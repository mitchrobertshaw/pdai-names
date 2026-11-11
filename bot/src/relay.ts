// Claims bridge messages from the .hex contracts on Ethereum, as soon as validators have signed them.
//
// HexOrderFiller's messages pay fillers or refund buyers; HexMirrorSync's keep the Ethereum copy up
// to date. The bridge signs them on PulseChain (about 11 to 15 minutes), and then someone has to
// submit them on Ethereum and pay the gas (a few cents). Anyone may; this bot does it for every
// message the .hex contracts send, and for its own USDC sent to Ethereum to buy ETH. The signatures
// are checked by the bridge, so the bot cannot alter a message, only deliver it.
//
// When Ethereum is busy and the copy fee is on (copyfee.ts), copies of new names and renewals wait
// for its fees to fall, unless someone paid the copy fee for them. Paid copies, the admin's, and
// changes of owner go at once: a name's old owner would otherwise still get what's sent to it there.
//
// While a copy waits, its owner may deliver it themselves on Ethereum, paying the fee in ETH (the
// app's "Copy it myself"). The bot then finds it delivered and leaves it. Copies held back are looked
// at again every few minutes rather than on every pass, so a long wait doesn't swamp the bot or its
// RPCs, and all at once when fees fall or the fee is switched off (copyfee.ts). Finished messages
// are forgotten after a week.

import {
  type Address,
  type Hex,
  type TransactionReceipt,
  decodeFunctionData,
  getAbiItem,
  isAddressEqual,
  keccak256,
  toBytes,
  zeroAddress,
} from "viem";

import {
  ORDER_STATUS,
  REGISTERED,
  bridgeCallsAbi,
  checkoutAbi,
  foreignAmbAbi,
  homeAmbAbi,
  mirrorRegistrarAbi,
  mirrorRegistryAbi,
  orderBookAbi,
  tokenBridgeCallsAbi,
} from "./abis.ts";
import { type AmbMessage, isFullySigned, packSignatures, parseAmbMessage } from "./amb.ts";
import type { RelayLimits } from "./config.ts";
import type { Context } from "./context.ts";
import { claimLimit, claimNeed, copyCost, copyGas, recordClaimLimit, recordCopyGas, weiPerUsdc } from "./copyfee.ts";
import { short, submit, usdc } from "./orders.ts";
import type { MessageRecord, RelayState } from "./state.ts";

const LOG_RANGE = 50_000n;
/**
 * About the gas a claim may take, for the daily allowance and the ETH kept back. The bridge runs a
 * message only if all the gas the message asks for is still left once it has checked the
 * signatures. Under Ethereum's next upgrade, which Sepolia already runs, that checking costs far
 * more than it did, and in November 2026 a copy of a name (1 million gas of its own) needed 1.6
 * million to claim on Sepolia, of which it used about 1.05 million.
 */
export const CLAIM_GAS = 1_600_000n;
/**
 * Gas kept back from other claims for the bot's own refill: claiming its USDC (the token bridge's
 * messages ask for 2 million gas, so a claim needs about 2.6 million), approving, buying ETH.
 */
export const REFILL_GAS = 3_000_000n;

/** The gas to send a claim with: what Ethereum works out it needs, and a fifth more to spare. */
export function claimGas(estimate: bigint): bigint {
  return estimate + estimate / 5n;
}
/** A claim not seen mined after this long is taken as dropped, and sent again. */
const CLAIM_TIMEOUT = 15n * 60n;
const HOUR = 3600n;
/** How often a message held back is looked at again. Paid copies and the admin's: every pass. */
export const RECHECK = 5n * 60n;
/** Finished messages are forgotten this long after, so the bot's records stay small. */
const FORGET_AFTER = 7n * 24n * HOUR;
const userRequestForSignature = getAbiItem({ abi: homeAmbAbi, name: "UserRequestForSignature" });
const copyPaid = getAbiItem({ abi: checkoutAbi, name: "CopyPaid" });

/**
 * The USDC arriving on Ethereum, if `message` is the bot's own transfer of USDC from PulseChain to
 * its wallet on Ethereum (sent to buy ETH); null for anything else.
 */
export function ownTransfer(message: AmbMessage, bot: Address, homeBridge: Address, ethereumUsdc: Address): bigint | null {
  if (!isAddressEqual(message.sender, homeBridge)) return null;
  try {
    const [token, receiver, value] = decodeFunctionData({ abi: tokenBridgeCallsAbi, data: message.data }).args;
    return isAddressEqual(receiver, bot) && isAddressEqual(token, ethereumUsdc) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Records messages the .hex contracts sent through the bridge since the last scan, and the bot's
 * own USDC transfers to Ethereum: found here even if the bot lost track of sending one. Notes the
 * copies someone paid the copy fee for, and those the admin sent: both are copied at once.
 */
export async function scanMessages(ctx: Context): Promise<void> {
  const { config } = ctx;
  const latest = await ctx.pls.getBlockNumber();
  const senders = new Set<Address>([config.orderFiller, config.mirrorSync].map((a) => a.toLowerCase() as Address));
  const t = config.treasury;
  const admin = ctx.state.copyFee?.admin as Address | undefined;
  for (let from = BigInt(ctx.state.pulsechainAmbBlock) + 1n; from <= latest; from += LOG_RANGE) {
    const to = from + LOG_RANGE - 1n < latest ? from + LOG_RANGE - 1n : latest;
    const logs = await ctx.pls.getLogs({ address: config.homeAmb, event: userRequestForSignature, fromBlock: from, toBlock: to });
    for (const log of logs) {
      const message = parseAmbMessage(log.args.encodedData!);
      if (ctx.state.messages[message.messageId]) continue;
      const own = ownTransfer(message, ctx.account.address, t.homeBridge, t.ethereumUsdc);
      if (own === null && !senders.has(message.sender.toLowerCase() as Address)) continue;
      const record: MessageRecord = {
        messageId: message.messageId,
        encoded: message.encoded,
        hash: message.hash,
        gasLimit: message.gasLimit.toString(),
        sender: message.sender,
        seenAtBlock: log.blockNumber.toString(),
        status: "waiting",
        ...(own === null ? {} : { own: { usdc: own.toString() } }),
      };
      if (admin && own === null && isAddressEqual(message.sender, config.mirrorSync)) {
        const tx = await ctx.pls.getTransaction({ hash: log.transactionHash! });
        if (isAddressEqual(tx.from, admin)) record.admin = true;
      }
      ctx.state.messages[message.messageId] = record;
    }
    if (config.checkout) {
      const paid = await ctx.pls.getLogs({ address: config.checkout, event: copyPaid, fromBlock: from, toBlock: to });
      for (const log of paid) {
        const record = ctx.state.messages[log.args.messageId!];
        if (record && !record.paid) record.paid = { fee: log.args.fee!.toString() };
      }
    }
    ctx.state.pulsechainAmbBlock = to.toString();
  }
}

export type Hold = {
  kind: "own" | "mirror" | "settle";
  label?: string; // the name a mirror message copies
  now: bigint;
  cost: bigint; // the most claiming it may cost, in wei: what's kept on hand for it
  copyCost?: bigint; // about what a copy of a name really costs, in wei, from the gas copies use
  ethBalance: bigint;
  reserve: bigint; // wei kept back for claiming the bot's own refill
  limits: RelayLimits;
  relay: RelayState;
  priority?: "paid" | "admin"; // someone paid the copy fee for it, or the admin sent it
  paidNeed?: bigint; // the ETH a paid copy's claim needs on hand (claimNeed in copyfee.ts)
  ownerChange?: boolean; // it gives the name a new owner on Ethereum
  copyUsdc?: bigint; // about what a copy costs now, in USDC units, if known
  feeOn?: boolean; // the copy fee is on, so anyone could have paid for this copy to go at once
};

/**
 * Why a message should wait rather than be claimed now, or null to claim it. The bot's own USDC is
 * always claimed (it buys the ETH everything else needs). Others leave enough ETH for that.
 *
 * Copies of names: one someone paid the copy fee for, or the admin sent, goes at once (a paid one
 * needs only the ETH for its own claim, which the bot keeps on hand while the fee is on). While the
 * copy fee is on and a copy costs more than the project pays (COPY_FREE_USDC), new names and
 * renewals wait for Ethereum's fees to fall; a change of owner doesn't, as the old owner would
 * still get what's sent to the name there. All of these keep within the day's ETH allowance, and to
 * one copy of a name an hour (the newest change wins, so nothing is lost by waiting).
 */
export function holdReason(h: Hold): string | null {
  if (h.kind === "own") return null;
  if (h.priority === "paid" && h.paidNeed !== undefined) {
    // Someone paid to copy it at once: it may use the ETH kept back for the bot's own refill.
    return h.ethBalance < h.paidNeed ? "low on ETH for a paid copy: it goes once the bot has more" : null;
  }
  if (h.ethBalance < h.reserve + h.cost) return "low on ETH: what's left is kept for claiming its own USDC to buy more";
  if (h.kind !== "mirror" || h.priority) return null;
  if (h.feeOn && !h.ownerChange && h.copyUsdc !== undefined && h.copyUsdc > h.limits.freeCopyUsdc) {
    return (
      `${h.label}.hex waits for Ethereum's fees to fall: a copy costs more than the ${usdc(h.limits.freeCopyUsdc)} USDC ` +
      "the project pays (COPY_FREE_USDC), and nobody paid its copy fee"
    );
  }
  // The day's allowance counts what copies really cost (claims are charged for the gas they use).
  if (BigInt(h.relay.spent) + (h.copyCost ?? h.cost) > h.limits.dailyEth) {
    return "at today's limit of ETH for copying names (RELAY_DAILY_ETH): the rest wait until tomorrow (UTC)";
  }
  const last = h.label === undefined ? undefined : h.relay.lastClaim[h.label];
  if (last !== undefined && h.now - BigInt(last) < h.limits.nameCooldown) {
    return `${h.label}.hex was copied less than ${h.limits.nameCooldown / 60n} minutes ago: its newest change follows after that`;
  }
  return null;
}

const utcDay = (now: bigint) => new Date(Number(now) * 1000).toISOString().slice(0, 10);

/** What copying names has spent on Ethereum today (UTC), in wei. */
export function spentToday(relay: RelayState | undefined, now: bigint): bigint {
  return relay && relay.day === utcDay(now) ? BigInt(relay.spent) : 0n;
}

/** The relay's own records, with the day's spending started afresh each UTC day. */
function relayState(ctx: Context, now: bigint): RelayState {
  const relay = (ctx.state.relay ??= { day: utcDay(now), spent: "0", lastClaim: {}, noted: {} });
  if (relay.day !== utcDay(now)) {
    relay.day = utcDay(now);
    relay.spent = "0";
  }
  const cooldown = ctx.config.relayLimits.nameCooldown;
  for (const [label, at] of Object.entries(relay.lastClaim)) if (now - BigInt(at) >= cooldown) delete relay.lastClaim[label];
  for (const [text, at] of Object.entries(relay.noted)) if (now - BigInt(at) >= 24n * HOUR) delete relay.noted[text];
  return relay;
}

/** The name a HexMirrorSync message copies, if it is one. */
function labelOf(message: MessageRecord): string | undefined {
  try {
    const call = decodeFunctionData({ abi: bridgeCallsAbi, data: parseAmbMessage(message.encoded).data });
    return call.functionName === "mirror" ? call.args[0] : undefined;
  } catch {
    return undefined;
  }
}

/** Forgets messages finished more than FORGET_AFTER ago; notes when the others finished. */
export function forgetFinished(messages: Record<string, MessageRecord>, now: bigint): void {
  for (const [id, m] of Object.entries(messages)) {
    if (m.status === "waiting") continue;
    if (!m.doneAt) m.doneAt = now.toString(); // finished before the bot noted when
    else if (now - BigInt(m.doneAt) >= FORGET_AFTER) delete messages[id];
  }
}

/** Whether a message held back is due to be looked at again (paid copies and the admin's always are). */
export function due(message: MessageRecord, now: bigint): boolean {
  return message.paid !== undefined || message.admin === true || !message.recheckAt || now >= BigInt(message.recheckAt);
}

/** Claims every waiting message that validators have finished signing, the bot's own first. */
export async function claimMessages(ctx: Context): Promise<void> {
  const now = BigInt(Math.floor(Date.now() / 1000));
  forgetFinished(ctx.state.messages, now);
  const waiting = Object.values(ctx.state.messages).filter((m) => m.status === "waiting");
  if (waiting.length === 0) return;
  waiting.sort((a, b) => Number(Boolean(b.own)) - Number(Boolean(a.own)));
  const relay = relayState(ctx, now);
  let funds: { gasPrice: bigint; eth: bigint; weiPerUsdc: bigint | undefined } | null = null;
  const required = await ctx.pls.readContract({ address: ctx.config.homeAmb, abi: homeAmbAbi, functionName: "requiredSignatures" });
  for (const message of waiting) {
    try {
      // A claim already sent: wait for it, rather than send another that would only revert.
      if (message.claimTx && !(await claimSettled(ctx, message, relay, now))) continue;
      if (message.status !== "waiting") continue;
      if (!message.claimTx && !due(message, now)) continue;
      const relayed = await ctx.eth.readContract({ address: ctx.config.foreignAmb, abi: foreignAmbAbi, functionName: "relayedMessages", args: [message.messageId] });
      if (relayed) {
        // Its owner copied it themselves (or anyone else did): nothing left to do.
        message.status = "claimed-by-someone-else";
        message.doneAt = now.toString();
        delete message.recheckAt;
        const label = message.own ? undefined : labelOf(message);
        ctx.log(`bridge message ${message.messageId}${label === undefined ? "" : ` (${label}.hex)`} was delivered on Ethereum by someone else, so the bot leaves it`);
        continue;
      }
      const signed = await ctx.pls.readContract({ address: ctx.config.homeAmb, abi: homeAmbAbi, functionName: "numMessagesSigned", args: [message.hash] });
      if (!isFullySigned(signed, required)) continue;
      const assessed: Assessment = message.own ? { skip: null, ownerChange: false } : await assess(ctx, message, waiting);
      if (assessed.skip) {
        message.status = "skipped";
        message.note = assessed.skip;
        message.doneAt = now.toString();
        delete message.recheckAt;
        ctx.log(`bridge message ${message.messageId}: not claiming it, ${assessed.skip}`);
        continue;
      }
      const kind = message.own ? "own" : isAddressEqual(message.sender as Address, ctx.config.orderFiller) ? "settle" : "mirror";
      if (kind !== "own") {
        const feeOn = ctx.state.copyFee?.on === true;
        funds ??= {
          gasPrice: await ctx.eth.getGasPrice(),
          eth: await ctx.eth.getBalance({ address: ctx.account.address }),
          weiPerUsdc: feeOn ? await weiPerUsdc(ctx) : undefined,
        };
        const hold = holdReason({
          kind,
          label: kind === "mirror" ? labelOf(message) : undefined,
          now,
          cost: funds.gasPrice * CLAIM_GAS,
          copyCost: funds.gasPrice * copyGas(relay),
          paidNeed: claimNeed(funds.gasPrice, claimLimit(relay)),
          ethBalance: funds.eth,
          reserve: funds.gasPrice * REFILL_GAS,
          limits: ctx.config.relayLimits,
          relay,
          priority: message.paid ? "paid" : message.admin ? "admin" : undefined,
          ownerChange: assessed.ownerChange,
          copyUsdc: funds.weiPerUsdc ? copyCost(copyGas(relay), funds.gasPrice, funds.weiPerUsdc) : undefined,
          feeOn,
        });
        if (hold) {
          noteOnce(ctx, relay, now, `bridge: holding back a claim, ${hold}`);
          message.recheckAt = (now + RECHECK).toString();
          continue;
        }
        delete message.recheckAt;
      }
      const signatures: Hex[] = [];
      for (let i = 0n; i < required; i++) {
        signatures.push(await ctx.pls.readContract({ address: ctx.config.homeAmb, abi: homeAmbAbi, functionName: "signature", args: [message.hash, i] }));
      }
      const claim = {
        address: ctx.config.foreignAmb,
        abi: foreignAmbAbi,
        functionName: "executeSignatures",
        args: [message.encoded, packSignatures(signatures)],
      } as const;
      // Asked of Ethereum each time, since what a claim needs changes with Ethereum's upgrades.
      const gas = claimGas(await ctx.eth.estimateContractGas({ ...claim, account: ctx.account }));
      if (kind === "mirror") recordClaimLimit(relay, gas);
      const hash = await submit(ctx, "eth", { ...claim, gas });
      message.claimTx = hash;
      message.claimSentAt = now.toString();
      ctx.save();
      const cost = finishClaim(ctx, message, await ctx.eth.waitForTransactionReceipt({ hash }), relay, now);
      if (funds) funds.eth -= cost;
    } catch (error) {
      // Once an hour at most for the same trouble, rather than at every look.
      noteOnce(ctx, relay, now, `bridge message ${message.messageId}: ${short(error)} (will retry)`);
    }
  }
}

/** Records how a claim went, and what it cost; returns the cost in wei. */
function finishClaim(ctx: Context, message: MessageRecord, receipt: TransactionReceipt, relay: RelayState, now: bigint): bigint {
  const cost = receipt.gasUsed * receipt.effectiveGasPrice;
  delete message.claimTx;
  delete message.claimSentAt;
  if (receipt.status !== "success") {
    ctx.log(`bridge message ${message.messageId}: the claim ${receipt.transactionHash} reverted (will retry)`);
    return cost;
  }
  message.status = "claimed";
  message.tx = receipt.transactionHash;
  message.doneAt = now.toString();
  const label = message.own ? undefined : labelOf(message);
  if (label !== undefined) {
    if (!message.paid) relay.spent = (BigInt(relay.spent) + cost).toString(); // paid copies don't use up the day's allowance
    relay.lastClaim[label] = now.toString();
    recordCopyGas(relay, receipt.gasUsed);
  }
  const why = message.paid ? `, copy fee paid: ${usdc(BigInt(message.paid.fee))} USDC` : message.admin ? ", sent by the admin" : "";
  const from = message.own ? "the bot's own USDC, for gas" : label !== undefined ? `HexMirrorSync, ${label}.hex${why}` : "HexOrderFiller";
  ctx.log(`bridge message ${message.messageId} (${from}) claimed on Ethereum (${receipt.transactionHash})`);
  return cost;
}

/** For a claim sent earlier: true once it's settled (mined, or given up on), false while it may still be mined. */
async function claimSettled(ctx: Context, message: MessageRecord, relay: RelayState, now: bigint): Promise<boolean> {
  const receipt = await ctx.eth.getTransactionReceipt({ hash: message.claimTx! }).catch(() => null);
  if (receipt) {
    finishClaim(ctx, message, receipt, relay, now);
    return true;
  }
  if (now - BigInt(message.claimSentAt ?? "0") < CLAIM_TIMEOUT) return false;
  ctx.log(`bridge message ${message.messageId}: its claim ${message.claimTx} was never mined; claiming it again`);
  delete message.claimTx;
  delete message.claimSentAt;
  return true;
}

/** Logs `text` at most once an hour. */
function noteOnce(ctx: Context, relay: RelayState, now: bigint, text: string): void {
  const last = relay.noted[text];
  if (last !== undefined && now - BigInt(last) < HOUR) return;
  relay.noted[text] = now.toString();
  ctx.log(text);
}

/** Whether a message is worth claiming (`skip` says why not), and if it gives a name a new owner. */
type Assessment = { skip: string | null; ownerChange: boolean };

/**
 * Anyone can make the .hex contracts send a message (report a made-up expired order, or sync a
 * name that has not changed) for a fraction of a cent on PulseChain, while claiming it costs ETH.
 * So only messages that would change something on Ethereum are claimed. Says why a message is not
 * worth claiming, if it isn't, and whether a copy gives the name a new owner on Ethereum.
 */
async function assess(ctx: Context, message: MessageRecord, waiting: MessageRecord[]): Promise<Assessment> {
  const { config } = ctx;
  const skip = (reason: string): Assessment => ({ skip: reason, ownerChange: false });
  const parsed = parseAmbMessage(message.encoded);
  let call;
  try {
    call = decodeFunctionData({ abi: bridgeCallsAbi, data: parsed.data });
  } catch {
    return skip("it is not a .hex call");
  }

  if (call.functionName === "settle") {
    if (!isAddressEqual(parsed.executor, config.orderBook)) return skip("it is for a different order book");
    const [orderId, commitment, deadline] = call.args;
    const [, , orderCommitment, orderDeadline, status] = await ctx.eth.readContract({ address: config.orderBook, abi: orderBookAbi, functionName: "orders", args: [orderId] });
    if (status !== ORDER_STATUS.OPEN || orderCommitment !== commitment || orderDeadline !== deadline) {
      return skip("it does not match an open order");
    }
    return { skip: null, ownerChange: false };
  }

  if (!isAddressEqual(parsed.executor, config.mirrorRegistrar)) return skip("it is for a different Ethereum copy");
  const [label, owner, expiry, nonce] = call.args;
  const labelId = BigInt(keccak256(toBytes(label)));
  const last = await ctx.eth.readContract({ address: config.mirrorRegistrar, abi: mirrorRegistrarAbi, functionName: "lastNonce", args: [labelId] });
  if (nonce <= last) return skip(`Ethereum already has a newer copy of ${label}.hex`);
  for (const other of waiting) {
    if (other.messageId === message.messageId) continue;
    try {
      const o = decodeFunctionData({ abi: bridgeCallsAbi, data: parseAmbMessage(other.encoded).data });
      if (o.functionName === "mirror" && o.args[0] === label && o.args[3] > nonce) {
        // The newer copy goes instead, and as this one would have: paid for, or the admin's.
        if (message.paid && !other.paid) other.paid = message.paid;
        if (message.admin) other.admin = true;
        return skip(`a newer copy of ${label}.hex is on its way`);
      }
    } catch {}
  }
  const registry = await ctx.eth.readContract({ address: config.mirrorRegistrar, abi: mirrorRegistrarAbi, functionName: "REGISTRY" });
  const state = await ctx.eth.readContract({ address: registry, abi: mirrorRegistryAbi, functionName: "getState", args: [labelId] });
  const now = (await ctx.eth.getBlock()).timestamp;
  const live = !isAddressEqual(owner, zeroAddress) && expiry > now;
  const registered = state.status === REGISTERED;
  if (!live && !registered) return skip(`${label}.hex is not on Ethereum and should not be`);
  if (live && registered && isAddressEqual(state.latestOwner, owner) && state.expiry === expiry) {
    return skip(`Ethereum already shows ${label}.hex as it is on PulseChain`);
  }
  return { skip: null, ownerChange: live && registered && !isAddressEqual(state.latestOwner, owner) };
}
