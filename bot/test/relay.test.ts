import assert from "node:assert/strict";
import { test } from "node:test";

import { type Hex, getAddress, parseGwei } from "viem";

import { parseAmbMessage } from "../src/amb.ts";
import { loadConfig } from "../src/config.ts";
import { claimNeed } from "../src/copyfee.ts";
import { CLAIM_GAS, RECHECK, REFILL_GAS, claimGas, due, forgetFinished, holdReason, ownTransfer } from "../src/relay.ts";
import type { MessageRecord, RelayState } from "../src/state.ts";

// A real message from the official bridge, made on a copy of PulseChain on 8 November 2026: 16 USDC
// sent to Ethereum with relayTokens, arriving as 15.952 after the bridge's 0.3% fee.
const SENT: Hex =
  "0x00050000eb21bb7b72d1042c471c6a52c971da8152d66d7a00000000000623964fd0aaa7506f3d9cb8274bdb946ec42a1b8751ef1715a3e4a142d8b698131108995174f37aeba10d001e8480020100017101272255bb000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000007aacfd23d0f33f5206fe8ca8c484aa08a9d0a9780000000000000000000000000000000000000000000000000000000000f36880";
const RECEIVER = getAddress("0x7aacfd23d0f33f5206fe8ca8c484aa08a9d0a978");
const ADDRESS = "0x000000000000000000000000000000000000dEaD";
const config = loadConfig({
  BOT_PRIVATE_KEY: `0x${"11".repeat(32)}`,
  PULSECHAIN_REGISTRAR: ADDRESS,
  PULSECHAIN_HEX_REGISTRY: ADDRESS,
  PULSECHAIN_ORDER_FILLER: ADDRESS,
  PULSECHAIN_MIRROR_SYNC: ADDRESS,
  ETHEREUM_ORDER_BOOK: ADDRESS,
  ETHEREUM_MIRROR_REGISTRAR: ADDRESS,
});
const t = config.treasury;

test("it knows its own USDC on the bridge, even if it lost track of sending it", () => {
  const message = parseAmbMessage(SENT);
  assert.equal(ownTransfer(message, RECEIVER, t.homeBridge, t.ethereumUsdc), 15_952_000n);
  assert.equal(ownTransfer(message, getAddress(ADDRESS), t.homeBridge, t.ethereumUsdc), null, "someone else's");
  assert.equal(ownTransfer(message, RECEIVER, getAddress(ADDRESS), t.ethereumUsdc), null, "not from the token bridge");
  assert.equal(ownTransfer(message, RECEIVER, t.homeBridge, getAddress(ADDRESS)), null, "not USDC");
});

const gasPrice = parseGwei("1");
const relay = (spent = 0n, lastClaim: Record<string, string> = {}): RelayState => ({ day: "2026-11-08", spent: spent.toString(), lastClaim, noted: {} });
const base = {
  now: 1_000_000n,
  cost: gasPrice * CLAIM_GAS,
  ethBalance: 10n ** 16n, // 0.01 ETH
  reserve: gasPrice * REFILL_GAS,
  limits: config.relayLimits,
};

test("claims are sent with the gas Ethereum says they need, and room to spare", () => {
  // A copy of yourfriendsommi.hex on Sepolia, 10 November 2026: its message asks for 1 million gas,
  // and Sepolia worked out the claim needs 1,596,252. The old fixed 1.3 million reverted.
  assert.equal(claimGas(1_596_252n), 1_915_502n);
  assert.ok(claimGas(1_596_252n) > 1_596_252n);
  assert.ok(CLAIM_GAS >= 1_596_252n, "the allowance plans for a claim's real gas");
  assert.ok(REFILL_GAS >= 2_600_000n, "enough kept back to claim its own USDC (2 million gas of its own)");
});

test("a copy of a name is claimed when it can be", () => {
  assert.equal(holdReason({ ...base, kind: "mirror", label: "alice", relay: relay() }), null);
});

test("its own USDC is always claimed first and regardless: it buys the ETH for everything else", () => {
  assert.equal(holdReason({ ...base, kind: "own", ethBalance: 0n, relay: relay(10n ** 18n) }), null);
});

test("other claims leave enough ETH to claim its own USDC and buy more", () => {
  const low = base.reserve + base.cost - 1n;
  assert.match(holdReason({ ...base, kind: "mirror", label: "alice", ethBalance: low, relay: relay() })!, /low on ETH/);
  assert.match(holdReason({ ...base, kind: "settle", ethBalance: low, relay: relay() })!, /low on ETH/);
});

test("copying names keeps within the day's ETH limit; the rest wait for tomorrow", () => {
  const atLimit = relay(config.relayLimits.dailyEth - base.cost + 1n);
  assert.match(holdReason({ ...base, kind: "mirror", label: "alice", relay: atLimit })!, /today's limit/);
  assert.equal(holdReason({ ...base, kind: "settle", relay: atLimit }), null, "orders' refunds aren't held back by it");
});

test("a name copied in the last hour waits, so sending it back and forth costs the bot little", () => {
  const justCopied = relay(0n, { alice: (base.now - 600n).toString() });
  assert.match(holdReason({ ...base, kind: "mirror", label: "alice", relay: justCopied })!, /less than 60 minutes ago/);
  assert.equal(holdReason({ ...base, kind: "mirror", label: "bob", relay: justCopied }), null, "other names aren't held back");
  const anHourAgo = relay(0n, { alice: (base.now - 3600n).toString() });
  assert.equal(holdReason({ ...base, kind: "mirror", label: "alice", relay: anHourAgo }), null);
});

test("a copy someone paid the copy fee for, or the admin sent, goes at once: past today's limit and the hourly wait", () => {
  const busy = relay(config.relayLimits.dailyEth, { alice: (base.now - 60n).toString() });
  assert.match(holdReason({ ...base, kind: "mirror", label: "alice", relay: busy })!, /today's limit/);
  assert.equal(holdReason({ ...base, kind: "mirror", label: "alice", relay: busy, priority: "paid" }), null);
  assert.equal(holdReason({ ...base, kind: "mirror", label: "alice", relay: busy, priority: "admin" }), null);
  // It still leaves enough ETH to claim its own USDC and buy more.
  const low = base.reserve + base.cost - 1n;
  assert.match(holdReason({ ...base, kind: "mirror", label: "alice", relay: relay(), priority: "paid", ethBalance: low })!, /low on ETH/);
});

test("while the copy fee is on and a copy costs over $2, new names and renewals nobody paid for wait for fees to fall", () => {
  const dear = { ...base, kind: "mirror" as const, label: "alice", relay: relay(), feeOn: true, copyUsdc: 2_000_001n };
  assert.match(holdReason(dear)!, /alice\.hex waits for Ethereum's fees to fall/);
  assert.equal(holdReason({ ...dear, copyUsdc: 2_000_000n }), null, "up to $2, the project pays");
  assert.equal(holdReason({ ...dear, priority: "paid" }), null, "paid for");
  assert.equal(holdReason({ ...dear, priority: "admin" }), null, "sent by the admin, after handing a name out");
  assert.equal(holdReason({ ...dear, ownerChange: true }), null, "a new owner goes at once, or the old one would still get what's sent there");
  assert.equal(holdReason({ ...dear, feeOn: false }), null, "with the fee off, nobody could have paid, so nothing waits for that");
  assert.equal(holdReason({ ...dear, copyUsdc: undefined }), null, "ETH's price couldn't be read: as without the fee");
  // A change of owner still keeps within today's limit, and to one copy of a name an hour.
  assert.match(holdReason({ ...dear, ownerChange: true, relay: relay(config.relayLimits.dailyEth) })!, /today's limit/);
  const justCopied = relay(0n, { alice: (base.now - 600n).toString() });
  assert.match(holdReason({ ...dear, ownerChange: true, relay: justCopied })!, /less than 60 minutes ago/);
  // Orders' refunds and payments aren't copies of names.
  assert.equal(holdReason({ ...dear, kind: "settle" }), null);
});

test("today's allowance counts what copies really cost, so a change of owner still goes when gas is high", () => {
  // At 30 gwei a claim may take 1.6 million gas (0.048 ETH), more than the whole day's 0.02 ETH;
  // a copy really uses about 300,000 (0.009 ETH), which fits.
  const gas = parseGwei("30");
  const high = { ...base, cost: gas * CLAIM_GAS, reserve: gas * REFILL_GAS, ethBalance: 10n ** 18n, kind: "mirror" as const, label: "alice", ownerChange: true };
  assert.equal(holdReason({ ...high, copyCost: gas * 300_000n, relay: relay() }), null);
  assert.match(holdReason({ ...high, copyCost: gas * 300_000n, relay: relay(config.relayLimits.dailyEth - gas * 300_000n + 1n) })!, /today's limit/);
  assert.match(holdReason({ ...high, relay: relay() })!, /today's limit/, "without what copies use, it plans for the most");
});

test("a paid copy needs only the ETH for its own claim: it may use what's kept back for the bot's own refill", () => {
  const gas = parseGwei("200");
  const need = claimNeed(gas, 1_320_000n); // 0.3168 ETH: its gas limit at a fifth over the gas price
  const busy = { ...base, kind: "mirror" as const, label: "alice", relay: relay(), cost: gas * CLAIM_GAS, reserve: gas * REFILL_GAS, paidNeed: need };
  assert.equal(holdReason({ ...busy, priority: "paid", ethBalance: need }), null, "0.3168 ETH is enough, though the reserve alone is 0.6");
  assert.match(holdReason({ ...busy, priority: "paid", ethBalance: need - 1n })!, /low on ETH for a paid copy/);
  assert.match(holdReason({ ...busy, priority: "admin", ethBalance: need })!, /low on ETH/, "the admin's copies keep the reserve");
  assert.match(holdReason({ ...busy, ownerChange: true, ethBalance: need })!, /low on ETH/, "and so do the project's own");
});

const record = (over: Partial<MessageRecord> = {}): MessageRecord => ({
  messageId: `0x${"01".repeat(32)}`,
  encoded: "0x",
  hash: `0x${"02".repeat(32)}`,
  gasLimit: "1000000",
  sender: ADDRESS,
  seenAtBlock: "1",
  status: "waiting",
  ...over,
});

test("a copy held back is looked at again every few minutes, not on every pass, so a long wait costs little", () => {
  const now = 1_000_000n;
  assert.equal(due(record(), now), true, "never held: looked at");
  const held = record({ recheckAt: (now + RECHECK).toString() });
  assert.equal(due(held, now), false, "held just now: left alone");
  assert.equal(due(held, now + RECHECK - 1n), false);
  assert.equal(due(held, now + RECHECK), true, "after RECHECK: looked at again");
  assert.equal(RECHECK, 300n, "five minutes");
  // Someone paying for it, or the admin sending it, can't wait.
  assert.equal(due({ ...held, paid: { fee: "1250000" } }, now), true);
  assert.equal(due({ ...held, admin: true }, now), true);
});

test("finished messages are forgotten a week after, so the bot's records stay small", () => {
  const now = 2_000_000n;
  const week = 7n * 24n * 3600n;
  const messages: Record<string, MessageRecord> = {
    waiting: record({ status: "waiting", recheckAt: "1" }),
    old: record({ status: "claimed", doneAt: (now - week).toString() }),
    recent: record({ status: "claimed-by-someone-else", doneAt: (now - week + 1n).toString() }),
    unknown: record({ status: "skipped" }),
  };
  forgetFinished(messages, now);
  assert.deepEqual(Object.keys(messages).sort(), ["recent", "unknown", "waiting"]);
  assert.equal(messages.unknown!.doneAt, now.toString(), "finished before the bot noted when: noted now, forgotten a week on");
  forgetFinished(messages, now + week);
  assert.deepEqual(Object.keys(messages), ["waiting"], "waiting ones are kept, however old");
});
