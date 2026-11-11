// What the bot remembers between runs, kept in one JSON file.

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { Hex } from "viem";

export type OrderStatus =
  | "new" // seen on Ethereum, not yet acted on
  | "committed" // commitment made on PulseChain, waiting for it to age
  | "filled" // registered on PulseChain; payment follows over the bridge
  | "refunded" // reported unfillable or expired; refund follows over the bridge
  | "waiting-for-deadline" // the bot will not fill it (unreadable, underpaid, ...); refunded once its deadline passes
  | "closed"; // settled on Ethereum by someone else

export type OrderRecord = {
  orderId: string;
  commitment: Hex;
  deadline: string; // unix seconds
  amount: string; // USDC units
  sealed: Hex;
  status: OrderStatus;
  note?: string;
  committedAt?: string; // unix seconds
  price?: string; // USDC units the name costs, once the bot has committed to fill it
  txs: Hex[];
  advanced?: string; // USDC units the bot paid for the name, when it filled the order itself
  repaid?: boolean; // the order has paid the bot back on Ethereum
};

export type MessageRecord = {
  messageId: Hex;
  encoded: Hex;
  hash: Hex;
  gasLimit: string;
  sender: string;
  seenAtBlock: string;
  status: "waiting" | "claimed" | "claimed-by-someone-else" | "skipped";
  note?: string; // why it was skipped
  tx?: Hex;
  own?: { usdc: string }; // the bot's own USDC, sent to Ethereum over the bridge to buy ETH
  claimTx?: Hex; // a claim sent and not yet mined: waited for, never sent twice
  claimSentAt?: string; // unix seconds
  paid?: { fee: string }; // a copy someone paid the copy fee for (USDC units): copied at once
  admin?: boolean; // a copy the admin sent (after handing out a name, say): copied at once
  recheckAt?: string; // held back: looked at again from then (unix seconds), so a long wait costs little
  doneAt?: string; // when it was claimed or skipped (unix seconds): forgotten a week later
};

/** USDC the bot sent home from Ethereum over the bridge, until it arrives on PulseChain. */
export type HomeTransfer = { messageId: Hex; usdc: string; tx: Hex; sentAt: string; arrived?: boolean };

/** A bridge transfer of the bot's own USDC, sent and not yet seen mined (out: to Ethereum; home: back). */
export type Submitted = { kind: "out" | "home"; tx: Hex; usdc: string; sentAt: string };

/** What the bot has spent claiming messages that copy names to Ethereum, to keep within its limits. */
export type RelayState = {
  day: string; // the UTC day `spent` counts, as YYYY-MM-DD
  spent: string; // wei spent on those claims that day
  lastClaim: Record<string, string>; // when each name was last copied, by label (unix seconds)
  noted: Record<string, string>; // what it last said it was holding back, and when (unix seconds)
  copyGas?: string[]; // the gas the last few copies used, to know what one costs
  claimLimits?: string[]; // the gas limits the last few copies' claims were sent with: what one needs on hand
};

/** The copy fee, as the bot last saw and set it on the checkout. */
export type CopyFeeState = {
  lastRun?: string; // unix seconds
  on: boolean; // this bot is the checkout's copy bot, and the admin hasn't switched the fee off
  offered: boolean; // a fee can be paid now: above zero and within the admin's cap
  fee: string; // the fee it set, in USDC units (UNAVAILABLE in copyfee.ts: copying at once paused)
  free?: boolean; // copies cost no more than the project pays just now: when it buys the ETH for paid copies
  admin?: string; // the checkout's owner: its copies are copied at once
  noted: Record<string, string>; // what it last said, and when (unix seconds)
};

export type TreasuryState = {
  lastRun?: string; // unix seconds
  lastReport?: string; // unix seconds: the daily line about its balances
  home: HomeTransfer[];
  submitted?: Submitted[];
  warned: Record<string, string>; // what it last warned about, and when (unix seconds)
};

export type State = {
  ethereumBlock: string; // last Ethereum block scanned for orders
  pulsechainAmbBlock: string; // last PulseChain block scanned for bridge messages
  pulsechainRegistryBlock: string; // last PulseChain block scanned for name changes
  orders: Record<string, OrderRecord>;
  messages: Record<string, MessageRecord>;
  treasury?: TreasuryState;
  relay?: RelayState;
  copyFee?: CopyFeeState;
};

export function loadState(file: string): State | undefined {
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8")) as State;
}

/** Writes the state atomically, so a crash never leaves a half-written file. */
export function saveState(file: string, state: State): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, file);
}
