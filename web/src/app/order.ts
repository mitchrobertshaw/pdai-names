// A name's purchase details and its registrar commitment, and the sealed copy an order from
// Ethereum carries for the bot. The same format as bot/src/reveal.ts, which opens it.
//
// Sealed: 0x01 | one-off public key (32) | nonce (24) | NaCl box of the ABI-encoded details.

import nacl from "tweetnacl";
import {
  type Address,
  type Hex,
  bytesToHex,
  concat,
  encodeAbiParameters,
  hexToBytes,
  keccak256,
  zeroAddress,
} from "viem";

export interface Purchase {
  label: string; // the name without .hex
  owner: Address;
  secret: Hex; // 32 random bytes
  subregistry: Address;
  resolver: Address; // zero: the name resolves to its owner on both chains
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

export function encodePurchase(p: Purchase): Hex {
  return encodeAbiParameters(PARAMS, [p.label, p.owner, p.secret, p.subregistry, p.resolver, p.duration, p.referrer]);
}

/** The registrar's commitment, as its makeCommitment computes it. */
export function commitmentOf(p: Purchase): Hex {
  return keccak256(encodePurchase(p));
}

/** Seals the details so that only the bot, holding the secret key for `botPublicKey`, can read them. */
export function sealFor(p: Purchase, botPublicKey: Hex): Hex {
  const key = hexToBytes(botPublicKey);
  if (key.length !== nacl.box.publicKeyLength) throw new Error("the bot's public key must be 32 bytes");
  const oneOff = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(hexToBytes(encodePurchase(p)), nonce, key, oneOff.secretKey);
  return concat([bytesToHex(new Uint8Array([1])), bytesToHex(oneOff.publicKey), bytesToHex(nonce), bytesToHex(box)]);
}

/** The id the registry knows a name by: keccak256 of its label (ENSv2's LibLabel.id). */
export function labelId(label: string): bigint {
  return BigInt(keccak256(new TextEncoder().encode(label)));
}

/**
 * The referral tag a purchase carries to the registrar: keccak256 of the referrer's .hex name, or
 * nothing. Nobody is credited for referring the very name they own.
 */
export function referralTag(referrer: string | null, buying: string): Hex {
  if (!referrer || referrer === buying) return NO_REFERRER;
  return keccak256(new TextEncoder().encode(referrer));
}
