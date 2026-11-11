// The network this build of the app works on (VITE_NETWORK), its deployment, and how to reach it.

import { type Chain, type PublicClient, createPublicClient, http } from "viem";
import { pulsechain, pulsechainV4 } from "viem/chains";

import { DEPLOYMENTS, type Deployment } from "../deployment";
import { PAY_CHAIN, type PayChain, TESTNET_PAY_CHAIN } from "../lib/tokens";
import { NETWORK } from "../site";

export const network = NETWORK;

/** The contracts, once deployed. Until then the app searches and prices names but can't buy them. */
export const deployment: Deployment | null = DEPLOYMENTS[NETWORK];

/** PulseChain, or its testnet: where names live, and are bought and managed. */
export const CHAIN: Chain = NETWORK === "testnet" ? pulsechainV4 : pulsechain;

/** What the checkout offers to pay with. */
export const PAY: PayChain = NETWORK === "testnet" ? TESTNET_PAY_CHAIN : PAY_CHAIN;

const rpc = deployment?.pulsechain.rpc ?? PAY.rpc;

/** For reading the chain, whatever wallet is connected. */
export const client = createPublicClient({ chain: CHAIN, transport: http(rpc) }) as PublicClient;

/** A transaction on the chain's explorer. */
export function txUrl(hash: string): string {
  return `${CHAIN.blockExplorers?.default.url}/tx/${hash}`;
}

export function addressUrl(address: string): string {
  return `${CHAIN.blockExplorers?.default.url}/address/${address}`;
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

/** What wallets need to add PulseChain if they don't know it, its testnet especially. */
export function addChainParams() {
  return {
    chainId: `0x${CHAIN.id.toString(16)}`,
    chainName: CHAIN.name,
    nativeCurrency: CHAIN.nativeCurrency,
    // The chain's own public RPC (rpc.pulsechain.com), as the homepage's "Add PulseChain" gives
    // wallets: not the archive RPC the app reads history from.
    rpcUrls: [CHAIN.rpcUrls.default.http[0] ?? rpc],
    blockExplorerUrls: CHAIN.blockExplorers ? [CHAIN.blockExplorers.default.url] : [],
  };
}
