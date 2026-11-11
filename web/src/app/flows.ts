// Buying, renewing and sending names: each a few wallet steps, reported as they go.

import {
  type Address,
  BaseError,
  type ContractFunctionArgs,
  ContractFunctionRevertedError,
  ExecutionRevertedError,
  type Hex,
  parseGwei,
  zeroAddress,
} from "viem";

import { usdcText } from "../lib/payouts";
import { formatToken } from "../lib/quotes";
import type { PayToken } from "../lib/tokens";
import { checkoutAbi, DISPERSE, disperseAbi, erc20Abi, registrarAbi, registryAbi } from "./abis";
import { client, deployment, network, PAY } from "./network";
import { commitmentOf, labelId, newPurchase, type Purchase, SECONDS_PER_YEAR } from "./purchase";
import { switchToPulseChain, walletClient } from "./wallet";

export type StepStatus = "todo" | "active" | "done" | "error";

export interface Step {
  key: string;
  title: string;
  status: StepStatus;
  detail?: string;
  /** The step's transaction. */
  tx?: Hex;
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

function required() {
  if (!deployment) throw new Error("The contracts aren't deployed yet.");
  return deployment;
}

/** The token a payment pulls, or null for the chain's own coin. */
export function tokenAddress(token: PayToken): Address | null {
  if (token.native) return null;
  if (!token.path) return required().pulsechain.usdc;
  return token.path[0] as Address;
}

/** A quote: the price, and how much of the token pays it. */
type Quote = { router: Address; path: Address[]; price: bigint; amountIn: bigint };

/** Asks each of PulseChain's routers (just the one for USDC itself), and takes the one needing the least. */
async function cheapest(token: PayToken, ask: (router: Address, path: Address[]) => Promise<Quote>): Promise<Quote> {
  const path = (token.path ?? []) as Address[];
  const routers = (token.path ? PAY.routers : [zeroAddress]) as Address[];
  const answers = await Promise.allSettled(routers.map((router) => ask(router, path)));
  const quotes = answers.flatMap((a) => (a.status === "fulfilled" ? [a.value] : []));
  if (quotes.length === 0) throw (answers[0] as PromiseRejectedResult).reason;
  return quotes.reduce((best, q) => (q.amountIn < best.amountIn ? q : best));
}

/**
 * The checkout's price for registering or renewing `label`, and how much of `token` pays it, asked
 * along each of PulseChain's routers. The one needing the least wins: pools differ in depth (PLS
 * cost up to 6.6% more on PulseX V2 than V1 in November 2026) and change over time. For USDC it's
 * the price itself, to the last unit: exactly what paying takes.
 */
export async function bestQuote(
  fn: "quoteRegister" | "quoteRenew",
  label: string,
  duration: bigint,
  token: PayToken,
): Promise<Quote> {
  const checkout = required().pulsechain.checkout;
  return cheapest(token, async (router, path) => {
    const [price, amountIn] = await client.readContract({
      address: checkout,
      abi: checkoutAbi,
      functionName: fn,
      args: [label, duration, router, path],
    });
    return { router, path, price, amountIn };
  });
}

/** The swap the checkout makes along `q`: at least the price in USDC, or none for USDC itself. */
function swapOf(token: PayToken, q: Quote) {
  return {
    router: q.router,
    path: q.path,
    amountOutMin: token.path ? q.price : 0n,
    deadline: BigInt(now() + 20 * 60),
  };
}

/**
 * Sends a payment to the checkout from the connected wallet, with room in its gas (withGasRoom).
 * `args` must match `functionName` in checkoutAbi.
 */
async function payCheckout(call: { functionName: string; args: readonly unknown[]; value?: bigint }): Promise<Hex> {
  const wallet = walletClient();
  const request = { address: required().pulsechain.checkout, abi: checkoutAbi, ...call };
  const gas = await withGasRoom(client.estimateContractGas({ ...request, account: wallet.account.address } as never));
  return wallet.writeContract({ ...request, gas, ...(await fees()) } as never);
}

/**
 * A payment's gas estimate plus 30%. Some wallets send exactly the estimate, and a payment can then
 * run out of gas when other transactions in the same block change what it costs. Only the gas used
 * is paid for.
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
 * What to offer for a transaction: the testnet fees on PulseChain's testnet, and otherwise nothing,
 * as the wallet's own suggestion is fair.
 */
type Fees = { maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint };

export async function fees(): Promise<Fees> {
  if (network !== "testnet") return {};
  try {
    return testnetFees((await client.getBlock()).baseFeePerGas);
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
  const address = tokenAddress(token);
  const held = address
    ? await client.readContract({ address, abi: erc20Abi, functionName: "balanceOf", args: [owner] })
    : await client.getBalance({ address: owner });
  if (held < pay) throw new Error(shortText(token, held, pay));
}

async function ensureAllowance(token: Address, spender: Address, amount: bigint, progress: Progress) {
  const wallet = walletClient();
  const owner = wallet.account.address;
  const allowance = await client.readContract({
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
    ...(await fees()),
  });
  progress.set("approve", { tx: hash });
  await confirm(hash);
}

export async function confirm(hash: Hex) {
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The transaction didn't go through.");
  return receipt;
}

// A purchase waiting out its minute is kept, so a reload carries on rather than starting over.
const PENDING = "pdains-pending";

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
 * (approving the token meanwhile), then pay through AnyTokenCheckout in one transaction.
 */
export async function buyOnPulseChain(o: {
  label: string;
  years: number;
  token: PayToken;
  referrer: Hex;
  report: Report;
}): Promise<void> {
  const d = required();
  const progress = new Progress(
    [
      ["chain", `Switch to ${PAY.name}`],
      ["commit", "Reserve the name"],
      // Every token but PLS is allowed first, while the minute runs.
      ...(o.token.native ? [] : ([["approve", `Allow ${o.token.label ?? o.token.symbol}`]] as [string, string][])),
      ["wait", "Wait a minute"],
      ["pay", "Pay and register"],
    ],
    o.report,
  );
  try {
    progress.start("chain");
    await switchToPulseChain();
    progress.done("chain");
    const wallet = walletClient();
    const owner = wallet.account.address;
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
    const first = await bestQuote("quoteRegister", o.label, duration, o.token);
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
      progress.set("commit", { tx: hash });
      const receipt = await confirm(hash);
      committedAt = Number((await client.getBlock({ blockNumber: receipt.blockNumber })).timestamp);
    }
    progress.done("commit");

    // The chain's clock decides when the minute is up.
    const readyAt = committedAt + Number(minAge) + 1;
    const chainNow = Number((await client.getBlock()).timestamp);
    progress.start("wait", { until: Date.now() + Math.max(0, readyAt - chainNow) * 1000 });

    const token = tokenAddress(o.token);
    if (token) {
      // Allow the token during the wait, so paying is one step when it's over.
      await ensureAllowance(
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
    const q = await bestQuote("quoteRegister", o.label, duration, o.token);
    const pay = o.token.path ? withBuffer(q.amountIn) : q.amountIn;
    await requireFunds(o.token, owner, pay);
    if (token) {
      // The price rose more than the room allowed during the minute: allow the new amount first.
      await ensureAllowance(token, d.pulsechain.checkout, pay, progress);
      progress.done("approve");
      progress.start("pay");
    }
    // RegistrationArg (below) checks the purchase has exactly the shape the contract takes.
    const reg: RegistrationArg = purchase;
    const swap = swapOf(o.token, q);
    const hash = token
      ? await payCheckout({ functionName: "registerWithToken", args: [reg, token, pay, swap] })
      : await payCheckout({ functionName: "registerWithPLS", args: [reg, swap], value: pay });
    progress.set("pay", { tx: hash });
    await confirm(hash);
    clearPending();
    progress.done("pay");
  } catch (error) {
    progress.fail(errorText(error));
    throw error;
  }
}

/** The registration AnyTokenCheckout takes. A purchase must be exactly that. */
type RegistrationArg = ContractFunctionArgs<typeof checkoutAbi, "nonpayable", "registerWithToken">[0];
export const purchaseFitsTheContract = (p: Purchase): RegistrationArg => p;

/** Renews a name on PulseChain for `years` more. Anyone can renew any name; it stays its owner's. */
export async function renew(o: {
  label: string;
  years: number;
  token: PayToken;
  referrer: Hex;
  report: Report;
}): Promise<void> {
  const d = required();
  const progress = new Progress(
    [
      ["chain", `Switch to ${PAY.name}`],
      ...(o.token.native ? [] : ([["approve", `Allow ${o.token.label ?? o.token.symbol}`]] as [string, string][])),
      ["pay", "Pay and renew"],
    ],
    o.report,
  );
  try {
    progress.start("chain");
    await switchToPulseChain();
    progress.done("chain");
    const wallet = walletClient();
    const duration = BigInt(o.years) * SECONDS_PER_YEAR;
    const q = await bestQuote("quoteRenew", o.label, duration, o.token);
    const pay = o.token.path ? withBuffer(q.amountIn) : q.amountIn;
    const account = wallet.account.address;
    await requireFunds(o.token, account, pay);
    const token = tokenAddress(o.token);
    if (token) {
      await ensureAllowance(token, d.pulsechain.checkout, pay, progress);
      progress.done("approve");
    }
    progress.start("pay");
    const ren = { label: o.label, duration, referrer: o.referrer };
    const swap = swapOf(o.token, q);
    const hash = token
      ? await payCheckout({ functionName: "renewWithToken", args: [ren, token, pay, swap] })
      : await payCheckout({ functionName: "renewWithPLS", args: [ren, swap], value: pay });
    progress.set("pay", { tx: hash });
    await confirm(hash);
    progress.done("pay");
  } catch (error) {
    progress.fail(errorText(error));
    throw error;
  }
}

/** Sends a name to another wallet on PulseChain. */
export async function send(o: { label: string; to: Address; report: Report }): Promise<void> {
  const d = required();
  const progress = new Progress(
    [
      ["chain", `Switch to ${PAY.name}`],
      ["send", "Send it"],
    ],
    o.report,
  );
  try {
    progress.start("chain");
    await switchToPulseChain();
    progress.done("chain");
    const wallet = walletClient();
    const state = await client.readContract({
      address: d.pulsechain.registry,
      abi: registryAbi,
      functionName: "getState",
      args: [labelId(o.label)],
    });
    progress.start("send");
    const hash = await wallet.writeContract({
      address: d.pulsechain.registry,
      abi: registryAbi,
      functionName: "safeTransferFrom",
      args: [wallet.account.address, o.to, state.tokenId, 1n, "0x"],
      ...(await fees()),
    });
    progress.set("send", { tx: hash });
    await confirm(hash);
    progress.done("send");
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
      ["chain", `Switch to ${PAY.name}`],
      ["approve", "Allow the total in USDC"],
      ["pay", `Pay ${o.payments.length} ${o.payments.length === 1 ? "referrer" : "referrers"}`],
    ],
    o.report,
  );
  try {
    progress.start("chain");
    await switchToPulseChain();
    progress.done("chain");
    const wallet = walletClient();
    const balance = await client.readContract({
      address: d.pulsechain.usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet.account.address],
    });
    if (balance < total) throw new Error("This wallet doesn't hold enough USDC on PulseChain to pay everyone.");
    await ensureAllowance(d.pulsechain.usdc, DISPERSE, total, progress);
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
    progress.set("pay", { tx: hash });
    await confirm(hash);
    progress.done("pay");
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
