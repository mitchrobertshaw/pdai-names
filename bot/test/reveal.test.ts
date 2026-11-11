import assert from "node:assert/strict";
import { test } from "node:test";

import nacl from "tweetnacl";
import { bytesToHex, hexToBytes, zeroAddress } from "viem";

import { prepareOrder } from "../src/buy.ts";
import {
  type Reveal,
  commitmentOf,
  decodeReveal,
  encodeReveal,
  encryptionKeyPair,
  encryptionSecretKeyFrom,
  openReveal,
  sealReveal,
} from "../src/reveal.ts";
import { orderKey } from "../src/orders.ts";

const reveal: Reveal = {
  label: "alice",
  owner: "0x328809Bc894f92807417D2dAD6b7C998c1aFdac6",
  secret: `0x${"11".repeat(32)}`,
  subregistry: zeroAddress,
  resolver: zeroAddress,
  duration: 31_536_000n,
  referrer: `0x${"00".repeat(32)}`,
};

test("the commitment matches the deployed registrar's makeCommitment", () => {
  // From ETHRegistrar.makeCommitment, called on a deployment of these contracts.
  assert.equal(commitmentOf(reveal), "0xd9a764372bda56ec1d542c80b3d205148b386b601cf67981e3cbe759e463f941");
});

test("the order key matches the deployed HexOrderFiller's orderKey", () => {
  assert.equal(
    orderKey(7n, `0x${"ab".repeat(32)}`, 1_800_000_000n),
    "0xdce8f3affde34782a051601c46ecae538df0e280ea2cc861cab16fec439f2a70",
  );
});

test("a reveal survives encoding", () => {
  assert.deepEqual(decodeReveal(encodeReveal(reveal)), reveal);
});

test("a sealed reveal opens with the bot's key, and only with it", () => {
  const bot = nacl.box.keyPair();
  const sealed = sealReveal(reveal, bot.publicKey);
  assert.deepEqual(openReveal(sealed, bot.secretKey), reveal);
  assert.equal(openReveal(sealed, nacl.box.keyPair().secretKey), null, "another key cannot open it");
});

test("a tampered or malformed sealed reveal does not open", () => {
  const bot = nacl.box.keyPair();
  const bytes = hexToBytes(sealReveal(reveal, bot.publicKey));
  const flipped = new Uint8Array(bytes);
  flipped[flipped.length - 1]! ^= 1;
  assert.equal(openReveal(bytesToHex(flipped), bot.secretKey), null, "tampered");
  const wrongVersion = new Uint8Array(bytes);
  wrongVersion[0] = 2;
  assert.equal(openReveal(bytesToHex(wrongVersion), bot.secretKey), null, "unknown version");
  assert.equal(openReveal("0x01", bot.secretKey), null, "too short");
  assert.equal(openReveal("0x", bot.secretKey), null, "empty");
});

test("the encryption key pair comes back from its secret key", () => {
  const bot = nacl.box.keyPair();
  const restored = encryptionKeyPair(bytesToHex(bot.secretKey));
  assert.equal(restored.publicKey, bytesToHex(bot.publicKey));
});

test("prepareOrder refuses labels wallets could never look up", () => {
  const bot = bytesToHex(nacl.box.keyPair().publicKey);
  assert.throws(() => prepareOrder({ label: "Alice", owner: reveal.owner, botPublicKey: bot }), /normal form; use "alice"/);
  assert.throws(() => prepareOrder({ label: "pay.alice", owner: reveal.owner, botPublicKey: bot }), /no dots/);
  assert.throws(() => prepareOrder({ label: "", owner: reveal.owner, botPublicKey: bot }));
  assert.doesNotThrow(() => prepareOrder({ label: "hex-fan", owner: reveal.owner, botPublicKey: bot }));
});

test("prepareOrder gives a commitment for a fresh secret and seals it for the bot", () => {
  const bot = nacl.box.keyPair();
  const a = prepareOrder({ label: "alice", owner: reveal.owner, years: 2, botPublicKey: bytesToHex(bot.publicKey) });
  const b = prepareOrder({ label: "alice", owner: reveal.owner, years: 2, botPublicKey: bytesToHex(bot.publicKey) });
  assert.notEqual(a.reveal.secret, b.reveal.secret, "a new secret every time");
  assert.equal(a.reveal.duration, 2n * 365n * 86_400n);
  assert.equal(a.commitment, commitmentOf(a.reveal));
  assert.deepEqual(openReveal(a.sealed, bot.secretKey), a.reveal);
});

test("the key made from the bot's wallet key never changes, and opens what websites seal to it", () => {
  const wallet = `0x${"11".repeat(32)}` as const;
  const secret = encryptionSecretKeyFrom(wallet);
  // keccak256("hex-names bot: order encryption key" ++ wallet key), and its NaCl public key. If these
  // change, every website's copy of the bot's public key goes stale and its orders can't be opened.
  assert.equal(secret, "0xb80414eca34a576723ab3e4a400409f2f7d4d72beb59147fcbaf581c9edbeafb");
  const bot = encryptionKeyPair(secret);
  assert.equal(bot.publicKey, "0x986e3a9caf41becb2d308a3df8978fac6a28dd891bc0c86f3bc1030d5a17bd11");
  assert.deepEqual(openReveal(sealReveal(reveal, hexToBytes(bot.publicKey)), bot.secretKey), reveal);
});
