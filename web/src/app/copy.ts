// The Ethereum copy fee. Each name has a copy on Ethereum, written there by the project's bot, which
// pays Ethereum's gas for it. While a copy costs up to $2 there's no fee, and copies follow by
// themselves in about 15 minutes. When Ethereum is busy, the bot sets a copy fee on the checkout for
// the rest: anyone buying, renewing or sending a name can pay it to have it copied at once, however
// busy Ethereum is, or leave it to be copied free once Ethereum's fees fall. Copying at once is
// offered while the bot holds the ETH to do it straight away; the admin's cap is a safety limit.

import { useEffect, useState } from "react";
import {
  type Address,
  encodeFunctionData,
  formatEther,
  getAbiItem,
  type Hex,
  isAddressEqual,
  keccak256,
  type Log,
  parseEventLogs,
  type TransactionReceipt,
} from "viem";

import { isFullySigned, packSignatures } from "../lib/amb";
import { checkoutAbi, foreignAmbAbi, homeAmbAbi, mirrorRegistrarAbi, mirrorSyncAbi, registryAbi } from "./abis";
import { clients, deployment } from "./network";
import { labelId } from "./order";

export type CopyFee =
  /** Nothing to pay: copies follow by themselves. Ethereum isn't busy, or the fee is off. */
  | { kind: "free" }
  /** `fee` (USDC units) copies a name at once; without it, it's copied free once Ethereum's fees fall. */
  | { kind: "offered"; fee: bigint }
  /**
   * Copying at once isn't available just now: the bot hasn't the ETH to do it straight away at
   * today's gas, or (`overCap`) a copy would cost more than the admin's safety limit, `cap` (USDC
   * units). Copies wait for Ethereum's fees to fall.
   */
  | { kind: "busy"; cap: bigint; overCap: boolean };

/** The fee the bot sets while copying at once is paused (the bot's UNAVAILABLE): above any cap. */
export const UNAVAILABLE = 2n ** 256n - 1n;

/** The copy fee, from the checkout's fee and the admin's cap. */
export function copyFeeOf(fee: bigint, cap: bigint): CopyFee {
  if (fee === 0n || cap === 0n) return { kind: "free" };
  return fee > cap ? { kind: "busy", cap, overCap: fee !== UNAVAILABLE } : { kind: "offered", fee };
}

/** The copy fee now. Free if the checkout can't say: one deployed before the copy fee has none. */
export async function readCopyFee(): Promise<CopyFee> {
  const d = deployment;
  if (!d) return { kind: "free" };
  const checkout = { address: d.pulsechain.checkout, abi: checkoutAbi } as const;
  try {
    const [fee, cap] = await Promise.all([
      clients.pulsechain.readContract({ ...checkout, functionName: "copyFee" }),
      clients.pulsechain.readContract({ ...checkout, functionName: "maxCopyFee" }),
    ]);
    return copyFeeOf(fee, cap);
  } catch {
    return { kind: "free" };
  }
}

/** The copy fee, read again every minute: null until it's known. */
export function useCopyFee(): CopyFee | null {
  const [fee, setFee] = useState<CopyFee | null>(null);
  useEffect(() => {
    let alive = true;
    const read = () => readCopyFee().then((value) => alive && setFee(value));
    void read();
    const timer = setInterval(read, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return fee;
}

/** The copy fee a payment paid, from its receipt: 0 if it paid none. */
export function copyFeePaid(receipt: Pick<TransactionReceipt, "logs">): bigint {
  const checkout = deployment?.pulsechain.checkout;
  if (!checkout) return 0n;
  return parseEventLogs({ abi: checkoutAbi, eventName: "CopyPaid", logs: receipt.logs })
    .filter((log) => isAddressEqual(log.address, checkout))
    .reduce((sum, log) => sum + log.args.fee, 0n);
}

/** Dollars, for the page: "$1.25". */
export function feeText(fee: bigint): string {
  return `$${(Number(fee) / 1e6).toFixed(2)}`;
}

/** Dollars, without cents when there are none: "$100", "$12.50". */
export function capText(cap: bigint): string {
  return cap % 1_000_000n === 0n ? `$${(cap / 1_000_000n).toLocaleString("en-US")}` : feeText(cap);
}

/** What the project pays of each copy, above which there's a fee (the bot's COPY_FREE_USDC). */
export const FREE_COPY = "$2";

/** The contracts that copy names to Ethereum, and the bridge's on each side. */
export interface Bridge {
  mirrorSync: Address; // HexMirrorSync, on PulseChain
  homeAmb: Address; // the bridge's message contract on PulseChain
  mirror: Address; // HexMirrorRegistrar, on Ethereum
  foreignAmb: Address; // the bridge's message contract on Ethereum
  registry: Address; // the .hex registry on Ethereum, where the copies are
}

let bridge: Promise<Bridge> | null = null;

/**
 * Found from the contracts, so nothing more needs filling in: the checkout's HexMirrorSync, its
 * bridge contract and its partner on Ethereum, and that one's bridge contract and registry.
 */
export function bridgeAddresses(): Promise<Bridge> {
  const d = deployment;
  if (!d) return Promise.reject(new Error("The contracts aren't deployed yet."));
  bridge ??= (async () => {
    const mirrorSync = await clients.pulsechain.readContract({
      address: d.pulsechain.checkout,
      abi: checkoutAbi,
      functionName: "MIRROR_SYNC",
    });
    const [homeAmb, mirror] = await Promise.all([
      clients.pulsechain.readContract({ address: mirrorSync, abi: mirrorSyncAbi, functionName: "AMB" }),
      clients.pulsechain.readContract({ address: mirrorSync, abi: mirrorSyncAbi, functionName: "peer" }),
    ]);
    const [foreignAmb, registry] = await Promise.all([
      clients.ethereum.readContract({ address: mirror, abi: mirrorRegistrarAbi, functionName: "AMB" }),
      clients.ethereum.readContract({ address: mirror, abi: mirrorRegistrarAbi, functionName: "REGISTRY" }),
    ]);
    return { mirrorSync, homeAmb, mirror, foreignAmb, registry };
  })().catch((error) => {
    bridge = null;
    throw error;
  });
  return bridge;
}

const ethereumRegistryAddress = () => bridgeAddresses().then((b) => b.registry);

/**
 * Whether Ethereum's copy of a name shows its owner and paid-until date as PulseChain does: the
 * same, behind, or behind with its copy fee paid (the bot copies it at once).
 */
export type EthereumCopy = "same" | "behind" | "paid" | "unknown";

/** About 8 hours of PulseChain's blocks: far longer than a paid copy takes to go across. */
const RECENT_BLOCKS = 3_000n;

/** Whether someone paid the copy fee for `label` lately. */
async function paidLately(label: string): Promise<boolean> {
  const checkout = deployment?.pulsechain.checkout;
  if (!checkout) return false;
  const latest = await clients.pulsechain.getBlockNumber();
  const logs = await clients.pulsechain.getLogs({
    address: checkout,
    event: getAbiItem({ abi: checkoutAbi, name: "CopyPaid" }),
    fromBlock: latest > RECENT_BLOCKS ? latest - RECENT_BLOCKS : 0n,
    toBlock: latest,
  });
  return logs.some((log) => log.args.label === label);
}

export async function readEthereumCopy(label: string, owner: Address, expiry: number): Promise<EthereumCopy> {
  try {
    const state = await clients.ethereum.readContract({
      address: await ethereumRegistryAddress(),
      abi: registryAbi,
      functionName: "getState",
      args: [labelId(label)],
    });
    if (isAddressEqual(state.latestOwner, owner) && Number(state.expiry) === expiry) return "same";
    return (await paidLately(label).catch(() => false)) ? "paid" : "behind";
  } catch {
    return "unknown";
  }
}

/**
 * Copying a name yourself. Each change to a name sends its owner and paid-until date over the
 * bridge; once the bridge's validators have signed that message (usually 10 to 15 minutes), anyone
 * may deliver it on Ethereum, paying Ethereum's fee in ETH. The bot does that for free copies; this
 * lets an owner do it at once, however busy Ethereum is. The bridge checks the signatures, so a
 * message can only ever say what PulseChain does.
 */
export interface CopyMessage {
  label: string;
  messageId: Hex;
  message: Hex; // the whole message, as the validators sign it
  nonce: bigint; // HexMirrorSync's count: Ethereum takes a message only if it's newer than its copy
  owner: Address; // what PulseChain said: the owner (zero once the name had expired)
  expiry: bigint; // ... and the date it's paid until
}

export type SelfCopy =
  | { kind: "none" } // no message says what PulseChain does now: one goes within minutes of a change
  | { kind: "signing"; found: CopyMessage } // the bridge is signing it: usually 10 to 15 minutes
  | { kind: "ready"; found: CopyMessage; foreignAmb: Address; signatures: Hex } // anyone can deliver it now
  | { kind: "done" }; // delivered, or a newer one was: Ethereum shows it, or will in a moment

/** How far back to look for a name's copy message: about 5 weeks of PulseChain's blocks. */
const SELF_COPY_BLOCKS = 300_000n;
const RANGE = 50_000n;

type SyncedLog = { args: { label?: string; owner?: Address; expiry?: bigint; nonce?: bigint; messageId?: Hex } };

/** The copy message a `Synced` log announced, from the logs of the same transaction. */
function messageOf(synced: SyncedLog, logs: Log[], b: Bridge): CopyMessage | null {
  const { label, owner, expiry, nonce, messageId } = synced.args;
  if (label === undefined || owner === undefined || expiry === undefined || nonce === undefined || !messageId) return null;
  const sent = parseEventLogs({ abi: homeAmbAbi, eventName: "UserRequestForSignature", logs }).find(
    (log) => isAddressEqual(log.address, b.homeAmb) && log.args.messageId === messageId,
  );
  return sent ? { label, messageId, message: sent.args.encodedData, nonce, owner, expiry } : null;
}

/** The copy message a purchase, renewal or send made for `label`, from its receipt. */
export async function copyMessageIn(receipt: TransactionReceipt, label: string): Promise<CopyMessage | null> {
  const b = await bridgeAddresses();
  const synced = parseEventLogs({ abi: mirrorSyncAbi, eventName: "Synced", logs: receipt.logs }).filter(
    (log) => isAddressEqual(log.address, b.mirrorSync) && log.args.label === label,
  );
  const last = synced[synced.length - 1];
  return last ? messageOf(last, receipt.logs, b) : null;
}

/** The newest copy message for `label`, if one was sent lately: looked for from the newest blocks back. */
export async function findCopyMessage(label: string): Promise<CopyMessage | null> {
  const b = await bridgeAddresses();
  const latest = await clients.pulsechain.getBlockNumber();
  const first = latest > SELF_COPY_BLOCKS ? latest - SELF_COPY_BLOCKS : 0n;
  const synced = getAbiItem({ abi: mirrorSyncAbi, name: "Synced" });
  for (let to = latest; to >= first; to -= RANGE) {
    const from = to - RANGE + 1n > first ? to - RANGE + 1n : first;
    const logs = await clients.pulsechain.getLogs({ address: b.mirrorSync, event: synced, fromBlock: from, toBlock: to });
    const mine = logs.filter((log) => log.args.label === label);
    if (mine.length > 0) {
      const newest = mine.reduce((a, c) => ((c.args.nonce ?? 0n) > (a.args.nonce ?? 0n) ? c : a));
      const receipt = await clients.pulsechain.getTransactionReceipt({ hash: newest.transactionHash });
      return messageOf(newest, receipt.logs, b);
    }
    if (from === first) break;
  }
  return null;
}

/**
 * Where `found` stands: delivered (or overtaken by a newer copy), being signed, or ready for anyone
 * to deliver. Once it was `ready`, only whether it's been delivered is read again.
 */
export async function copyStatus(found: CopyMessage, was?: SelfCopy | null): Promise<SelfCopy> {
  const b = await bridgeAddresses();
  const [relayed, last] = await Promise.all([
    clients.ethereum.readContract({ address: b.foreignAmb, abi: foreignAmbAbi, functionName: "relayedMessages", args: [found.messageId] }),
    clients.ethereum.readContract({ address: b.mirror, abi: mirrorRegistrarAbi, functionName: "lastNonce", args: [labelId(found.label)] }),
  ]);
  if (relayed || last >= found.nonce) return { kind: "done" };
  if (was?.kind === "ready" && was.found.messageId === found.messageId) return was;
  const hash = keccak256(found.message);
  const [signed, required] = await Promise.all([
    clients.pulsechain.readContract({ address: b.homeAmb, abi: homeAmbAbi, functionName: "numMessagesSigned", args: [hash] }),
    clients.pulsechain.readContract({ address: b.homeAmb, abi: homeAmbAbi, functionName: "requiredSignatures" }),
  ]);
  if (!isFullySigned(signed, required)) return { kind: "signing", found };
  const signatures = await Promise.all(
    Array.from({ length: Number(required) }, (_, i) =>
      clients.pulsechain.readContract({ address: b.homeAmb, abi: homeAmbAbi, functionName: "signature", args: [hash, BigInt(i)] }),
    ),
  );
  return { kind: "ready", found, foreignAmb: b.foreignAmb, signatures: packSignatures(signatures) };
}

const messages = new Map<string, Promise<CopyMessage | null>>();

/**
 * `label`'s newest copy message, if it says what PulseChain does now (`owner`, `expiry`): one sent
 * before a later change can't bring Ethereum up to date. Kept once found; looked for again if not.
 */
export function selfCopyMessage(label: string, owner: Address, expiry: number): Promise<CopyMessage | null> {
  const key = `${label}:${owner.toLowerCase()}:${expiry}`;
  let found = messages.get(key);
  if (!found) {
    found = findCopyMessage(label).then((m) => (m && isAddressEqual(m.owner, owner) && m.expiry === BigInt(expiry) ? m : null));
    messages.set(key, found);
    found.then(
      (m) => m || messages.delete(key),
      () => messages.delete(key),
    );
  }
  return found;
}

/** Whether `label`'s copy can be delivered yourself now, and what with. */
export async function readSelfCopy(label: string, owner: Address, expiry: number, was?: SelfCopy | null): Promise<SelfCopy> {
  const found = await selfCopyMessage(label, owner, expiry);
  return found ? copyStatus(found, was) : { kind: "none" };
}

/** What delivering a copy yourself takes on Ethereum now. */
export interface SelfCopyCost {
  cost: bigint; // about what it's charged, in wei: the gas it uses, at today's price
  need: bigint; // what the wallet must hold to send it: its whole gas limit, at its highest fee
  balance: bigint; // what the wallet holds on Ethereum
  gas: bigint; // the gas limit it's sent with
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

/** The gas a call would really use, from Ethereum's own reckoning (eth_createAccessList); null if the RPC can't say. */
async function gasUsedBy(from: Address, to: Address, data: Hex): Promise<bigint | null> {
  try {
    const result = (await clients.ethereum.request({
      method: "eth_createAccessList",
      params: [{ from, to, data }, "latest"],
    } as never)) as { gasUsed?: Hex; error?: string } | null;
    return result?.gasUsed && !result.error ? BigInt(result.gasUsed) : null;
  } catch {
    return null;
  }
}

/**
 * The fee for delivering `ready` from `account`, and what the wallet needs on hand to send it.
 * Ethereum only takes a transaction from a wallet holding its whole gas limit at its highest fee,
 * though it charges for the gas used. A copy asks for far more gas than it uses: the bridge holds
 * back the full million gas a copy may use until it has run. So the wallet needs several times
 * the fee on hand, and keeps the rest.
 */
export async function selfCopyCost(ready: Extract<SelfCopy, { kind: "ready" }>, account: Address): Promise<SelfCopyCost> {
  const call = {
    address: ready.foreignAmb,
    abi: foreignAmbAbi,
    functionName: "executeSignatures",
    args: [ready.found.message, ready.signatures],
  } as const;
  const [estimate, used, block, tip, balance] = await Promise.all([
    clients.ethereum.estimateContractGas({ ...call, account }),
    gasUsedBy(account, ready.foreignAmb, encodeFunctionData(call)),
    clients.ethereum.getBlock(),
    clients.ethereum.estimateMaxPriorityFeePerGas(),
    clients.ethereum.getBalance({ address: account }),
  ]);
  // A tenth more gas than the estimate: the bridge runs the copy only if all the gas it asks for is
  // left once it has checked the signatures, and the estimate is just enough for that.
  const gas = estimate + estimate / 10n;
  const base = block.baseFeePerGas ?? 0n;
  // Room for the base fee to rise by half before it's mined; it's charged only what it is then.
  const maxFeePerGas = (base * 3n) / 2n + tip;
  // With a twentieth more: Ethereum's reckoning runs a little under what the copy then uses (about
  // 1% in the launch rehearsal), and a fee is better shown a little high than low.
  const shown = ((used ?? estimate) * 21n) / 20n;
  return { cost: shown * (base + tip), need: gas * maxFeePerGas, balance, gas, maxFeePerGas, maxPriorityFeePerGas: tip };
}

/** ETH for people: to 2 significant figures, rounded up, so a cost is never shown as less than it is. */
export function ethText(wei: bigint): string {
  if (wei === 0n) return "0 ETH";
  const eth = Number(formatEther(wei));
  if (eth < 0.000001) return "under 0.000001 ETH";
  const digits = Math.max(0, 1 - Math.floor(Math.log10(eth)));
  const factor = 10 ** digits;
  return `${Number((Math.ceil(eth * factor - 1e-9) / factor).toFixed(digits))} ETH`;
}

/**
 * Whether `label`'s copy can be delivered yourself: read every 20 seconds while it's behind (once a
 * minute while there's nothing to deliver yet), until it's delivered.
 */
export function useSelfCopy(label: string, owner: Address | null, expiry: number, behind: boolean, version: number): SelfCopy | null {
  const [self, setSelf] = useState<SelfCopy | null>(null);
  useEffect(() => {
    setSelf(null);
    if (!deployment || !behind || !owner) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let was: SelfCopy | null = null;
    const read = async () => {
      const result = await readSelfCopy(label, owner, expiry, was).catch(() => was);
      if (!alive) return;
      was = result;
      setSelf(result);
      if (result?.kind !== "done") timer = setTimeout(read, result?.kind === "none" ? 60_000 : 20_000);
    };
    void read();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [label, owner, expiry, behind, version]);
  return self;
}

/** Ethereum's copy of a name, read again every 30 seconds until it's up to date: null until it's known. */
export function useEthereumCopy(label: string, owner: Address | null, expiry: number, version: number): EthereumCopy | null {
  const [copy, setCopy] = useState<EthereumCopy | null>(null);
  useEffect(() => {
    setCopy(null);
    if (!deployment || !owner) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      const result = await readEthereumCopy(label, owner, expiry);
      if (!alive) return;
      setCopy(result);
      if (result === "behind" || result === "paid") timer = setTimeout(read, 30_000);
    };
    void read();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [label, owner, expiry, version]);
  return copy;
}
