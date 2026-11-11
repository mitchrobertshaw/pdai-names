// Clients for both chains and the bot's wallet.

import { type Account, type Chain, type PublicClient, type Transport, type WalletClient, createPublicClient, createWalletClient, http, parseGwei } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, pulsechain, pulsechainV4, sepolia } from "viem/chains";

import type { Config } from "./config.ts";
import { encryptionKeyPair } from "./reveal.ts";
import type { State } from "./state.ts";

export type Context = {
  config: Config;
  state: State;
  account: Account;
  encryption: { publicKey: `0x${string}`; secretKey: Uint8Array };
  pls: PublicClient<Transport, Chain>;
  plsWallet: WalletClient<Transport, Chain, Account>;
  eth: PublicClient<Transport, Chain>;
  ethWallet: WalletClient<Transport, Chain, Account>;
  log: (message: string) => void;
  /** Writes the state to its file now, as soon as a transaction it must not lose track of is sent. */
  save: () => void;
};

/**
 * The two chains of each network: PulseChain and Ethereum, or PulseChain Testnet v4 and Sepolia.
 * On the testnets the bot sets its own tip. PulseChain Testnet v4 suggests about 3,385 gwei, which
 * would cost nearly 2 tPLS for each order filled, though its validators take anything from
 * 0.001 gwei. Sepolia takes tiny tips too.
 */
export const CHAINS = {
  mainnet: { pulsechain, ethereum: mainnet },
  testnet: {
    pulsechain: { ...pulsechainV4, fees: { maxPriorityFeePerGas: parseGwei("1") } },
    ethereum: { ...sepolia, fees: { maxPriorityFeePerGas: parseGwei("0.01") } },
  },
} as const;

export function createContext(config: Config, state: State): Context {
  const account = privateKeyToAccount(config.botPrivateKey);
  const chains = CHAINS[config.network];
  const plsTransport = http(config.pulsechainRpcUrl, { retryCount: 3 });
  const ethTransport = http(config.ethereumRpcUrl, { retryCount: 3 });
  return {
    config,
    state,
    account,
    encryption: encryptionKeyPair(config.encryptionSecretKey),
    pls: createPublicClient({ chain: chains.pulsechain, transport: plsTransport }),
    plsWallet: createWalletClient({ account, chain: chains.pulsechain, transport: plsTransport }),
    eth: createPublicClient({ chain: chains.ethereum, transport: ethTransport }),
    ethWallet: createWalletClient({ account, chain: chains.ethereum, transport: ethTransport }),
    log: (message) => console.log(`${new Date().toISOString()} ${message}`),
    save: () => {},
  };
}
