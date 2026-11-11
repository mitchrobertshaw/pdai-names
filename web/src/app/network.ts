// The network this build of the app works on (VITE_NETWORK), its deployment, and how to reach it.

import { type Chain, type PublicClient, createPublicClient, http } from "viem";
import { mainnet, pulsechain, pulsechainV4, sepolia } from "viem/chains";

import { DEPLOYMENTS, type Deployment } from "../deployment";
import { type ChainKey, PAY_CHAINS, type PayChain, TESTNET_PAY_CHAINS } from "../lib/tokens";
import { NETWORK } from "../site";

export const network = NETWORK;

/** The contracts, once deployed. Until then the app searches and prices names but can't buy them. */
export const deployment: Deployment | null = DEPLOYMENTS[NETWORK];

export const CHAINS: Record<ChainKey, Chain> =
  NETWORK === "testnet" ? { pulsechain: pulsechainV4, ethereum: sepolia } : { pulsechain, ethereum: mainnet };

/** What each chain's checkout offers to pay with. */
export const PAY: Record<ChainKey, PayChain> = NETWORK === "testnet" ? TESTNET_PAY_CHAINS : PAY_CHAINS;

const rpcOf = (key: ChainKey) => deployment?.[key].rpc ?? PAY[key].rpc;

/** For reading the chains, whatever wallet is connected. */
export const clients: Record<ChainKey, PublicClient> = {
  pulsechain: createPublicClient({ chain: CHAINS.pulsechain, transport: http(rpcOf("pulsechain")) }) as PublicClient,
  ethereum: createPublicClient({ chain: CHAINS.ethereum, transport: http(rpcOf("ethereum")) }) as PublicClient,
};

/** A transaction on the chain's explorer. */
export function txUrl(key: ChainKey, hash: string): string {
  return `${CHAINS[key].blockExplorers?.default.url}/tx/${hash}`;
}

export function addressUrl(key: ChainKey, address: string): string {
  return `${CHAINS[key].blockExplorers?.default.url}/address/${address}`;
}

/** Networks a wallet might be on, by chain id, to say which one in plain words. */
const NETWORK_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  56: "BNB Chain",
  137: "Polygon",
  369: "PulseChain",
  943: "PulseChain Testnet v4",
  8453: "Base",
  42161: "Arbitrum",
  11155111: "Sepolia",
};

/** A network's name, from its chain id: "Ethereum", or "network 1234" for one it doesn't know. */
export function chainName(id: number): string {
  return NETWORK_NAMES[id] ?? `network ${id}`;
}

/** What wallets need to add a chain they don't know, PulseChain's testnet especially. */
export function addChainParams(key: ChainKey) {
  const chain = CHAINS[key];
  return {
    chainId: `0x${chain.id.toString(16)}`,
    chainName: chain.name,
    nativeCurrency: chain.nativeCurrency,
    // The chain's own public RPC (rpc.pulsechain.com), as the homepage's "Add PulseChain" gives
    // wallets: not the archive RPC the app reads history from.
    rpcUrls: [chain.rpcUrls.default.http[0] ?? rpcOf(key)],
    blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : [],
  };
}
