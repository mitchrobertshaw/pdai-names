import { describe, expect, it } from "vitest";

import {
  EXPIRY_UPDATED,
  LABEL_REGISTERED,
  LABEL_UNREGISTERED,
  type RegistrationLog,
  type Rpc,
  TRANSFER_BATCH,
  TRANSFER_SINGLE,
  freshState,
  labelOf,
  nameKey,
  ownedBy,
  scan,
  showable,
  summarise,
  timeAgo,
} from "./stats";

// Two real LabelRegistered logs, from ENS's own ENSv2 .eth registry on Sepolia (7 November 2026).
const ENS_ON_SEPOLIA: RegistrationLog[] = [
  {
    blockNumber: "0xb8432d",
    blockTimestamp: "0x6aeda478",
    data: "0x00000000000000000000000000000000000000000000000000000000000000600000000000000000000000006f1524f5a1152d6b08ef8833e42e4311151e904f000000000000000000000000000000000000000000000000000000006cced7f80000000000000000000000000000000000000000000000000000000000000008626c6f636b616964000000000000000000000000000000000000000000000000",
  },
  {
    blockNumber: "0xb84363",
    blockTimestamp: "0x6aeda700",
    data: "0x00000000000000000000000000000000000000000000000000000000000000600000000000000000000000003a05d06949b9890aead4700aa5ecebf4d1ba0ba0000000000000000000000000000000000000000000000000000000006cceda80000000000000000000000000000000000000000000000000000000000000000965746865727363616e0000000000000000000000000000000000000000000000",
  },
];

const word = (n: number | bigint) => n.toString(16).padStart(64, "0");

const topic = (n: number | bigint | string) => `0x${(typeof n === "string" ? n.replace(/^0x/, "") : n.toString(16)).padStart(64, "0")}`;
/** A stand-in token id for a name: any 256-bit number, with 32 version bits at the bottom. */
const tokenOf = (label: string, version = 0) => (BigInt([...label].reduce((h, c) => (h * 131 + c.charCodeAt(0)) % 2 ** 50, 7)) << 200n) | BigInt(version);
const ALICE = "0x00000000000000000000000000000000000a11ce";
const BOB = "0x0000000000000000000000000000000000000b0b";

/** A LabelRegistered log as the registry writes it: (string label, address owner, uint64 expiry). */
function logOf(label: string, block: number, at?: number, owner = ALICE, expiry = 2_000_000_000): RegistrationLog {
  const bytes = [...new TextEncoder().encode(label)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const padded = bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0");
  return {
    blockNumber: `0x${block.toString(16)}`,
    blockTimestamp: at === undefined ? undefined : `0x${at.toString(16)}`,
    topics: [LABEL_REGISTERED, topic(tokenOf(label)), topic(1), topic(BOB)],
    data: `0x${word(0x60)}${word(BigInt(owner))}${word(expiry)}${word(bytes.length / 2)}${padded}`,
  };
}

const transfer = (label: string, to: string, block: number, version = 0): RegistrationLog => ({
  blockNumber: `0x${block.toString(16)}`,
  topics: [TRANSFER_SINGLE, topic(BOB), topic(ALICE), topic(to)],
  data: `0x${word(tokenOf(label, version))}${word(1)}`,
});

/** A chain whose head is `head` at `headTime`, with `logs`, refusing log ranges wider than `widest`. */
function fakeChain(head: number, headTime: number, logs: RegistrationLog[], widest = Infinity) {
  const calls: { from: number; to: number }[] = [];
  const rpc: Rpc = async (method, params) => {
    if (method === "eth_getBlockByNumber") return { number: `0x${head.toString(16)}`, timestamp: `0x${headTime.toString(16)}` };
    if (method === "eth_getLogs") {
      const filter = params[0] as { address: string; topics: string[][]; fromBlock: string; toBlock: string };
      expect(filter.topics[0]).toEqual(expect.arrayContaining([LABEL_REGISTERED, TRANSFER_SINGLE, TRANSFER_BATCH, EXPIRY_UPDATED, LABEL_UNREGISTERED]));
      const from = Number(filter.fromBlock);
      const to = Number(filter.toBlock);
      if (to - from + 1 > widest) throw new Error("block range too large");
      calls.push({ from, to });
      return logs.filter((log) => Number(log.blockNumber) >= from && Number(log.blockNumber) <= to);
    }
    throw new Error(`unexpected ${method}`);
  };
  return { rpc, calls };
}

const NOW = 1_800_000_000;

describe("live stats", () => {
  it("read the names from real ENSv2 registrations", () => {
    expect(ENS_ON_SEPOLIA.map((log) => labelOf(log.data))).toEqual(["blockaid", "etherscan"]);
  });

  it("read names in any script, and longer than one word", () => {
    for (const label of ["ünïcode🙂", "a".repeat(40), "abc"]) expect(labelOf(logOf(label, 1).data)).toBe(label);
  });

  it("count every registration, newest first, with when it happened", async () => {
    const logs = [logOf("alice", 950, NOW - 500), logOf("bob", 990), logOf("carol", 1000)];
    const { rpc } = fakeChain(1000, NOW, logs);
    const state = await scan(freshState(900), { rpc, registry: "0x1", deadline: Date.now() + 5000 });
    expect(state.names).toBe(3);
    expect(state.block).toBe(1000);
    expect(state.behind).toBe(false);
    expect(state.recent.map((r) => r.label)).toEqual(["carol", "bob", "alice"]);
    // From the log when the node gives it, else 10 seconds a block back from the head.
    expect(state.recent.map((r) => r.at)).toEqual([NOW, NOW - 100, NOW - 500]);
  });

  it("carry on from where they stopped, without counting anything twice", async () => {
    const logs = [logOf("alice", 950), logOf("bob", 1500)];
    const first = await scan(freshState(900), { ...fakeChain(1000, NOW - 5000, logs), registry: "0x1", deadline: Date.now() + 5000 });
    const second = await scan(first, { ...fakeChain(2000, NOW, logs), registry: "0x1", deadline: Date.now() + 5000 });
    expect(second.names).toBe(2);
    expect(second.recent.map((r) => r.label)).toEqual(["bob", "alice"]);
  });

  it("ask for narrower ranges when the RPC refuses wide ones", async () => {
    const chain = fakeChain(100_000, NOW, [logOf("alice", 42_000)], 2_000);
    const state = await scan(freshState(1), { rpc: chain.rpc, registry: "0x1", deadline: Date.now() + 5000 });
    expect(state.names).toBe(1);
    expect(state.block).toBe(100_000);
    expect(Math.max(...chain.calls.map((c) => c.to - c.from + 1))).toBeLessThanOrEqual(2_000);
  });

  it("stop at the deadline and say they are behind", async () => {
    const chain = fakeChain(1_000_000, NOW, []);
    const state = await scan(freshState(1), { rpc: chain.rpc, registry: "0x1", deadline: Date.now() - 1 });
    expect(state.behind).toBe(true);
    expect(state.block).toBe(0);
  });

  it("keep the last day's names, and at least the latest 10", async () => {
    const old = Array.from({ length: 15 }, (_, i) => logOf(`old${i}`, 100 + i, NOW - 3 * 86_400));
    const today = Array.from({ length: 12 }, (_, i) => logOf(`new${i}`, 9_000 + i, NOW - 3600));
    const state = await scan(freshState(1), { ...fakeChain(10_000, NOW, [...old, ...today]), registry: "0x1", deadline: Date.now() + 5000 });
    expect(state.names).toBe(27);
    expect(state.recent).toHaveLength(12);
    expect(summarise(state, NOW).last24h).toBe(12);

    const quiet = await scan(freshState(1), { ...fakeChain(10_000, NOW, old), registry: "0x1", deadline: Date.now() + 5000 });
    expect(quiet.recent).toHaveLength(10);
    expect(summarise(quiet, NOW).last24h).toBe(0);
  });

  it("show only plain, polite names, at most six", () => {
    const recent = ["alice", "Bob", "free-money", "ünïcode", "x".repeat(25), "carol", "dave", "erin", "frank", "grace", "heidi"].map(
      (label, i) => ({ label, block: 100 - i, at: NOW - i * 60 }),
    );
    const stats = summarise({ block: 100, names: 11, recent, holdings: {} }, NOW);
    expect(stats.latest.map((r) => r.label)).toEqual(["alice", "carol", "dave", "erin", "frank", "grace"]);
    expect(stats.names).toBe(11);
    expect(showable("pulse-chain369")).toBe(true);
    expect(showable("ab")).toBe(false);
  });

  it("follow who owns each name: transfers, renewals and removals", async () => {
    const logs: RegistrationLog[] = [
      logOf("alice", 101),
      logOf("carol", 102),
      logOf("dave", 103),
      transfer("alice", BOB, 110),
      // ENSv2 gives a name a new token id (other version bits) when its roles change.
      transfer("carol", BOB, 111, 7),
      {
        blockNumber: "0x70",
        topics: [EXPIRY_UPDATED, topic(tokenOf("carol", 7)), topic(2_100_000_000), topic(BOB)],
        data: "0x",
      },
      { blockNumber: "0x71", topics: [LABEL_UNREGISTERED, topic(tokenOf("dave")), topic(BOB)], data: "0x" },
    ];
    const state = await scan(freshState(100), { ...fakeChain(200, NOW, logs), registry: "0x1", deadline: Date.now() + 5000 });
    expect(ownedBy(state, BOB, NOW)).toEqual([
      { label: "alice", expiry: 2_000_000_000 },
      { label: "carol", expiry: 2_100_000_000 },
    ]);
    expect(ownedBy(state, ALICE, NOW)).toEqual([]);
    expect(ownedBy(state, BOB.toUpperCase().replace("0X", "0x"), NOW)).toHaveLength(2); // any case
    expect(state.holdings[nameKey(tokenOf("carol", 7))]).toEqual(state.holdings[nameKey(tokenOf("carol"))]);
  });

  it("follow batch transfers too", async () => {
    const ids = [tokenOf("alice"), tokenOf("carol")];
    const batch: RegistrationLog = {
      blockNumber: "0x6f",
      topics: [TRANSFER_BATCH, topic(BOB), topic(ALICE), topic(BOB)],
      // (uint256[] ids, uint256[] values): two offsets, then each array's length and items.
      data: `0x${word(0x40)}${word(0x40 + 32 * 3)}${word(2)}${ids.map(word).join("")}${word(2)}${word(1)}${word(1)}`,
    };
    const state = await scan(freshState(100), {
      ...fakeChain(200, NOW, [logOf("alice", 101), logOf("carol", 102), batch]),
      registry: "0x1",
      deadline: Date.now() + 5000,
    });
    expect(ownedBy(state, BOB, NOW).map((n) => n.label)).toEqual(["alice", "carol"]);
  });

  it("keep a lapsed name its owner's through the 28-day grace period", async () => {
    const expiry = NOW - 10 * 86_400;
    const state = await scan(freshState(100), {
      ...fakeChain(200, NOW, [logOf("alice", 101, undefined, ALICE, expiry)]),
      registry: "0x1",
      deadline: Date.now() + 5000,
    });
    expect(ownedBy(state, ALICE, NOW)).toEqual([{ label: "alice", expiry }]);
    expect(ownedBy(state, ALICE, expiry + 29 * 86_400)).toEqual([]);
  });

  it("say how long ago", () => {
    expect(timeAgo(NOW - 20, NOW)).toBe("just now");
    expect(timeAgo(NOW - 5 * 60, NOW)).toBe("5 min ago");
    expect(timeAgo(NOW - 3600, NOW)).toBe("1 hour ago");
    expect(timeAgo(NOW - 5 * 3600, NOW)).toBe("5 hours ago");
    expect(timeAgo(NOW - 86_400, NOW)).toBe("1 day ago");
    expect(timeAgo(NOW + 30, NOW)).toBe("just now");
  });
});
