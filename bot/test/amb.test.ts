import assert from "node:assert/strict";
import { test } from "node:test";

import { type Hex, concat, decodeFunctionData, encodeFunctionData, keccak256, toHex } from "viem";

import { bridgeCallsAbi } from "../src/abis.ts";
import { isFullySigned, packSignatures, parseAmbMessage } from "../src/amb.ts";
import { loadConfig } from "../src/config.ts";
import { usdc } from "../src/orders.ts";

// A real message from the live bridge (a token withdrawal from PulseChain to Ethereum, Nov 2026).
const REAL_MESSAGE: Hex =
  "0x00050000eb21bb7b72d1042c471c6a52c971da8152d66d7a00000000000622b84fd0aaa7506f3d9cb8274bdb946ec42a1b8751ef1715a3e4a142d8b698131108995174f37aeba10d001e8480020100017101272255bb000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000002f8afc192503501deb75915279d821b1c3ba4e2a00000000000000000000000000000000000000000000000000000002fad14af7";

test("a real bridge message is read correctly", () => {
  const m = parseAmbMessage(REAL_MESSAGE);
  assert.equal(m.messageId, "0x00050000eb21bb7b72d1042c471c6a52c971da8152d66d7a00000000000622b8");
  assert.equal(m.sender, "0x4fD0aaa7506f3d9cB8274bdB946Ec42A1b8751Ef", "the PulseChain token bridge");
  assert.equal(m.executor, "0x1715a3E4A142d8b698131108995174F37aEBA10D", "the Ethereum token bridge");
  assert.equal(m.gasLimit, 2_000_000n);
  assert.equal(m.hash, keccak256(REAL_MESSAGE));
  assert.equal(m.data.slice(0, 10), "0x272255bb", "the call: the token bridge's handleNativeTokens");
});

test("the .hex call inside a message can be read before claiming it", () => {
  const owner = "0x328809Bc894f92807417D2dAD6b7C998c1aFdac6";
  const call = encodeFunctionData({ abi: bridgeCallsAbi, functionName: "mirror", args: ["alice", owner, 1_900_000_000n, 7n] });
  const encoded = concat([
    `0x${"00".repeat(31)}01`, // message id
    "0x31403b1e52051883f2Ce1B1b4C89f36034e1221D", // sender: HexMirrorSync
    "0xE99cf700591F3605ad4494E166D2f447F0F50a71", // executor: HexMirrorRegistrar
    toHex(1_000_000, { size: 4 }),
    "0x02", // source chain id: 2 bytes
    "0x01", // destination chain id: 1 byte
    "0x00", // data type
    "0x0171", // 369
    "0x01", // 1
    call,
  ]);
  const m = parseAmbMessage(encoded);
  assert.equal(m.gasLimit, 1_000_000n);
  const decoded = decodeFunctionData({ abi: bridgeCallsAbi, data: m.data });
  assert.equal(decoded.functionName, "mirror");
  assert.deepEqual(decoded.args, ["alice", owner, 1_900_000_000n, 7n]);
});

test("a message too short to be one is refused", () => {
  assert.throws(() => parseAmbMessage("0x1234"));
});

test("signatures are packed as count, then every v, then every r, then every s", () => {
  const sig = (n: number): Hex => concat([toHex(n, { size: 32 }), toHex(n + 100, { size: 32 }), toHex(27 + (n % 2), { size: 1 })]);
  const packed = packSignatures([sig(1), sig(2)]);
  const expected = concat([
    "0x02",
    "0x1c", // v of the first: 27 + 1
    "0x1b", // v of the second: 27 + 0
    toHex(1, { size: 32 }),
    toHex(2, { size: 32 }),
    toHex(101, { size: 32 }),
    toHex(102, { size: 32 }),
  ]);
  assert.equal(packed, expected);
  assert.throws(() => packSignatures([]));
  assert.throws(() => packSignatures(["0x1234"]));
});

test("a message counts as signed once the count reaches the requirement or it is marked done", () => {
  assert.equal(isFullySigned(4n, 5n), false);
  assert.equal(isFullySigned(5n, 5n), true);
  assert.equal(isFullySigned((1n << 255n) | 5n, 5n), true, "marked processed");
  assert.equal(isFullySigned((1n << 255n) | 1n, 5n), true, "marked processed, whatever the count");
});

test("settings parse, with defaults", () => {
  const key = `0x${"01".repeat(32)}`;
  const a = "0x000000000000000000000000000000000000dEaD";
  const config = loadConfig({
    BOT_PRIVATE_KEY: key,
    BOT_ENCRYPTION_SECRET_KEY: key,
    PULSECHAIN_REGISTRAR: a,
    PULSECHAIN_HEX_REGISTRY: a,
    PULSECHAIN_ORDER_FILLER: a,
    PULSECHAIN_MIRROR_SYNC: a,
    ETHEREUM_ORDER_BOOK: a,
    ETHEREUM_MIRROR_REGISTRAR: a,
    MIN_FEE_USDC: "0.5",
    RELAY: "false",
  });
  assert.equal(config.minFee, 500_000n);
  assert.equal(config.relay, false);
  assert.equal(config.fill, false, "names are bought on PulseChain: filling Ethereum orders is off unless FILL=true");
  assert.equal(config.sync, true);
  assert.equal(config.homeAmb, "0x6ef79FD6f9f840264332884240539Ed7A2dA8b2b");
  assert.equal(config.foreignAmb, "0xd0764FAe29E0a6a96fF685f71CfC685456D5636c");
  assert.throws(() => loadConfig({}), /BOT_PRIVATE_KEY is not set/);
});

test("USDC amounts print plainly", () => {
  assert.equal(usdc(5_250_000n), "5.25");
  assert.equal(usdc(5_000_000n), "5");
  assert.equal(usdc(1n), "0.000001");
});
