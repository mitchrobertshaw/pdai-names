import assert from "node:assert/strict";
import { test } from "node:test";

import { parseGwei } from "viem";

import {
  COPY_CLAIM_LIMIT,
  COPY_GAS,
  UNAVAILABLE,
  claimLimit,
  claimNeed,
  copyCost,
  copyGas,
  feeFor,
  feeText,
  feeToSet,
  holdsCopies,
  paidCopyNeed,
  recheckHeld,
  recordClaimLimit,
  recordCopyGas,
  worthUpdating,
} from "../src/copyfee.ts";
import type { MessageRecord, RelayState } from "../src/state.ts";

const WEI_PER_USDC = 475_000_000_000_000n; // 1 USDC buys 0.000475 ETH: ETH at about $2,105, 10 November 2026
const FREE = 2_000_000n; // the project pays up to $2 a copy
const CAP = 100_000_000n; // the admin's cap at deploy: $100
const COPY = 1_050_000n; // the gas a copy used on Sepolia, November 2026

test("what a copy costs: the gas it uses, at Ethereum's gas price, at ETH's price", () => {
  assert.equal(copyCost(COPY, parseGwei("0.06"), WEI_PER_USDC), 132_632n, "about 13 cents on 10 November 2026");
  assert.equal(copyCost(COPY, parseGwei("1"), WEI_PER_USDC), 2_210_527n, "about $2.21 at 1 gwei");
  assert.equal(copyCost(COPY, parseGwei("10"), WEI_PER_USDC), 22_105_264n, "about $22 at 10 gwei");
  assert.equal(copyCost(COPY, parseGwei("30"), WEI_PER_USDC), 66_315_790n, "about $66 at 30 gwei");
});

test("no fee up to $2 a copy; above it, the rest and a quarter more, to the cent above", () => {
  assert.equal(feeFor(132_632n, FREE), 0n);
  assert.equal(feeFor(FREE, FREE), 0n, "exactly $2 is still free");
  assert.equal(feeFor(FREE + 1n, FREE), 10_000n, "a cent, at least");
  assert.equal(feeFor(2_210_527n, FREE), 270_000n, "1 gwei: 27 cents");
  assert.equal(feeFor(3_000_000n, FREE), 1_250_000n, "a $3 copy: $1.25");
  assert.equal(feeFor(22_105_264n, FREE), 25_140_000n, "10 gwei: $25.14");
  assert.equal(feeFor(66_315_790n, FREE), 80_400_000n, "30 gwei: $80.40, still under the $100 cap");
  assert.ok(feeFor(copyCost(COPY, parseGwei("40"), WEI_PER_USDC), FREE) > CAP, "at 40 gwei it's over the cap: not offered");
});

test("a new fee is sent only when it matters: to or from zero, across the cap, or more than a tenth", () => {
  assert.equal(worthUpdating(0n, 0n, CAP), false);
  assert.equal(worthUpdating(0n, 270_000n, CAP), true, "fees start");
  assert.equal(worthUpdating(270_000n, 0n, CAP), true, "fees stop");
  assert.equal(worthUpdating(1_000_000n, 1_100_000n, CAP), false, "a tenth more: not worth a transaction");
  assert.equal(worthUpdating(1_000_000n, 1_110_000n, CAP), true);
  assert.equal(worthUpdating(1_000_000n, 890_000n, CAP), true);
  assert.equal(worthUpdating(99_000_000n, 101_000_000n, CAP), true, "over the cap: copying at once stops being offered");
  assert.equal(worthUpdating(101_000_000n, 99_000_000n, CAP), true, "and back under it");
});

test("it learns the gas a copy uses from its own claims", () => {
  assert.equal(copyGas(undefined), COPY_GAS);
  const relay: RelayState = { day: "2026-11-10", spent: "0", lastClaim: {}, noted: {} };
  assert.equal(copyGas(relay), COPY_GAS);
  recordCopyGas(relay, 1_049_000n);
  recordCopyGas(relay, 1_052_000n);
  recordCopyGas(relay, 1_010_000n);
  assert.equal(copyGas(relay), 1_052_000n, "the most of the last few");
  for (let i = 0; i < 10; i++) recordCopyGas(relay, 900_000n);
  assert.equal(relay.copyGas!.length, 10, "only the last ten");
  assert.equal(copyGas(relay), 900_000n);
});

test("what it logs about the fee", () => {
  assert.equal(feeText(0n, CAP), "none: copies are free");
  assert.equal(feeText(1_250_000n, CAP), "1.25 USDC to copy a name at once");
  assert.match(feeText(120_000_000n, CAP), /over the 100 USDC cap: copying at once isn't offered/);
});

test("it learns the gas limit a copy's claim is sent with, which is what it needs on hand", () => {
  assert.equal(claimLimit(undefined), COPY_CLAIM_LIMIT, "before any claim: about what Sepolia needed");
  const relay: RelayState = { day: "2026-11-10", spent: "0", lastClaim: {}, noted: {} };
  recordClaimLimit(relay, 1_300_000n);
  recordClaimLimit(relay, 1_320_000n);
  assert.equal(claimLimit(relay), 1_320_000n, "the most of the last few");
  for (let i = 0; i < 10; i++) recordClaimLimit(relay, 1_310_000n);
  assert.equal(relay.claimLimits!.length, 10, "only the last ten");
  assert.equal(claimLimit(relay), 1_310_000n);
});

test("a claim needs its whole gas limit on hand, though it's charged only for the gas it uses", () => {
  // At 200 gwei a copy using 300,000 gas costs 0.06 ETH, but its claim is sent with a limit of about
  // 1.32 million gas (the bridge holds back the million a copy may use), and Ethereum takes it only
  // from a wallet holding that limit at its highest fee, a fifth over the gas price: 0.3168 ETH.
  const gasPrice = parseGwei("200");
  assert.equal(claimNeed(gasPrice, 1_320_000n), 316_800_000_000_000_000n);
  // To offer copying at once it wants half again the gas price, for it to rise before the copy goes.
  assert.equal(paidCopyNeed(gasPrice, 1_320_000n, 300_000n, 0), 396_000_000_000_000_000n);
  // Paid copies not yet claimed keep their share: each uses its gas, and the next needs the limit.
  assert.equal(paidCopyNeed(gasPrice, 1_320_000n, 300_000n, 2), 576_000_000_000_000_000n, "(1.32M + 2 x 300k) gas");
  // The old reckoning, twice the gas a copy uses (0.12 ETH), would have offered copies it couldn't send.
  assert.ok(paidCopyNeed(gasPrice, 1_320_000n, 300_000n, 0) > claimNeed(gasPrice, 1_320_000n));
  assert.ok(gasPrice * 300_000n * 2n < claimNeed(gasPrice, 1_320_000n));
});

test("copying at once is offered only while the bot holds the ETH to do it straight away", () => {
  // At 200 gwei a copy of 300,000 gas costs about $126, and offering it needs 0.396 ETH on hand.
  const gas = 300_000n;
  const need = paidCopyNeed(parseGwei("200"), 1_320_000n, gas, 0);
  assert.equal(need, 396_000_000_000_000_000n);
  const fee = feeFor(copyCost(gas, parseGwei("200"), WEI_PER_USDC), FREE);
  assert.ok(fee > 150_000_000n && fee < 160_000_000n, "about $155: more than $100, and still offered");
  assert.equal(feeToSet(fee, need, need), fee, "it holds enough: offered");
  assert.equal(feeToSet(fee, need - 1n, need), UNAVAILABLE, "it doesn't: copying at once is paused");
  assert.equal(feeToSet(0n, 0n, need), 0n, "copies are free: nothing to pause");
  assert.ok(UNAVAILABLE > 1_000_000_000n, "above any cap, so nothing can be paid");
  assert.equal(worthUpdating(fee, UNAVAILABLE, 1_000_000_000n), true, "pausing is sent at once");
  assert.equal(worthUpdating(UNAVAILABLE, fee, 1_000_000_000n), true, "and so is offering again");
  assert.match(feeText(UNAVAILABLE, 1_000_000_000n), /copying at once paused/);
  assert.equal(feeText(fee, 1_000_000_000n), "155.4 USDC to copy a name at once");
});

test("when the fee is switched off, or copies are free again, the copies held back go on the next pass", () => {
  assert.equal(holdsCopies({ on: true, free: false }), true, "the fee is on and copies cost more than the project pays");
  assert.equal(holdsCopies({ on: true, free: true }), false, "copies are free again");
  assert.equal(holdsCopies({ on: false, free: false }), false, "the fee is off");
  assert.equal(holdsCopies({ on: true }), false, "not known yet");
  const message = (over: Partial<MessageRecord>): MessageRecord => ({
    messageId: `0x${"01".repeat(32)}`,
    encoded: "0x",
    hash: `0x${"02".repeat(32)}`,
    gasLimit: "1000000",
    sender: "0x000000000000000000000000000000000000dEaD",
    seenAtBlock: "1",
    status: "waiting",
    ...over,
  });
  const messages = {
    a: message({ recheckAt: "2000" }),
    b: message({ recheckAt: "2000" }),
    c: message({}),
    d: message({ status: "claimed", recheckAt: "2000" }),
  };
  assert.equal(recheckHeld(messages), 2, "the two held back");
  assert.equal(messages.a.recheckAt, undefined);
  assert.equal(messages.b.recheckAt, undefined);
  assert.equal(messages.d.recheckAt, "2000", "finished ones are left as they are");
  assert.equal(recheckHeld(messages), 0);
});
