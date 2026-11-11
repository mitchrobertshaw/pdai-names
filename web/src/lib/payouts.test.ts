import { concat, encodeFunctionData, keccak256, toBytes } from "viem";
import { describe, expect, it } from "vitest";

import { disperseAbi } from "../app/abis";

import {
  dollarsText,
  findPayout,
  microDollarsText,
  nextPeriod,
  paidThrough,
  payoutCsv,
  payoutNote,
  payoutReport,
  payoutTransfers,
  readPayoutNote,
  type ReferredPayment,
  type Referrer,
  tokenUnits,
  toMicroDollars,
  type Transfer,
} from "./payouts";

const tag = (name: string) => keccak256(toBytes(name));
const A = "0x00000000000000000000000000000000000000aa"; // owns mick.hex
const B = "0x00000000000000000000000000000000000000bb"; // owns sommi.hex
const USDC = "0x00000000000000000000000000000000000000c1";
const DAI = "0x00000000000000000000000000000000000000d1";
const ODD = "0x00000000000000000000000000000000000000e1";

const tokens = new Map([
  [USDC, { symbol: "USDC", decimals: 6 }],
  [DAI, { symbol: "DAI", decimals: 18 }],
] as const);

const referrers = new Map<`0x${string}`, Referrer>([
  [tag("mick"), { label: "mick", owner: "0x00000000000000000000000000000000000000AA" }], // any letter case
  [tag("sommi"), { label: "sommi", owner: B }],
  [tag("lapsed"), { label: "lapsed", owner: null }], // a name nobody owns now
  // tag("ghost") was never a name, so it isn't here at all
]);

let n = 0;
const pay = (kind: ReferredPayment["kind"], label: string, owner: `0x${string}` | null, referrer: string, amount: bigint, token: `0x${string}` = USDC): ReferredPayment => ({
  kind,
  label,
  owner,
  referrer: tag(referrer),
  amount,
  token,
  block: BigInt(++n),
  tx: `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`,
});

const usdc = (dollars: number) => BigInt(Math.round(dollars * 1e6));

describe("the referral payout report", () => {
  const report = payoutReport(
    [
      pay("purchase", "bob", "0x00000000000000000000000000000000000000c0", "mick", usdc(10)),
      pay("purchase", "carol", "0x00000000000000000000000000000000000000d0", "mick", 10n * 10n ** 18n, DAI),
      pay("renewal", "bob", "0x00000000000000000000000000000000000000c0", "mick", usdc(10)),
      pay("purchase", "mick2", A, "mick", usdc(10)), // mick's owner bought it: a self-referral
      pay("purchase", "dave", "0x00000000000000000000000000000000000000e0", "sommi", usdc(2.5)),
      pay("purchase", "eve", "0x00000000000000000000000000000000000000f0", "ghost", usdc(10)),
      pay("purchase", "frank", "0x0000000000000000000000000000000000000100", "lapsed", usdc(10)),
      pay("purchase", "gina", "0x0000000000000000000000000000000000000200", "mick", 5n, ODD),
    ],
    referrers,
    tokens,
  );

  it("pays each referrer 10% of what their buyers paid, purchases and renewals, USDC and DAI alike", () => {
    expect(report.pay.map((row) => [row.referrer, row.payTo, row.purchases, row.renewals, row.paid, row.owed])).toEqual([
      ["mick.hex", "0x00000000000000000000000000000000000000AA", 2, 1, usdc(30), usdc(3)],
      ["sommi.hex", B, 1, 0, usdc(2.5), usdc(0.25)],
    ]);
    expect(report.total).toEqual({ paid: usdc(32.5), owed: usdc(3.25) });
  });

  it("sets aside self-referrals, and tags that aren't a name anyone owns", () => {
    expect(report.selfReferrals.map((row) => [row.referrer, row.payTo, row.purchases, row.paid])).toEqual([["mick.hex", null, 1, usdc(10)]]);
    expect(report.noOwner.map((row) => [row.referrer, row.payTo, row.paid])).toEqual([
      [tag("ghost"), null, usdc(10)],
      ["lapsed.hex", null, usdc(10)],
    ]);
    expect(report.otherTokens.map((p) => p.label)).toEqual(["gina"]);
  });

  it("rounds what's owed down to USDC's smallest unit", () => {
    const tiny = payoutReport([pay("purchase", "x", null, "sommi", 33n)], referrers, tokens);
    expect(tiny.pay[0].owed).toBe(3n);
    expect(toMicroDollars(10n ** 18n, 18)).toBe(1_000_000n);
    expect(toMicroDollars(999_999_999_999n, 18)).toBe(0n);
    expect(toMicroDollars(150n, 2)).toBe(1_500_000n);
  });

  it("writes amounts the way they're sent and read", () => {
    expect(microDollarsText(usdc(3.25))).toBe("3.250000");
    expect(microDollarsText(7n)).toBe("0.000007");
    expect(dollarsText(usdc(3.25))).toBe("$3.25");
    expect(dollarsText(1_234_567_899_999n)).toBe("$1,234,567.89");
  });

  it("makes a spreadsheet of every referrer, paid or not", () => {
    expect(payoutCsv(report).split("\n")).toEqual([
      "referrer,pay_to,purchases,renewals,buyers_paid_usd,owed_usdc,status",
      "mick.hex,0x00000000000000000000000000000000000000AA,2,1,30.000000,3.000000,pay",
      `sommi.hex,${B},1,0,2.500000,0.250000,pay`,
      "mick.hex,,1,0,10.000000,0.000000,not paid: self-referral",
      `${tag("ghost")},,1,0,10.000000,0.000000,not paid: no one owns this name`,
      "lapsed.hex,,1,0,10.000000,0.000000,not paid: no one owns this name",
      "",
    ]);
  });
});

describe("paying out", () => {
  const report = payoutReport(
    [
      pay("purchase", "bob", "0x00000000000000000000000000000000000000c0", "mick", usdc(10)),
      pay("purchase", "dave", "0x00000000000000000000000000000000000000e0", "sommi", usdc(2.5)),
      pay("purchase", "tiny", "0x00000000000000000000000000000000000000e0", "sommi", 0n), // nothing owed for this one
    ],
    referrers,
    tokens,
  );
  const sent = (tx: string, to: string, value: bigint): Transfer => ({ to: to as `0x${string}`, value, tx: tx as `0x${string}`, block: 1n });

  it("sends each referrer what they're owed, in the token's own units", () => {
    expect(payoutTransfers(report, 6)).toEqual([
      { to: "0x00000000000000000000000000000000000000AA", amount: usdc(1) },
      { to: B, amount: usdc(0.25) },
    ]);
    expect(tokenUnits(usdc(1), 18)).toBe(10n ** 18n);
    expect(tokenUnits(usdc(1), 2)).toBe(100n);
  });

  it("knows a payout was already sent when one transaction paid everyone exactly", () => {
    const tx = "0x01";
    // Paid in full, in one go: found, whatever else went to these wallets.
    expect(findPayout(report, [sent("0x09", B, 5n), sent(tx, A, usdc(1)), sent(tx, B, usdc(0.25))], 6)?.tx).toBe(tx);
    // The same amounts in two transactions, or a different amount: not this payout.
    expect(findPayout(report, [sent("0x02", A, usdc(1)), sent("0x03", B, usdc(0.25))], 6)).toBeNull();
    expect(findPayout(report, [sent(tx, A, usdc(1)), sent(tx, B, usdc(0.24))], 6)).toBeNull();
    expect(findPayout(report, [], 6)).toBeNull();
  });
});

describe("a payout's record of the days it paid", () => {
  const payee = "0x1096E7956173bF2778F51798B9D411E3F366f0ca";
  const usdc = "0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07";

  it("rides at the end of the payout's transaction, where Disperse ignores it", () => {
    const note = payoutNote("2026-11-01", "2026-11-30");
    expect(note).toMatch(/^0x48584e53[0-9a-f]{16}$/); // "HXNS", then the two days
    const call = encodeFunctionData({ abi: disperseAbi, functionName: "disperseToken", args: [usdc, [payee], [1_000_000n]] });
    expect(readPayoutNote(concat([call, note]))).toEqual({ first: "2026-11-01", last: "2026-11-30" });
    // A payout made before payouts carried notes says nothing.
    expect(readPayoutNote(call)).toBeNull();
    expect(readPayoutNote("0x")).toBeNull();
  });

  it("knows the last day paid from all the payouts made", () => {
    const at = (first: string, last: string) => ({ tx: "0x01" as const, block: 1n, days: { first, last } });
    expect(paidThrough([])).toBeNull();
    expect(paidThrough([at("2026-11-01", "2026-11-14"), at("2026-11-15", "2026-11-30"), { tx: "0x02", block: 2n, days: null }])).toBe(
      "2026-11-30",
    );
  });

  it("starts the next payout the day after the last one, and pays whole days up to yesterday", () => {
    const offer = { offerFirst: "2026-11-01", offerLast: "2026-12-28" };
    // Nothing paid yet: from the first day of the offer.
    expect(nextPeriod({ ...offer, paidThrough: null, today: "2026-11-20" })).toEqual({ first: "2026-11-01", last: "2026-11-19" });
    // Paid up to the 19th: from the 20th.
    expect(nextPeriod({ ...offer, paidThrough: "2026-11-19", today: "2026-12-01" })).toEqual({ first: "2026-11-20", last: "2026-11-30" });
    // Paid up to yesterday: nothing until today is over.
    expect(nextPeriod({ ...offer, paidThrough: "2026-11-30", today: "2026-12-01" })).toBeNull();
    // The offer's first day isn't over yet.
    expect(nextPeriod({ ...offer, paidThrough: null, today: "2026-11-01" })).toBeNull();
    // After the offer, up to its last day only, and then nothing more.
    expect(nextPeriod({ ...offer, paidThrough: "2026-12-20", today: "2027-02-01" })).toEqual({ first: "2026-12-21", last: "2026-12-28" });
    expect(nextPeriod({ ...offer, paidThrough: "2026-12-28", today: "2027-02-01" })).toBeNull();
  });
});
