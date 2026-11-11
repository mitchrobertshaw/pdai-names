// The .hex bot. Run with: npm start (settings in .env or the environment; see .env.example).

import { formatEther } from "viem";

import { loadConfig } from "./config.ts";
import { createContext } from "./context.ts";
import { runCopyFee } from "./copyfee.ts";
import { processOrders, scanOrders, short, usdc } from "./orders.ts";
import { claimMessages, scanMessages } from "./relay.ts";
import { runTreasury } from "./treasury.ts";
import { type State, loadState, saveState } from "./state.ts";
import { syncNames } from "./sync.ts";

const config = loadConfig();

let state = loadState(config.stateFile);
if (!state) {
  const ctx = createContext(config, {} as State);
  const [eth, pls] = await Promise.all([ctx.eth.getBlockNumber(), ctx.pls.getBlockNumber()]);
  state = {
    ethereumBlock: ((config.startBlockEthereum ?? eth) - 1n).toString(),
    pulsechainAmbBlock: ((config.startBlockPulseChain ?? pls) - 1n).toString(),
    pulsechainRegistryBlock: ((config.startBlockPulseChain ?? pls) - 1n).toString(),
    orders: {},
    messages: {},
  };
}
const ctx = createContext(config, state);
const saved = state;
ctx.save = () => saveState(config.stateFile, saved);

ctx.log(`hex-names bot ${ctx.account.address} on ${config.network === "testnet" ? "the testnets (PulseChain Testnet v4 + Sepolia)" : "mainnet (PulseChain + Ethereum)"}`);
ctx.log(
  config.fill
    ? "  orders from Ethereum repay this wallet on Ethereum; it sends the money home to its float on PulseChain"
    : "  buying from Ethereum is off (FILL=false): names are bought on PulseChain",
);
ctx.log(
  `  order encryption public key, for the website (bot.publicKey in web/src/deployment.ts): ${ctx.encryption.publicKey}` +
    (config.encryptionKeyFromWallet ? " (made from the bot's wallet key)" : " (from BOT_ENCRYPTION_SECRET_KEY)"),
);
ctx.log(
  `  fill orders: ${config.fill}, claim bridge messages: ${config.relay}, copy name changes: ${config.sync}, ` +
    `pay its own gas: ${config.treasury.enabled}`,
);
ctx.log(
  config.checkout
    ? `  copy fee: kept up to date on ${config.checkout} once the admin chooses this bot as the copy bot; ` +
        `the project pays up to ${usdc(config.relayLimits.freeCopyUsdc)} USDC a copy, and it keeps ` +
        `${formatEther(config.treasury.copyNowEth)} ETH for copies paid for (COPY_NOW_ETH)`
    : "  copy fee: off (PULSECHAIN_CHECKOUT not set), so every copy is free",
);
ctx.log(`  remembers its place in ${config.stateFile}`);
if (config.railway && !config.railway.volume) {
  ctx.log(
    "  WARNING: no volume is attached on Railway, so the bot forgets its place every time it restarts and reads " +
      "everything again from the start blocks. Attach a volume to this service, mounted at /data.",
  );
}

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    ctx.log(`${signal}: saving and stopping`);
  });
}

async function step(name: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    ctx.log(`${name}: ${short(error)} (will retry)`);
  }
}

while (!stopping) {
  if (config.fill) {
    await step("orders", async () => {
      await scanOrders(ctx);
      await processOrders(ctx);
    });
  }
  if (config.relay) {
    // First, so the claims below know whether the copy fee is on, and who the admin is.
    await step("copy fee", () => runCopyFee(ctx));
    // Apart, so a scan that fails (a busy RPC, say) doesn't hold up claiming what it already found.
    await step("bridge", () => scanMessages(ctx));
    await step("bridge claims", () => claimMessages(ctx));
  }
  if (config.sync) await step("sync", () => syncNames(ctx));
  if (config.treasury.enabled) await step("treasury", () => runTreasury(ctx));
  saveState(config.stateFile, state);
  for (let waited = 0; waited < config.pollSeconds * 10 && !stopping; waited++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
saveState(config.stateFile, state);
