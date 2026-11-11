// The checkout's live price asks every router PulseChain's checkout may swap on, and shows the
// cheapest, as paying does (app/flows.ts bestQuote).
import { afterEach, describe, expect, it, vi } from "vitest";

import { decodeAmountIn, encodeGetAmountsIn, quoteIn } from "./quotes";
import { PAY_CHAINS } from "./tokens";

const word = (n: bigint) => n.toString(16).padStart(64, "0");
/** A router's getAmountsIn answer: [amountIn, ..., amountOut]. */
const answer = (amountIn: bigint) => `0x${word(0x20n)}${word(2n)}${word(amountIn)}${word(10_000_000n)}`;

/** Answers each router as `byRouter` says: an amount, or an error. */
function routersAnswer(byRouter: Record<string, bigint | "error">) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const to = JSON.parse(init.body).params[0].to.toLowerCase();
      const value = byRouter[to];
      const body =
        value === "error" || value === undefined ? { error: { message: "execution reverted" } } : { result: answer(value) };
      return { json: async () => body };
    }),
  );
}

const chain = PAY_CHAINS.pulsechain;
const pls = chain.tokens.find((t) => t.symbol === "PLS")!;
const [v1, v2] = chain.routers.map((r) => r.toLowerCase());

afterEach(() => vi.unstubAllGlobals());

describe("the live price", () => {
  it("reads a router's answer", () => {
    expect(decodeAmountIn(answer(1234n))).toBe(1234n);
    expect(encodeGetAmountsIn(1n, ["0x00000000000000000000000000000000000000aa"]).slice(0, 10)).toBe("0x1f00ca74");
  });

  it("is the cheaper of PulseX's two routers", async () => {
    routersAnswer({ [v1]: 115_047_228n, [v2]: 122_669_038n });
    expect(await quoteIn(chain, pls, 640_000_000n)).toBe(115_047_228n);
    routersAnswer({ [v1]: 20n, [v2]: 19n });
    expect(await quoteIn(chain, pls, 640_000_000n)).toBe(19n);
  });

  it("still answers when one router can't", async () => {
    routersAnswer({ [v1]: "error", [v2]: 500n });
    expect(await quoteIn(chain, pls, 1_000_000n)).toBe(500n);
  });

  it("fails only when no router can", async () => {
    routersAnswer({ [v1]: "error", [v2]: "error" });
    await expect(quoteIn(chain, pls, 1_000_000n)).rejects.toThrow(/reverted/);
  });

  it("needs no router for USDC itself", async () => {
    const usdc = chain.tokens.find((t) => !t.path)!;
    expect(await quoteIn(chain, usdc, 10_000_000n)).toBe(10_000_000n);
  });
});
