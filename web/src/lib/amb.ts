// The official PulseChain bridge's messages (TokenBridge AMB, interfaces version 6.2), for copying a
// name to Ethereum from the app: the same reading of messages as the bot's (bot/src/amb.ts).
//
// A message sent from PulseChain is recorded by the bridge's home contract in a
// UserRequestForSignature event. Its validators then sign it there, and once enough have, anyone can
// execute it on Ethereum by passing the message and the signatures to the foreign contract's
// executeSignatures, paying Ethereum's fee for it.

import { type Hex, concat, getAddress, keccak256, size, slice, toHex } from "viem";

export type AmbMessage = {
  messageId: Hex;
  sender: string; // the contract that sent it, on PulseChain
  executor: string; // the contract it calls, on Ethereum
  gasLimit: bigint;
  data: Hex; // the call made on Ethereum
  encoded: Hex; // the whole message, as signed
  hash: Hex; // keccak256 of the whole message: the key the home contract stores signatures under
};

/**
 * Reads an AMB v6 message: messageId (32) | sender (20) | executor (20) | gas limit (4) |
 * source chain id length (1) | destination chain id length (1) | data type (1) |
 * source chain id | destination chain id | call data.
 */
export function parseAmbMessage(encoded: Hex): AmbMessage {
  if (size(encoded) < 79) throw new Error("not an AMB message: too short");
  const sourceLength = Number(BigInt(slice(encoded, 76, 77)));
  const destinationLength = Number(BigInt(slice(encoded, 77, 78)));
  const dataStart = 79 + sourceLength + destinationLength;
  if (size(encoded) < dataStart) throw new Error("not an AMB message: chain ids cut short");
  return {
    messageId: slice(encoded, 0, 32),
    sender: getAddress(slice(encoded, 32, 52)),
    executor: getAddress(slice(encoded, 52, 72)),
    gasLimit: BigInt(slice(encoded, 72, 76)),
    data: size(encoded) === dataStart ? "0x" : slice(encoded, dataStart),
    encoded,
    hash: keccak256(encoded),
  };
}

/**
 * Packs validator signatures the way executeSignatures expects them:
 * count (1 byte) | v of each (1 byte each) | r of each (32 bytes each) | s of each (32 bytes each).
 * Each signature as stored by the home contract is 65 bytes: r (32) | s (32) | v (1).
 */
export function packSignatures(signatures: Hex[]): Hex {
  if (signatures.length === 0 || signatures.length > 255) throw new Error("need between 1 and 255 signatures");
  const vs: Hex[] = [];
  const rs: Hex[] = [];
  const ss: Hex[] = [];
  for (const sig of signatures) {
    if (size(sig) !== 65) throw new Error(`signature is ${size(sig)} bytes, not 65`);
    rs.push(slice(sig, 0, 32));
    ss.push(slice(sig, 32, 64));
    vs.push(slice(sig, 64, 65));
  }
  return concat([toHex(signatures.length, { size: 1 }), ...vs, ...rs, ...ss]);
}

/** The home contract marks a message as fully signed by setting the top bit of its count. */
export function isFullySigned(numMessagesSigned: bigint, required: bigint): boolean {
  const processed = numMessagesSigned >> 255n === 1n;
  const count = numMessagesSigned & ((1n << 255n) - 1n);
  return processed || count >= required;
}
