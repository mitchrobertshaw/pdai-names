// What the admin can change while the site runs, read from the contracts so the site always shows
// what paying takes: whether sales are open, and the price level (all prices raised or lowered
// together, as a share of the list prices in src/lib/names.ts).

import { useEffect, useState } from "react";
import type { Address } from "viem";

import { PRICES } from "../lib/names";
import { oracleAbi, registrarAbi, registryAbi, rulesAbi } from "./abis";
import { clients, deployment } from "./network";
import { SECONDS_PER_YEAR } from "./order";

/** ENSv2's role for registering names: the registrar holds it while sales are open. */
export const ROLE_REGISTRAR = 1n;

/** A price level: 10000 is the list prices, 12000 is 20% more. */
export const LIST_LEVEL = 10_000n;

/**
 * The oracle's units: 10^decimals of them to the dollar (12 on the first testnet, 27 since). Read
 * from its per-second rate for 5+ letter names, which is the list price spread over a year.
 */
export function priceDecimalsFrom(fivePlusRate: bigint, dollarsPerYear: number = PRICES.fivePlus): number {
  return Math.round(Math.log10(Number(fivePlusRate * SECONDS_PER_YEAR) / dollarsPerYear));
}

export type Ratio = { numer: bigint; denom: bigint };

/** A token's exchange rate at the list prices: from the oracle's units to the token's. */
export function baseRatio(tokenDecimals: number, priceDecimals: number): Ratio {
  return tokenDecimals >= priceDecimals
    ? { numer: 10n ** BigInt(tokenDecimals - priceDecimals), denom: 1n }
    : { numer: 1n, denom: 10n ** BigInt(priceDecimals - tokenDecimals) };
}

/** The price level a token's exchange rate sets, rounded to a hundredth of a percent. */
export function levelOf(ratio: Ratio, tokenDecimals: number, priceDecimals: number): bigint {
  const base = baseRatio(tokenDecimals, priceDecimals);
  const over = ratio.denom * base.numer;
  return (ratio.numer * base.denom * LIST_LEVEL + over / 2n) / over;
}

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));

/** The exchange rate that sets a token's prices to `level`, in lowest terms. */
export function ratioFor(level: bigint, tokenDecimals: number, priceDecimals: number): Ratio {
  const base = baseRatio(tokenDecimals, priceDecimals);
  const numer = base.numer * level;
  const denom = base.denom * LIST_LEVEL;
  const divisor = gcd(numer, denom);
  return { numer: numer / divisor, denom: denom / divisor };
}

let oracle: Promise<Address> | null = null;

/** The price oracle, behind HexNameRules. */
export function oracleAddress(): Promise<Address> {
  const d = deployment;
  if (!d) return Promise.reject(new Error("The contracts aren't deployed yet."));
  oracle ??= clients.pulsechain
    .readContract({ address: d.pulsechain.registrar, abi: registrarAbi, functionName: "rentPriceOracle" })
    .then((rules) => clients.pulsechain.readContract({ address: rules, abi: rulesAbi, functionName: "ORACLE" }))
    .catch((error) => {
      oracle = null;
      throw error;
    });
  return oracle;
}

/** The oracle's units: see priceDecimalsFrom. */
export async function readPriceDecimals(): Promise<number> {
  const rates = await clients.pulsechain.readContract({
    address: await oracleAddress(),
    abi: oracleAbi,
    functionName: "getBaseRates",
  });
  return priceDecimalsFrom(rates[rates.length - 1]);
}

/** Prices now, as a share of the list prices: 1 is the list prices. Names are priced in USDC. */
export async function readPriceLevel(): Promise<number> {
  const d = deployment;
  if (!d) return 1;
  const [decimals, [numer, denom]] = await Promise.all([
    readPriceDecimals(),
    oracleAddress().then((address) =>
      clients.pulsechain.readContract({
        address,
        abi: oracleAbi,
        functionName: "getPaymentTokenRatio",
        args: [d.pulsechain.usdc],
      }),
    ),
  ]);
  if (denom === 0n) return 1; // USDC taken away: sales are paused, and prices stay as listed
  return Number(levelOf({ numer, denom }, 6, decimals)) / Number(LIST_LEVEL);
}

/** Whether names can be bought: the admin can pause sales, and renewals carry on meanwhile. */
export async function readSalesOpen(): Promise<boolean> {
  const d = deployment;
  if (!d) return true;
  return clients.pulsechain.readContract({
    address: d.pulsechain.registry,
    abi: registryAbi,
    functionName: "hasRootRoles",
    args: [ROLE_REGISTRAR, d.pulsechain.registrar],
  });
}

/** The price level, once read: 1 until then, or if it can't be read. */
export function usePriceLevel(): number {
  const [level, setLevel] = useState(1);
  useEffect(() => {
    let alive = true;
    readPriceLevel()
      .then((value) => alive && setLevel(value))
      .catch(() => {
        // The list prices, then: the checkout's quote still shows the exact amount.
      });
    return () => {
      alive = false;
    };
  }, []);
  return level;
}

/** Whether sales are open, once read: null until then, or if it can't be read. */
export function useSalesOpen(): boolean | null {
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    readSalesOpen()
      .then((value) => alive && setOpen(value))
      .catch(() => {
        // Unknown: buying stays possible, and the payment's own check stops it if sales are paused.
      });
    return () => {
      alive = false;
    };
  }, []);
  return open;
}
