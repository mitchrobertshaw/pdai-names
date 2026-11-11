// GET /api/stats?network=mainnet|testnet: the homepage's live numbers (src/lib/stats.ts).

import { current, networkOf, reply } from "../lib/registry";
import { summarise } from "../../src/lib/stats";

export default async (request: Request): Promise<Response> => {
  const now = await current(networkOf(request));
  if (!now) return reply({ live: false }, 300);
  // Still catching up with the chain, or it couldn't be reached: ask again soon.
  return reply(summarise(now.state, Math.floor(Date.now() / 1000)), now.behind || now.stale ? 10 : 60);
};

export const config = { path: "/api/stats" };
