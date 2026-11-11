// Fills .hex orders placed on Ethereum, on PulseChain, within about two minutes.
//
// For each order: open its sealed details, check they match its commitment and that the name can
// be registered and is paid for, commit on the PulseChain registrar, wait the minimum commitment
// age (one minute), then fill it through HexOrderFiller, paying from the bot's own USDC. The order's
// money reaches the bot on Ethereum about 15 minutes later, when the bridge delivers the fill.
//
// Every order ends either filled or refunded: if the bot cannot fill it (the name is taken, the
// details are invalid, it is underpaid), it reports it so the buyer gets their money back.

import { type Hex, type TransactionReceipt, encodeAbiParameters, getAbiItem, keccak256, maxUint256 } from "viem";

import { ORDER_STATUS, OUTCOME, erc20Abi, orderBookAbi, orderFillerAbi, registrarAbi } from "./abis.ts";
import { assertNormalizedLabel } from "./buy.ts";
import type { Context } from "./context.ts";
import { type Reveal, commitmentOf, openReveal } from "./reveal.ts";
import type { OrderRecord } from "./state.ts";

const LOG_RANGE = 2_000n;
const orderPlaced = getAbiItem({ abi: orderBookAbi, name: "OrderPlaced" });

/** Records orders placed on Ethereum since the last scan, once they have enough confirmations. */
export async function scanOrders(ctx: Context): Promise<void> {
  const safe = (await ctx.eth.getBlockNumber()) - ctx.config.ethereumConfirmations;
  for (let from = BigInt(ctx.state.ethereumBlock) + 1n; from <= safe; from += LOG_RANGE) {
    const to = from + LOG_RANGE - 1n < safe ? from + LOG_RANGE - 1n : safe;
    const logs = await ctx.eth.getLogs({ address: ctx.config.orderBook, event: orderPlaced, fromBlock: from, toBlock: to });
    for (const { args } of logs) {
      const orderId = args.orderId!.toString();
      if (ctx.state.orders[orderId]) continue;
      ctx.state.orders[orderId] = {
        orderId,
        commitment: args.commitment!,
        deadline: args.deadline!.toString(),
        amount: args.amount!.toString(),
        sealed: args.encryptedReveal!,
        status: "new",
        txs: [],
      };
      ctx.log(`order ${orderId}: placed, ${usdc(args.amount!)} USDC, fill by ${new Date(Number(args.deadline!) * 1000).toISOString()}`);
    }
    ctx.state.ethereumBlock = to.toString();
  }
}

/** Moves every open order one step along. */
export async function processOrders(ctx: Context): Promise<void> {
  const open = Object.values(ctx.state.orders).filter((o) => !["filled", "refunded", "closed"].includes(o.status));
  if (open.length === 0) return;
  const now = (await ctx.pls.getBlock()).timestamp;
  const minAge = await ctx.pls.readContract({ address: ctx.config.registrar, abi: registrarAbi, functionName: "MIN_COMMITMENT_AGE" });
  for (const order of open) {
    try {
      await processOrder(ctx, order, now, minAge);
    } catch (error) {
      ctx.log(`order ${order.orderId}: ${short(error)} (will retry)`);
    }
  }
}

async function processOrder(ctx: Context, order: OrderRecord, now: bigint, minAge: bigint): Promise<void> {
  const { config } = ctx;
  const orderId = BigInt(order.orderId);
  const deadline = BigInt(order.deadline);

  // Settled on Ethereum already (reclaimed by the buyer, or filled by someone else)?
  const [, , , , status] = await ctx.eth.readContract({ address: config.orderBook, abi: orderBookAbi, functionName: "orders", args: [orderId] });
  if (status !== ORDER_STATUS.OPEN) {
    order.status = "closed";
    return;
  }
  // Closed on PulseChain already, by this bot or anyone else?
  const outcome = await ctx.pls.readContract({ address: config.orderFiller, abi: orderFillerAbi, functionName: "outcomeOf", args: [orderKey(orderId, order.commitment, deadline)] });
  if (outcome !== OUTCOME.OPEN) {
    order.status = outcome === OUTCOME.FILLED ? "filled" : "refunded";
    return;
  }

  // Past its deadline: it can no longer be filled, so refund it.
  if (now > deadline) {
    const tx = await send(ctx, "pls", { address: config.orderFiller, abi: orderFillerAbi, functionName: "reportExpired", args: [orderId, order.commitment, deadline] });
    order.txs.push(tx);
    order.status = "refunded";
    ctx.log(`order ${order.orderId}: expired unfilled, refund sent over the bridge (${tx})`);
    return;
  }
  if (order.status === "waiting-for-deadline") return;

  const reveal = openReveal(order.sealed, ctx.encryption.secretKey);
  if (!reveal) return waitForDeadline(ctx, order, "its details are not sealed for this bot");
  if (commitmentOf(reveal) !== order.commitment) return waitForDeadline(ctx, order, "its details do not match its commitment");
  try {
    assertNormalizedLabel(reveal.label);
  } catch (error) {
    return waitForDeadline(ctx, order, `its name could never be looked up: ${short(error)}`);
  }
  if (deadline - now < minAge + 60n) return waitForDeadline(ctx, order, "not enough time left to fill it");

  const r = revealArg(reveal);
  const canRegister = await ctx.pls.readContract({ address: config.orderFiller, abi: orderFillerAbi, functionName: "canRegister", args: [r] });
  if (!canRegister) {
    const tx = await send(ctx, "pls", { address: config.orderFiller, abi: orderFillerAbi, functionName: "reportUnfillable", args: [orderId, deadline, r] });
    order.txs.push(tx);
    order.status = "refunded";
    ctx.log(`order ${order.orderId}: ${reveal.label}.hex cannot be registered, refund sent over the bridge (${tx})`);
    return;
  }

  const [base, premium] = await ctx.pls.readContract({ address: config.registrar, abi: registrarAbi, functionName: "getRegisterPrice", args: [reveal.label, reveal.duration, config.pulsechainUsdc] });
  const price = base + premium;
  if (BigInt(order.amount) < price + config.minFee) {
    return waitForDeadline(ctx, order, `pays ${usdc(BigInt(order.amount))} USDC but needs ${usdc(price + config.minFee)}`);
  }

  if (order.status === "new") {
    const committedAt = await ctx.pls.readContract({ address: config.registrar, abi: registrarAbi, functionName: "commitmentAt", args: [order.commitment] });
    if (committedAt === 0n) {
      const tx = await send(ctx, "pls", { address: config.registrar, abi: registrarAbi, functionName: "commit", args: [order.commitment] });
      order.txs.push(tx);
    }
    const at = await ctx.pls.readContract({ address: config.registrar, abi: registrarAbi, functionName: "commitmentAt", args: [order.commitment] });
    order.committedAt = at.toString();
    order.price = price.toString();
    order.status = "committed";
    ctx.log(`order ${order.orderId}: committed for ${reveal.label}.hex, filling in about ${minAge} seconds`);
    return;
  }

  if (order.status === "committed") {
    if (now < BigInt(order.committedAt!) + minAge + 2n) return;
    await ensureFloat(ctx, price);
    // The order repays the bot's own wallet on Ethereum, which sends the money home to its float.
    const tx = await send(ctx, "pls", { address: config.orderFiller, abi: orderFillerAbi, functionName: "fill", args: [orderId, deadline, r, config.pulsechainUsdc, ctx.account.address] });
    order.txs.push(tx);
    order.status = "filled";
    order.advanced = price.toString();
    ctx.log(`order ${order.orderId}: ${reveal.label}.hex registered to ${reveal.owner} (${tx}); payment follows over the bridge`);
  }
}

function waitForDeadline(ctx: Context, order: OrderRecord, why: string): void {
  order.status = "waiting-for-deadline";
  order.note = why;
  ctx.log(`order ${order.orderId}: not filling it, ${why}; it will be refunded after its deadline`);
}

/** Makes sure the bot has `price` USDC on PulseChain and has let HexOrderFiller use it. */
async function ensureFloat(ctx: Context, price: bigint): Promise<void> {
  const { config } = ctx;
  const balance = await ctx.pls.readContract({ address: config.pulsechainUsdc, abi: erc20Abi, functionName: "balanceOf", args: [ctx.account.address] });
  if (balance < price) throw new Error(`the bot has ${usdc(balance)} USDC on PulseChain and needs ${usdc(price)}: top up its float`);
  const allowance = await ctx.pls.readContract({ address: config.pulsechainUsdc, abi: erc20Abi, functionName: "allowance", args: [ctx.account.address, config.orderFiller] });
  if (allowance < price) {
    await send(ctx, "pls", { address: config.pulsechainUsdc, abi: erc20Abi, functionName: "approve", args: [config.orderFiller, maxUint256] });
  }
}

/** HexOrderFiller.orderKey, computed locally. */
export function orderKey(orderId: bigint, commitment: Hex, deadline: bigint): Hex {
  return keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "bytes32" }, { type: "uint64" }], [orderId, commitment, deadline]));
}

function revealArg(r: Reveal) {
  return { label: r.label, owner: r.owner, secret: r.secret, subregistry: r.subregistry, resolver: r.resolver, duration: r.duration, referrer: r.referrer };
}

type Call = Parameters<Context["pls"]["simulateContract"]>[0] & { gas?: bigint };

/** Simulates, sends and waits for a transaction; throws if it would revert or did. */
export async function send(ctx: Context, chain: "pls" | "eth", call: Call): Promise<Hex> {
  return (await sendForReceipt(ctx, chain, call)).transactionHash;
}

/** The same, returning the receipt, for reading what the transaction logged. */
export async function sendForReceipt(ctx: Context, chain: "pls" | "eth", call: Call): Promise<TransactionReceipt> {
  return receiptOf(ctx, chain, await submit(ctx, chain, call));
}

/**
 * Simulates and sends a transaction, returning its hash without waiting for it to be mined, so the
 * caller can remember it first: if waiting then fails (an RPC error, a restart), the next pass finds
 * the transaction again instead of sending it twice.
 */
export async function submit(ctx: Context, chain: "pls" | "eth", call: Call): Promise<Hex> {
  const client = chain === "pls" ? ctx.pls : ctx.eth;
  const wallet = chain === "pls" ? ctx.plsWallet : ctx.ethWallet;
  const { request } = await client.simulateContract({ ...call, account: ctx.account } as never);
  return wallet.writeContract(request as never);
}

/** Waits for a transaction sent with `submit`; throws if it reverted. */
export async function receiptOf(ctx: Context, chain: "pls" | "eth", hash: Hex): Promise<TransactionReceipt> {
  const client = chain === "pls" ? ctx.pls : ctx.eth;
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`transaction ${hash} reverted`);
  return receipt;
}

export function usdc(units: bigint): string {
  const whole = units / 1_000_000n;
  const fraction = (units % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function short(error: unknown): string {
  const e = error as { shortMessage?: string; message?: string };
  return (e.shortMessage ?? e.message ?? String(error)).split("\n")[0]!;
}
