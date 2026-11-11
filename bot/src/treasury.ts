// Keeps the bot going by itself, so nobody has to look after its balances.
//
// The money, for a name ordered from Ethereum:
//   1. The bot pays for the name on PulseChain out of its float. The registrar sends that payment
//      to the payments wallet: the sale, counted once, as for any other name.
//   2. When the bridge confirms the fill, the order pays the buyer's money (the price and the
//      bot's fee) to the bot on Ethereum.
//   3. The bot sends it home over the official bridge (free in that direction) to refill its float.
// So the float only ever lends: the buyer pays it back, not the payments wallet.
//
// Gas: it buys PLS on PulseX and ETH on Uniswap with its USDC when either runs low. With no USDC on
// Ethereum to buy ETH, it first sends some there over the bridge (0.3% fee). If its working balance
// can't cover a purchase, it draws the difference from the payments wallet's budget first.
//
// Settling up with the payments wallet (the registrar's beneficiary): the bot's fees, less its gas,
// pile up in the float, and it sends anything beyond the float back to the payments wallet. If gas
// (or an order bigger than the float) leaves it short instead, it draws the difference from the
// payments wallet, up to the budget that wallet allows it in the app (a USDC allowance). So the
// payments wallet ends up with every sale less the bot's gas, and nobody moves money by hand.

import { type Address, type Hex, type TransactionReceipt, formatUnits, isAddressEqual, parseEventLogs } from "viem";

import { ORDER_STATUS, erc20Abi, foreignAmbAbi, homeAmbAbi, orderBookAbi, registrarAbi, routerAbi, tokenBridgeAbi } from "./abis.ts";
import { parseAmbMessage } from "./amb.ts";
import type { Treasury } from "./config.ts";
import type { Context } from "./context.ts";
import { weiPerUsdc as readWeiPerUsdc } from "./copyfee.ts";
import { receiptOf, send, short, submit } from "./orders.ts";
import { CLAIM_GAS, REFILL_GAS, ownTransfer, spentToday } from "./relay.ts";
import type { Submitted, TreasuryState } from "./state.ts";

/** How often it looks at its balances, unless an order is waiting on the float. */
export const EVERY_SECONDS = 300n;
/** Smaller amounts wait on Ethereum until there's more to send home. */
export const MIN_SEND_HOME = 5_000_000n;
/** Sent to Ethereum on top of what an ETH purchase needs, to cover the bridge's 0.3% fee. */
export const OUT_EXTRA = 1_000_000n;
/** Money sent home is counted as on its way for this long at most. */
const HOME_TIMEOUT = 6n * 3600n;
/** A bridge transfer the bot sent but never saw mined is given up on after this long. */
const SUBMITTED_TIMEOUT = 30n * 60n;
const DAY = 86_400n;

export type Balances = {
  pls: bigint; // wei
  float: bigint; // USDC on PulseChain
  eth: bigint; // wei
  ethUsdc: bigint; // USDC on Ethereum
  budget: bigint; // what the payments wallet lets it draw: the smaller of its allowance and its USDC
  ethUnknown?: boolean; // Ethereum couldn't be read just now: leave its gas alone this time
  /**
   * The ETH (wei) it should hold now: what the next copy of a name needs at Ethereum's gas price,
   * with what's kept back for claiming its own USDC (0 when no copy can go today anyway: today's
   * limit, RELAY_DAILY_ETH), or the ETH kept for paid copies, if that's more.
   */
  ethNeed?: bigint;
  weiPerUsdc?: bigint; // what 1 USDC buys on Uniswap now, to size a purchase: unknown if it couldn't be read
};

/**
 * The ETH (wei) to hold, beyond ETH_LOW:
 * - what the next copy needs at today's gas, with what's kept back for claiming its own USDC, while
 *   one fits today's limit at the most a claim may take. Past that, topping up over the bridge costs
 *   more than it's worth, and copies wait for gas to fall, or use the ETH below.
 * - while the copy fee is on, COPY_NOW_ETH for paid copies, bought only while copies are free (gas is
 *   cheap), and used when someone pays to copy at once, however busy Ethereum gets.
 */
export function ethToHold(o: {
  gasPrice: bigint;
  spent: bigint;
  relay: boolean;
  dailyEth: bigint;
  copyNow: boolean;
  copyNowEth: bigint;
}): bigint {
  const cost = o.gasPrice * CLAIM_GAS;
  const next = o.relay && o.spent + cost <= o.dailyEth ? cost + o.gasPrice * REFILL_GAS : 0n;
  const forPaid = o.copyNow ? o.copyNowEth : 0n;
  return next > forPaid ? next : forPaid;
}

/**
 * The ETH it keeps at least: ETH_LOW, or what it should hold now (ethToHold) if that's more, so a
 * copy waits for gas only when today's limit says it should.
 */
export function ethLine(b: Pick<Balances, "ethNeed">, t: Pick<Treasury, "ethLow">): bigint {
  const need = b.ethNeed ?? 0n;
  return need > t.ethLow ? need : t.ethLow;
}

/**
 * How much USDC of ETH to buy, below the line: enough to reach twice it, so it doesn't buy again at
 * once, but at least ETH_BUY_USDC, and at most ETH_BUY_MAX_USDC at a time (the next round buys more
 * if that wasn't enough). At ETH_BUY_USDC if ETH's price couldn't be read.
 */
export function ethPurchase(b: Pick<Balances, "eth" | "ethNeed" | "weiPerUsdc">, t: Pick<Treasury, "ethLow" | "ethBuyUsdc" | "ethBuyMaxUsdc">): bigint {
  if (!b.weiPerUsdc) return t.ethBuyUsdc;
  const wanted = ethLine(b, t) * 2n - b.eth;
  const usdc = (wanted * 1_000_000n + b.weiPerUsdc - 1n) / b.weiPerUsdc;
  const most = t.ethBuyMaxUsdc > t.ethBuyUsdc ? t.ethBuyMaxUsdc : t.ethBuyUsdc;
  return usdc < t.ethBuyUsdc ? t.ethBuyUsdc : usdc > most ? most : usdc;
}

export type Pending = {
  repayments: bigint; // what orders the bot filled will pay it back
  home: bigint; // USDC on its way home over the bridge
  out: bigint; // USDC on its way to Ethereum over the bridge
  reserved: bigint; // what orders about to be filled will take from the float
  reservedBack: bigint; // ... and pay back once filled
};

export type Action =
  | { kind: "buy-pls"; usdc: bigint }
  | { kind: "buy-eth"; usdc: bigint }
  | { kind: "send-out"; usdc: bigint } // to Ethereum, to buy ETH there
  | { kind: "send-home"; usdc: bigint } // buyers' payments, back to the float
  | { kind: "return"; usdc: bigint } // to the payments wallet
  | { kind: "draw"; usdc: bigint } // from the payments wallet
  | { kind: "warn"; key: string; message: string };

/** How far the float may drift from its target before the bot settles up with the payments wallet. */
export function margin(floatUsdc: bigint): bigint {
  const fifth = floatUsdc / 5n;
  return fifth > 5_000_000n ? fifth : 5_000_000n;
}

/**
 * What to do, given the balances and what's on its way. Pure, so it's easy to test. Anything drawn
 * from the payments wallet comes first, as one draw, so it's there for what spends it.
 */
export function plan(
  b: Balances,
  p: Pending,
  t: Pick<Treasury, "floatUsdc" | "plsLow" | "plsBuyUsdc" | "ethLow" | "ethBuyUsdc" | "ethBuyMaxUsdc">,
): Action[] {
  const actions: Action[] = [];
  const warnings: Action[] = [];
  let float = b.float;
  let budget = b.budget;
  let drawn = 0n;
  let ethUsdc = b.ethUsdc;
  /** Pays `usdc` from the float, drawing what it lacks from the budget; false if even that can't. */
  const spend = (usdc: bigint): boolean => {
    const missing = usdc > float ? usdc - float : 0n;
    if (missing > budget) return false;
    budget -= missing;
    drawn += missing;
    float += missing - usdc;
    return true;
  };

  // 1. Gas on PulseChain.
  if (b.pls < t.plsLow) {
    if (spend(t.plsBuyUsdc)) actions.push({ kind: "buy-pls", usdc: t.plsBuyUsdc });
    else warnings.push({ kind: "warn", key: "pls", message: "low on PLS for gas, with no USDC or budget left to buy more" });
  }

  // 2. Gas on Ethereum, unless Ethereum couldn't be read just now: at least what the next copy needs.
  if (!b.ethUnknown && b.eth < ethLine(b, t)) {
    const buy = ethPurchase(b, t);
    if (ethUsdc >= buy) {
      actions.push({ kind: "buy-eth", usdc: buy });
      ethUsdc -= buy;
    } else if (ethUsdc >= t.ethBuyUsdc) {
      // Close to it: the bridge took its fee on the way, or the bot spent ETH or ETH's price moved
      // while the USDC crossed. It buys with what's there; if that's not quite enough, it tops up
      // next time. (Sending it home and more back out would go round for ever.)
      actions.push({ kind: "buy-eth", usdc: ethUsdc });
      ethUsdc = 0n;
    } else {
      if (p.out === 0n) {
        const usdc = buy - ethUsdc + OUT_EXTRA;
        if (spend(usdc)) actions.push({ kind: "send-out", usdc });
        else warnings.push({ kind: "warn", key: "eth", message: "low on ETH for gas, with no USDC or budget left to buy more" });
      }
      // What's there waits for the rest, to buy ETH with it all: none of it goes home meanwhile.
      ethUsdc = 0n;
    }
  }

  // 3. Buyers' payments go home to the float, less enough for the next ETH purchase.
  let home = p.home;
  if (!b.ethUnknown && ethUsdc >= t.ethBuyUsdc + MIN_SEND_HOME) {
    const usdc = ethUsdc - t.ethBuyUsdc;
    actions.push({ kind: "send-home", usdc });
    home += usdc;
  }

  // 4. Settle up with the payments wallet.
  const m = margin(t.floatUsdc);
  const free = float - p.reserved; // the float, less what orders about to be filled will take
  if (free > t.floatUsdc + m) {
    actions.push({ kind: "return", usdc: free - t.floatUsdc });
  } else {
    // An order waiting on the float: drawn for only if the budget covers all it needs, or the draw
    // would just come back unused when the order is refunded.
    const nowNeed = free < 0n ? -free : 0n;
    const coverOrders = nowNeed <= budget;
    if (!coverOrders) {
      warnings.push({
        kind: "warn",
        key: "order",
        message: `${usdcText(nowNeed)} USDC short for an order from Ethereum, more than the payments wallet's budget for it: the order will be refunded unless the budget is raised in the app`,
      });
    }
    const expected = (coverOrders ? free + p.reservedBack : float) + p.repayments + home; // with what's on its way back
    const laterNeed = expected < t.floatUsdc - m ? t.floatUsdc - expected : 0n; // short even once paid back
    const need = coverOrders && nowNeed > laterNeed ? nowNeed : laterNeed;
    if (need > 0n) {
      const usdc = need < budget ? need : budget;
      drawn += usdc;
      budget -= usdc;
      if (usdc < need) {
        warnings.push({
          kind: "warn",
          key: "budget",
          message: `short of its working balance by ${usdcText(need - usdc)} USDC, and the payments wallet's budget for it has run out: raise it in the app`,
        });
      }
    }
  }
  return [...(drawn > 0n ? [{ kind: "draw", usdc: drawn } as Action] : []), ...actions, ...warnings];
}

/** Looks at its balances every few minutes (or at once if an order is waiting on the float) and acts. */
export async function runTreasury(ctx: Context): Promise<void> {
  const t = ctx.config.treasury;
  const state = (ctx.state.treasury ??= { home: [], warned: {} });
  const now = BigInt(Math.floor(Date.now() / 1000));
  // Orders count only while the bot fills them (FILL=true): one left half-done when filling was
  // turned off is the order book's to refund, not the float's to wait on or lend for.
  const waitingOnFloat = ctx.config.fill && Object.values(ctx.state.orders).some((o) => o.status === "committed");
  if (!waitingOnFloat && state.lastRun && now - BigInt(state.lastRun) < EVERY_SECONDS) return;
  state.lastRun = now.toString();

  const payments = await ctx.pls.readContract({ address: ctx.config.registrar, abi: registrarAbi, functionName: "BENEFICIARY" });
  if (ctx.config.fill) await collectOwed(ctx).catch((error) => ctx.log(`balance: couldn't check the order book (${short(error)})`));
  const [balances, pending] = await Promise.all([readBalances(ctx, payments, now), readPending(ctx, state, now)]);
  for (const action of plan(balances, pending, t)) {
    if (action.kind === "warn") {
      warn(ctx, state, now, action.key, action.message);
      continue;
    }
    try {
      await act(ctx, action, payments, state, now);
    } catch (error) {
      warn(ctx, state, now, action.kind, `could not ${action.kind.replace("-", " ")} (${usdcText(action.usdc)} USDC): ${short(error)}`);
    }
  }

  if (!state.lastReport || now - BigInt(state.lastReport) >= DAY) {
    state.lastReport = now.toString();
    const after = await readBalances(ctx, payments, now);
    const bridging =
      state.home.filter((h) => !h.arrived).reduce((sum, h) => sum + BigInt(h.usdc), 0n) +
      Object.values(ctx.state.messages).reduce((sum, m) => sum + (m.own && m.status === "waiting" ? BigInt(m.own.usdc) : 0n), 0n);
    ctx.log(
      `daily: working balance ${usdcText(after.float)} USDC (keeps ${usdcText(t.floatUsdc)}), ${plsText(after.pls)} PLS, ` +
        `${formatUnits(after.eth, 18)} ETH, ${usdcText(after.ethUsdc)} USDC on Ethereum; ` +
        `owed back by orders ${usdcText(pending.repayments)}, on the bridge ${usdcText(bridging)}; ` +
        `budget from the payments wallet ${usdcText(after.budget)} USDC`,
    );
  }
}

async function readBalances(ctx: Context, payments: Address, now: bigint): Promise<Balances> {
  const { config } = ctx;
  const t = config.treasury;
  const bot = ctx.account.address;
  const [pls, float, allowance, held] = await Promise.all([
    ctx.pls.getBalance({ address: bot }),
    ctx.pls.readContract({ address: config.pulsechainUsdc, abi: erc20Abi, functionName: "balanceOf", args: [bot] }),
    ctx.pls.readContract({ address: config.pulsechainUsdc, abi: erc20Abi, functionName: "allowance", args: [payments, bot] }),
    ctx.pls.readContract({ address: config.pulsechainUsdc, abi: erc20Abi, functionName: "balanceOf", args: [payments] }),
  ]);
  const budget = allowance < held ? allowance : held;
  try {
    const [eth, ethUsdc, gasPrice, weiPerUsdc] = await Promise.all([
      ctx.eth.getBalance({ address: bot }),
      ctx.eth.readContract({ address: t.ethereumUsdc, abi: erc20Abi, functionName: "balanceOf", args: [bot] }),
      ctx.eth.getGasPrice(),
      readWeiPerUsdc(ctx), // undefined if it couldn't be read: sized at ETH_BUY_USDC, then
    ]);
    const ethNeed = ethToHold({
      gasPrice,
      spent: spentToday(ctx.state.relay, now),
      relay: config.relay,
      dailyEth: config.relayLimits.dailyEth,
      copyNow: ctx.state.copyFee?.on === true && ctx.state.copyFee.free === true,
      copyNowEth: t.copyNowEth,
    });
    return { pls, float, eth, ethUsdc, budget, ethNeed, weiPerUsdc };
  } catch (error) {
    ctx.log(`balance: couldn't read Ethereum just now (${short(error)}); looking after PulseChain only this time`);
    return { pls, float, eth: 0n, ethUsdc: 0n, budget, ethUnknown: true };
  }
}

async function readPending(ctx: Context, state: TreasuryState, now: bigint): Promise<Pending> {
  const { config } = ctx;
  let repayments = 0n;
  let reserved = 0n;
  let reservedBack = 0n;
  for (const order of config.fill ? Object.values(ctx.state.orders) : []) {
    if (order.status === "committed" && order.price) {
      reserved += BigInt(order.price);
      reservedBack += BigInt(order.amount); // what it will pay back once filled
    }
    if (!order.advanced || order.repaid) continue;
    const [, , , , status] = await ctx.eth.readContract({ address: config.orderBook, abi: orderBookAbi, functionName: "orders", args: [BigInt(order.orderId)] });
    if (status === ORDER_STATUS.OPEN) repayments += BigInt(order.amount);
    else order.repaid = true; // paid to the bot (FILLED), or never will be (refunded or reclaimed)
  }

  await resolveSubmitted(ctx, state, now);
  let home = 0n;
  for (const transfer of state.home) {
    if (transfer.arrived) continue;
    const arrived = await ctx.pls.readContract({ address: config.homeAmb, abi: homeAmbAbi, functionName: "messageCallStatus", args: [transfer.messageId] });
    if (arrived) {
      transfer.arrived = true;
      ctx.log(`balance: ${usdcText(BigInt(transfer.usdc))} USDC arrived home from Ethereum`);
    } else if (now - BigInt(transfer.sentAt) > HOME_TIMEOUT) {
      transfer.arrived = true; // stop counting on it, and say so
      ctx.log(`balance: ${usdcText(BigInt(transfer.usdc))} USDC sent home in ${transfer.tx} hasn't arrived after 6 hours; check the bridge`);
    } else {
      home += BigInt(transfer.usdc);
    }
  }
  state.home = state.home.filter((transfer) => !transfer.arrived || now - BigInt(transfer.sentAt) < 7n * DAY);

  let out = 0n;
  for (const message of Object.values(ctx.state.messages)) {
    if (message.own && message.status === "waiting") out += BigInt(message.own.usdc);
  }
  // Sent, but not yet seen mined: counted as on their way, so nothing is sent twice.
  for (const transfer of state.submitted ?? []) {
    if (transfer.kind === "out") out += BigInt(transfer.usdc);
    else home += BigInt(transfer.usdc);
  }
  return { repayments, home, out, reserved, reservedBack };
}

/**
 * Bridge transfers the bot sent without seeing them mined (the wait failed, or it restarted): once
 * mined, recorded as if it had seen them at once; given up on if never mined.
 */
async function resolveSubmitted(ctx: Context, state: TreasuryState, now: bigint): Promise<void> {
  const still: Submitted[] = [];
  for (const transfer of state.submitted ?? []) {
    const client = transfer.kind === "out" ? ctx.pls : ctx.eth;
    const receipt = await client.getTransactionReceipt({ hash: transfer.tx }).catch(() => null);
    if (receipt?.status === "success") recordTransfer(ctx, state, transfer, receipt);
    else if (receipt) ctx.log(`balance: the bridge transfer ${transfer.tx} reverted, so its ${usdcText(BigInt(transfer.usdc))} USDC never left`);
    else if (now - BigInt(transfer.sentAt) > SUBMITTED_TIMEOUT) ctx.log(`balance: the bridge transfer ${transfer.tx} was never mined; giving up on it`);
    else still.push(transfer);
  }
  state.submitted = still;
}

/** Records a mined bridge transfer: the message to claim on Ethereum, or the money on its way home. */
function recordTransfer(ctx: Context, state: TreasuryState, transfer: Submitted, receipt: TransactionReceipt): void {
  const { config } = ctx;
  const t = config.treasury;
  if (transfer.kind === "home") {
    const [sent] = parseEventLogs({ abi: foreignAmbAbi, eventName: "UserRequestForAffirmation", logs: receipt.logs }).filter((l) => isAddressEqual(l.address, config.foreignAmb));
    if (!sent) return ctx.log(`balance: the bridge took the USDC but sent no message (${receipt.transactionHash})`);
    if (!state.home.some((h) => h.messageId === sent.args.messageId)) {
      state.home.push({ messageId: sent.args.messageId, usdc: transfer.usdc, tx: receipt.transactionHash, sentAt: transfer.sentAt });
    }
    return;
  }
  const [sent] = parseEventLogs({ abi: homeAmbAbi, eventName: "UserRequestForSignature", logs: receipt.logs }).filter((l) => isAddressEqual(l.address, config.homeAmb));
  if (!sent) return ctx.log(`gas: the bridge took the USDC but sent no message (${receipt.transactionHash})`);
  const message = parseAmbMessage(sent.args.encodedData);
  if (ctx.state.messages[message.messageId]) return; // found already by the bridge scan
  const arriving = ownTransfer(message, ctx.account.address, t.homeBridge, t.ethereumUsdc);
  ctx.state.messages[message.messageId] = {
    messageId: message.messageId,
    encoded: message.encoded,
    hash: message.hash,
    gasLimit: message.gasLimit.toString(),
    sender: message.sender,
    seenAtBlock: receipt.blockNumber.toString(),
    status: "waiting",
    own: { usdc: (arriving ?? BigInt(transfer.usdc)).toString() },
  };
}

/**
 * Sends the bot's own USDC over the bridge, remembering the transaction (and saving the state)
 * before waiting for it: if the wait fails, the next pass picks it up rather than sending again.
 */
async function sendTransfer(ctx: Context, state: TreasuryState, now: bigint, kind: Submitted["kind"], usdc: bigint): Promise<Hex> {
  const { config } = ctx;
  const t = config.treasury;
  const bot = ctx.account.address;
  const chain = kind === "out" ? "pls" : "eth";
  const tx = await submit(ctx, chain, {
    address: kind === "out" ? t.homeBridge : t.foreignBridge,
    abi: tokenBridgeAbi,
    functionName: "relayTokens",
    args: [kind === "out" ? config.pulsechainUsdc : t.ethereumUsdc, bot, usdc],
  });
  const transfer: Submitted = { kind, tx, usdc: usdc.toString(), sentAt: now.toString() };
  (state.submitted ??= []).push(transfer);
  ctx.save();
  const receipt = await receiptOf(ctx, chain, tx);
  recordTransfer(ctx, state, transfer, receipt);
  state.submitted = state.submitted.filter((s) => s.tx !== tx);
  return tx;
}

/** Takes any repayment the order book holds for the bot because a transfer to it failed. */
async function collectOwed(ctx: Context): Promise<void> {
  const owed = await ctx.eth.readContract({ address: ctx.config.orderBook, abi: orderBookAbi, functionName: "owed", args: [ctx.account.address] });
  if (owed === 0n) return;
  const tx = await send(ctx, "eth", { address: ctx.config.orderBook, abi: orderBookAbi, functionName: "withdraw" });
  ctx.log(`balance: collected ${usdcText(owed)} USDC the order book was holding for the bot (${tx})`);
}

async function act(ctx: Context, action: Exclude<Action, { kind: "warn" }>, payments: Address, state: TreasuryState, now: bigint): Promise<void> {
  const { config } = ctx;
  const t = config.treasury;
  const bot = ctx.account.address;
  switch (action.kind) {
    case "buy-pls": {
      const { router, out } = await bestQuote(ctx, "pls", t.pulsexRouters, action.usdc, [config.pulsechainUsdc, t.wpls]);
      await allow(ctx, "pls", config.pulsechainUsdc, router, action.usdc);
      const tx = await send(ctx, "pls", { address: router, abi: routerAbi, functionName: "swapExactTokensForETH", args: [action.usdc, (out * 97n) / 100n, [config.pulsechainUsdc, t.wpls], bot, now + 1200n] });
      ctx.log(`gas: bought about ${plsText(out)} PLS for ${usdcText(action.usdc)} USDC on PulseX (${tx})`);
      return;
    }
    case "buy-eth": {
      const { router, out } = await bestQuote(ctx, "eth", [t.uniswapRouter], action.usdc, [t.ethereumUsdc, t.weth]);
      await allow(ctx, "eth", t.ethereumUsdc, router, action.usdc);
      const tx = await send(ctx, "eth", { address: router, abi: routerAbi, functionName: "swapExactTokensForETH", args: [action.usdc, (out * 97n) / 100n, [t.ethereumUsdc, t.weth], bot, now + 1200n] });
      ctx.log(`gas: bought about ${formatUnits(out, 18)} ETH for ${usdcText(action.usdc)} USDC on Uniswap (${tx})`);
      return;
    }
    case "send-home": {
      await allow(ctx, "eth", t.ethereumUsdc, t.foreignBridge, action.usdc);
      const tx = await sendTransfer(ctx, state, now, "home", action.usdc);
      ctx.log(`balance: sent ${usdcText(action.usdc)} USDC home from Ethereum over the bridge; it arrives in about 20 minutes (${tx})`);
      return;
    }
    case "send-out": {
      await allow(ctx, "pls", config.pulsechainUsdc, t.homeBridge, action.usdc);
      const tx = await sendTransfer(ctx, state, now, "out", action.usdc);
      ctx.log(`gas: sent ${usdcText(action.usdc)} USDC to Ethereum over the bridge, to buy ETH once it arrives (${tx})`);
      return;
    }
    case "return": {
      const tx = await send(ctx, "pls", { address: config.pulsechainUsdc, abi: erc20Abi, functionName: "transfer", args: [payments, action.usdc] });
      ctx.log(`balance: ${usdcText(action.usdc)} USDC over the ${usdcText(t.floatUsdc)} it keeps, sent to the payments wallet ${payments} (${tx})`);
      return;
    }
    case "draw": {
      const tx = await send(ctx, "pls", { address: config.pulsechainUsdc, abi: erc20Abi, functionName: "transferFrom", args: [payments, bot, action.usdc] });
      ctx.log(`balance: drew ${usdcText(action.usdc)} USDC from the payments wallet's budget, for gas (${tx})`);
      return;
    }
  }
}

/** The router that gives the most for `amount` along `path`. */
async function bestQuote(ctx: Context, chain: "pls" | "eth", routers: Address[], amount: bigint, path: Address[]): Promise<{ router: Address; out: bigint }> {
  const client = chain === "pls" ? ctx.pls : ctx.eth;
  let best: { router: Address; out: bigint } | null = null;
  for (const router of routers) {
    try {
      const amounts = await client.readContract({ address: router, abi: routerAbi, functionName: "getAmountsOut", args: [amount, path] });
      const out = amounts[amounts.length - 1]!;
      if (!best || out > best.out) best = { router, out };
    } catch {
      // no pool on this router
    }
  }
  if (!best || best.out === 0n) throw new Error("no pool to swap USDC for gas");
  return best;
}

/** Lets `spender` take exactly `amount` of the bot's `token`, unless it already may. */
async function allow(ctx: Context, chain: "pls" | "eth", token: Address, spender: Address, amount: bigint): Promise<void> {
  const client = chain === "pls" ? ctx.pls : ctx.eth;
  const allowance = await client.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [ctx.account.address, spender] });
  if (allowance >= amount) return;
  await send(ctx, chain, { address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount] });
}

/** Says something once a day at most. */
function warn(ctx: Context, state: TreasuryState, now: bigint, key: string, message: string): void {
  const last = state.warned[key];
  if (last && now - BigInt(last) < DAY) return;
  state.warned[key] = now.toString();
  ctx.log(`WARNING: the bot is ${message}`);
}

export function usdcText(units: bigint): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const text = formatUnits(abs, 6);
  const [whole, fraction = ""] = text.split(".");
  return `${negative ? "-" : ""}${whole}.${fraction.padEnd(2, "0").slice(0, Math.max(2, fraction.replace(/0+$/, "").length))}`;
}

function plsText(wei: bigint): string {
  return Math.round(Number(formatUnits(wei, 18))).toLocaleString("en-US");
}

