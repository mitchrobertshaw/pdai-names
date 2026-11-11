// A name's purchase details and its registrar commitment, the id the registry knows a name by, and
// the referral tag a purchase carries.

import { type Address, type Hex, bytesToHex, encodeAbiParameters, keccak256, zeroAddress } from "viem";

export interface Purchase {
  label: string; // the name without .pdai
  owner: Address;
  secret: Hex; // 32 random bytes
  subregistry: Address;
  resolver: Address; // zero: the name resolves to its owner
  duration: bigint; // seconds
  referrer: Hex; // 32 bytes
}

export const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n;
export const NO_REFERRER: Hex = `0x${"00".repeat(32)}`;

const PARAMS = [
  { type: "string" },
  { type: "address" },
  { type: "bytes32" },
  { type: "address" },
  { type: "address" },
  { type: "uint64" },
  { type: "bytes32" },
] as const;

/** A new purchase of `label` for `owner`, with a fresh secret. */
export function newPurchase(label: string, owner: Address, years: number, referrer: Hex = NO_REFERRER): Purchase {
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  return {
    label,
    owner,
    secret: bytesToHex(secret),
    subregistry: zeroAddress,
    resolver: zeroAddress,
    duration: BigInt(years) * SECONDS_PER_YEAR,
    referrer,
  };
}

/** The registrar's commitment, as its makeCommitment computes it. */
export function commitmentOf(p: Purchase): Hex {
  return keccak256(
    encodeAbiParameters(PARAMS, [p.label, p.owner, p.secret, p.subregistry, p.resolver, p.duration, p.referrer]),
  );
}

/** The id the registry knows a name by: keccak256 of its label (ENSv2's LibLabel.id). */
export function labelId(label: string): bigint {
  return BigInt(keccak256(new TextEncoder().encode(label)));
}

/**
 * The referral tag a purchase carries to the registrar: keccak256 of the referrer's .pdai name, or
 * nothing. Nobody is credited for referring the very name they own.
 */
export function referralTag(referrer: string | null, buying: string): Hex {
  if (!referrer || referrer === buying) return NO_REFERRER;
  return keccak256(new TextEncoder().encode(referrer));
}
