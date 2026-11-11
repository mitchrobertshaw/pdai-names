// For websites: everything needed to buy a .hex name from Ethereum in one transaction.
//
//   const order = prepareOrder({ label: "alice", owner, years: 1, botPublicKey });
//   // price: PulseChain registrar.getRegisterPrice(label, duration, USDC) (base + premium)
//   const amount = orderAmount(price, minFee);
//   // then, on Ethereum: HexOrderBook.placeOrder(order.commitment, amount, order.sealed)
//   //   (or placeOrderWithETH / placeOrderWithToken to pay with ETH, HEX or any token)
//
// Keep `order.reveal` until the name shows up: with it the buyer can also report the order
// unfillable themselves if needed.

import { type Address, type Hex, bytesToHex, hexToBytes, zeroAddress } from "viem";
import { normalize } from "viem/ens";

import { type Reveal, commitmentOf, sealReveal } from "./reveal.ts";

/**
 * Checks a label is already in ENS normal form (ENSIP-15: lower case, no look-alike characters).
 * Wallets normalise what people type, so a name bought in any other form could never be found.
 */
export function assertNormalizedLabel(label: string): void {
  if (label.length === 0 || label.includes(".")) throw new Error("a label is one name with no dots, e.g. \"alice\" for alice.hex");
  if (normalize(label) !== label) throw new Error(`"${label}" is not in normal form; use "${normalize(label)}"`);
}

export const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n;

export function prepareOrder(params: {
  label: string;
  owner: Address;
  years?: number;
  duration?: bigint;
  botPublicKey: Hex;
  resolver?: Address;
}): { reveal: Reveal; commitment: Hex; sealed: Hex } {
  assertNormalizedLabel(params.label);
  const secret = new Uint8Array(32);
  globalThis.crypto.getRandomValues(secret);
  const reveal: Reveal = {
    label: params.label,
    owner: params.owner,
    secret: bytesToHex(secret),
    subregistry: zeroAddress,
    resolver: params.resolver ?? zeroAddress,
    duration: params.duration ?? BigInt(params.years ?? 1) * SECONDS_PER_YEAR,
    referrer: `0x${"00".repeat(32)}`,
  };
  return { reveal, commitment: commitmentOf(reveal), sealed: sealReveal(reveal, hexToBytes(params.botPublicKey)) };
}

/** The USDC to put in an order: the registrar's price plus the bot's fee. */
export function orderAmount(price: bigint, minFee: bigint = 250_000n): bigint {
  return price + minFee;
}
