import { concat, encodeFunctionData, type Hex, keccak256, parseAbi, toHex } from "viem";
import { describe, expect, it } from "vitest";

import { isFullySigned, packSignatures, parseAmbMessage } from "./amb";

// The same real message the bot's tests read (bot/test/amb.test.ts): a token withdrawal from
// PulseChain to Ethereum over the live bridge, November 2026. Both must read messages alike.
const REAL_MESSAGE: Hex =
  "0x00050000eb21bb7b72d1042c471c6a52c971da8152d66d7a00000000000622b84fd0aaa7506f3d9cb8274bdb946ec42a1b8751ef1715a3e4a142d8b698131108995174f37aeba10d001e8480020100017101272255bb000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000002f8afc192503501deb75915279d821b1c3ba4e2a00000000000000000000000000000000000000000000000000000002fad14af7";

describe("the bridge's messages, for copying a name yourself", () => {
  it("reads a real message as the bot does", () => {
    const m = parseAmbMessage(REAL_MESSAGE);
    expect(m.messageId).toBe("0x00050000eb21bb7b72d1042c471c6a52c971da8152d66d7a00000000000622b8");
    expect(m.sender).toBe("0x4fD0aaa7506f3d9cB8274bdB946Ec42A1b8751Ef");
    expect(m.executor).toBe("0x1715a3E4A142d8b698131108995174F37aEBA10D");
    expect(m.gasLimit).toBe(2_000_000n);
    expect(m.hash).toBe(keccak256(REAL_MESSAGE));
    expect(m.data.slice(0, 10)).toBe("0x272255bb");
  });

  it("reads a copy of a name, with the million gas it asks for on Ethereum", () => {
    const mirror = parseAbi(["function mirror(string label, address owner, uint64 expiry, uint64 nonce)"]);
    const call = encodeFunctionData({
      abi: mirror,
      functionName: "mirror",
      args: ["alice", "0x328809Bc894f92807417D2dAD6b7C998c1aFdac6", 1_900_000_000n, 7n],
    });
    const encoded = concat([
      `0x${"00".repeat(31)}01`,
      "0x31403b1e52051883f2Ce1B1b4C89f36034e1221D",
      "0xE99cf700591F3605ad4494E166D2f447F0F50a71",
      toHex(1_000_000, { size: 4 }),
      "0x02",
      "0x01",
      "0x00",
      "0x0171",
      "0x01",
      call,
    ]);
    const m = parseAmbMessage(encoded);
    expect(m.gasLimit).toBe(1_000_000n);
    expect(m.data).toBe(call);
    expect(() => parseAmbMessage("0x1234")).toThrow();
  });

  it("packs the validators' signatures as the bridge on Ethereum takes them: count, every v, every r, every s", () => {
    const sig = (n: number): Hex => concat([toHex(n, { size: 32 }), toHex(n + 100, { size: 32 }), toHex(27 + (n % 2), { size: 1 })]);
    expect(packSignatures([sig(1), sig(2)])).toBe(
      concat(["0x02", "0x1c", "0x1b", toHex(1, { size: 32 }), toHex(2, { size: 32 }), toHex(101, { size: 32 }), toHex(102, { size: 32 })]),
    );
    expect(() => packSignatures([])).toThrow();
    expect(() => packSignatures(["0x1234"])).toThrow();
  });

  it("counts a message as signed once enough validators have, or the bridge marks it done", () => {
    expect(isFullySigned(4n, 5n)).toBe(false);
    expect(isFullySigned(5n, 5n)).toBe(true);
    expect(isFullySigned((1n << 255n) | 1n, 5n)).toBe(true);
  });
});
