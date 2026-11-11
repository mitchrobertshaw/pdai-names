import assert from "node:assert/strict";
import { test } from "node:test";

import { parseEther } from "viem";

import { loadConfig } from "../src/config.ts";
import { parseGwei } from "viem";

import { type Action, type Balances, type Pending, ethLine, ethPurchase, ethToHold, margin, plan, usdcText } from "../src/treasury.ts";

const usdc = (dollars: number) => BigInt(Math.round(dollars * 1_000_000));
const ADDRESS = "0x000000000000000000000000000000000000dEaD";
const DEPLOYED = {
  BOT_PRIVATE_KEY: `0x${"11".repeat(32)}`,
  PULSECHAIN_REGISTRAR: ADDRESS,
  PULSECHAIN_HEX_REGISTRY: ADDRESS,
  PULSECHAIN_ORDER_FILLER: ADDRESS,
  PULSECHAIN_MIRROR_SYNC: ADDRESS,
  ETHEREUM_ORDER_BOOK: ADDRESS,
  ETHEREUM_MIRROR_REGISTRAR: ADDRESS,
};
const defaults = loadConfig(DEPLOYED);
// The plan, worked through with a $150 float, as a bot filling Ethereum orders (FILL=true) would keep:
// it buys $2 of PLS under 200,000 and $15 of ETH under 0.003.
const t = loadConfig({ ...DEPLOYED, FLOAT_USDC: "150" }).treasury;

const healthy: Balances = { pls: parseEther("1000000"), float: usdc(150), eth: parseEther("0.01"), ethUsdc: 0n, budget: usdc(100) };
const nothing: Pending = { repayments: 0n, home: 0n, out: 0n, reserved: 0n, reservedBack: 0n };
const kinds = (actions: Action[]) => actions.map((a) => (a.kind === "warn" ? `warn:${a.key}` : `${a.kind} ${usdcText(a.usdc)}`));

test("mainnet's defaults: no Ethereum orders, a $20 working balance, and gas bought a little at a time", () => {
  assert.equal(defaults.fill, false, "names are bought on PulseChain");
  assert.equal(loadConfig({ ...DEPLOYED, FILL: "true" }).fill, true);
  assert.equal(defaults.treasury.floatUsdc, usdc(20));
  assert.equal(margin(defaults.treasury.floatUsdc), usdc(5));
  assert.equal(t.enabled, true);
  assert.equal(t.floatUsdc, usdc(150));
  assert.equal(t.plsLow, parseEther("200000"));
  assert.equal(t.plsBuyUsdc, usdc(2));
  assert.equal(t.ethLow, parseEther("0.003"));
  assert.equal(t.ethBuyUsdc, usdc(15));
  assert.equal(t.ethBuyMaxUsdc, usdc(100), "the most it buys at once when gas is high");
  assert.equal(t.homeBridge, "0x4fD0aaa7506f3d9cB8274bdB946Ec42A1b8751Ef");
  assert.equal(t.foreignBridge, "0x1715a3E4A142d8b698131108995174F37aEBA10D");
  assert.equal(margin(t.floatUsdc), usdc(30));
});

test("the settings can be changed", () => {
  const custom = loadConfig({ ...process.env, BOT_PRIVATE_KEY: `0x${"11".repeat(32)}`, PULSECHAIN_REGISTRAR: ADDRESS, PULSECHAIN_HEX_REGISTRY: ADDRESS, PULSECHAIN_ORDER_FILLER: ADDRESS, PULSECHAIN_MIRROR_SYNC: ADDRESS, ETHEREUM_ORDER_BOOK: ADDRESS, ETHEREUM_MIRROR_REGISTRAR: ADDRESS, FLOAT_USDC: "700", ETH_LOW: "0.01", TREASURY: "false" });
  assert.equal(custom.treasury.floatUsdc, usdc(700));
  assert.equal(custom.treasury.ethLow, parseEther("0.01"));
  assert.equal(custom.treasury.enabled, false);
  assert.throws(() => loadConfig({ ...process.env, BOT_PRIVATE_KEY: `0x${"11".repeat(32)}`, PULSECHAIN_REGISTRAR: ADDRESS, PULSECHAIN_HEX_REGISTRY: ADDRESS, PULSECHAIN_ORDER_FILLER: ADDRESS, PULSECHAIN_MIRROR_SYNC: ADDRESS, ETHEREUM_ORDER_BOOK: ADDRESS, ETHEREUM_MIRROR_REGISTRAR: ADDRESS, FLOAT_USDC: "$150" }), /not a number/);
});

test("with everything in order, it does nothing", () => {
  assert.deepEqual(plan(healthy, nothing, t), []);
});

test("low on PLS, it buys more with its float", () => {
  assert.deepEqual(kinds(plan({ ...healthy, pls: parseEther("150000") }, nothing, t)), ["buy-pls 2.00"]);
  // The $2 comes out of the float, which is still within its margin: no draw for that.
  assert.deepEqual(kinds(plan({ ...healthy, pls: 0n, float: 0n, budget: 0n }, nothing, t)), ["warn:pls", "warn:budget"]);
});

test("low on ETH, it buys more with buyers' USDC on Ethereum, and sends the rest home", () => {
  assert.deepEqual(kinds(plan({ ...healthy, eth: parseEther("0.001"), ethUsdc: usdc(40) }, nothing, t)), ["buy-eth 15.00", "send-home 10.00"]);
});

test("low on ETH with no USDC on Ethereum, it sends some there first, once", () => {
  assert.deepEqual(kinds(plan({ ...healthy, eth: parseEther("0.001") }, nothing, t)), ["send-out 16.00"]);
  assert.deepEqual(kinds(plan({ ...healthy, eth: parseEther("0.001"), ethUsdc: usdc(5) }, nothing, t)), ["send-out 11.00"]);
  // Already on its way: nothing more.
  assert.deepEqual(plan({ ...healthy, eth: parseEther("0.001") }, { ...nothing, out: usdc(16) }, t), []);
});

test("USDC sent to buy ETH arrives a little short (the bridge's fee, ETH spent or its price moving meanwhile): it buys with it, rather than send it home and more back out", () => {
  const at = (gwei: number) => parseEther(String((4_600_000 * gwei) / 1e9));
  const weiPerUsdc = parseEther("0.0003"); // ETH at about $3,333
  const priced = { ...healthy, weiPerUsdc };
  // At 3 gwei it wants $58.67 of ETH. $58 arrived: it buys with that, and sends nothing home or out.
  assert.deepEqual(kinds(plan({ ...priced, ethUsdc: usdc(58), ethNeed: at(3) }, nothing, t)), ["buy-eth 58.00"]);
  // The launch rehearsal's case: topping up the ETH kept for paid copies (0.02) from 0.0048, with
  // $72.05 arrived of what it now wants. It used to send a little more out, and $57.05 home, each time.
  const rehearsal = plan({ ...priced, eth: parseEther("0.0048"), ethUsdc: usdc(72.05), ethNeed: parseEther("0.02") }, nothing, t);
  assert.deepEqual(kinds(rehearsal), ["buy-eth 72.05"]);
  // Less than ETH_BUY_USDC there, with more on its way: it waits for that, and sends none home.
  assert.deepEqual(plan({ ...priced, ethUsdc: usdc(14), ethNeed: at(3) }, { ...nothing, out: usdc(50) }, t), []);
});

test("buyers' payments on Ethereum go home, less enough for the next ETH", () => {
  assert.deepEqual(kinds(plan({ ...healthy, ethUsdc: usdc(30.25) }, nothing, t)), ["send-home 15.25"]);
  assert.deepEqual(plan({ ...healthy, ethUsdc: usdc(19.99) }, nothing, t), [], "under $5 over: it waits for more");
});

test("an order from Ethereum: the float lends, the buyer pays it back, nothing is drawn or counted twice", () => {
  // Committed to fill a $10 name: the float will lend $10 and get $10.25 back.
  const committed: Pending = { ...nothing, reserved: usdc(10), reservedBack: usdc(10.25) };
  assert.deepEqual(plan(healthy, committed, t), []);
  // Filled: $140 left, $10.25 owed back on Ethereum.
  assert.deepEqual(plan({ ...healthy, float: usdc(140) }, { ...nothing, repayments: usdc(10.25) }, t), []);
  // Paid back on Ethereum: it goes home.
  assert.deepEqual(kinds(plan({ ...healthy, float: usdc(140), ethUsdc: usdc(25.25) }, nothing, t)), ["send-home 10.25"]);
  // Home again: $150.25, the fee on top. Nothing to return until fees pass the margin.
  assert.deepEqual(plan({ ...healthy, float: usdc(150.25) }, nothing, t), []);
});

test("fees beyond the margin go to the payments wallet", () => {
  assert.deepEqual(kinds(plan({ ...healthy, float: usdc(181) }, nothing, t)), ["return 31.00"]);
  // But not money an order about to be filled needs.
  assert.deepEqual(plan({ ...healthy, float: usdc(181) }, { ...nothing, reserved: usdc(10), reservedBack: usdc(10.25) }, t), []);
});

test("short after paying for gas, it draws from the payments wallet's budget", () => {
  assert.deepEqual(kinds(plan({ ...healthy, float: usdc(100) }, nothing, t)), ["draw 50.00"]);
  // Not while what's owed back would cover it.
  assert.deepEqual(plan({ ...healthy, float: usdc(100) }, { ...nothing, repayments: usdc(40) }, t), []);
  assert.deepEqual(plan({ ...healthy, float: usdc(100) }, { ...nothing, home: usdc(40) }, t), []);
  // Up to the budget, and it says when that has run out.
  assert.deepEqual(kinds(plan({ ...healthy, float: usdc(100), budget: usdc(20) }, nothing, t)), ["draw 20.00", "warn:budget"]);
  assert.deepEqual(kinds(plan({ ...healthy, float: usdc(100), budget: 0n }, nothing, t)), ["warn:budget"]);
});

test("an order bigger than the float: it draws only what the order needs now", () => {
  // A 4-character name, $160: $10 more than the float holds. The buyer pays $160.25 back.
  const fourLetters: Pending = { ...nothing, reserved: usdc(160), reservedBack: usdc(160.25) };
  assert.deepEqual(kinds(plan(healthy, fourLetters, t)), ["draw 10.00"]);
  // Once paid back, the float holds $160.25: within its margin, so it keeps it.
  assert.deepEqual(plan({ ...healthy, float: usdc(160.25) }, nothing, t), []);
  // A 3-character name, $640, then paid back: the extra goes back to the payments wallet.
  const threeLetters: Pending = { ...nothing, reserved: usdc(640), reservedBack: usdc(640.25) };
  assert.deepEqual(kinds(plan({ ...healthy, budget: usdc(1000) }, threeLetters, t)), ["draw 490.00"]);
  // With too small a budget, it draws nothing for the order, which is refunded, and says so.
  assert.deepEqual(kinds(plan(healthy, threeLetters, t)), ["warn:order"]);
  // ...while still keeping its own float topped up.
  assert.deepEqual(kinds(plan({ ...healthy, float: usdc(100) }, threeLetters, t)), ["draw 50.00", "warn:order"]);
  assert.deepEqual(kinds(plan({ ...healthy, float: usdc(640.25) }, nothing, t)), ["return 490.25"]);
});

test("too little in its working balance to buy gas: it draws the difference first, in one draw", () => {
  const d = defaults.treasury; // a $20 working balance, kept within $5
  // $10 left and ETH low: it needs $16 on Ethereum, draws $6 for that and $20 to refill, then sends.
  assert.deepEqual(kinds(plan({ ...healthy, float: usdc(10), eth: parseEther("0.001") }, nothing, d)), ["draw 26.00", "send-out 16.00"]);
  // Low on PLS with nothing left: $2 for PLS and $20 to refill.
  assert.deepEqual(kinds(plan({ ...healthy, float: 0n, pls: 0n }, nothing, d)), ["draw 22.00", "buy-pls 2.00"]);
  // A budget too small for the ETH: it says so, and draws what it can for its working balance.
  assert.deepEqual(kinds(plan({ ...healthy, float: usdc(10), eth: parseEther("0.001"), budget: usdc(3) }, nothing, d)), ["draw 3.00", "warn:eth", "warn:budget"]);
});

test("when Ethereum can't be read, it still looks after PulseChain, and leaves Ethereum alone", () => {
  const unknown = { ...healthy, eth: 0n, ethUsdc: 0n, ethUnknown: true, pls: 0n };
  assert.deepEqual(kinds(plan(unknown, nothing, t)), ["buy-pls 2.00"]);
});

test("USDC amounts read as dollars and cents", () => {
  assert.equal(usdcText(usdc(10)), "10.00");
  assert.equal(usdcText(usdc(10.25)), "10.25");
  assert.equal(usdcText(1234n), "0.001234");
  assert.equal(usdcText(-usdc(3.5)), "-3.50");
});

test("when gas is high, it buys what the next copy needs, a limited amount at a time", () => {
  const weiPerUsdc = parseEther("0.0003"); // 1 USDC buys 0.0003 ETH: ETH at about $3,333
  const at = (gwei: number) => parseEther(String((4_600_000 * gwei) / 1e9)); // a copy and what's kept back: 4.6M gas
  const priced = { ...healthy, weiPerUsdc }; // holding 0.01 ETH, and no USDC on Ethereum

  // At ordinary gas, a copy needs less than ETH_LOW, so nothing changes: it buys under 0.003 as before.
  assert.equal(ethLine({ ethNeed: at(0.1) }, t), parseEther("0.003"));
  assert.deepEqual(kinds(plan({ ...priced, ethNeed: at(0.1) }, nothing, t)), []);

  // At 2 gwei the next copy needs 0.0092 ETH, and it holds 0.01: enough.
  assert.deepEqual(kinds(plan({ ...priced, ethNeed: at(2) }, nothing, t)), []);

  // At 3 gwei it needs 0.0138: it buys enough to hold twice that, 0.0176 ETH more, about $58.67.
  assert.equal(ethLine({ ethNeed: at(3) }, t), parseEther("0.0138"));
  assert.deepEqual(kinds(plan({ ...priced, ethUsdc: usdc(60), ethNeed: at(3) }, nothing, t)), ["buy-eth 58.666667"]);

  // At 20 gwei it would want about $580 of ETH: it buys $100 at a time, ETH_BUY_MAX_USDC.
  assert.deepEqual(kinds(plan({ ...priced, ethUsdc: usdc(100), ethNeed: at(20) }, nothing, t)), ["buy-eth 100.00"]);

  // And never less than ETH_BUY_USDC.
  // (At 0.7 gwei a copy needs 0.00322 ETH: reaching twice that from 0.0032 would take about $10.80.)
  assert.equal(ethPurchase({ eth: parseEther("0.0032"), ethNeed: at(0.7), weiPerUsdc }, t), usdc(15));

  // When no copy can go today (today's limit), it keeps only ETH_LOW: buying more would sit unused.
  assert.deepEqual(kinds(plan({ ...priced, ethNeed: 0n }, nothing, t)), []);

  // Without ETH's price, it buys ETH_BUY_USDC.
  assert.deepEqual(kinds(plan({ ...healthy, ethUsdc: usdc(15), ethNeed: at(3) }, nothing, t)), ["buy-eth 15.00"]);

  // With no USDC on Ethereum, it sends what the purchase needs over the bridge first, drawing from
  // the payments wallet's budget what the float can't spare.
  const out = plan({ ...healthy, weiPerUsdc, ethNeed: at(3) }, nothing, t);
  assert.deepEqual(kinds(out), ["draw 59.666667", "send-out 59.666667"]);
});

test("the most it buys at once can be changed, and the testnets have their own", () => {
  assert.equal(loadConfig({ ...DEPLOYED, ETH_BUY_MAX_USDC: "250" }).treasury.ethBuyMaxUsdc, usdc(250));
  assert.equal(loadConfig({ ...DEPLOYED, NETWORK: "testnet", PULSECHAIN_USDC: ADDRESS }).treasury.ethBuyMaxUsdc, usdc(10));
});

test("while the copy fee is on, it keeps ETH for paid copies, bought only while copies are free", () => {
  const relay = { relay: true, spent: 0n, dailyEth: parseEther("0.02"), copyNowEth: parseEther("0.02") };
  assert.equal(defaults.treasury.copyNowEth, parseEther("0.02"), "about $42 on mainnet");
  assert.equal(loadConfig({ ...DEPLOYED, COPY_NOW_ETH: "0.15" }).treasury.copyNowEth, parseEther("0.15"));
  assert.equal(loadConfig({ ...DEPLOYED, NETWORK: "testnet", PULSECHAIN_USDC: ADDRESS }).treasury.copyNowEth, parseEther("0.002"));
  // Gas is cheap and the fee is on: it holds the 0.02 ETH, and buys towards twice that.
  const cheap = ethToHold({ ...relay, gasPrice: parseGwei("0.06"), copyNow: true });
  assert.equal(cheap, parseEther("0.02"));
  assert.equal(ethLine({ ethNeed: cheap }, t), parseEther("0.02"));
  assert.equal(ethPurchase({ eth: parseEther("0.01"), ethNeed: cheap, weiPerUsdc: 475_000_000_000_000n }, t), 63_157_895n, "a top-up to 0.04 ETH: about $63");
  // The fee is off: just ETH_LOW, as before.
  assert.equal(ethToHold({ ...relay, gasPrice: parseGwei("0.06"), copyNow: false }), parseGwei("0.06") * 4_600_000n);
  // Ethereum is very busy (copies aren't free, so copyNow is false): it doesn't chase ETH it would
  // pay a fortune to bring over, and uses what it holds.
  assert.equal(ethToHold({ ...relay, gasPrice: parseGwei("200"), copyNow: false }), 0n);
  // In between, while a copy fits today's limit at the most a claim may take, it buys for the next copy.
  assert.equal(ethToHold({ ...relay, gasPrice: parseGwei("10"), copyNow: false }), parseGwei("10") * 4_600_000n);
});
