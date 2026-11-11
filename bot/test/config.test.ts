import assert from "node:assert/strict";
import { test } from "node:test";

import { createPublicClient, custom, parseGwei } from "viem";

import { loadConfig } from "../src/config.ts";
import { CHAINS } from "../src/context.ts";
import { encryptionSecretKeyFrom } from "../src/reveal.ts";

const KEY = `0x${"11".repeat(32)}` as const;
const ADDRESS = "0x000000000000000000000000000000000000dEaD";
const DEPLOYED = {
  BOT_PRIVATE_KEY: KEY,
  BOT_ENCRYPTION_SECRET_KEY: KEY,
  PULSECHAIN_REGISTRAR: ADDRESS,
  PULSECHAIN_HEX_REGISTRY: ADDRESS,
  PULSECHAIN_ORDER_FILLER: ADDRESS,
  PULSECHAIN_MIRROR_SYNC: ADDRESS,
  ETHEREUM_ORDER_BOOK: ADDRESS,
  ETHEREUM_MIRROR_REGISTRAR: ADDRESS,
};

test("mainnet is the default, with the live bridge and USDC bridged from Ethereum", () => {
  const config = loadConfig({ ...DEPLOYED });
  assert.equal(config.network, "mainnet");
  assert.equal(config.pulsechainRpcUrl, "https://rpc.pulsechain.com");
  assert.equal(config.homeAmb, "0x6ef79FD6f9f840264332884240539Ed7A2dA8b2b");
  assert.equal(config.foreignAmb, "0xd0764FAe29E0a6a96fF685f71CfC685456D5636c");
  assert.equal(config.pulsechainUsdc, "0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07");
  assert.equal(CHAINS.mainnet.pulsechain.id, 369);
  assert.equal(CHAINS.mainnet.ethereum.id, 1);
});

test("the testnets use PulseChain Testnet v4, Sepolia and the testnet bridge", () => {
  const config = loadConfig({ ...DEPLOYED, NETWORK: "testnet", PULSECHAIN_USDC: ADDRESS });
  assert.equal(config.network, "testnet");
  assert.equal(config.pulsechainRpcUrl, "https://rpc.v4.testnet.pulsechain.com");
  assert.equal(config.ethereumRpcUrl, "https://ethereum-sepolia-rpc.publicnode.com");
  assert.equal(config.homeAmb, "0xf902DE27606cd3A7F66695c77487769Ff96211fE");
  assert.equal(config.foreignAmb, "0x67e190aaF39b9E05b162A78ab94189446077C694");
  assert.equal(CHAINS.testnet.pulsechain.id, 943);
  assert.equal(CHAINS.testnet.ethereum.id, 11155111);
  // The testnet bridge's token contracts, and a smaller float.
  assert.equal(config.treasury.homeBridge, "0x6B08a50865aDeCe6e3869D9AfbB316d0a0436B6c");
  assert.equal(config.treasury.foreignBridge, "0x546e37DAA15cdb82fd1a717E5dEEa4AF08D4349A");
  assert.equal(config.treasury.ethereumUsdc, "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238");
  assert.equal(config.treasury.floatUsdc, 20_000_000n);
});

test("on the testnets the bot sets its own tip, and viem uses it", async () => {
  const base = 7n; // PulseChain Testnet v4's base fee is a few wei
  const rpc = custom({
    async request({ method }: { method: string }) {
      if (method === "eth_getBlockByNumber") return { baseFeePerGas: `0x${base.toString(16)}` };
      if (method === "eth_maxPriorityFeePerGas") return `0x${parseGwei("3385").toString(16)}`; // what it suggests
      throw new Error(`unexpected ${method}`);
    },
  });
  const testnet = createPublicClient({ chain: CHAINS.testnet.pulsechain, transport: rpc });
  const fees = await testnet.estimateFeesPerGas();
  assert.equal(fees.maxPriorityFeePerGas, parseGwei("1"));
  assert.ok(fees.maxFeePerGas < parseGwei("2"));
  assert.equal(CHAINS.testnet.ethereum.fees.maxPriorityFeePerGas, parseGwei("0.01"));

  // Mainnet takes the chain's own suggestion.
  const live = createPublicClient({ chain: CHAINS.mainnet.pulsechain, transport: rpc });
  assert.equal((await live.estimateFeesPerGas()).maxPriorityFeePerGas, parseGwei("3385"));
});

test("on the testnets, USDC must come from step 1's summary", () => {
  assert.throws(() => loadConfig({ ...DEPLOYED, NETWORK: "testnet" }), /PULSECHAIN_USDC is not set/);
});

test("an unknown network is refused", () => {
  assert.throws(() => loadConfig({ ...DEPLOYED, NETWORK: "goerli" }), /NETWORK must be mainnet or testnet/);
});

test("without BOT_ENCRYPTION_SECRET_KEY, the order key is made from the wallet key", () => {
  const { BOT_ENCRYPTION_SECRET_KEY: _, ...withoutKey } = DEPLOYED;
  const config = loadConfig(withoutKey);
  assert.equal(config.encryptionKeyFromWallet, true);
  assert.equal(config.encryptionSecretKey, encryptionSecretKeyFrom(KEY));
  assert.notEqual(config.encryptionSecretKey, KEY, "never the wallet key itself");
  assert.equal(loadConfig(withoutKey).encryptionSecretKey, config.encryptionSecretKey, "the same every time it starts");
  const otherWallet = loadConfig({ ...withoutKey, BOT_PRIVATE_KEY: `0x${"22".repeat(32)}` });
  assert.notEqual(otherWallet.encryptionSecretKey, config.encryptionSecretKey, "a new wallet, a new key");
});

test("BOT_ENCRYPTION_SECRET_KEY is used when it is set", () => {
  const own = `0x${"33".repeat(32)}`;
  const config = loadConfig({ ...DEPLOYED, BOT_ENCRYPTION_SECRET_KEY: own });
  assert.equal(config.encryptionKeyFromWallet, false);
  assert.equal(config.encryptionSecretKey, own);
  assert.throws(() => loadConfig({ ...DEPLOYED, BOT_ENCRYPTION_SECRET_KEY: "0x1234" }), /must be 32 bytes of hex/);
});

test("on Railway, the bot remembers its place on the attached volume", () => {
  assert.equal(loadConfig({ ...DEPLOYED }).stateFile, "./state.json");
  assert.equal(loadConfig({ ...DEPLOYED }).railway, undefined);

  const railway = { RAILWAY_PROJECT_ID: "p", RAILWAY_SERVICE_ID: "s", RAILWAY_ENVIRONMENT_ID: "e" };
  const withVolume = loadConfig({ ...DEPLOYED, ...railway, RAILWAY_VOLUME_MOUNT_PATH: "/data" });
  assert.equal(withVolume.stateFile, "/data/state.json");
  assert.deepEqual(withVolume.railway, { volume: "/data" });

  const noVolume = loadConfig({ ...DEPLOYED, ...railway });
  assert.equal(noVolume.stateFile, "./state.json");
  assert.deepEqual(noVolume.railway, { volume: undefined }, "so the bot can warn that it will forget");

  assert.equal(loadConfig({ ...DEPLOYED, ...railway, RAILWAY_VOLUME_MOUNT_PATH: "/data", STATE_FILE: "/data/testnet.json" }).stateFile, "/data/testnet.json");
});

test("switches read as on or off, and anything unclear is refused rather than guessed", () => {
  for (const off of ["false", "FALSE", "0", "no", "off"]) assert.equal(loadConfig({ ...DEPLOYED, FILL: off }).fill, false, off);
  for (const on of ["true", "1", "yes", "on"]) assert.equal(loadConfig({ ...DEPLOYED, FILL: on }).fill, true, on);
  assert.equal(loadConfig({ ...DEPLOYED }).fill, false, "filling is off unless asked for");
  assert.equal(loadConfig({ ...DEPLOYED, RELAY: "0" }).relay, false);
  assert.throws(() => loadConfig({ ...DEPLOYED, FILL: "maybe" }), /FILL must be true or false/);
});

test("copying names keeps to a daily ETH limit and to one copy of a name an hour, unless changed", () => {
  const limits = loadConfig({ ...DEPLOYED }).relayLimits;
  assert.equal(limits.dailyEth, 20_000_000_000_000_000n); // 0.02 ETH
  assert.equal(limits.nameCooldown, 3600n);
  const custom = loadConfig({ ...DEPLOYED, RELAY_DAILY_ETH: "0.1", RELAY_NAME_COOLDOWN_MINUTES: "15" }).relayLimits;
  assert.equal(custom.dailyEth, 100_000_000_000_000_000n);
  assert.equal(custom.nameCooldown, 900n);
});

test("the copy fee: on with the checkout's address, and the project pays up to $2 a copy unless changed", () => {
  const without = loadConfig({ ...DEPLOYED });
  assert.equal(without.checkout, undefined, "without PULSECHAIN_CHECKOUT, every copy stays free");
  assert.equal(without.relayLimits.freeCopyUsdc, 2_000_000n);
  const withIt = loadConfig({ ...DEPLOYED, PULSECHAIN_CHECKOUT: ADDRESS.toLowerCase(), COPY_FREE_USDC: "1.5" });
  assert.equal(withIt.checkout, ADDRESS);
  assert.equal(withIt.relayLimits.freeCopyUsdc, 1_500_000n);
  assert.throws(() => loadConfig({ ...DEPLOYED, PULSECHAIN_CHECKOUT: "0x1234" }), /Address/);
});
