// Reads what the referral payout report adds up (src/lib/payouts.ts) from PulseChain: every
// referred purchase and renewal the registrar recorded in a period, and the referrers and payment
// tokens behind them. It only reads; paying is up to the person running the report.

import { type Address, type Hex, type PublicClient, zeroAddress, zeroHash } from "viem";

import type { Deployment } from "../deployment";
import { type Payout, type ReferredPayment, type Referrer, readPayoutNote, type Token, type Transfer } from "../lib/payouts";
import { DISPERSE, erc20Abi, labelStoreAbi, registrarEvents, registryAbi, transferEvent } from "./abis";

/** Blocks per log request, as the bot reads PulseChain. */
const RANGE = 50_000n;
/** Lookups sent at once, to stay polite to public RPCs. */
const BATCH = 10;

type PulseChain = Pick<Deployment["pulsechain"], "registry" | "registrar" | "startBlock">;

async function inBatches<T, R>(items: T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += BATCH) out.push(...(await Promise.all(items.slice(i, i + BATCH).map(work))));
  return out;
}

/** The first block from `low` to `high` stamped at or after `time` (unix seconds), or `high + 1`. */
export async function firstBlockFrom(client: PublicClient, time: bigint, low: bigint, high: bigint): Promise<bigint> {
  let lo = low;
  let hi = high + 1n;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const block = await client.getBlock({ blockNumber: mid });
    if (block.timestamp >= time) hi = mid;
    else lo = mid + 1n;
  }
  return lo;
}

export interface Progress {
  /** Blocks read so far, of `total`. */
  done: bigint;
  total: bigint;
}

/** Every referred purchase and renewal from `from` up to, not including, `to` (unix seconds). */
export async function readReferredPayments(
  client: PublicClient,
  pulsechain: PulseChain,
  from: number,
  to: number,
  onProgress?: (progress: Progress) => void,
): Promise<{ payments: ReferredPayment[]; blocks: { first: bigint; last: bigint } }> {
  const latest = await client.getBlockNumber();
  const deployed = BigInt(pulsechain.startBlock);
  const first = await firstBlockFrom(client, BigInt(from), deployed, latest);
  const last = (await firstBlockFrom(client, BigInt(to), first, latest)) - 1n;

  const payments: ReferredPayment[] = [];
  const renewed: { payment: ReferredPayment; tokenId: bigint }[] = [];
  const total = last >= first ? last - first + 1n : 0n;
  onProgress?.({ done: 0n, total });
  for (let start = first; start <= last; start += RANGE) {
    const end = start + RANGE - 1n < last ? start + RANGE - 1n : last;
    const logs = await client.getLogs({ address: pulsechain.registrar, events: registrarEvents, fromBlock: start, toBlock: end });
    for (const log of logs) {
      const referrer = log.args.referrer;
      if (!referrer || referrer === zeroHash) continue;
      const where = { block: log.blockNumber, tx: log.transactionHash };
      if (log.eventName === "NameRegistered") {
        const { label, owner, paymentToken, base, premium } = log.args;
        payments.push({ kind: "purchase", label: label!, owner: owner!, referrer, amount: base! + premium!, token: paymentToken!, ...where });
      } else {
        const { tokenId, label, paymentToken, amount } = log.args;
        const payment: ReferredPayment = { kind: "renewal", label: label!, owner: null, referrer, amount: amount!, token: paymentToken!, ...where };
        payments.push(payment);
        renewed.push({ payment, tokenId: tokenId! });
      }
    }
    onProgress?.({ done: end - first + 1n, total });
  }

  // A renewal doesn't say who owns the name, so look it up: needed to spot self-referrals.
  await inBatches(renewed, async ({ payment, tokenId }) => {
    const owner = await client.readContract({ address: pulsechain.registry, abi: registryAbi, functionName: "getOwner", args: [tokenId] });
    payment.owner = owner === zeroAddress ? null : owner;
  });
  return { payments, blocks: { first, last } };
}

/** Each referral tag's name, if it is one, and who owns that name now. */
export async function readReferrers(client: PublicClient, registry: Address, tags: Hex[]): Promise<Map<Hex, Referrer>> {
  const labelStore = await client.readContract({ address: registry, abi: registryAbi, functionName: "LABEL_STORE" });
  const unique = [...new Set(tags.map((tag) => tag.toLowerCase() as Hex))];
  const found = await inBatches(unique, async (tag) => {
    const id = BigInt(tag);
    const [label, owner] = await Promise.all([
      client.readContract({ address: labelStore, abi: labelStoreAbi, functionName: "getLabel", args: [id] }),
      client.readContract({ address: registry, abi: registryAbi, functionName: "getOwner", args: [id] }),
    ]);
    return [tag, { label: label || null, owner: owner === zeroAddress ? null : owner }] as const;
  });
  return new Map(found);
}

/** The symbol and decimals of each payment token. */
export async function readTokens(client: PublicClient, addresses: Address[]): Promise<Map<Address, Token>> {
  const unique = [...new Set(addresses.map((address) => address.toLowerCase() as Address))];
  const found = await inBatches(unique, async (address) => {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    ]);
    return [address, { symbol, decimals }] as const;
  });
  return new Map(found);
}

/** Every transfer of `token` out of Disperse to these wallets from block `from` on: past payouts. */
export async function readPayoutTransfers(client: PublicClient, token: Address, wallets: Address[], from: bigint): Promise<Transfer[]> {
  if (!wallets.length) return [];
  const latest = await client.getBlockNumber();
  const out: Transfer[] = [];
  for (let start = from; start <= latest; start += RANGE) {
    const end = start + RANGE - 1n < latest ? start + RANGE - 1n : latest;
    const logs = await client.getLogs({ address: token, event: transferEvent[0], args: { from: DISPERSE, to: wallets }, fromBlock: start, toBlock: end });
    for (const log of logs) out.push({ to: log.args.to!, value: log.args.value!, tx: log.transactionHash, block: log.blockNumber });
  }
  return out;
}

/**
 * Every payout `payer` has made through Disperse from block `from` on, with the days each says it
 * paid for. Disperse first takes a payout's whole total from the payer, so each payout is one
 * transfer from the payer to Disperse; its note is at the end of the transaction that made it.
 */
export async function readPayouts(client: PublicClient, token: Address, payer: Address, from: bigint): Promise<Payout[]> {
  const latest = await client.getBlockNumber();
  const found: { tx: Hex; block: bigint }[] = [];
  for (let start = from; start <= latest; start += RANGE) {
    const end = start + RANGE - 1n < latest ? start + RANGE - 1n : latest;
    const logs = await client.getLogs({ address: token, event: transferEvent[0], args: { from: payer, to: DISPERSE }, fromBlock: start, toBlock: end });
    for (const log of logs) found.push({ tx: log.transactionHash, block: log.blockNumber });
  }
  return inBatches(found, async ({ tx, block }) => {
    const sent = await client.getTransaction({ hash: tx });
    const ours = sent.from.toLowerCase() === payer.toLowerCase() && sent.to?.toLowerCase() === DISPERSE.toLowerCase();
    return { tx, block, days: ours ? readPayoutNote(sent.input) : null };
  });
}
