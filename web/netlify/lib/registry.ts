// What the site's functions share: the scan of the .hex registry, kept in Netlify Blobs between
// visits, brought up to date at most about once a minute (each answer is cached that long).

import { getStore } from "@netlify/blobs";

import { DEPLOYMENTS, type Network } from "../../src/deployment";
import { type ScanState, freshState, jsonRpc, scan } from "../../src/lib/stats";

export function networkOf(request: Request): Network {
  return new URL(request.url).searchParams.get("network") === "testnet" ? "testnet" : "mainnet";
}

/**
 * The registry as of now: what was kept, plus the blocks since. `null` before the contracts are
 * deployed, and `stale` if the chain couldn't be reached (the last known state, if any).
 */
export async function current(network: Network): Promise<{ state: ScanState; behind: boolean; stale: boolean } | null> {
  const deployment = DEPLOYMENTS[network];
  if (!deployment) return null;
  const { pulsechain } = deployment;
  const store = getStore("hexns-registry");
  const key = `${network}-${pulsechain.registry.toLowerCase()}`;
  const saved = (await store.get(key, { type: "json" })) as ScanState | null;
  // A state from before names' owners were followed starts again from the deployment.
  const from = saved?.holdings ? saved : freshState(pulsechain.startBlock);
  try {
    const read = await scan(from, { rpc: jsonRpc(pulsechain.rpc), registry: pulsechain.registry, deadline: Date.now() + 6000 });
    const state: ScanState = { block: read.block, names: read.names, recent: read.recent, holdings: read.holdings };
    await store.setJSON(key, state);
    return { state, behind: read.behind, stale: false };
  } catch {
    return saved?.holdings ? { state: saved, behind: true, stale: true } : null;
  }
}

/** A JSON answer, kept by Netlify's CDN for `seconds` (separately for each query). */
export function reply(body: unknown, seconds: number, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Netlify-CDN-Cache-Control": `public, durable, max-age=${seconds}, stale-while-revalidate=${seconds * 5}`,
      "Netlify-Vary": "query=network|owner",
    },
  });
}
