// Keeps the checkout's copy fee in step with Ethereum's gas.
//
// Copying a name to Ethereum costs the bot ETH. The project pays up to COPY_FREE_USDC of each copy.
// When a copy costs more, anyone buying, renewing or sending a name can pay the rest to have it
// copied at once: the copy fee, which the bot sets on AnyTokenCheckout about once a minute from
// Ethereum's gas price and ETH's price on Uniswap, with a quarter more for gas rising before the
// copy goes out. New names and renewals nobody paid for wait for Ethereum's fees to fall (see
// holdReason in relay.ts). The fees go to the bot's working balance, which buys its ETH.
//
// The admin turns the fee on by choosing this bot as the copy bot on the admin page, and caps it, as a
// safety limit. Copying at once is offered only while the bot holds the ETH to do it straight away
// (COPY_NOW_ETH, bought while Ethereum is cheap): otherwise it sets UNAVAILABLE, so nobody pays for a
// copy it couldn't make at once. Buyers can then copy it themselves on Ethereum, paying its fee in
// ETH from their own wallet (the app's "Copy it myself"), or let it go free once fees fall.

import { type Address, formatEther, isAddressEqual } from "viem";

import { checkoutAbi, routerAbi } from "./abis.ts";
import type { Context } from "./context.ts";
import { send, short, usdc } from "./orders.ts";
import type { CopyFeeState, MessageRecord, RelayState } from "./state.ts";

/** How often it looks at Ethereum's gas for the copy fee. */
export const FEE_EVERY_SECONDS = 60n;
/** The gas a copy uses, until the bot has claimed some itself: about 1.05 million on Sepolia, November 2026. */
export const COPY_GAS = 1_100_000n;
const HOUR = 3600n;
const CENT = 10_000n;
/** The fee that says copying at once isn't available just now: above any cap, so nothing can be paid. */
export const UNAVAILABLE = 2n ** 256n - 1n;

/**
 * The gas limit a copy's claim is sent with, until the bot has sent one: on Sepolia in November
 * 2026, about 1.91 million (a fifth more than the 1.6 million Ethereum worked out it needed).
 */
export const COPY_CLAIM_LIMIT = 1_920_000n;

/**
 * What a claim needs on hand at `gasPrice`, in wei. Ethereum only takes a transaction whose sender
 * holds its whole gas limit at its highest fee (the bot offers up to a fifth over the gas price),
 * though it charges only for the gas used. A copy's claim asks for far more gas than it uses: the
 * bridge holds back the full million gas a copy may use until it has run.
 */
export function claimNeed(gasPrice: bigint, limit: bigint): bigint {
  return (gasPrice * limit * 6n) / 5n;
}

/**
 * The ETH the bot must hold to offer copying at once: a claim's gas limit, and the gas the paid
 * copies already waiting will use, at half again today's gas price, for it to rise before they go.
 * Claims go one at a time, and each gives back the gas it didn't use.
 */
export function paidCopyNeed(gasPrice: bigint, limit: bigint, gasUsed: bigint, waiting: number): bigint {
  return (gasPrice * (limit + gasUsed * BigInt(waiting)) * 3n) / 2n;
}

/** The fee to set: the fee, unless there is one and the bot can't make a paid copy at once. */
export function feeToSet(fee: bigint, ethBalance: bigint, need: bigint): bigint {
  return fee === 0n || ethBalance >= need ? fee : UNAVAILABLE;
}

/** The gas a copy uses: the most of the last few the bot claimed, or COPY_GAS before it has claimed any. */
export function copyGas(relay: Pick<RelayState, "copyGas"> | undefined): bigint {
  const seen = (relay?.copyGas ?? []).map((gas) => BigInt(gas));
  return seen.length === 0 ? COPY_GAS : seen.reduce((a, b) => (a > b ? a : b));
}

/** Remembers the gas a copy used, keeping the last ten. */
export function recordCopyGas(relay: RelayState, gasUsed: bigint): void {
  relay.copyGas = [...(relay.copyGas ?? []), gasUsed.toString()].slice(-10);
}

/** The gas limit a copy's claim is sent with: the most of the last few, or COPY_CLAIM_LIMIT before any. */
export function claimLimit(relay: Pick<RelayState, "claimLimits"> | undefined): bigint {
  const seen = (relay?.claimLimits ?? []).map((gas) => BigInt(gas));
  return seen.length === 0 ? COPY_CLAIM_LIMIT : seen.reduce((a, b) => (a > b ? a : b));
}

/** Remembers the gas limit a copy's claim was sent with, keeping the last ten. */
export function recordClaimLimit(relay: RelayState, limit: bigint): void {
  relay.claimLimits = [...(relay.claimLimits ?? []), limit.toString()].slice(-10);
}

/** What a copy costs, in USDC units (rounded up): `gas` at `gasPrice`, when 1 USDC buys `weiPerUsdc`. */
export function copyCost(gas: bigint, gasPrice: bigint, weiPerUsdc: bigint): bigint {
  return (gas * gasPrice * 1_000_000n + weiPerUsdc - 1n) / weiPerUsdc;
}

/** The copy fee for a copy costing `cost`: nothing up to `free`, then the rest and a quarter more, to the cent above. */
export function feeFor(cost: bigint, free: bigint): bigint {
  if (cost <= free) return 0n;
  const fee = ((cost - free) * 5n + 3n) / 4n;
  return ((fee + CENT - 1n) / CENT) * CENT;
}

/** Whether a new fee is worth a transaction: to or from zero, across the cap, or a change of more than a tenth. */
export function worthUpdating(current: bigint, next: bigint, cap: bigint): boolean {
  if (current === next) return false;
  if (current === 0n || next === 0n || current > cap !== next > cap) return true;
  const change = current > next ? current - next : next - current;
  return change * 10n > current;
}

/** What 1 USDC buys in ETH on Uniswap now (wei), or undefined if it couldn't be read. */
export async function weiPerUsdc(ctx: Context): Promise<bigint | undefined> {
  const t = ctx.config.treasury;
  return ctx.eth
    .readContract({ address: t.uniswapRouter, abi: routerAbi, functionName: "getAmountsOut", args: [1_000_000n, [t.ethereumUsdc, t.weth]] })
    .then((amounts) => amounts[amounts.length - 1])
    .catch(() => undefined);
}

/** The fee, in words, for the log. */
export function feeText(fee: bigint, cap: bigint): string {
  if (fee === 0n) return "none: copies are free";
  if (fee === UNAVAILABLE) return "copying at once paused: the bot hasn't the ETH to do it straight away";
  if (fee > cap) return `${usdc(fee)} USDC, over the ${usdc(cap)} USDC cap: copying at once isn't offered, and new copies wait for fees to fall`;
  return `${usdc(fee)} USDC to copy a name at once`;
}

/** Whether copies of new names and renewals may be waiting for Ethereum's fees: the fee is on, and copies aren't free. */
export const holdsCopies = (s: Pick<CopyFeeState, "on" | "free">): boolean => s.on && s.free === false;

/**
 * Has every copy held back looked at again on the bot's next pass, rather than at its next look
 * (every few minutes): for when the fee is switched off, or copies are free again. Says how many.
 */
export function recheckHeld(messages: Record<string, MessageRecord>): number {
  let held = 0;
  for (const m of Object.values(messages)) {
    if (m.status !== "waiting" || !m.recheckAt) continue;
    delete m.recheckAt;
    held++;
  }
  return held;
}

/**
 * Keeps the copy fee up to date, about once a minute, once the admin has chosen this bot as the
 * copy bot. Also remembers the checkout's owner (the admin), whose copies are copied at once. When
 * copies stop waiting for Ethereum's fees (the fee is switched off, or they're free again), those
 * held back go on the next pass.
 */
export async function runCopyFee(ctx: Context): Promise<void> {
  if (!ctx.config.checkout) return;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const state = (ctx.state.copyFee ??= { on: false, offered: false, fee: "0", noted: {} });
  if (state.lastRun && now - BigInt(state.lastRun) < FEE_EVERY_SECONDS) return;
  state.lastRun = now.toString();
  const holding = holdsCopies(state);
  try {
    await updateCopyFee(ctx, state, now);
  } finally {
    if (holding && !holdsCopies(state)) {
      const held = recheckHeld(ctx.state.messages);
      if (held > 0) ctx.log(`copy fee: ${held} ${held === 1 ? "copy" : "copies"} held back for Ethereum's fees now go`);
    }
  }
}

async function updateCopyFee(ctx: Context, state: CopyFeeState, now: bigint): Promise<void> {
  const config = ctx.config;
  if (!config.checkout) return;
  const checkout = { address: config.checkout, abi: checkoutAbi } as const;
  let bot: Address, cap: bigint, current: bigint, admin: Address;
  try {
    [bot, cap, current, admin] = await Promise.all([
      ctx.pls.readContract({ ...checkout, functionName: "copyBot" }),
      ctx.pls.readContract({ ...checkout, functionName: "maxCopyFee" }),
      ctx.pls.readContract({ ...checkout, functionName: "copyFee" }),
      ctx.pls.readContract({ ...checkout, functionName: "owner" }),
    ]);
  } catch (error) {
    state.on = false;
    state.offered = false;
    note(ctx, state, now, `copy fee: the checkout ${config.checkout} has none (deployed before the copy fee?), so copies stay free (${short(error)})`);
    return;
  }
  state.admin = admin;
  state.on = isAddressEqual(bot, ctx.account.address) && cap > 0n;
  if (!state.on) {
    state.offered = false;
    note(
      ctx,
      state,
      now,
      cap === 0n
        ? "copy fee: switched off on the admin page, so copies stay free"
        : "copy fee: off until this bot is chosen as the copy bot on the admin page, so copies stay free",
    );
    return;
  }

  const [gasPrice, perUsdc, eth] = await Promise.all([
    ctx.eth.getGasPrice(),
    weiPerUsdc(ctx),
    ctx.eth.getBalance({ address: ctx.account.address }),
  ]);
  if (perUsdc) {
    const gas = copyGas(ctx.state.relay);
    const cost = copyCost(gas, gasPrice, perUsdc);
    // Paid copies not yet claimed keep their share of its ETH, so it never offers more than it can make.
    const waiting = Object.values(ctx.state.messages).filter((m) => m.status === "waiting" && m.paid).length;
    const need = paidCopyNeed(gasPrice, claimLimit(ctx.state.relay), gas, waiting);
    const fee = feeToSet(feeFor(cost, config.relayLimits.freeCopyUsdc), eth, need);
    if (worthUpdating(current, fee, cap)) {
      const tx = await send(ctx, "pls", { ...checkout, functionName: "setCopyFee", args: [fee] });
      const queued = waiting === 0 ? "" : ` with ${waiting} paid ${waiting === 1 ? "copy" : "copies"} still to go`;
      const why =
        fee === UNAVAILABLE
          ? `a copy costs about ${usdc(cost)} USDC on Ethereum now, and copying one at once needs ${formatEther(need)} ETH on hand${queued}; ` +
            `it holds ${formatEther(eth)}, and tops up while copies are free (COPY_NOW_ETH). Owners can copy theirs themselves meanwhile`
          : `a copy costs about ${usdc(cost)} USDC on Ethereum now`;
      ctx.log(`copy fee: ${feeText(fee, cap)} (${why}) (${tx})`);
      current = fee;
    } else {
      note(ctx, state, now, `copy fee: on, at most ${usdc(cap)} USDC; now ${feeText(current, cap)}`);
    }
  } else {
    note(ctx, state, now, `copy fee: couldn't read ETH's price on Uniswap just now; it stays at ${usdc(current)} USDC`);
  }
  state.fee = current.toString();
  state.offered = current > 0n && current <= cap;
  state.free = current === 0n;
}

/** Logs `text` at most once an hour. */
function note(ctx: Context, state: CopyFeeState, now: bigint, text: string): void {
  const last = state.noted[text];
  if (last !== undefined && now - BigInt(last) < HOUR) return;
  for (const [said, at] of Object.entries(state.noted)) if (now - BigInt(at) >= 24n * HOUR) delete state.noted[said];
  state.noted[text] = now.toString();
  ctx.log(text);
}
