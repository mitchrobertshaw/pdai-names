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
  testnet: {
    launchDate: "2026-11-15", // the day .pdai was deployed on the testnet: the referral offer counts from it
    pulsechain: {
      rpc: "https://rpc.v4.testnet.pulsechain.com",
      registry: "0xa7618E0Ca8C1d4602E53Dc82420c7f05be65Beec", // PDAI_REGISTRY
      registrar: "0xD8B50f7304F1d79BB77f1896D84e2889a0bB56d7", // REGISTRAR
      checkout: "0x7beD9d7DD34bbC6f2cb90E2593FA4Ea4eF537530", // CHECKOUT
      usdc: "0x759CB81dEB2520f67F1074A4535e710aA9c3132B", // USDC
      startBlock: 25907566, // START_BLOCK
    },
  },
};
