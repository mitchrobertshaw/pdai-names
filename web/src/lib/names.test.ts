import { describe, expect, it } from "vitest";

import botConfig from "../../../bot/src/config.ts?raw";
import deployer from "../../../script/HexDeployer.sol?raw";
import nameRules from "../../../src/pulsechain/HexNameRules.sol?raw";
import page from "../../index.html?raw";

import {
  checkName,
  DISCOUNTS,
  ETHEREUM_ORDER_FEE,
  MAX_NAME_BYTES,
  isPlain,
  MAX_YEARS,
  nameLength,
  NO_DOUBLE_HYPHEN,
  PLAIN_ONLY,
  PRICES,
  priceFor,
  shortName,
  tooLongText,
  YEARLY_PRICE,
} from "./names";
import { parseReservedNames, reservedFor } from "./reserved";

const reserved = parseReservedNames(
  "name,wallet,who\n" +
    "yourfriendsommi,0xc6aB34235e4b2B7F42A3F6D78830E83760881667,Your Friend Sommi (@yourfriendSOMMI). note\n" +
    "pulsechain,,PulseChain\n",
);
const check = (input: string) => checkName(input, reserved);

describe("checkName", () => {
  it("prices names of 5 or more characters at $10 a year", () => {
    expect(check("alice")).toEqual({ kind: "available", name: "alice.hex", length: 5, yearlyPrice: 10 });
  });

  it("lower-cases, trims and accepts a typed .hex ending", () => {
    expect(check("  Alice.HEX ")).toMatchObject({ kind: "available", name: "alice.hex" });
  });

  it("prices 3 and 4 characters as premium and refuses 1 and 2", () => {
    expect(check("abc")).toMatchObject({ kind: "premium", length: 3, yearlyPrice: 320 });
    expect(check("abcd")).toMatchObject({ kind: "premium", length: 4, yearlyPrice: 160 });
    expect(check("ab")).toEqual({ kind: "too-short", name: "ab.hex" });
    expect(check("a")).toMatchObject({ kind: "too-short" });
  });

  it("sells only letters a to z, numbers and hyphens, as the contracts do", () => {
    for (const name of ["pulse-chain", "0x123", "-abcd", "abcd-", "a--bcd"]) {
      expect(check(name).kind, name).toBe("available");
      expect(isPlain(name), name).toBe(true);
    }
    for (const name of ["🔥🔥🔥", "café", "名前名", "al_ice", "_alice", "$alice", "alice's", "аlice"]) {
      expect(check(name), name).toEqual({ kind: "invalid", reason: PLAIN_ONLY });
    }
    // As ENS's rules, "--" can't be the 3rd and 4th characters: that's kept for encoded names.
    expect(check("ab--cd")).toEqual({ kind: "invalid", reason: NO_DOUBLE_HYPHEN });
    expect(check("xn--abc")).toEqual({ kind: "invalid", reason: NO_DOUBLE_HYPHEN });
    expect(isPlain("ab--cd")).toBe(false);
    expect(nameLength("alice")).toBe(5);
  });

  it("says who a reserved name is for", () => {
    expect(check("yourfriendsommi")).toEqual({
      kind: "reserved",
      name: "yourfriendsommi.hex",
      reservedFor: "Your Friend Sommi",
      given: true,
    });
    expect(check("PulseChain")).toMatchObject({ kind: "reserved", reservedFor: "PulseChain", given: false });
  });

  it("catches .eth and checks the .hex name instead", () => {
    expect(check("alice.eth")).toEqual({
      kind: "eth",
      name: "alice.eth",
      hex: { kind: "available", name: "alice.hex", length: 5, yearlyPrice: 10 },
    });
    expect(check("alice.hex.eth")).toMatchObject({ kind: "eth", hex: { name: "alice.hex" } });
  });

  it("refuses dots, spaces and characters wallets won't accept", () => {
    expect(check("sub.alice")).toMatchObject({ kind: "invalid" });
    expect(check("two words")).toEqual({ kind: "invalid", reason: "Names can't have spaces in them." });
    expect(check("hey!")).toEqual({ kind: "invalid", reason: PLAIN_ONLY });
  });

  it("drops invisible characters, as wallets do when they normalize a name", () => {
    expect(check("ali​ce")).toMatchObject({ kind: "available", name: "alice.hex" }); // zero-width space
  });

  it("says a name over 63 bytes is too long, as the contracts do", () => {
    const longest = "a".repeat(63);
    const tooLong = "a".repeat(64);
    expect(check(longest)).toMatchObject({ kind: "available", length: 63 });
    expect(check(tooLong)).toEqual({ kind: "too-long", name: `${tooLong}.hex`, length: 64, bytes: 64 });
    expect(tooLongText({ length: 64 })).toBe("Names can be up to 63 characters. This one has 64.");
    expect(shortName(`${tooLong}.hex`)).toBe(`${"a".repeat(20)}….hex`);
    expect(shortName("alice.hex")).toBe("alice.hex");
  });

  it("treats blank input as nothing typed", () => {
    expect(check("   ")).toEqual({ kind: "empty" });
    expect(check(".hex")).toEqual({ kind: "empty" });
  });
});

describe("priceFor", () => {
  it("applies the multi-year price to the whole price", () => {
    expect(priceFor(5, 1)).toEqual({ full: 10, total: 10, discount: 0 });
    expect(priceFor(5, 2)).toEqual({ full: 20, total: 15, discount: 0.25 });
    expect(priceFor(5, 3).total).toBeCloseTo(17.5);
    expect(priceFor(5, 4).total).toBeCloseTo(18.75);
    expect(priceFor(3, 1).total).toBe(320);
  });

  it("makes 5 years cost the same as 2, and more years always cost more in all", () => {
    expect([1, 2, 3, 4, 5].map((y) => Math.round(priceFor(3, y).total))).toEqual([320, 480, 560, 600, 640]);
    expect(priceFor(4, 5).total).toBeCloseTo(320);
    expect(priceFor(5, 5).total).toBeCloseTo(20);
    expect(priceFor(5, 5).total).toBeCloseTo(priceFor(5, 1).full * 2);
    for (let y = 2; y <= MAX_YEARS; y++) expect(priceFor(3, y).total).toBeGreaterThan(priceFor(3, y - 1).total);
  });
});

describe("the prices", () => {
  const number = (pattern: RegExp) => Number(deployer.match(pattern)?.[1]);

  it("match what the contracts are deployed with", () => {
    expect(number(/YEARLY_PRICE_5_PLUS\s*=\s*(\d+)/), "5+ characters").toBe(PRICES.fivePlus);
    expect(number(/YEARLY_PRICE_4\s*=\s*(\d+)/), "4 characters").toBe(PRICES.four);
    expect(number(/YEARLY_PRICE_3\s*=\s*(\d+)/), "3 characters").toBe(PRICES.three);
    expect(YEARLY_PRICE).toBe(PRICES.fivePlus);
  });

  it("use the contracts' multi-year discounts", () => {
    // e.g. "duration: uint64(2 * SEC_PER_YEAR), numer: DISCOUNT_DENOMINATOR / 8 * 7"
    const steps = [...deployer.matchAll(/uint64\((\d+) \* SEC_PER_YEAR\), numer: DISCOUNT_DENOMINATOR \/ (\d+) \* (\d+)/g)];
    expect(steps.map(([, years, over, times]) => ({ years: Number(years), factor: Number(times) / Number(over) }))).toEqual(
      DISCOUNTS.map((d) => ({ years: d.years, factor: d.factor })),
    );
  });

  it("cap names at the length and the years the contracts do", () => {
    expect(nameRules).toMatch(new RegExp(`MAX_LENGTH = ${MAX_NAME_BYTES};`));
    expect(nameRules).toMatch(new RegExp(`MAX_TERM = ${MAX_YEARS} \\* 365 days;`));
  });

  it("allow the same characters the contracts do", () => {
    expect(nameRules).toContain('(c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c == "-"');
    expect(nameRules).toContain('b.length >= 4 && b[2] == "-" && b[3] == "-"');
  });

  it("add the bot's Ethereum order fee", () => {
    expect(Number(botConfig.match(/MIN_FEE_USDC"\) \?\? "([\d.]+)"/)?.[1])).toBe(ETHEREUM_ORDER_FEE);
  });

  it("is the one in the page description", () => {
    expect(page).toContain(`$${YEARLY_PRICE} a year`);
  });
});

describe("reservedFor", () => {
  it("takes the note up to its first bracket or full stop", () => {
    expect(reservedFor("Your Friend Sommi (@yourfriendSOMMI). More")).toBe("Your Friend Sommi");
    expect(reservedFor("PulseChain")).toBe("PulseChain");
    expect(reservedFor("A project. More")).toBe("A project");
  });
});
