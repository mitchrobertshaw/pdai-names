// The details behind an order's registrar commitment, and how they travel to the bot.
//
// A buyer on Ethereum puts only the commitment in their order, so nobody watching Ethereum can
// see which name they are buying and register it first. The details go along in the same order,
// sealed so that only the bot can open them: a NaCl box (X25519 + XSalsa20-Poly1305) from a
// one-off key to the bot's public key. Websites use `sealReveal`; the bot uses `openReveal`.
//
// Sealed format: 0x01 | ephemeral public key (32) | nonce (24) | box(ABI-encoded reveal).

import nacl from "tweetnacl";
import {
  type Address,
  type Hex,
  bytesToHex,
  concat,
  decodeAbiParameters,
  encodeAbiParameters,
  hexToBytes,
  keccak256,
  stringToHex,
} from "viem";

export type Reveal = {
  label: string; // the name without .hex
  owner: Address;
  secret: Hex; // 32 random bytes
  subregistry: Address; // usually zero
  resolver: Address; // zero to resolve to the owner on both chains
  duration: bigint; // seconds
  referrer: Hex; // 32 bytes, usually zero
};

const REVEAL_PARAMS = [
  { type: "string" },
  { type: "address" },
  { type: "bytes32" },
  { type: "address" },
  { type: "address" },
  { type: "uint64" },
  { type: "bytes32" },
] as const;

const SEALED_VERSION = 1;

/** ABI-encodes a reveal the way the registrar hashes it. */
export function encodeReveal(r: Reveal): Hex {
  return encodeAbiParameters(REVEAL_PARAMS, [r.label, r.owner, r.secret, r.subregistry, r.resolver, r.duration, r.referrer]);
}

export function decodeReveal(data: Hex): Reveal {
  const [label, owner, secret, subregistry, resolver, duration, referrer] = decodeAbiParameters(REVEAL_PARAMS, data);
  return { label, owner, secret, subregistry, resolver, duration, referrer };
}

/** The registrar commitment: ETHRegistrar.makeCommitment, keccak256(abi.encode(...)). */
export function commitmentOf(r: Reveal): Hex {
  return keccak256(encodeReveal(r));
}

/** Seals a reveal so that only the holder of `botPublicKey`'s secret key can open it. */
export function sealReveal(r: Reveal, botPublicKey: Uint8Array): Hex {
  if (botPublicKey.length !== nacl.box.publicKeyLength) throw new Error("bot public key must be 32 bytes");
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(hexToBytes(encodeReveal(r)), nonce, botPublicKey, ephemeral.secretKey);
  return concat([bytesToHex(new Uint8Array([SEALED_VERSION])), bytesToHex(ephemeral.publicKey), bytesToHex(nonce), bytesToHex(box)]);
}

/** Opens a sealed reveal, or returns null if it is not for this key or has been tampered with. */
export function openReveal(sealed: Hex, botSecretKey: Uint8Array): Reveal | null {
  const bytes = hexToBytes(sealed);
  const header = 1 + nacl.box.publicKeyLength + nacl.box.nonceLength;
  if (bytes.length < header + nacl.box.overheadLength || bytes[0] !== SEALED_VERSION) return null;
  const ephemeralPublicKey = bytes.slice(1, 1 + nacl.box.publicKeyLength);
  const nonce = bytes.slice(1 + nacl.box.publicKeyLength, header);
  const opened = nacl.box.open(bytes.slice(header), nonce, ephemeralPublicKey, botSecretKey);
  if (!opened) return null;
  try {
    return decodeReveal(bytesToHex(opened));
  } catch {
    return null;
  }
}

/**
 * Mixed with the wallet key to make the bot's encryption key. It must never change: a different
 * label would give the bot a different public key, and orders sealed to the old one couldn't be
 * opened.
 */
export const ENCRYPTION_KEY_LABEL = "hex-names bot: order encryption key";

/**
 * The bot's encryption secret key when BOT_ENCRYPTION_SECRET_KEY isn't set, made from its wallet
 * key so that there's one secret to keep instead of two. Both sit in the same settings anyway, so a
 * separate key wouldn't be any safer. The label keeps it from being the wallet key itself, and the
 * wallet key can't be worked out from it. A new wallet means a new public key for the website.
 */
export function encryptionSecretKeyFrom(walletKey: Hex): Hex {
  return keccak256(concat([stringToHex(ENCRYPTION_KEY_LABEL), walletKey]));
}

/** The bot's encryption key pair, from its 32-byte secret key. */
export function encryptionKeyPair(secretKey: Hex): { publicKey: Hex; secretKey: Uint8Array } {
  const keyPair = nacl.box.keyPair.fromSecretKey(hexToBytes(secretKey));
  return { publicKey: bytesToHex(keyPair.publicKey), secretKey: keyPair.secretKey };
}
