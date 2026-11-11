// GET /api/names?network=mainnet|testnet&owner=0x…: the .hex names a wallet holds, for the app's
// My names (src/lib/stats.ts follows every registration, transfer, renewal and removal).

import { current, networkOf, reply } from "../lib/registry";
import { ownedBy } from "../../src/lib/stats";

export default async (request: Request): Promise<Response> => {
  const owner = new URL(request.url).searchParams.get("owner") ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) return reply({ error: "owner must be a wallet address" }, 3600, 400);
  const now = await current(networkOf(request));
  if (!now) return reply({ live: false }, 300);
  return reply({ live: true, names: ownedBy(now.state, owner, Math.floor(Date.now() / 1000)) }, now.behind ? 10 : 30);
};

export const config = { path: "/api/names" };
