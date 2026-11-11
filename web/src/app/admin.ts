// The admin page's reads and actions: pausing sales, raising or lowering all prices together,
// holding names, handing them to their owners and adding time to them, and the Ethereum copy fee.
// Each is a power the contracts give the admin wallet at deploy (README, "Who can do what"), and the
// contracts check it whoever calls: this page only makes the powers easy to use.

import { type Abi, type Address, getAbiItem, isAddress, zeroAddress } from "viem";

import { checkName } from "../lib/names";
import { reservedFor, reservedNames } from "../lib/reserved";
import { checkoutAbi, erc20Abi, mirrorSyncAbi, oracleAbi, registrarAbi, registryAbi } from "./abis";
import { confirm, errorText, fees, Progress, type Report } from "./flows";
import { LIST_LEVEL, levelOf, oracleAddress, type Ratio, ratioFor, readPriceDecimals, ROLE_REGISTRAR } from "./live";
import { clients, deployment, PAY } from "./network";
import { labelId, SECONDS_PER_YEAR } from "./order";
import { switchTo, walletClient } from "./wallet";

/** ENSv2's registry roles the page uses (RegistryRolesLib). Each role's admin role is it << 128. */
const ROLE_REGISTER_RESERVED = 1n << 4n;
const ROLE_RENEW = 1n << 16n;
const adminRole = (role: bigint) => role << 128n;
/** The roles a buyer gets with a name: ETHRegistrar's REGISTRATION_ROLE_BITMAP. */
export const OWNER_ROLES =
  (1n << 20n) | adminRole(1n << 20n) | (1n << 24n) | adminRole(1n << 24n) | adminRole(1n << 28n);
/** The price oracle's role for changing a payment token's exchange rate. */
const ROLE_UPDATE_TOKEN = 1n;
/** A name's status in the registry: held (reserved), or registered to an owner. */
const HELD = 1;
const REGISTERED = 2;

export interface Powers {
  pause: boolean;
  prices: boolean;
  hold: boolean;
  handOut: boolean;
  extend: boolean;
  /** Choosing the copy bot and capping the Ethereum copy fee: this wallet owns the checkout. */
  copyFee: boolean;
  /**
   * Roles that let this wallet register or renew any name for free. The page only takes them for
   * the moment an action needs them, so holding them means an action didn't finish.
   */
  leftover: bigint;
}

export function powersOf(registryRoles: bigint, canUpdatePrices: boolean, ownsCheckout = false): Powers {
  const has = (role: bigint) => (registryRoles & role) === role;
  return {
    pause: has(adminRole(ROLE_REGISTRAR)),
    prices: canUpdatePrices,
    hold: has(adminRole(ROLE_REGISTRAR)) || has(ROLE_REGISTRAR),
    handOut: has(ROLE_REGISTER_RESERVED),
    extend: has(adminRole(ROLE_RENEW)) || has(ROLE_RENEW),
    copyFee: ownsCheckout,
    leftover: registryRoles & (ROLE_REGISTRAR | ROLE_RENEW),
  };
}

export const anyPower = (p: Powers) =>
  p.pause || p.prices || p.hold || p.handOut || p.extend || p.copyFee || p.leftover !== 0n;

function required() {
  if (!deployment) throw new Error("The contracts aren't deployed yet.");
  return deployment;
}

/** What `account` may do here. */
export async function readPowers(account: Address): Promise<Powers> {
  const d = required();
  const [roles, prices, checkoutOwner] = await Promise.all([
    clients.pulsechain.readContract({
      address: d.pulsechain.registry,
      abi: registryAbi,
      functionName: "roles",
      args: [0n, account],
    }),
    oracleAddress().then((oracle) =>
      clients.pulsechain.readContract({
        address: oracle,
        abi: oracleAbi,
        functionName: "hasRootRoles",
        args: [ROLE_UPDATE_TOKEN, account],
      }),
    ),
    // A checkout deployed before the copy fee has no owner.
    clients.pulsechain
      .readContract({ address: d.pulsechain.checkout, abi: checkoutAbi, functionName: "owner" })
      .catch(() => zeroAddress),
  ]);
  return powersOf(roles, prices, checkoutOwner.toLowerCase() === account.toLowerCase());
}

/** The copy fee's settings: the bot that sets it, the most it may be, and what it is now (USDC units). */
export interface CopySettings {
  bot: Address;
  cap: bigint;
  fee: bigint;
}

export async function readCopySettings(): Promise<CopySettings> {
  const checkout = { address: required().pulsechain.checkout, abi: checkoutAbi } as const;
  const [bot, cap, fee] = await Promise.all([
    clients.pulsechain.readContract({ ...checkout, functionName: "copyBot" }),
    clients.pulsechain.readContract({ ...checkout, functionName: "maxCopyFee" }),
    clients.pulsechain.readContract({ ...checkout, functionName: "copyFee" }),
  ]);
  return { bot, cap, fee };
}

const RANGE = 50_000n;

/** Events since the deployment, read in stretches the public RPCs accept, a few at a time. */
async function since<T>(read: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>): Promise<T[]> {
  const d = required();
  const latest = await clients.pulsechain.getBlockNumber();
  const ranges: [bigint, bigint][] = [];
  for (let from = BigInt(d.pulsechain.startBlock); from <= latest; from += RANGE) {
    ranges.push([from, from + RANGE - 1n < latest ? from + RANGE - 1n : latest]);
  }
  const found: T[] = [];
  for (let i = 0; i < ranges.length; i += 4) {
    const batch = await Promise.all(ranges.slice(i, i + 4).map(([from, to]) => read(from, to)));
    found.push(...batch.flat());
  }
  return found;
}

export interface PriceToken {
  address: Address;
  symbol: string;
  decimals: number;
  ratio: Ratio;
}

export interface Prices {
  oracle: Address;
  /** The oracle's units: 10^decimals to the dollar. */
  decimals: number;
  /** The tokens names can be paid in, straight to the registrar. The checkout pays in USDC. */
  tokens: PriceToken[];
  /** All prices now, as a share of the list prices: 10000 is the list prices. */
  level: bigint;
}

/** The price level, and the tokens it applies to. */
export async function readPrices(): Promise<Prices> {
  const d = required();
  const [oracle, decimals] = await Promise.all([oracleAddress(), readPriceDecimals()]);
  const updated = getAbiItem({ abi: oracleAbi, name: "PaymentTokenUpdated" });
  const logs = await since((fromBlock, toBlock) =>
    clients.pulsechain.getLogs({ address: oracle, event: updated, fromBlock, toBlock }),
  );
  const addresses = [...new Set(logs.flatMap((log) => (log.args.paymentToken ? [log.args.paymentToken] : [])))];
  const tokens = await Promise.all(
    addresses.map(async (address): Promise<PriceToken> => {
      const [[numer, denom], symbol, tokenDecimals] = await Promise.all([
        clients.pulsechain.readContract({
          address: oracle,
          abi: oracleAbi,
          functionName: "getPaymentTokenRatio",
          args: [address],
        }),
        clients.pulsechain.readContract({ address, abi: erc20Abi, functionName: "symbol" }).catch(() => "token"),
        clients.pulsechain.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
      ]);
      return { address, symbol, decimals: Number(tokenDecimals), ratio: { numer, denom } };
    }),
  );
  const accepted = tokens.filter((token) => token.ratio.denom > 0n);
  // USDC first: names are priced, and the checkout pays, in USDC.
  accepted.sort(
    (a, b) =>
      Number(b.address.toLowerCase() === d.pulsechain.usdc.toLowerCase()) -
      Number(a.address.toLowerCase() === d.pulsechain.usdc.toLowerCase()),
  );
  const usdc = accepted.find((token) => token.address.toLowerCase() === d.pulsechain.usdc.toLowerCase());
  return {
    oracle,
    decimals,
    tokens: accepted,
    level: usdc ? levelOf(usdc.ratio, usdc.decimals, decimals) : LIST_LEVEL,
  };
}

export interface Held {
  label: string;
  /** When the hold ends (unix seconds): then the name is anyone's to buy. */
  expiry: number;
  /** Who it's held for, from the reserved list, if it's on it. */
  forWhom?: string;
}

/** The names held now: held at deploy or since, and neither handed out nor run out. */
export async function readHeld(): Promise<Held[]> {
  const d = required();
  const reserved = getAbiItem({ abi: registryAbi, name: "LabelReserved" });
  const logs = await since((fromBlock, toBlock) =>
    clients.pulsechain.getLogs({ address: d.pulsechain.registry, event: reserved, fromBlock, toBlock }),
  );
  const labels = [...new Set(logs.flatMap((log) => (log.args.label ? [log.args.label] : [])))];
  const states = await Promise.all(
    labels.map((label) =>
      clients.pulsechain.readContract({
        address: d.pulsechain.registry,
        abi: registryAbi,
        functionName: "getState",
        args: [labelId(label)],
      }),
    ),
  );
  const now = Date.now() / 1000;
  return labels
    .flatMap((label, i) => {
      const state = states[i];
      if (state.status !== HELD || Number(state.expiry) <= now) return [];
      const reservation = reservedNames.get(label);
      return [
        { label, expiry: Number(state.expiry), forWhom: reservation ? reservedFor(reservation.note) : undefined },
      ];
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** The names in `text`, separated by commas, spaces or new lines, each checked as the app checks a search. */
export function parseNames(text: string): { labels: string[]; problems: string[] } {
  const labels: string[] = [];
  const problems: string[] = [];
  for (const word of text.split(/[\s,]+/).filter(Boolean)) {
    const check = checkName(word);
    if (check.kind === "available" || check.kind === "premium" || check.kind === "reserved") {
      const label = check.name.replace(/\.hex$/, "");
      if (!labels.includes(label)) labels.push(label);
    } else if (check.kind === "too-short") {
      problems.push(`${word}: names of 1 or 2 characters aren't for sale, so there's nothing to hold.`);
    } else if (check.kind === "too-long") {
      problems.push(`${word}: names can be up to 63 characters.`);
    } else if (check.kind === "invalid") {
      problems.push(`${word}: ${check.reason}`);
    } else {
      problems.push(`${word}: not a .hex name.`);
    }
  }
  return { labels, problems };
}

/** The one name in `text`, or why it isn't one. */
function oneName(text: string): string {
  const { labels, problems } = parseNames(text);
  if (problems.length) throw new Error(problems[0]);
  if (labels.length !== 1) throw new Error("Type one name.");
  return labels[0];
}

type Call = { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };

/**
 * Sends one of the page's transactions as `key`'s step, after checking it would go through, so a
 * call the contracts would refuse says why instead of asking the wallet for a fee.
 */
async function sendStep(progress: Progress, key: string, call: Call) {
  progress.start(key);
  const wallet = walletClient("pulsechain");
  await clients.pulsechain.simulateContract({ ...call, account: wallet.account.address } as never);
  const hash = await wallet.writeContract({ ...call, ...(await fees()) } as never);
  progress.set(key, { tx: { chain: "pulsechain", hash } });
  await confirm("pulsechain", hash);
  progress.done(key);
}

/** Runs an action's steps on PulseChain, reporting each, after switching the wallet there. */
async function run(
  steps: [string, string][],
  report: Report,
  work: (progress: Progress, account: Address) => Promise<void>,
) {
  const progress = new Progress([["chain", `Switch to ${PAY.pulsechain.name}`], ...steps], report);
  try {
    progress.start("chain");
    await switchTo("pulsechain");
    progress.done("chain");
    await work(progress, walletClient("pulsechain").account.address);
  } catch (error) {
    progress.fail(errorText(error));
    throw error;
  }
}

const roleCall = (grant: boolean, role: bigint, account: Address): Call => ({
  address: required().pulsechain.registry,
  abi: registryAbi,
  functionName: grant ? "grantRootRoles" : "revokeRootRoles",
  args: [role, account],
});

/**
 * Pauses or restarts sales. Pausing takes the registrar's power to register names, so nobody can
 * buy one; renewals carry on, so nobody loses a name meanwhile. Restarting gives it back.
 */
export async function setSales(o: { open: boolean; report: Report }) {
  const d = required();
  await run([["sales", o.open ? "Restart sales" : "Pause sales"]], o.report, async (progress) => {
    await sendStep(progress, "sales", roleCall(o.open, ROLE_REGISTRAR, d.pulsechain.registrar));
  });
}

/**
 * Sets all prices to `level` (10000 is the list prices), in every token the registrar takes, so
 * none stays cheaper: one transaction per token.
 */
export async function setPriceLevel(o: { level: bigint; prices: Prices; report: Report }) {
  const changes = o.prices.tokens.flatMap((token) => {
    const ratio = ratioFor(o.level, token.decimals, o.prices.decimals);
    const same = ratio.numer * token.ratio.denom === token.ratio.numer * ratio.denom;
    return same ? [] : [{ token, ratio }];
  });
  if (changes.length === 0) throw new Error("Prices are already at that level.");
  await run(
    changes.map(({ token }) => [token.address, `Set prices in ${token.symbol}`]),
    o.report,
    async (progress) => {
      for (const { token, ratio } of changes) {
        await sendStep(progress, token.address, {
          address: o.prices.oracle,
          abi: oracleAbi,
          functionName: "updatePaymentToken",
          args: [token.address, ratio.numer, ratio.denom],
        });
      }
    },
  );
}

async function rolesOf(account: Address): Promise<bigint> {
  return clients.pulsechain.readContract({
    address: required().pulsechain.registry,
    abi: registryAbi,
    functionName: "roles",
    args: [0n, account],
  });
}

/**
 * Holds `labels` for `years`: nobody can buy them until then, unless the admin hands them to their
 * owners. Holding takes the registry's power to register names, which this wallet takes for these
 * steps only and gives back after.
 */
export async function holdNames(o: { text: string; years: number; report: Report }) {
  const d = required();
  const { labels, problems } = parseNames(o.text);
  if (problems.length) throw new Error(problems.join(" "));
  if (labels.length === 0) throw new Error("Type the names to hold.");
  const free = await Promise.all(
    labels.map((label) =>
      clients.pulsechain.readContract({
        address: d.pulsechain.registrar,
        abi: registrarAbi,
        functionName: "isAvailable",
        args: [label],
      }),
    ),
  );
  const taken = labels.filter((_, i) => !free[i]);
  if (taken.length) {
    const names = taken.map((label) => `${label}.hex`).join(", ");
    throw new Error(`Not free to hold: someone owns them, they're in their grace period, or they're held. ${names}.`);
  }
  const account = walletClient("pulsechain").account.address;
  const needsRole = ((await rolesOf(account)) & ROLE_REGISTRAR) === 0n;
  const steps: [string, string][] = [
    ...(needsRole ? ([["take", "Let this wallet hold names, for now"]] as [string, string][]) : []),
    ...labels.map((label): [string, string] => [label, `Hold ${label}.hex`]),
    ["back", "Give that back"],
  ];
  await run(steps, o.report, async (progress, wallet) => {
    const now = (await clients.pulsechain.getBlock()).timestamp;
    const until = now + BigInt(o.years) * SECONDS_PER_YEAR;
    if (needsRole) await sendStep(progress, "take", roleCall(true, ROLE_REGISTRAR, wallet));
    for (const label of labels) {
      await sendStep(progress, label, {
        address: d.pulsechain.registry,
        abi: registryAbi,
        functionName: "register",
        args: [label, zeroAddress, zeroAddress, zeroAddress, 0n, until],
      });
    }
    await sendStep(progress, "back", roleCall(false, ROLE_REGISTRAR, wallet));
  });
}

/**
 * Sends `label`'s copy to Ethereum from the admin wallet: the bot copies what the admin sends at
 * once, whatever Ethereum's fees, at the project's cost.
 */
async function syncStep(progress: Progress, key: string, label: string) {
  const sync = await clients.pulsechain.readContract({
    address: required().pulsechain.checkout,
    abi: checkoutAbi,
    functionName: "MIRROR_SYNC",
  });
  await sendStep(progress, key, { address: sync, abi: mirrorSyncAbi, functionName: "sync", args: [label] });
}

/** Hands a held name to `owner`, with the roles a buyer gets, for the rest of its hold, and copies it to Ethereum. */
export async function handOut(o: { name: string; owner: string; report: Report }) {
  const d = required();
  const label = oneName(o.name);
  const owner = o.owner.trim();
  if (!isAddress(owner) || owner === zeroAddress) throw new Error("Type the wallet address to hand it to (0x…).");
  const state = await clients.pulsechain.readContract({
    address: d.pulsechain.registry,
    abi: registryAbi,
    functionName: "getState",
    args: [labelId(label)],
  });
  if (state.status !== HELD) throw new Error(`${label}.hex isn't held, so there's nothing to hand out.`);
  const to = `${owner.slice(0, 6)}…${owner.slice(-4)}`;
  const steps: [string, string][] = [
    ["give", `Hand ${label}.hex to ${to}`],
    ["copy", "Copy it to Ethereum now"],
  ];
  await run(steps, o.report, async (progress) => {
    await sendStep(progress, "give", {
      address: d.pulsechain.registry,
      abi: registryAbi,
      functionName: "register",
      args: [label, owner, zeroAddress, zeroAddress, OWNER_ROLES, 0n],
    });
    await syncStep(progress, "copy", label);
  });
}

/** Copies a name to Ethereum now, from the admin wallet: the bot copies it at once, at the project's cost. */
export async function copyToEthereum(o: { name: string; report: Report }) {
  const label = oneName(o.name);
  await run([["copy", `Copy ${label}.hex to Ethereum now`]], o.report, async (progress) => {
    await syncStep(progress, "copy", label);
  });
}

/** Chooses the bot that sets the copy fee and receives it (its wallet address); zero switches the fee off. */
export async function setCopyBot(o: { bot: string; report: Report }) {
  const bot = o.bot.trim();
  if (!isAddress(bot)) throw new Error("Type the bot's wallet address (0x…).");
  const off = bot === zeroAddress;
  await run([["bot", off ? "Switch the copy fee off" : "Choose the copy bot"]], o.report, async (progress) => {
    await sendStep(progress, "bot", {
      address: required().pulsechain.checkout,
      abi: checkoutAbi,
      functionName: "setCopyBot",
      args: [bot],
    });
  });
}

/** The most a copy can cost anyone, in dollars ("100", "2.50"); 0 switches the fee off. */
export function capFrom(text: string): bigint | null {
  if (!/^\d+(\.\d{1,2})?$/.test(text.trim())) return null;
  const [whole, cents = ""] = text.trim().split(".");
  const cap = BigInt(whole) * 1_000_000n + BigInt(cents.padEnd(2, "0")) * 10_000n;
  return cap <= 10_000_000_000n ? cap : null; // up to $10,000
}

export async function setCopyCap(o: { cap: bigint; report: Report }) {
  await run([["cap", o.cap === 0n ? "Switch the copy fee off" : "Set the most a copy can cost"]], o.report, async (progress) => {
    await sendStep(progress, "cap", {
      address: required().pulsechain.checkout,
      abi: checkoutAbi,
      functionName: "setMaxCopyFee",
      args: [o.cap],
    });
  });
}

/**
 * Adds `years` to a held name's hold, or to an owned name's time, free. Adding time takes the
 * registry's power to renew names, which this wallet takes for these steps only and gives back after.
 */
export async function extendName(o: { name: string; years: number; report: Report }) {
  const d = required();
  const label = oneName(o.name);
  const state = await clients.pulsechain.readContract({
    address: d.pulsechain.registry,
    abi: registryAbi,
    functionName: "getState",
    args: [labelId(label)],
  });
  if ((state.status !== HELD && state.status !== REGISTERED) || Number(state.expiry) <= Date.now() / 1000) {
    throw new Error(`${label}.hex isn't held or owned, so there's nothing to add time to.`);
  }
  const account = walletClient("pulsechain").account.address;
  const needsRole = ((await rolesOf(account)) & ROLE_RENEW) === 0n;
  const until = state.expiry + BigInt(o.years) * SECONDS_PER_YEAR;
  const steps: [string, string][] = [
    ...(needsRole ? ([["take", "Let this wallet add time, for now"]] as [string, string][]) : []),
    ["extend", `Add ${o.years} ${o.years === 1 ? "year" : "years"} to ${label}.hex`],
    ["back", "Give that back"],
  ];
  await run(steps, o.report, async (progress, wallet) => {
    if (needsRole) await sendStep(progress, "take", roleCall(true, ROLE_RENEW, wallet));
    await sendStep(progress, "extend", {
      address: d.pulsechain.registry,
      abi: registryAbi,
      functionName: "renew",
      args: [labelId(label), until],
    });
    await sendStep(progress, "back", roleCall(false, ROLE_RENEW, wallet));
  });
}

/** Gives back roles left over from an action that didn't finish. */
export async function giveBack(o: { roles: bigint; report: Report }) {
  await run([["back", "Give it back"]], o.report, async (progress, wallet) => {
    await sendStep(progress, "back", roleCall(false, o.roles, wallet));
  });
}
