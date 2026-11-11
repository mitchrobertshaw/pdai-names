// What a name is right now: free, premium, reserved, or someone's. From the registry on PulseChain
// once the contracts are deployed; until then from the same rules the contracts use.

import { type Address, zeroAddress } from "viem";

import { checkName, nameLength, priceFor, yearlyPriceFor } from "../lib/names";
import { reservedFor, reservedNames } from "../lib/reserved";
import { registrarAbi, registryAbi } from "./abis";
import { clients, deployment } from "./network";
import { labelId, SECONDS_PER_YEAR } from "./order";

export type NameInfo =
  | { kind: "invalid"; reason: string }
  | { kind: "too-short"; label: string }
  /** Over 63 characters: the contracts turn it away. */
  | { kind: "too-long"; label: string; length: number; bytes: number }
  | { kind: "available"; label: string; length: number; yearlyPrice: number; premium: number }
  | { kind: "reserved"; label: string; reservedFor: string }
  | {
      kind: "registered";
      label: string;
      owner: Address;
      expiry: number; // unix seconds
      /** Expired, but its owner can still renew it until `graceEnds`. */
      inGrace: boolean;
      reservedFor?: string;
    };

const GRACE = 28 * 24 * 60 * 60;

/** Checks the name the way the search does: normal form, length, the reserved list. */
export function localInfo(input: string): NameInfo {
  const check = checkName(input);
  switch (check.kind) {
    case "empty":
      return { kind: "invalid", reason: "Type a name." };
    case "invalid":
      return { kind: "invalid", reason: check.reason };
    case "eth":
      return localInfo(check.name.replace(/\.eth$/, "")); // the .hex name with the same label
    case "too-short":
      return { kind: "too-short", label: check.name.replace(/\.hex$/, "") };
    case "too-long":
      return { kind: "too-long", label: check.name.replace(/\.hex$/, ""), length: check.length, bytes: check.bytes };
    case "reserved":
      return { kind: "reserved", label: check.name.replace(/\.hex$/, ""), reservedFor: check.reservedFor };
    case "premium":
    case "available":
      return {
        kind: "available",
        label: check.name.replace(/\.hex$/, ""),
        length: check.length,
        yearlyPrice: check.yearlyPrice,
        premium: 0,
      };
  }
}

/** The name's state on PulseChain, or the local rules before the contracts are deployed. */
export async function lookUp(input: string): Promise<NameInfo> {
  const local = localInfo(input);
  if (!deployment || local.kind === "invalid" || local.kind === "too-short" || local.kind === "too-long") return local;
  const label = local.label;
  const { registry, registrar, usdc } = deployment.pulsechain;
  const state = await clients.pulsechain.readContract({
    address: registry,
    abi: registryAbi,
    functionName: "getState",
    args: [labelId(label)],
  });
  const expiry = Number(state.expiry);
  const owner = state.latestOwner;
  const reservation = reservedNames.get(label);
  const now = Math.floor(Date.now() / 1000);
  if (owner !== zeroAddress && expiry + GRACE > now) {
    return {
      kind: "registered",
      label,
      owner,
      expiry,
      inGrace: expiry <= now,
      reservedFor: reservation ? reservedFor(reservation.note) : undefined,
    };
  }
  if (state.status === 1)
    return { kind: "reserved", label, reservedFor: reservation ? reservedFor(reservation.note) : "its owner" };
  const available = await clients.pulsechain.readContract({
    address: registrar,
    abi: registrarAbi,
    functionName: "isAvailable",
    args: [label],
  });
  if (!available)
    return { kind: "reserved", label, reservedFor: reservation ? reservedFor(reservation.note) : "its owner" };
  // A name that lapsed recently costs more for a while (a premium that halves daily).
  const [, premium] = await clients.pulsechain.readContract({
    address: registrar,
    abi: registrarAbi,
    functionName: "getRegisterPrice",
    args: [label, SECONDS_PER_YEAR, usdc],
  });
  const length = nameLength(label);
  return { kind: "available", label, length, yearlyPrice: yearlyPriceFor(length) ?? 0, premium: Number(premium) / 1e6 };
}

/**
 * What `years` of `info` costs in dollars, before any fee, at the price `level` the admin has set (1
 * is the list prices). The premium is read from the chain, so it's already at the level.
 */
export function priceOf(info: Extract<NameInfo, { kind: "available" }>, years: number, level = 1) {
  const price = priceFor(info.length, years);
  return { ...price, full: price.full * level, total: price.total * level + info.premium };
}
