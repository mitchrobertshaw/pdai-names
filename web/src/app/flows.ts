// Buying, renewing and sending names: each a few wallet steps, reported as they go. Each can also
// pay the Ethereum copy fee, while Ethereum is busy, to have the name copied there at once (copy.ts),
// and buying or renewing can instead copy it yourself, paying Ethereum's fee in ETH.

import {
  type Address,
  BaseError,
  type ContractFunctionArgs,
  ContractFunctionRevertedError,
  ExecutionRevertedError,
  type Hex,
  parseGwei,
  type TransactionReceipt,
  zeroAddress,
} from "viem";

import { usdcText } from "../lib/payouts";
import { formatToken } from "../lib/quotes";
import type { ChainKey, PayToken } from "../lib/tokens";
import { checkoutAbi, DISPERSE, disperseAbi, erc20Abi, foreignAmbAbi, registrarAbi, registryAbi } from "./abis";
import {
  type CopyMessage,
  copyFeePaid,
  copyMessageIn,
  copyStatus,
  ethText,
  readCopyFee,
  selfCopyCost,
  type SelfCopyCost,
  selfCopyMessage,
} from "./copy";
import { clients, deployment, network, PAY } from "./network";
import { commitmentOf, labelId, newPurchase, type Purchase, SECONDS_PER_YEAR } from "./order";
import { switchTo, walletClient } from "./wallet";

export type StepStatus = "todo" | "active" | "done" | "error";

export interface Step {
  key: string;
  title: string;
  status: StepStatus;
  detail?: string;
  tx?: { chain: ChainKey; hash: Hex };
  /** When a wait ends, in this computer's time (ms). */
  until?: number;
}

export type Report = (steps: Step[]) => void;

/** The steps of one purchase, reported to the page as each changes. */
export class Progress {
  steps: Step[];
  constructor(
    titles: [string, string][],
    private report: Report,
  ) {
    this.steps = titles.map(([key, title]) => ({ key, title, status: "todo" }));
    this.emit();
  }
  private emit() {
    this.report(this.steps.map((s) => ({ ...s })));
  }
  set(key: string, patch: Partial<Step>) {
    this.steps = this.steps.map((s) => (s.key === key ? { ...s, ...patch } : s));
    this.emit();
  }
  start = (key: string, patch: Partial<Step> = {}) => this.set(key, { status: "active", ...patch });
  done = (key: string, patch: Partial<Step> = {}) => this.set(key, { status: "done", ...patch });
  /** Leaves out steps that turned out not to be needed. */
  drop(...keys: string[]) {
    this.steps = this.steps.filter((s) => !keys.includes(s.key));
    this.emit();
  }
  /** Marks whatever was running as failed. */
  fail(detail: string) {
    const active = this.steps.find((s) => s.status === "active") ?? this.steps.find((s) => s.status === "todo");
    if (active) this.set(active.key, { status: "error", detail });
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => Math.floor(Date.now() / 1000);
/** Swaps send 2% extra in case the price moves; the change comes straight back, in USDC. */
export const withBuffer = (amount: bigint) => (amount * 102n) / 100n;
/**
 * What a token is allowed for while a purchase waits out its minute: room for its price to rise
 * about 3% before paying, which sends the quote then plus 2%. Rises beyond that ask for one more
 * approval just before paying.
 */
const withRoom = (amount: bigint) => (amount * 105n) / 100n;
export const usdcUnits = (dollars: number) => BigInt(Math.round(dollars * 1_000_000));

function required() {
  if (!deployment) throw new Error("The contracts aren't deployed yet.");
  return deployment;
}

/** The token a payment pulls, or null for the chain's own coin. */
export function tokenAddress(key: ChainKey, token: PayToken): Address | null {
  if (token.native) return null;
  if (!token.path) return required()[key].usdc;
  return token.path[0] as Address;
}

/** A quote: the price, the copy fee (0 if none is paid), and how much of the token pays both. */
type Quote = { router: Address; path: Address[]; price: bigint; fee: bigint; amountIn: bigint };

/** Asks each of PulseChain's routers (just the one for USDC itself), and takes the one needing the least. */
async function cheapest(token: PayToken, ask: (router: Address, path: Address[]) => Promise<Quote>): Promise<Quote> {
  const path = (token.path ?? []) as Address[];
  const routers = (token.path ? PAY.pulsechain.routers : [zeroAddress]) as Address[];
  const answers = await Promise.allSettled(routers.map((router) => ask(router, path)));
  const quotes = answers.flatMap((a) => (a.status === "fulfilled" ? [a.value] : []));
  if (quotes.length === 0) throw (answers[0] as PromiseRejectedResult).reason;
  return quotes.reduce((best, q) => (q.amountIn < best.amountIn ? q : best));
}

/**
 * The checkout's price for registering or renewing `label`, and how much of `token` pays it, asked
 * along each of PulseChain's routers. The one needing the least wins: pools differ in depth (PLS
 * cost up to 6.6% more on PulseX V2 than V1 in November 2026) and change over time. For USDC it's
 * the price itself, to the last unit: exactly what paying takes. With `withCopy`, it includes the
 * copy fee, if there is one to pay.
 */
export async function bestQuote(
  fn: "quoteRegister" | "quoteRenew",
  label: string,
  duration: bigint,
  token: PayToken,
  withCopy = false,
): Promise<Quote> {
  const checkout = required().pulsechain.checkout;
  return cheapest(token, async (router, path) => {
    if (withCopy) {
      const [price, fee, amountIn] = await clients.pulsechain.readContract({
        address: checkout,
        abi: checkoutAbi,
        functionName: fn === "quoteRegister" ? "quoteRegisterAndCopy" : "quoteRenewAndCopy",
        args: [label, duration, router, path],
      });
      return { router, path, price, fee, amountIn };
    }
    const [price, amountIn] = await clients.pulsechain.readContract({
      address: checkout,
      abi: checkoutAbi,
      functionName: fn,
      args: [label, duration, router, path],
    });
    return { router, path, price, fee: 0n, amountIn };
  });
}

/** The copy fee to pay on its own now, and how much of `token` pays it; null if there's none to pay. */
async function bestCopyQuote(token: PayToken): Promise<Quote | null> {
  const checkout = required().pulsechain.checkout;
  const q = await cheapest(token, async (router, path) => {
    const [fee, amountIn] = await clients.pulsechain.readContract({
      address: checkout,
      abi: checkoutAbi,
      functionName: "quoteCopyFee",
      args: [router, path],
    });
    return { router, path, price: 0n, fee, amountIn };
  });
  return q.fee === 0n ? null : q;
}

/** The swap the checkout makes along `q`: at least the price and fee in USDC, or none for USDC itself. */
function swapOf(token: PayToken, q: Quote) {
  return {
    router: q.router,
    path: q.path,
    amountOutMin: token.path ? q.price + q.fee : 0n,
    deadline: BigInt(now() + 20 * 60),
  };
}

/**
 * Sends a payment to the checkout from the connected wallet, with room in its gas (withGasRoom).
 * `args` must match `functionName` in checkoutAbi.
 */
async function payCheckout(call: { functionName: string; args: readonly unknown[]; value?: bigint }): Promise<Hex> {
  const wallet = walletClient("pulsechain");
  const request = { address: required().pulsechain.checkout, abi: checkoutAbi, ...call };
  const gas = await withGasRoom(
    clients.pulsechain.estimateContractGas({ ...request, account: wallet.account.address } as never),
  );
  return wallet.writeContract({ ...request, gas, ...(await fees()) } as never);
}

/**
 * A payment's gas estimate plus 30%. Some wallets send exactly the estimate, and a payment's last
 * step (sending the name's copy to the bridge) can then run out of gas when other transactions in
 * the same block change what it costs. Only the gas used is paid for.
 *
 * If the estimate shows the payment would fail, it isn't sent: the wallet would still ask for its
 * fee, often an alarming one, for a transaction that can only fail. If there's no estimate for
 * another reason, such as the network being busy, the wallet works out the gas itself (undefined).
 */
async function withGasRoom(estimate: Promise<bigint>): Promise<bigint | undefined> {
  try {
    return ((await estimate) * 13n) / 10n;
  } catch (error) {
    if (refusalOf(error)) throw error;
    return undefined;
  }
}

/** Where a contract refused a call, if that's why `error` happened. */
function refusalOf(error: unknown): BaseError | null {
  if (!(error instanceof BaseError)) return null;
  return error.walk((e) => e instanceof ContractFunctionRevertedError || e instanceof ExecutionRevertedError) as
    | BaseError
    | null;
}

/** The tip offered on PulseChain's testnet. */
export const TESTNET_TIP = parseGwei("1");

/**
 * Fees for PulseChain's testnet, where the network suggests a tip thousands of times its base fee
 * (25,000 gwei against 7 wei in November 2026): wallets that follow it ask tens of tPLS for a
 * purchase that takes a fraction of one. A 1 gwei tip gets in, with room for the base fee to rise.
 */
export function testnetFees(baseFee: bigint | null | undefined) {
  return { maxPriorityFeePerGas: TESTNET_TIP, maxFeePerGas: (baseFee ?? 0n) * 2n + TESTNET_TIP };
}

/**
 * What to offer for a transaction on `key`: the testnet fees on PulseChain's testnet, and otherwise
 * nothing, as the wallet's own suggestion is fair.
 */
type Fees = { maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint };

export async function fees(key: ChainKey = "pulsechain"): Promise<Fees> {
  if (network !== "testnet" || key !== "pulsechain") return {};
  try {
    return testnetFees((await clients.pulsechain.getBlock()).baseFeePerGas);
  } catch {
    return {};
  }
}

/** An amount of `token` for people: USDC to the last unit, as a price is exact; others to 4 figures. */
export function amountText(token: PayToken, amount: bigint): string {
  const exact = !token.path && token.decimals === 6;
  return `${exact ? usdcText(amount) : formatToken(amount, token.decimals)} ${token.label ?? token.symbol}`;
}

/** What a wallet holding `held` of `token` is told when paying takes `pay`. */
export function shortText(token: PayToken, held: bigint, pay: bigint): string {
  // A swap sends 2% extra, which comes back as change, so only USDC's amounts are the price.
  const short = token.path
    ? `This wallet doesn't hold enough ${token.label ?? token.symbol} to pay.`
    : `This wallet holds ${amountText(token, held)}, and this costs ${amountText(token, pay)}.`;
  return `${short} Add a little more, then try again. Nothing was paid.`;
}

/**
 * Said wherever a payment in `token` is chosen, so the amount the wallet asks to send isn't a
 * surprise: a swap sends 2% more than the quote (`withBuffer`), in case the price moves before it
 * lands, and the checkout returns what isn't needed, in USDC. With the live quote, `amountIn`, it
 * says how much. Null for USDC, which isn't swapped: it's sent to the last unit.
 */
export function changeText(token: PayToken, amountIn?: bigint): string | null {
  if (!token.path) return null;
  const sends =
    amountIn === undefined
      ? `Your wallet sends 2% more ${token.symbol} than this costs, in case the price moves.`
      : `Your wallet sends about ${formatToken(withBuffer(amountIn), token.decimals)} ${token.symbol}: 2% extra in case the price moves.`;
  return `${sends} What isn’t needed comes straight back to you, in USDC.`;
}

/**
 * Stops a payment the wallet can't cover before the wallet is asked to send it: it would only
 * fail, and its fee would be spent all the same.
 */
async function requireFunds(token: PayToken, owner: Address, pay: bigint) {
  const address = tokenAddress("pulsechain", token);
  const held = address
    ? await clients.pulsechain.readContract({ address, abi: erc20Abi, functionName: "balanceOf", args: [owner] })
    : await clients.pulsechain.getBalance({ address: owner });
  if (held < pay) throw new Error(shortText(token, held, pay));
}

async function ensureAllowance(key: ChainKey, token: Address, spender: Address, amount: bigint, progress: Progress) {
  const wallet = walletClient(key);
  const owner = wallet.account.address;
  const allowance = await clients[key].readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
  if (allowance >= amount) return;
  progress.start("approve");
  const hash = await wallet.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
    ...(await fees(key)),
  });
  progress.set("approve", { tx: { chain: key, hash } });
  await confirm(key, hash);
}

export async function confirm(key: ChainKey, hash: Hex) {
  const receipt = await clients[key].waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The transaction didn't go through.");
  return receipt;
}

// A purchase waiting out its minute is kept, so a reload carries on rather than starting over.
const PENDING = "hexns-pending";

function savePending(p: Purchase) {
  try {
    localStorage.setItem(PENDING, JSON.stringify({ ...p, duration: p.duration.toString() }));
  } catch {
    // Without storage a reload starts again; nothing is lost but a minute.
  }
}

function loadPending(label: string, owner: Address, duration: bigint): Purchase | null {
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING) ?? "null");
    if (!saved || saved.label !== label || saved.owner !== owner || saved.duration !== duration.toString()) return null;
    return { ...saved, duration: BigInt(saved.duration) };
  } catch {
    return null;
  }
}

function clearPending() {
  try {
    localStorage.removeItem(PENDING);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Buys a name on PulseChain: reserve it with a sealed commitment, wait out the registrar's minute
 * (approving the token meanwhile), then pay through AnyTokenCheckout in one transaction. With
 * `copyNow`, the payment adds the copy fee, if there is one then, to copy the name to Ethereum at
 * once; with `copyMyself`, the wallet copies it there itself after paying, paying Ethereum's fee
 * in ETH. Says what copy fee was paid (0 if none), and how copying it yourself went.
 */
export async function buyOnPulseChain(o: {
  label: string;
  years: number;
  token: PayToken;
  referrer: Hex;
  copyNow?: boolean;
  copyMyself?: boolean;
  report: Report;
}): Promise<{ copyFee: bigint; copied?: SelfCopied | "later" }> {
  const d = required();
  const progress = new Progress(
    [
      ["chain", `Switch to ${PAY.pulsechain.name}`],
      ["commit", "Reserve the name"],
      // Every token but PLS is allowed first, while the minute runs.
      ...(o.token.native ? [] : ([["approve", `Allow ${o.token.label ?? o.token.symbol}`]] as [string, string][])),
      ["wait", "Wait a minute"],
      ["pay", "Pay and register"],
      ...(o.copyMyself ? SELF_COPY_STEPS : []),
    ],
    o.report,
  );
  try {
    progress.start("chain");
    await switchTo("pulsechain");
    progress.done("chain");
    const wallet = walletClient("pulsechain");
    const owner = wallet.account.address;
    const client = clients.pulsechain;
    const registrar = d.pulsechain.registrar;
    const duration = BigInt(o.years) * SECONDS_PER_YEAR;

    let purchase = loadPending(o.label, owner, duration) ?? newPurchase(o.label, owner, o.years, o.referrer);
    const [minAge, maxAge, at] = await Promise.all([
      client.readContract({ address: registrar, abi: registrarAbi, functionName: "MIN_COMMITMENT_AGE" }),
      client.readContract({ address: registrar, abi: registrarAbi, functionName: "MAX_COMMITMENT_AGE" }),
      client.readContract({
        address: registrar,
        abi: registrarAbi,
        functionName: "commitmentAt",
        args: [commitmentOf(purchase)],
      }),
    ]);
    let committedAt = Number(at);
    if (committedAt && now() > committedAt + Number(maxAge) - 120) {
      // Reserved too long ago to pay for in time, and the registrar won't take the same commitment
      // again until it lapses: reserve afresh, with a new secret.
      purchase = newPurchase(o.label, owner, o.years, o.referrer);
      committedAt = 0;
    }
    const commitment = commitmentOf(purchase);
    progress.start("commit");
    // A wallet that can't pay stops here, before spending fees on reserving and allowing.
    const first = await bestQuote("quoteRegister", o.label, duration, o.token, o.copyNow);
    await requireFunds(o.token, owner, o.token.path ? withBuffer(first.amountIn) : first.amountIn);
    if (!committedAt) {
      savePending(purchase);
      const hash = await wallet.writeContract({
        address: registrar,
        abi: registrarAbi,
        functionName: "commit",
        args: [commitment],
        ...(await fees()),
      });
      progress.set("commit", { tx: { chain: "pulsechain", hash } });
      const receipt = await confirm("pulsechain", hash);
      committedAt = Number((await client.getBlock({ blockNumber: receipt.blockNumber })).timestamp);
    }
    progress.done("commit");

    // The chain's clock decides when the minute is up.
    const readyAt = committedAt + Number(minAge) + 1;
    const chainNow = Number((await client.getBlock()).timestamp);
    progress.start("wait", { until: Date.now() + Math.max(0, readyAt - chainNow) * 1000 });

    const token = tokenAddress("pulsechain", o.token);
    if (token) {
      // Allow the token during the wait, so paying is one step when it's over.
      await ensureAllowance(
        "pulsechain",
        token,
        d.pulsechain.checkout,
        o.token.path ? withRoom(first.amountIn) : first.amountIn,
        progress,
      );
      progress.done("approve");
    }
    while (Number((await client.getBlock()).timestamp) < readyAt) await sleep(2000);
    progress.done("wait");

    progress.start("pay");
    const q = await bestQuote("quoteRegister", o.label, duration, o.token, o.copyNow);
    const pay = o.token.path ? withBuffer(q.amountIn) : q.amountIn;
    await requireFunds(o.token, owner, pay);
    if (token) {
      // The price rose more than the room allowed during the minute: allow the new amount first.
      await ensureAllowance("pulsechain", token, d.pulsechain.checkout, pay, progress);
      progress.done("approve");
      progress.start("pay");
    }
    // RegistrationArg (below) checks the purchase has exactly the shape the contract takes. With a
    // copy fee, it's paid up to the amount just quoted, and never more.
    const reg: RegistrationArg = purchase;
    const swap = swapOf(o.token, q);
    const copy = q.fee > 0n;
    const hash = token
      ? await payCheckout(
          copy
            ? { functionName: "registerWithTokenAndCopy", args: [reg, token, pay, swap, q.fee] }
            : { functionName: "registerWithToken", args: [reg, token, pay, swap] },
        )
      : await payCheckout(
          copy
            ? { functionName: "registerWithPLSAndCopy", args: [reg, swap, q.fee], value: pay }
            : { functionName: "registerWithPLS", args: [reg, swap], value: pay },
        );
    progress.set("pay", { tx: { chain: "pulsechain", hash } });
    const receipt = await confirm("pulsechain", hash);
    clearPending();
    progress.done("pay");
    return { copyFee: copyFeePaid(receipt), copied: o.copyMyself ? await copyAfterPaying(progress, receipt, o.label) : undefined };
  } catch (error) {
    progress.fail(errorText(error));
    throw error;
  }
}

/** The registration AnyTokenCheckout takes. A purchase must be exactly that. */
type RegistrationArg = ContractFunctionArgs<typeof checkoutAbi, "nonpayable", "registerWithToken">[0];
export const purchaseFitsTheContract = (p: Purchase): RegistrationArg => p;

/**
 * Renews a name on PulseChain for `years` more. Anyone can renew any name; it stays its owner's.
 * With `copyNow`, it pays the copy fee too, if there is one; with `copyMyself`, the wallet copies
 * the new date to Ethereum itself after paying: see buyOnPulseChain.
 */
export async function renew(o: {
  label: string;
  years: number;
  token: PayToken;
  referrer: Hex;
  copyNow?: boolean;
  copyMyself?: boolean;
  report: Report;
}): Promise<{ copyFee: bigint; copied?: SelfCopied | "later" }> {
  const d = required();
  const progress = new Progress(
    [
      ["chain", `Switch to ${PAY.pulsechain.name}`],
      ...(o.token.native ? [] : ([["approve", `Allow ${o.token.label ?? o.token.symbol}`]] as [string, string][])),
      ["pay", "Pay and renew"],
      ...(o.copyMyself ? SELF_COPY_STEPS : []),
    ],
    o.report,
  );
  try {
    progress.start("chain");
    await switchTo("pulsechain");
    progress.done("chain");
    const wallet = walletClient("pulsechain");
    const duration = BigInt(o.years) * SECONDS_PER_YEAR;
    const q = await bestQuote("quoteRenew", o.label, duration, o.token, o.copyNow);
    const pay = o.token.path ? withBuffer(q.amountIn) : q.amountIn;
    const account = wallet.account.address;
    await requireFunds(o.token, account, pay);
    const token = tokenAddress("pulsechain", o.token);
    if (token) {
      await ensureAllowance("pulsechain", token, d.pulsechain.checkout, pay, progress);
      progress.done("approve");
    }
    progress.start("pay");
    const ren = { label: o.label, duration, referrer: o.referrer };
    const swap = swapOf(o.token, q);
    const copy = q.fee > 0n;
    const hash = token
      ? await payCheckout(
          copy
            ? { functionName: "renewWithTokenAndCopy", args: [ren, token, pay, swap, q.fee] }
            : { functionName: "renewWithToken", args: [ren, token, pay, swap] },
        )
      : await payCheckout(
          copy
            ? { functionName: "renewWithPLSAndCopy", args: [ren, swap, q.fee], value: pay }
            : { functionName: "renewWithPLS", args: [ren, swap], value: pay },
        );
    progress.set("pay", { tx: { chain: "pulsechain", hash } });
    const receipt = await confirm("pulsechain", hash);
    progress.done("pay");
    return { copyFee: copyFeePaid(receipt), copied: o.copyMyself ? await copyAfterPaying(progress, receipt, o.label) : undefined };
  } catch (error) {
    progress.fail(errorText(error));
    throw error;
  }
}

/** Steps for paying the copy fee on its own with `token`: allowing it first, unless it's PLS. */
function copySteps(token: PayToken): [string, string][] {
  return [
    ...(token.native ? [] : ([["approve", `Allow ${token.label ?? token.symbol}`]] as [string, string][])),
    ["copy", "Pay to copy it to Ethereum now"],
  ];
}

/**
 * Pays the copy fee for `label` with `token`, as the "copy" step: the checkout sends the name's
 * copy to Ethereum and the fee to the bot, which copies it at once. If there's no fee to pay by
 * now, the step says so and nothing is paid. Says what was paid.
 */
async function payCopyStep(progress: Progress, label: string, token: PayToken): Promise<bigint> {
  const current = await readCopyFee();
  const q = current.kind === "offered" ? await bestCopyQuote(token) : null;
  if (!q) {
    const why =
      current.kind === "busy"
        ? "Copying at once isn't available just now: it's copied once Ethereum's fees fall. Nothing was paid."
        : "Ethereum's fees fell, so it's copied free. Nothing was paid.";
    if (!token.native) progress.done("approve", { detail: "Not needed." });
    progress.done("copy", { detail: why });
    return 0n;
  }
  const owner = walletClient("pulsechain").account.address;
  const pay = token.path ? withBuffer(q.amountIn) : q.amountIn;
  await requireFunds(token, owner, pay);
  const address = tokenAddress("pulsechain", token);
  if (address) {
    await ensureAllowance("pulsechain", address, required().pulsechain.checkout, pay, progress);
    progress.done("approve");
  }
  progress.start("copy");
  const swap = { ...swapOf(token, q), amountOutMin: token.path ? q.fee : 0n };
  const hash = address
    ? await payCheckout({ functionName: "payCopyFee", args: [label, address, pay, swap] })
    : await payCheckout({ functionName: "payCopyFeeWithPLS", args: [label, swap], value: pay });
  progress.set("copy", { tx: { chain: "pulsechain", hash } });
  const receipt = await confirm("pulsechain", hash);
  progress.done("copy");
  return copyFeePaid(receipt);
}

/**
 * Sends a name to another wallet on PulseChain. Its Ethereum copy follows by itself; with
 * `copyWith`, while there's a copy fee, it's paid with that token after sending, so the new owner
 * shows on Ethereum at once. Says what copy fee was paid.
 */
export async function send(o: { label: string; to: Address; copyWith?: PayToken; report: Report }): Promise<{ copyFee: bigint }> {
  const d = required();
  const progress = new Progress(
    [
      ["chain", `Switch to ${PAY.pulsechain.name}`],
      ["send", "Send it"],
      ...(o.copyWith ? copySteps(o.copyWith) : []),
    ],
    o.report,
  );
  try {
    progress.start("chain");
    await switchTo("pulsechain");
    progress.done("chain");
    const wallet = walletClient("pulsechain");
    const state = await clients.pulsechain.readContract({
      address: d.pulsechain.registry,
      abi: registryAbi,
      functionName: "getState",
      args: [labelId(o.label)],
    });
    if (o.copyWith) {
      // A wallet that can't pay the fee finds out before the name moves.
      const q = await bestCopyQuote(o.copyWith);
      if (q) await requireFunds(o.copyWith, wallet.account.address, o.copyWith.path ? withBuffer(q.amountIn) : q.amountIn);
    }
    progress.start("send");
    const hash = await wallet.writeContract({
      address: d.pulsechain.registry,
      abi: registryAbi,
      functionName: "safeTransferFrom",
      args: [wallet.account.address, o.to, state.tokenId, 1n, "0x"],
      ...(await fees()),
    });
    progress.set("send", { tx: { chain: "pulsechain", hash } });
    await confirm("pulsechain", hash);
    progress.done("send");
    // After the name has moved, so the copy shows its new owner.
    return { copyFee: o.copyWith ? await payCopyStep(progress, o.label, o.copyWith) : 0n };
  } catch (error) {
    progress.fail(errorText(error));
    throw error;
  }
}

/** What became of copying a name yourself. */
export type SelfCopied =
  | "copied" // this wallet copied it
  | "already" // it had been copied before this wallet sent anything: by the bot as fees fell, or someone else
  | "someone-else"; // another copy went a moment before this one, which stopped without copying

/** Copying a name yourself: the bridge signs the copy, then the wallet delivers it on Ethereum. */
const SELF_COPY_STEPS: [string, string][] = [
  ["sign", "The bridge signs the copy"],
  ["eth", `Switch to ${PAY.ethereum.name}`],
  ["copy", "Copy it to Ethereum"],
];

/** How copying it yourself went, in words. */
export function selfCopiedText(how: SelfCopied): string {
  return how === "copied"
    ? "Copied: Ethereum shows it in a moment."
    : how === "already"
      ? "It had already been copied, so there was nothing to pay."
      : "Someone else copied it a moment before you, so it's copied. Yours stopped without copying, and was charged only for the little it ran.";
}

/** Why a wallet can't send the copy yet: said before it's asked to. */
export function ethShortText(c: Pick<SelfCopyCost, "balance" | "need" | "cost">): string {
  return (
    `This wallet holds ${ethText(c.balance)} on ${PAY.ethereum.name}, and sending the copy needs ${ethText(c.need)} on hand. ` +
    `It's charged only about ${ethText(c.cost)}: Ethereum sets the rest aside while the copy runs, then gives it back. ` +
    "Add some ETH, then try again. Nothing was paid."
  );
}

/** Whether the wallet's owner cancelled it. */
function cancelled(error: unknown): boolean {
  const e = error as { code?: number; message?: string; cause?: { code?: number } };
  return e?.code === 4001 || e?.cause?.code === 4001 || /user (rejected|denied)/i.test(e?.message ?? "");
}

/**
 * Whether `found` is delivered within about half a minute: when sending it would fail, someone
 * else's copy may be on its way (the bot's, say, as Ethereum's fees fell), waiting for a block.
 */
async function deliveredSoon(found: CopyMessage): Promise<boolean> {
  for (let i = 0; i < 10; i++) {
    if ((await copyStatus(found).catch(() => null))?.kind === "done") return true;
    await sleep(3000);
  }
  return false;
}

/**
 * Delivers `found` on Ethereum from the connected wallet, paying Ethereum's fee in ETH, once the
 * bridge has signed it (waiting for that if need be). It looks again just before asking the wallet,
 * and if someone else delivers it first (the bot, or another tab), says so rather than fail: the
 * name is copied either way.
 */
async function deliverCopy(progress: Progress, found: CopyMessage): Promise<SelfCopied> {
  let status = await copyStatus(found);
  if (status.kind === "signing") {
    progress.start("sign", { detail: "Usually 10 to 15 minutes after paying. You can leave: copy it later from the name's page." });
    while (status.kind === "signing") {
      await sleep(15_000);
      // A failed look (the RPC busy, say) just waits for the next one.
      status = await copyStatus(found, status).catch(() => status);
    }
    progress.done("sign", { detail: undefined });
  } else {
    progress.drop("sign");
  }
  const finish = (how: SelfCopied) => {
    if (progress.steps.find((s) => s.key === "eth")?.status !== "done") progress.drop("eth");
    progress.done("copy", { detail: selfCopiedText(how) });
    return how;
  };
  if (status.kind !== "ready") return finish("already");
  progress.start("eth");
  await switchTo("ethereum");
  progress.done("eth");
  progress.start("copy");
  const wallet = walletClient("ethereum");
  // Looked at again now: the bot may have copied it free while the bridge signed, or someone else.
  status = await copyStatus(found, status);
  if (status.kind !== "ready") return finish("already");
  let cost: SelfCopyCost;
  try {
    cost = await selfCopyCost(status, wallet.account.address);
  } catch (error) {
    // Working out its gas fails if it was delivered a moment ago, or someone else's copy is about to be.
    if (await deliveredSoon(found)) return finish("already");
    throw error;
  }
  if (cost.balance < cost.need) throw new Error(ethShortText(cost));
  progress.set("copy", { detail: `Ethereum's fee: about ${ethText(cost.cost)}.` });
  let sent = false;
  try {
    const hash = await wallet.writeContract({
      address: status.foreignAmb,
      abi: foreignAmbAbi,
      functionName: "executeSignatures",
      args: [found.message, status.signatures],
      gas: cost.gas,
      maxFeePerGas: cost.maxFeePerGas,
      maxPriorityFeePerGas: cost.maxPriorityFeePerGas,
    });
    sent = true;
    progress.set("copy", { tx: { chain: "ethereum", hash } });
    await confirm("ethereum", hash);
  } catch (error) {
    // Another copy went first: this one did nothing, or was never sent.
    if (!cancelled(error) && (await deliveredSoon(found))) return finish(sent ? "someone-else" : "already");
    throw error;
  }
  return finish("copied");
}

/** Said when copying it yourself after paying didn't happen: the purchase went through all the same. */
const COPY_LATER = "Your name is yours either way: copy it from its page later, or it's copied free once Ethereum's fees fall.";

/** After paying, copies the name yourself, as chosen. Whatever happens here, the payment went through. */
async function copyAfterPaying(progress: Progress, receipt: TransactionReceipt, label: string): Promise<SelfCopied | "later"> {
  try {
    const found = await copyMessageIn(receipt, label);
    if (!found) throw new Error("Its copy for Ethereum wasn't found in the payment.");
    return await deliverCopy(progress, found);
  } catch (error) {
    progress.fail(`${errorText(error)} ${COPY_LATER}`);
    return "later";
  }
}

/**
 * Copies `label` to Ethereum yourself, from its page: delivers its newest copy message, which says
 * what PulseChain does now (`owner`, `expiry`), paying Ethereum's fee in ETH. Anyone may; the bridge
 * checks the validators' signatures, so it can only ever write what PulseChain says.
 */
export async function copyOnEthereum(o: { label: string; owner: Address; expiry: number; report: Report }): Promise<SelfCopied> {
  const progress = new Progress(SELF_COPY_STEPS, o.report);
  try {
    const found = await selfCopyMessage(o.label, o.owner, o.expiry);
    if (!found) throw new Error("Its latest change hasn't gone over the bridge yet: that happens within minutes of a change. Try again shortly.");
    return await deliverCopy(progress, found);
  } catch (error) {
    progress.fail(errorText(error));
    throw error;
  }
}

/** Pays the copy fee to have `label` copied to Ethereum at once, from its page. Says what was paid. */
export async function copyNow(o: { label: string; token: PayToken; report: Report }): Promise<bigint> {
  const progress = new Progress([["chain", `Switch to ${PAY.pulsechain.name}`], ...copySteps(o.token)], o.report);
  try {
    progress.start("chain");
    await switchTo("pulsechain");
    progress.done("chain");
    return await payCopyStep(progress, o.label, o.token);
  } catch (error) {
    progress.fail(errorText(error));
    throw error;
  }
}

/**
 * Pays referrers what they're owed, from the connected wallet, in one transaction: allow Disperse
 * the exact total in USDC, then Disperse sends each amount. `amounts` are in USDC's own units.
 */
export async function payReferrers(o: {
  payments: { to: Address; amount: bigint }[];
  /** The days it pays for, recorded at the end of the transaction (lib/payouts.ts payoutNote). */
  note?: Hex;
  report: Report;
}): Promise<Hex> {
  const d = required();
  const total = o.payments.reduce((sum, p) => sum + p.amount, 0n);
  const progress = new Progress(
    [
      ["chain", `Switch to ${PAY.pulsechain.name}`],
      ["approve", "Allow the total in USDC"],
      ["pay", `Pay ${o.payments.length} ${o.payments.length === 1 ? "referrer" : "referrers"}`],
    ],
    o.report,
  );
  try {
    progress.start("chain");
    await switchTo("pulsechain");
    progress.done("chain");
    const wallet = walletClient("pulsechain");
    const balance = await clients.pulsechain.readContract({
      address: d.pulsechain.usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet.account.address],
    });
    if (balance < total) throw new Error("This wallet doesn't hold enough USDC on PulseChain to pay everyone.");
    await ensureAllowance("pulsechain", d.pulsechain.usdc, DISPERSE, total, progress);
    progress.done("approve");
    progress.start("pay");
    const hash = await wallet.writeContract({
      address: DISPERSE,
      abi: disperseAbi,
      functionName: "disperseToken",
      args: [d.pulsechain.usdc, o.payments.map((p) => p.to), o.payments.map((p) => p.amount)],
      dataSuffix: o.note,
      ...(await fees()),
    });
    progress.set("pay", { tx: { chain: "pulsechain", hash } });
    await confirm("pulsechain", hash);
    progress.done("pay");
    return hash;
  } catch (error) {
    progress.fail(errorText(error));
    throw error;
  }
}

/**
 * Sets how much USDC the bot may draw from this wallet (the payments wallet) on PulseChain, for when
 * gas leaves its float short: an allowance, which only this wallet can change. 0 stops it.
 */
export async function setBotBudget(o: { bot: Address; usdc: bigint; report: Report }): Promise<Hex> {
  const d = required();
  const progress = new Progress(
    [
      ["chain", `Switch to ${PAY.pulsechain.name}`],
      ["budget", o.usdc === 0n ? "Stop the bot drawing from this wallet" : "Set the bot's budget"],
    ],
    o.report,
  );
  try {
    progress.start("chain");
    await switchTo("pulsechain");
    progress.done("chain");
    progress.start("budget");
    const hash = await walletClient("pulsechain").writeContract({
      address: d.pulsechain.usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [o.bot, o.usdc],
      ...(await fees()),
    });
    progress.set("budget", { tx: { chain: "pulsechain", hash } });
    await confirm("pulsechain", hash);
    progress.done("budget");
    return hash;
  } catch (error) {
    progress.fail(errorText(error));
    throw error;
  }
}

/** Why the contracts would refuse a payment, said plainly, by their error's name. */
const REFUSALS: Record<string, string> = {
  InsufficientPayment: "The price changed while paying. Try again.",
  NameNotAvailable: "Someone else registered it first.",
  CommitmentTooOld: "Its reservation ran out. Try again to reserve it afresh.",
  CommitmentTooNew: "Its minute isn't quite over. Try again in a moment.",
  TooFarAhead: "A name can be paid for at most 5 years ahead.",
  NoCopyFee: "There's no copy fee to pay now: it's copied free.",
  CopyFailed: "Its copy couldn't be sent to Ethereum just now. Try again in a moment.",
  OwnableUnauthorizedAccount: "This wallet isn't allowed to do that.",
  // The admin page's actions (admin.ts).
  LabelAlreadyRegistered: "Someone owns it.",
  LabelAlreadyReserved: "It's already held.",
  EACUnauthorizedAccountRoles: "This wallet isn't allowed to do that.",
  EACCannotGrantRoles: "This wallet isn't allowed to do that.",
  EACCannotRevokeRoles: "This wallet isn't allowed to do that.",
};

/** A failure, said plainly. */
export function errorText(error: unknown): string {
  const e = error as { code?: number; shortMessage?: string; message?: string; cause?: { code?: number } };
  if (e?.code === 4001 || e?.cause?.code === 4001 || /user (rejected|denied)/i.test(e?.message ?? "")) {
    return "You cancelled it in your wallet. Nothing was paid.";
  }
  if (/insufficient funds/i.test(e?.message ?? ""))
    return "Not enough in your wallet to pay for this, and its network fee.";
  const refusal = refusalOf(error);
  if (refusal) {
    const reverted = refusal instanceof ContractFunctionRevertedError ? refusal : null;
    const name = reverted?.data?.errorName;
    const reason = reverted?.reason !== "execution reverted" ? reverted?.reason : undefined;
    const why =
      (name && REFUSALS[name]) ??
      (reason && /INSUFFICIENT_OUTPUT_AMOUNT|EXCESSIVE_INPUT_AMOUNT/.test(reason)
        ? "The price moved while paying. Try again."
        : reason || name
          ? `The contract said: ${reason ?? name}.`
          : "");
    return `It would fail, so it wasn't sent, and nothing was paid.${why ? ` ${why}` : ""}`;
  }
  return e?.shortMessage ?? e?.message ?? "Something went wrong.";
}
