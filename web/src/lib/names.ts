// Checks and prices a name the way the contracts will: ENS normal form (ENSIP-15), length counted
// in characters like ENSv2's StringUtils.strlen, and the prices and multi-year discounts the
// registrar is deployed with (script/HexDeployer.sol; names.test.ts checks they match).
import { ens_normalize } from "@adraffy/ens-normalize";

import { type Reservation, reservedFor, reservedNames } from "./reserved";

/** Dollars a year by length, covering both chains. Names of 1 or 2 characters aren't for sale. */
export const PRICES = { three: 320, four: 160, fivePlus: 10 } as const;

/** Dollars a year for names of 5 or more characters. */
export const YEARLY_PRICE = PRICES.fivePlus;

/**
 * Multi-year prices: from `years`, the whole price is multiplied by `factor`. 2 years cost 1.5
 * years' price, 3 cost 1.75, 4 cost 1.875, and 5 cost 2: 5 years for the price of 2.
 */
export const DISCOUNTS = [
  { years: 2, factor: 3 / 4 },
  { years: 3, factor: 7 / 12 },
  { years: 4, factor: 15 / 32 },
  { years: 5, factor: 2 / 5 },
] as const;

/** The longest a name can be paid for, as the contracts allow (HexNameRules.MAX_TERM). */
export const MAX_YEARS = 5;

/** The fee the hex-names bot adds to orders placed from Ethereum, in dollars. */
export const ETHEREUM_ORDER_FEE = 0.25;

export function yearlyPriceFor(length: number): number | null {
  if (length < 3) return null;
  if (length === 3) return PRICES.three;
  if (length === 4) return PRICES.four;
  return PRICES.fivePlus;
}

/** What `years` of a name of `length` characters cost before any discount, and after it. */
export function priceFor(length: number, years: number): { full: number; total: number; discount: number } {
  const full = (yearlyPriceFor(length) ?? 0) * years;
  let factor = 1;
  for (const step of DISCOUNTS) if (years >= step.years) factor = step.factor;
  return { full, total: full * factor, discount: 1 - factor };
}

/**
 * The longest name that can be registered: 63 characters, the most one part of a web address can
 * hold. The contracts (src/pulsechain/HexNameRules.sol) count bytes, and a name's letters, digits
 * and hyphens are a byte each.
 */
export const MAX_NAME_BYTES = 63;

/** What a name can be made of, as the contracts allow (HexNameRules): letters a to z, digits and hyphens. */
const PLAIN = /^[a-z0-9-]*$/;

export const PLAIN_ONLY = "Names can only use letters a to z, numbers and hyphens.";

export const NO_DOUBLE_HYPHEN = "Names can't have hyphens as both their 3rd and 4th characters.";

/**
 * Whether a (normalized) label is a name the contracts will sell: letters a to z, digits and
 * hyphens, without "--" as its 3rd and 4th characters, which ENS's rules keep for encoded names
 * such as "xn--". Exactly HexNameRules.isPlain.
 */
export function isPlain(label: string): boolean {
  return PLAIN.test(label) && !label.startsWith("--", 2);
}

export type NameCheck =
  | { kind: "empty" }
  | { kind: "invalid"; reason: string }
  | { kind: "eth"; name: string; hex: NameCheck } // typed a .eth name; `hex` checks the .hex one
  | { kind: "too-short"; name: string }
  | { kind: "too-long"; name: string; length: number; bytes: number }
  | { kind: "premium"; name: string; length: number; yearlyPrice: number }
  | { kind: "reserved"; name: string; reservedFor: string; given: boolean }
  | { kind: "available"; name: string; length: number; yearlyPrice: number };

/** The number of characters in a normalized name, as the price oracle counts them. */
export function nameLength(label: string): number {
  return [...label].length;
}

/** The number of bytes in a name, as the length cap counts them. */
export function nameBytes(label: string): number {
  return new TextEncoder().encode(label).length;
}

/** Why a name is too long, said plainly. */
export function tooLongText(check: { length: number }): string {
  return `Names can be up to ${MAX_NAME_BYTES} characters. This one has ${check.length}.`;
}

/** A long name cut down for a heading: "averyveryverylongname….hex". */
export function shortName(name: string, keep = 24): string {
  const label = name.replace(/\.hex$/, "");
  const characters = [...label];
  return characters.length > keep ? `${characters.slice(0, keep - 4).join("")}….hex` : name;
}

export function checkName(input: string, reserved: Map<string, Reservation> = reservedNames): NameCheck {
  const text = input.trim();
  if (!text) return { kind: "empty" };

  const lower = text.toLowerCase();
  if (lower.endsWith(".eth")) {
    const label = text.slice(0, -4).replace(/\.hex$/i, "");
    return { kind: "eth", name: lower, hex: checkName(label, reserved) };
  }
  const bare = lower.endsWith(".hex") ? text.slice(0, -4) : text;
  if (bare.includes(".")) {
    return { kind: "invalid", reason: "A .hex name is one word, with no dots in it." };
  }

  let label: string;
  try {
    label = ens_normalize(bare);
  } catch (error) {
    return { kind: "invalid", reason: explain(bare, error) };
  }
  if (!label) return { kind: "empty" };
  if (!isPlain(label)) return { kind: "invalid", reason: PLAIN_ONLY };

  const name = `${label}.hex`;
  const length = nameLength(label);
  const yearlyPrice = yearlyPriceFor(length);
  if (yearlyPrice === null) return { kind: "too-short", name };
  const bytes = nameBytes(label);
  if (bytes > MAX_NAME_BYTES) return { kind: "too-long", name, length, bytes };
  const reservation = reserved.get(label);
  if (reservation) {
    return { kind: "reserved", name, reservedFor: reservedFor(reservation.note), given: reservation.given };
  }
  if (length < 5) return { kind: "premium", name, length, yearlyPrice };
  return { kind: "available", name, length, yearlyPrice };
}

function explain(text: string, error: unknown): string {
  if (/\s/.test(text)) return "Names can't have spaces in them.";
  const lower = text.toLowerCase();
  if (!PLAIN.test(lower)) return PLAIN_ONLY;
  if (lower.startsWith("--", 2)) return NO_DOUBLE_HYPHEN;
  const detail = error instanceof Error ? error.message : String(error);
  return `Wallets wouldn't accept this name (${detail}).`;
}
