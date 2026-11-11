// Settings, from environment variables. See bot/.env.example.

import { join } from "node:path";

import { type Address, type Hex, getAddress, isHex } from "viem";

import { encryptionSecretKeyFrom } from "./reveal.ts";

/** Mainnet (PulseChain + Ethereum), or the testnets (PulseChain Testnet v4 + Sepolia). */
export type Network = "mainnet" | "testnet";

export type Config = {
  network: Network;
  pulsechainRpcUrl: string;
  ethereumRpcUrl: string;
  botPrivateKey: Hex; // the bot's wallet, the same address on both chains
  encryptionSecretKey: Hex; // opens the sealed order details; keep it secret
  encryptionKeyFromWallet: boolean; // true if made from the wallet key (BOT_ENCRYPTION_SECRET_KEY not set)

  // PulseChain (from deploy step 1)
  registrar: Address;
  hexRegistry: Address;
  orderFiller: Address;
  mirrorSync: Address;
  pulsechainUsdc: Address;
  homeAmb: Address;
  /**
   * AnyTokenCheckout (PULSECHAIN_CHECKOUT, optional). With it, and once the admin has chosen this
   * bot as the copy bot, the bot keeps the copy fee up to date and copies names paid for first.
   */
  checkout: Address | undefined;

  // Ethereum (from deploy step 2)
  orderBook: Address;
  mirrorRegistrar: Address;
  foreignAmb: Address;

  // Running itself (see treasury.ts)
  treasury: Treasury;

  minFee: bigint; // least fee per order, in USDC units (6 decimals)
  ethereumConfirmations: bigint; // Ethereum blocks to wait before acting on an order
  pollSeconds: number;
  stateFile: string; // where it remembers its place: STATE_FILE, else on a Railway volume, else ./state.json
  railway: { volume: string | undefined } | undefined; // set when running on Railway
  startBlockEthereum: bigint | undefined;
  startBlockPulseChain: bigint | undefined;
  fill: boolean; // fill Ethereum orders: off unless FILL=true, as names are bought on PulseChain
  relay: boolean; // claim bridge messages on Ethereum
  sync: boolean; // copy name changes to Ethereum
  relayLimits: RelayLimits;
};

/**
 * Anyone can change a name on PulseChain for a fraction of a cent (sending it back and forth, say),
 * and each change costs the bot ETH to copy. So it copies each name at most once in a while, and
 * spends at most so much ETH a day copying; the rest wait, and the newest change wins.
 */
export type RelayLimits = {
  dailyEth: bigint; // RELAY_DAILY_ETH: the most ETH (in wei) a day it spends copying names
  nameCooldown: bigint; // RELAY_NAME_COOLDOWN_MINUTES, in seconds: how long after copying a name it copies it again
  /**
   * COPY_FREE_USDC, in USDC units: what the project pays for one copy. While the copy fee is on and
   * a copy costs more, new names and renewals nobody paid the fee for wait for Ethereum's fees to
   * fall, and the copy fee is the rest (and a quarter more).
   */
  freeCopyUsdc: bigint;
};

/** What the bot needs to keep itself going: its float, its gas, and where to swap and bridge. */
export type Treasury = {
  enabled: boolean; // TREASURY: buy its own gas, bring buyers' payments home, settle with the payments wallet
  floatUsdc: bigint; // FLOAT_USDC: the USDC it keeps on PulseChain, to buy gas with (and, with FILL, for orders)
  plsLow: bigint; // PLS_LOW: below this much PLS (in wei), it buys more
  plsBuyUsdc: bigint; // PLS_BUY_USDC: how much USDC of PLS it buys at a time
  ethLow: bigint; // ETH_LOW: below this much ETH (in wei), it buys more
  ethBuyUsdc: bigint; // ETH_BUY_USDC: how much USDC of ETH it buys at a time
  ethBuyMaxUsdc: bigint; // ETH_BUY_MAX_USDC: the most one ETH purchase spends, when gas is high
  /**
   * COPY_NOW_ETH: while the copy fee is on, the ETH it keeps for paid copies, bought while Ethereum
   * is cheap, so someone can pay to copy a name at once while Ethereum is busy. Busier than that
   * covers, owners copy theirs themselves on Ethereum (paying its fee in ETH) or wait for it free.
   */
  copyNowEth: bigint;
  ethereumUsdc: Address; // USDC on Ethereum (or Sepolia): what orders are paid in
  homeBridge: Address; // the official bridge's token contract on PulseChain
  foreignBridge: Address; // ... and on Ethereum
  wpls: Address;
  pulsexRouters: Address[];
  weth: Address;
  uniswapRouter: Address;
};

/** What each network uses unless the .env says otherwise (the same addresses as script/Addresses.sol). */
export const NETWORK_DEFAULTS: Record<
  Network,
  {
    pulsechainRpcUrl: string;
    ethereumRpcUrl: string;
    homeAmb: string;
    foreignAmb: string;
    pulsechainUsdc?: string;
    ethereumUsdc: string;
    homeBridge: string;
    foreignBridge: string;
    wpls: string;
    pulsexRouters: string[];
    weth: string;
    uniswapRouter: string;
    floatUsdc: string;
    plsLow: string;
    plsBuyUsdc: string;
    ethLow: string;
    ethBuyUsdc: string;
    ethBuyMaxUsdc: string;
    copyNowEth: string;
  }
> = {
  // Checked on-chain on 8 November 2026.
  mainnet: {
    pulsechainRpcUrl: "https://rpc.pulsechain.com",
    ethereumRpcUrl: "https://ethereum-rpc.publicnode.com",
    homeAmb: "0x6ef79FD6f9f840264332884240539Ed7A2dA8b2b",
    foreignAmb: "0xd0764FAe29E0a6a96fF685f71CfC685456D5636c",
    pulsechainUsdc: "0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07", // USDC bridged from Ethereum
    ethereumUsdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    homeBridge: "0x4fD0aaa7506f3d9cB8274bdB946Ec42A1b8751Ef", // free from Ethereum; 0.3% to Ethereum
    foreignBridge: "0x1715a3E4A142d8b698131108995174F37aEBA10D",
    wpls: "0xA1077a294dDE1B09bB078844df40758a5D0f9a27",
    pulsexRouters: ["0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02", "0x165C3410fC91EF562C50559f7d2289fEbed552d9"],
    weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    uniswapRouter: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    floatUsdc: "20", // a working balance for buying gas; with FILL=true, it pays for orders too
    plsLow: "200000", // about $1 on 8 November 2026
    plsBuyUsdc: "2",
    ethLow: "0.003", // about 80 copies of names at 10 November 2026's gas prices
    ethBuyUsdc: "15",
    ethBuyMaxUsdc: "100", // when gas is high, it buys what the next copies need, up to this at a time
    copyNowEth: "0.02", // about $42: copying at once offered up to about 7 to 10 gwei, twice that just after a top-up
  },
  testnet: {
    pulsechainRpcUrl: "https://rpc.v4.testnet.pulsechain.com",
    ethereumRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    homeAmb: "0xf902DE27606cd3A7F66695c77487769Ff96211fE",
    foreignAmb: "0x67e190aaF39b9E05b162A78ab94189446077C694",
    // No default: "USDC from Sepolia" exists once someone bridges it. Step 1 prints it as PULSECHAIN_USDC.
    ethereumUsdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    homeBridge: "0x6B08a50865aDeCe6e3869D9AfbB316d0a0436B6c",
    foreignBridge: "0x546e37DAA15cdb82fd1a717E5dEEa4AF08D4349A",
    wpls: "0x70499adEBB11Efd915E3b69E700c331778628707",
    pulsexRouters: ["0xDaE9dd3d1A52CfCe9d5F2fAC7fDe164D500E50f7", "0x636f6407B90661b73b1C0F7e24F4C79f624d0738"],
    weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    uniswapRouter: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3",
    floatUsdc: "20",
    plsLow: "1",
    plsBuyUsdc: "1",
    ethLow: "0.002",
    ethBuyUsdc: "2",
    ethBuyMaxUsdc: "10",
    copyNowEth: "0.002",
  },
};

/** "12.5" with `decimals` decimals, as a whole number of the smallest unit. */
export function decimal(value: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error(`"${value}" is not a number`);
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name} is not set (see bot/.env.example)`);
    return value;
  };
  const optional = (name: string): string | undefined => env[name]?.trim() || undefined;
  const address = (name: string, fallback?: string): Address => getAddress(optional(name) ?? fallback ?? required(name));
  const key = (name: string): Hex => {
    const value = required(name);
    const hex = (value.startsWith("0x") ? value : `0x${value}`) as Hex;
    if (!isHex(hex) || hex.length !== 66) throw new Error(`${name} must be 32 bytes of hex`);
    return hex;
  };
  const flag = (name: string, fallback = true): boolean => {
    const value = optional(name)?.toLowerCase();
    if (value === undefined) return fallback;
    if (["true", "1", "yes", "on"].includes(value)) return true;
    if (["false", "0", "no", "off"].includes(value)) return false;
    throw new Error(`${name} must be true or false, not "${value}"`);
  };
  const block = (name: string): bigint | undefined => {
    const value = optional(name);
    return value === undefined ? undefined : BigInt(value);
  };
  const usdc = (value: string): bigint => decimal(value, 6);
  const coins = (value: string): bigint => decimal(value, 18);

  const networkName = (optional("NETWORK") ?? "mainnet").toLowerCase();
  if (networkName !== "mainnet" && networkName !== "testnet") throw new Error("NETWORK must be mainnet or testnet");
  const network: Network = networkName;
  const defaults = NETWORK_DEFAULTS[network];

  const botPrivateKey = key("BOT_PRIVATE_KEY");
  const ownEncryptionKey = optional("BOT_ENCRYPTION_SECRET_KEY") !== undefined;
  // Railway sets its RAILWAY_ variables in every deployment, and RAILWAY_VOLUME_MOUNT_PATH when a
  // volume is attached: the bot keeps its state there, so it survives restarts and redeploys.
  const onRailway = ["RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID", "RAILWAY_ENVIRONMENT_ID", "RAILWAY_ENVIRONMENT_NAME"].some(
    (name) => optional(name) !== undefined,
  );
  const railway = onRailway ? { volume: optional("RAILWAY_VOLUME_MOUNT_PATH") } : undefined;

  return {
    network,
    pulsechainRpcUrl: optional("PULSECHAIN_RPC_URL") ?? defaults.pulsechainRpcUrl,
    ethereumRpcUrl: optional("ETHEREUM_RPC_URL") ?? defaults.ethereumRpcUrl,
    botPrivateKey,
    encryptionSecretKey: ownEncryptionKey ? key("BOT_ENCRYPTION_SECRET_KEY") : encryptionSecretKeyFrom(botPrivateKey),
    encryptionKeyFromWallet: !ownEncryptionKey,
    registrar: address("PULSECHAIN_REGISTRAR"),
    hexRegistry: address("PULSECHAIN_HEX_REGISTRY"),
    orderFiller: address("PULSECHAIN_ORDER_FILLER"),
    mirrorSync: address("PULSECHAIN_MIRROR_SYNC"),
    pulsechainUsdc: address("PULSECHAIN_USDC", defaults.pulsechainUsdc),
    homeAmb: address("PULSECHAIN_AMB", defaults.homeAmb),
    checkout: optional("PULSECHAIN_CHECKOUT") === undefined ? undefined : address("PULSECHAIN_CHECKOUT"),
    orderBook: address("ETHEREUM_ORDER_BOOK"),
    mirrorRegistrar: address("ETHEREUM_MIRROR_REGISTRAR"),
    foreignAmb: address("ETHEREUM_AMB", defaults.foreignAmb),
    treasury: {
      enabled: flag("TREASURY"),
      floatUsdc: usdc(optional("FLOAT_USDC") ?? defaults.floatUsdc),
      plsLow: coins(optional("PLS_LOW") ?? defaults.plsLow),
      plsBuyUsdc: usdc(optional("PLS_BUY_USDC") ?? defaults.plsBuyUsdc),
      ethLow: coins(optional("ETH_LOW") ?? defaults.ethLow),
      ethBuyUsdc: usdc(optional("ETH_BUY_USDC") ?? defaults.ethBuyUsdc),
      ethBuyMaxUsdc: usdc(optional("ETH_BUY_MAX_USDC") ?? defaults.ethBuyMaxUsdc),
      copyNowEth: coins(optional("COPY_NOW_ETH") ?? defaults.copyNowEth),
      ethereumUsdc: address("ETHEREUM_USDC", defaults.ethereumUsdc),
      homeBridge: address("PULSECHAIN_TOKEN_BRIDGE", defaults.homeBridge),
      foreignBridge: address("ETHEREUM_TOKEN_BRIDGE", defaults.foreignBridge),
      wpls: getAddress(defaults.wpls),
      pulsexRouters: defaults.pulsexRouters.map((a) => getAddress(a)),
      weth: getAddress(defaults.weth),
      uniswapRouter: getAddress(defaults.uniswapRouter),
    },
    minFee: usdc(optional("MIN_FEE_USDC") ?? "0.25"),
    ethereumConfirmations: BigInt(optional("ETHEREUM_CONFIRMATIONS") ?? "2"),
    pollSeconds: Number(optional("POLL_SECONDS") ?? "5"),
    stateFile: optional("STATE_FILE") ?? (railway?.volume ? join(railway.volume, "state.json") : "./state.json"),
    railway,
    startBlockEthereum: block("START_BLOCK_ETHEREUM"),
    startBlockPulseChain: block("START_BLOCK_PULSECHAIN"),
    fill: flag("FILL", false),
    relay: flag("RELAY"),
    sync: flag("SYNC"),
    relayLimits: {
      // About 1,100 copies a day at 10 November 2026's gas prices (a copy used about 300,000 gas),
      // and still a few at times of very high gas; beyond it, copies wait for the next day.
      dailyEth: coins(optional("RELAY_DAILY_ETH") ?? "0.02"),
      nameCooldown: BigInt(Number(optional("RELAY_NAME_COOLDOWN_MINUTES") ?? "60") * 60),
      freeCopyUsdc: usdc(optional("COPY_FREE_USDC") ?? "2"),
    },
  };
}
