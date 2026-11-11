// Where .pdai is deployed, for the website and the app. Fill each network in from its deploy run
// summary: deploy/website/README.md has a block to paste for each. Until a network is filled in, the
// homepage shows no live numbers and the app searches and prices names but can't buy them.

export type Network = "mainnet" | "testnet";
type Address = `0x${string}`;

export interface Deployment {
  /**
   * The day .pdai launched on this network, as "YYYY-MM-DD". The referral launch offer (referrers
   * earn 10% of what the buyers they bring pay) runs for 58 days from it: src/lib/referral.ts.
   */
  launchDate?: string;
  pulsechain: {
    /** A PulseChain RPC that keeps the chain's whole history. */
    rpc: string;
    /** PDAI_REGISTRY: the .pdai registry, where names live. */
    registry: Address;
    /** REGISTRAR: takes commitments and sells names. */
    registrar: Address;
    /** CHECKOUT (AnyTokenCheckout): buys and renews with any token or PLS. */
    checkout: Address;
    /** USDC: what names are priced and paid in. */
    usdc: Address;
    /** START_BLOCK: the block the contracts were deployed in. */
    startBlock: number;
  };
}

export const DEPLOYMENTS: Record<Network, Deployment | null> = {
  mainnet: null,
  testnet: null,
};
