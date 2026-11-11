// The referral payout report: what each referrer is owed for the referred purchases and renewals in
// a period, from the registrar's records on PulseChain. This part only adds up: the app's referrals
// page reads the chain (src/app/payouts.ts) and hands the records here.
//
// Who's paid: whoever owns the referrer's name now. Set aside, and not paid: self-referrals (the
// buyer also owns the referring name), and tags that aren't a name anyone owns.

import { REFERRAL_PERCENT } from "./referral";

type Address = `0x${string}`;
type Hex = `0x${string}`;

/** One referred purchase or renewal, from the registrar's NameRegistered or NameRenewed event. */
export interface ReferredPayment {
  kind: "purchase" | "renewal";
  /** The name bought or renewed, without .hex. */
  label: string;
  /** Who owns that name: the buyer, for a purchase; its owner now, for a renewal. */
  owner: Address | null;
  /** The referral tag: keccak256 of the referrer's name. */
  referrer: Hex;
  /** What was paid, in the token's smallest units (base and premium, for a purchase). */
  amount: bigint;
  token: Address;
  block: bigint;
  tx: Hex;
}

/** A referrer, from the registry: its name, if the tag is one, and who owns it now. */
export interface Referrer {
  label: string | null;
  owner: Address | null;
}

export interface Token {
  symbol: string;
  decimals: number;
}

/** Why a referrer's row is, or isn't, paid. */
export type PayoutStatus = "pay" | "self-referral" | "no-owner";

export interface PayoutRow {
  status: PayoutStatus;
  /** The referrer's name, such as "mick.hex", or its tag when it isn't a name. */
  referrer: string;
  tag: Hex;
  /** Who to pay: the owner of the referrer's name now. */
  payTo: Address | null;
  purchases: number;
  renewals: number;
  /** What the buyers they brought paid, in USDC's units: millionths of a dollar. */
  paid: bigint;
  /** REFERRAL_PERCENT of `paid`, rounded down, in the same units. */
  owed: bigint;
}

export interface PayoutReport {
  /** The referrers to pay, most owed first. */
  pay: PayoutRow[];
  /** Not paid: the buyer owns the referring name too. */
  selfReferrals: PayoutRow[];
  /** Not paid: the tag isn't a name, or nobody owns that name now. */
  noOwner: PayoutRow[];
  /** Payments in a token whose decimals couldn't be read. None are expected. */
  otherTokens: ReferredPayment[];
  /** What's owed in all, and what the buyers behind it paid. */
  total: { paid: bigint; owed: bigint };
}

const same = (a: string | null, b: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** A dollar coin amount in USDC's units (6 decimals), rounded down. */
export function toMicroDollars(amount: bigint, decimals: number): bigint {
  return decimals >= 6 ? amount / 10n ** BigInt(decimals - 6) : amount * 10n ** BigInt(6 - decimals);
}

export function payoutReport(
  payments: ReferredPayment[],
  referrers: Map<Hex, Referrer>,
  tokens: Map<Address, Token>,
  percent = REFERRAL_PERCENT,
): PayoutReport {
  const rows = new Map<string, PayoutRow>();
  const otherTokens: ReferredPayment[] = [];
  for (const payment of payments) {
    const tag = payment.referrer.toLowerCase() as Hex;
    // The registrar prices names in dollars, in each payment token's own units (USDC and DAI).
    const token = tokens.get(payment.token.toLowerCase() as Address);
    if (!token) {
      otherTokens.push(payment);
      continue;
    }
    const referrer = referrers.get(tag) ?? { label: null, owner: null };
    const status: PayoutStatus = !referrer.label || !referrer.owner
      ? "no-owner"
      : same(referrer.owner, payment.owner)
        ? "self-referral"
        : "pay";
    const key = `${status}:${tag}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        status,
        referrer: referrer.label ? `${referrer.label}.hex` : tag,
        tag,
        payTo: status === "pay" ? referrer.owner : null,
        purchases: 0,
        renewals: 0,
        paid: 0n,
        owed: 0n,
      };
      rows.set(key, row);
    }
    if (payment.kind === "purchase") row.purchases += 1;
    else row.renewals += 1;
    row.paid += toMicroDollars(payment.amount, token.decimals);
  }
  for (const row of rows.values()) row.owed = (row.paid * BigInt(percent)) / 100n;

  const sorted = (status: PayoutStatus) =>
    [...rows.values()]
      .filter((row) => row.status === status)
      .sort((a, b) => (a.owed === b.owed ? a.referrer.localeCompare(b.referrer) : a.owed > b.owed ? -1 : 1));
  const pay = sorted("pay");
  return {
    pay,
    selfReferrals: sorted("self-referral"),
    noOwner: sorted("no-owner"),
    otherTokens,
    total: { paid: pay.reduce((sum, row) => sum + row.paid, 0n), owed: pay.reduce((sum, row) => sum + row.owed, 0n) },
  };
}

/** Millionths of a dollar as dollars, to 6 places: what to send in USDC. */
export function microDollarsText(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const fraction = (amount % 1_000_000n).toString().padStart(6, "0");
  return `${whole}.${fraction}`;
}

/** The same, to the cent (rounded down), for reading: "$12.34". */
export function dollarsText(amount: bigint): string {
  const cents = amount / 10_000n;
  return `$${(cents / 100n).toLocaleString("en-US")}.${(cents % 100n).toString().padStart(2, "0")}`;
}

const STATUS_TEXT: Record<PayoutStatus, string> = {
  pay: "pay",
  "self-referral": "not paid: self-referral",
  "no-owner": "not paid: no one owns this name",
};

/** The report as a spreadsheet: every referrer, paid or not, with what to send in USDC. */
export function payoutCsv(report: PayoutReport): string {
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [["referrer", "pay_to", "purchases", "renewals", "buyers_paid_usd", "owed_usdc", "status"].join(",")];
  for (const row of [...report.pay, ...report.selfReferrals, ...report.noOwner]) {
    lines.push(
      [
        row.referrer,
        row.payTo ?? "",
        row.purchases,
        row.renewals,
        microDollarsText(row.paid),
        row.status === "pay" ? microDollarsText(row.owed) : "0.000000",
        STATUS_TEXT[row.status],
      ]
        .map(cell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** USDC to send, without trailing zeros past the cents: "3.25", "0.000007". */
export function usdcText(micro: bigint): string {
  const whole = micro / 1_000_000n;
  const fraction = (micro % 1_000_000n).toString().padStart(6, "0").replace(/0{1,4}$/, "");
  return `${whole.toLocaleString("en-US")}.${fraction.padEnd(2, "0")}`;
}

/** An amount in USDC's units (millionths of a dollar) in a token's own units. */
export function tokenUnits(micro: bigint, decimals: number): bigint {
  return decimals >= 6 ? micro * 10n ** BigInt(decimals - 6) : micro / 10n ** BigInt(6 - decimals);
}

/** What Pay all sends: each referrer with something owed, in the token's units. */
export function payoutTransfers(report: PayoutReport, decimals: number): { to: Address; amount: bigint }[] {
  return report.pay
    .filter((row) => row.payTo && row.owed > 0n)
    .map((row) => ({ to: row.payTo!, amount: tokenUnits(row.owed, decimals) }));
}

/** A token transfer out of the payout contract. */
export interface Transfer {
  to: Address;
  value: bigint;
  tx: Hex;
  block: bigint;
}

/** The transaction that already paid every referrer exactly what they're owed, if there is one. */
export function findPayout(report: PayoutReport, transfers: Transfer[], decimals: number): Transfer | null {
  const wanted = payoutTransfers(report, decimals);
  if (!wanted.length) return null;
  const byTx = new Map<string, Transfer[]>();
  for (const transfer of transfers) byTx.set(transfer.tx, [...(byTx.get(transfer.tx) ?? []), transfer]);
  for (const sent of byTx.values()) {
    if (wanted.every((w) => sent.some((t) => same(t.to, w.to) && t.value === w.amount))) return sent[0];
  }
  return null;
}

/** "HXNS": what starts the note a payout carries at the end of its transaction. */
const NOTE_TAG = "48584e53";
const DAY_MS = 86_400_000;
/** A day ("2026-11-10") as a number: days since 1 January 1970. */
export const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
/** ... and back. */
export const dayFrom = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/**
 * The note a payout carries at the end of its transaction, after what the payout contract reads:
 * "HXNS", then the first and last days it paid for. The chain keeps it with the transaction, so any
 * device can see which days are paid.
 */
export function payoutNote(first: string, last: string): Hex {
  const word = (day: string) => dayNumber(day).toString(16).padStart(8, "0");
  return `0x${NOTE_TAG}${word(first)}${word(last)}`;
}

/** The days a payout's transaction says it paid for, or null if it carries no note. */
export function readPayoutNote(input: Hex): { first: string; last: string } | null {
  const hex = input.toLowerCase().replace(/^0x/, "");
  if (hex.length < 24 || !hex.slice(-24).startsWith(NOTE_TAG)) return null;
  const first = parseInt(hex.slice(-16, -8), 16);
  const last = parseInt(hex.slice(-8), 16);
  return first <= last ? { first: dayFrom(first), last: dayFrom(last) } : null;
}

/** A payout the payments wallet made, and the days it says it paid for (none if it predates notes). */
export interface Payout {
  tx: Hex;
  block: bigint;
  days: { first: string; last: string } | null;
}

/** The last day paid for, by the payouts that say so. */
export function paidThrough(payouts: Payout[]): string | null {
  let last: string | null = null;
  for (const payout of payouts) if (payout.days && (!last || payout.days.last > last)) last = payout.days.last;
  return last;
}

/**
 * The days the next payout covers: from the day after the last one paid (or the launch offer's first
 * day) to yesterday, whole days only, within the offer. Null when there's nothing to pay yet.
 */
export function nextPeriod(o: {
  offerFirst: string;
  offerLast: string;
  paidThrough: string | null;
  today: string;
}): { first: string; last: string } | null {
  const first = o.paidThrough && o.paidThrough >= o.offerFirst ? dayFrom(dayNumber(o.paidThrough) + 1) : o.offerFirst;
  const yesterday = dayFrom(dayNumber(o.today) - 1);
  const last = yesterday < o.offerLast ? yesterday : o.offerLast;
  return first <= last ? { first, last } : null;
}
