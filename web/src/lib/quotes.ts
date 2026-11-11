// Live prices for the checkout: how much of a token buys a given amount of USDC right now, asked
// of the same exchange the checkout contracts swap on (the router's getAmountsIn), over a public RPC.
import type { PayChain, PayToken } from "./tokens";

const GET_AMOUNTS_IN = "0x1f00ca74"; // getAmountsIn(uint256 amountOut, address[] path)

const word = (hex: string) => hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");

/** Encodes the router call for `usdc` (in USDC's 6-decimal units) along `path`. */
export function encodeGetAmountsIn(usdc: bigint, path: string[]): string {
  return GET_AMOUNTS_IN + word(usdc.toString(16)) + word("40") + word(path.length.toString(16)) + path.map(word).join("");
}

/** The first amount in the router's answer: how much of the token goes in. */
export function decodeAmountIn(result: string): bigint {
  const hex = result.replace(/^0x/, "");
  if (hex.length < 192) throw new Error("unexpected answer");
  return BigInt(`0x${hex.slice(128, 192)}`);
}

/** How much of a token buys `usdc` (6-decimal units) along `path` on one router right now. */
async function quoteOn(rpc: string, router: string, path: string[], usdc: bigint, signal?: AbortSignal) {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: router, data: encodeGetAmountsIn(usdc, path) }, "latest"],
    }),
    signal,
  });
  const json = (await response.json()) as { result?: string; error?: { message?: string } };
  if (!json.result || json.result === "0x") throw new Error(json.error?.message ?? "no answer");
  return decodeAmountIn(json.result);
}

/**
 * How much of `token` buys `usdc` (6-decimal units) on `chain` right now: the least any of its
 * routers asks, as the checkout pays along whichever is cheapest.
 */
export async function quoteIn(chain: PayChain, token: PayToken, usdc: bigint, signal?: AbortSignal): Promise<bigint> {
  if (!token.path) return usdc;
  const path = token.path;
  const answers = await Promise.allSettled(chain.routers.map((router) => quoteOn(chain.rpc, router, path, usdc, signal)));
  const amounts = answers.flatMap((a) => (a.status === "fulfilled" ? [a.value] : []));
  if (amounts.length === 0) throw (answers[0] as PromiseRejectedResult).reason;
  return amounts.reduce((least, amount) => (amount < least ? amount : least));
}

/** A token amount for people: 4 significant figures, with thousands separators. */
export function formatToken(amount: bigint, decimals: number): string {
  const value = Number(amount) / 10 ** decimals;
  return new Intl.NumberFormat("en", { maximumSignificantDigits: 4 }).format(value);
}

export function formatUsd(dollars: number): string {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(dollars);
}
