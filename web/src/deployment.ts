// Where .hex is deployed, for the website and the app. Fill each network in from the deploy run
// summaries and the public key the bot prints when it starts: deploy/website/README.md has a block
// to paste for each. Until a network is filled in, the homepage shows no live numbers and the app
// searches and prices names but can't buy them.

export type Network = "mainnet" | "testnet";
type Address = `0x${string}`;

export interface Deployment {
  /**
   * The day .hex launched on this network, as "YYYY-MM-DD". The referral launch offer (referrers
   * earn 10% of what the buyers they bring pay) runs for 58 days from it: src/lib/referral.ts.
   */
  launchDate?: string;
  pulsechain: {
    /** A PulseChain RPC that keeps the chain's whole history. */
    rpc: string;
    /** PULSECHAIN_HEX_REGISTRY: the .hex registry, where names live. */
    registry: Address;
    /** PULSECHAIN_REGISTRAR: takes commitments and sells names. */
    registrar: Address;
    /** PULSECHAIN_CHECKOUT (AnyTokenCheckout): buys and renews with any token, and takes the Ethereum copy fee. */
    checkout: Address;
    /** PULSECHAIN_USDC: what names are priced and paid in. */
    usdc: Address;
    /** START_BLOCK_PULSECHAIN: the block step 1 was deployed in. */
    startBlock: number;
  };
  ethereum: {
    rpc: string;
    /** ETHEREUM_ORDER_BOOK: orders placed from Ethereum. Only for buying from Ethereum, which is switched off. */
    orderBook: Address;
    /** USDC on Ethereum (or Sepolia). */
    usdc: Address;
  };
  bot: {
    /**
     * The public key the bot prints when it starts ("for the website"): orders from Ethereum are sealed
     * to it. Only for buying from Ethereum, which is switched off; kept ready in case that changes.
     */
    publicKey: Address;
    /** The bot's least fee per order from Ethereum, in dollars (MIN_FEE_USDC). Only for buying from Ethereum. */
    minFee: number;
    /**
     * The bot's wallet, the address it prints when it starts ("hex-names bot 0x…"). The payments
     * page shows its balances, and the budget the payments wallet allows it.
     */
    address?: Address;
  };
}

export const DEPLOYMENTS: Record<Network, Deployment | null> = {
  mainnet: null,
    testnet: {
    launchDate: "2026-11-10", // the day you deployed on the testnets: the referral offer counts from it
    pulsechain: {
      rpc: "https://rpc.v4.testnet.pulsechain.com",
      registry: "0xe8E68B1B62363bD1fBb0327F8E6f9aA1Cf8Ed181", // PULSECHAIN_HEX_REGISTRY, from step 1
      registrar: "0xF49f539c4Ed118E5C00e66f62b3776397c4f7Ae1", // PULSECHAIN_REGISTRAR, from step 1
      checkout: "0xb67d2bAF8c467Cb88F1a82Fbf057F017aab92fA7", // AnyTokenCheckout, from step 1
      usdc: "0x759CB81dEB2520f67F1074A4535e710aA9c3132B", // PULSECHAIN_USDC, from step 1
      startBlock: 25863653, // START_BLOCK_PULSECHAIN, from step 1: a number, without quotes
    },
    ethereum: {
      rpc: "https://ethereum-sepolia-rpc.publicnode.com",
      orderBook: "0x98C52e936a0aFF545F6845D69D087840a21D03D3", // ETHEREUM_ORDER_BOOK, from step 2 (only for buying from Ethereum)
      usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Circle's test USDC on Sepolia
    },
    bot: {
      publicKey: "0x04dbfd00ca7435d8cd93330105c880eed8b32fe1cd662593ee7f9452bb775212", // from the bot's log on Railway (only for buying from Ethereum)
      minFee: 0.25, // the bot's fee per order, in dollars (only for buying from Ethereum)
      address: "0xcD8ACE5f53A4efF15F82F16013Fd43ddEf9a8755", // the bot's wallet: the first 0x… in its log
    },
  },
};
