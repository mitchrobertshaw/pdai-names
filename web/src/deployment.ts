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
  mainnet: {
    launchDate: "2026-11-16", // launch day: referrers earn 10% for the 58 days from it
    pulsechain: {
      rpc: "https://rpc.pulsechain.com",
      registry: "0xb672f77087cfC0AE2dDe0379aa48005e7CaE2896", // PDAI_REGISTRY
      registrar: "0x40b5dD0c08aFFbC773ee7A5d32009361B70E54Bd", // REGISTRAR
      checkout: "0x8A4193Da32FF48602e159BdE6697EC69F33A5377", // CHECKOUT
      usdc: "0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07", // USDC bridged from Ethereum (USDC)
      startBlock: 28070212, // START_BLOCK
    },
  },
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
