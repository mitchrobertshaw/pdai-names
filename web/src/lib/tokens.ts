// The tokens the checkout offers on PulseChain, where names are bought, and the routes the contracts
// swap them along on PulseX (as AnyTokenCheckout and its fork tests use). Ethereum's entry is for
// reading it; buying from Ethereum (HexOrderBook, on Uniswap V2) is switched off.
import { ETHEREUM_ORDER_FEE } from "./names";

export type ChainKey = "pulsechain" | "ethereum";

export interface PayToken {
  symbol: string;
  /** What the page calls it, when the symbol alone could mean another token. */
  label?: string;
  /** Shown when it's picked. */
  note?: string;
  decimals: number;
  /** The chain's own coin (PLS or ETH), sent with the transaction rather than approved. */
  native?: boolean;
  /** The swap from this token to USDC, or null for USDC itself. */
  path: string[] | null;
}

export interface PayChain {
  key: ChainKey;
  name: string;
  /** A public RPC that answers browsers, for live quotes. */
  rpc: string;
  /**
   * The exchanges the checkout may swap on. Each payment asks them all and uses whichever needs the
   * least: pools differ in depth (in November 2026, $640 of PLS cost 6.6% more on PulseX V2 than on
   * V1, while HEX from Ethereum was cheaper on V2), and they change over time.
   */
  routers: string[];
  dex: string;
  /** Dollars added to the price when paying from this chain. */
  fee: number;
  network: string;
  tokens: PayToken[];
}

const PULSECHAIN = {
  WPLS: "0xA1077a294dDE1B09bB078844df40758a5D0f9a27",
  // USDC bridged from Ethereum ("USD Coin from Ethereum"): there's no native USDC on PulseChain yet.
  // Not the copy of USDC made when PulseChain forked from Ethereum, which wallets also call USDC.
  USDC: "0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07",
  HEX: "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39",
  PLSX: "0x95B303987A60C71504D99Aa1b13B4DA07b0790ab",
  // Bridged from Ethereum by the official bridge (its bridgedTokenAddress), not the copies made at
  // PulseChain's fork.
  USDT: "0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f",
  DAI: "0xefD766cCb38EaF1dfd701853BFCe31359239F305",
  WETH_FROM_ETHEREUM: "0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C",
  HEX_FROM_ETHEREUM: "0x57fde0a71132198BBeC939B98976993d8D89D225",
  PULSEX_V1: "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02",
  PULSEX_V2: "0x165C3410fC91EF562C50559f7d2289fEbed552d9",
};

const ETHEREUM = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  HEX: "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39",
  UNISWAP_V2: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
};

export const PAY_CHAINS: Record<ChainKey, PayChain> = {
  pulsechain: {
    key: "pulsechain",
    name: "PulseChain",
    rpc: "https://pulsechain-rpc.publicnode.com",
    routers: [PULSECHAIN.PULSEX_V1, PULSECHAIN.PULSEX_V2],
    dex: "PulseX",
    fee: 0,
    network: "A fraction of a cent, in PLS",
    tokens: [
      { symbol: "PLS", decimals: 18, native: true, path: [PULSECHAIN.WPLS, PULSECHAIN.USDC] },
      {
        symbol: "HEX",
        note: "PulseChain\u2019s own HEX. HEX bridged from Ethereum is eHEX.",
        decimals: 8,
        path: [PULSECHAIN.HEX, PULSECHAIN.WPLS, PULSECHAIN.USDC],
      },
      {
        symbol: "eHEX",
        note: "HEX bridged from Ethereum, which your wallet calls \u201cHEX from Ethereum\u201d. Not the HEX made on PulseChain.",
        decimals: 8,
        path: [PULSECHAIN.HEX_FROM_ETHEREUM, PULSECHAIN.WPLS, PULSECHAIN.USDC],
      },
      { symbol: "PLSX", decimals: 18, path: [PULSECHAIN.PLSX, PULSECHAIN.WPLS, PULSECHAIN.USDC] },
      {
        symbol: "USDC",
        label: "USDC from Ethereum",
        note: "USDC bridged from Ethereum, which your wallet calls \u201cUSD Coin from Ethereum\u201d. There\u2019s no native USDC on PulseChain yet, and the USDC copied when PulseChain launched is a different token.",
        decimals: 6,
        path: null,
      },
      // Through WPLS: PulseX's USDT/USDC pools held under $35 a side on 11 November 2026, and its
      // USDT/WPLS pool on V1 about $225k. Paying cost about 0.6% more than the price on $10 and 1.1%
      // on $640, nearly all of it PulseX's fee of 0.29% a swap.
      {
        symbol: "USDT",
        label: "USDT from Ethereum",
        note: "Tether bridged from Ethereum, which your wallet calls “Tether USD from Ethereum”. The USDT copied when PulseChain launched is a different token.",
        decimals: 6,
        path: [PULSECHAIN.USDT, PULSECHAIN.WPLS, PULSECHAIN.USDC],
      },
      // Straight into USDC: PulseX's DAI/USDC pools held about $100k a side on V1 and $87k on V2 on
      // 11 November 2026. Paying cost about 0.5% more than the price on $10 and 1.1% on $640: the
      // swap fee, and DAI trading a fraction of a cent under USDC there.
      {
        symbol: "DAI",
        label: "DAI from Ethereum",
        note: "Dai bridged from Ethereum, which your wallet calls “Dai Stablecoin from Ethereum”. The DAI copied when PulseChain launched (pDAI) is a different token.",
        decimals: 18,
        path: [PULSECHAIN.DAI, PULSECHAIN.USDC],
      },
      // Through WPLS. On 8 November 2026 the swap lost WETH about 0.2% on $100; eHEX's pools are
      // smaller, so it lost about 1% on $100 and 7% on $640.
      {
        symbol: "WETH",
        label: "WETH from Ethereum",
        note: "Ether bridged from Ethereum, which your wallet calls \u201cWrapped Ether from Ethereum\u201d.",
        decimals: 18,
        path: [PULSECHAIN.WETH_FROM_ETHEREUM, PULSECHAIN.WPLS, PULSECHAIN.USDC],
      },
    ],
  },
  ethereum: {
    key: "ethereum",
    name: "Ethereum",
    rpc: "https://ethereum-rpc.publicnode.com",
    routers: [ETHEREUM.UNISWAP_V2],
    dex: "Uniswap",
    fee: ETHEREUM_ORDER_FEE,
    network: "Set by Ethereum; your wallet shows it before you confirm",
    tokens: [
      { symbol: "ETH", decimals: 18, native: true, path: [ETHEREUM.WETH, ETHEREUM.USDC] },
      { symbol: "USDC", decimals: 6, path: null },
      { symbol: "HEX", decimals: 8, path: [ETHEREUM.HEX, ETHEREUM.WETH, ETHEREUM.USDC] },
    ],
  },
};

// The testnets (script/Addresses.sol): PulseChain Testnet v4, and Sepolia joined to it by the testnet
// bridge. On PulseChain Testnet v4 names are paid for in USDC bridged from Sepolia; PulseX's testnet
// has no pool for it, so that is the only way to pay there.
const SEPOLIA = {
  WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  UNISWAP_V2: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3",
};

export const TESTNET_PAY_CHAINS: Record<ChainKey, PayChain> = {
  pulsechain: {
    key: "pulsechain",
    name: "PulseChain Testnet v4",
    rpc: "https://rpc.v4.testnet.pulsechain.com",
    routers: ["0x636f6407B90661b73b1C0F7e24F4C79f624d0738"],
    dex: "PulseX",
    fee: 0,
    network: "A fraction of a cent, in tPLS",
    tokens: [
      {
        symbol: "USDC",
        label: "USDC from Sepolia",
        note: "Circle\u2019s test USDC, bridged from Sepolia by the testnet bridge.",
        decimals: 6,
        path: null,
      },
    ],
  },
  ethereum: {
    key: "ethereum",
    name: "Sepolia",
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    routers: [SEPOLIA.UNISWAP_V2],
    dex: "Uniswap",
    fee: ETHEREUM_ORDER_FEE,
    network: "Close to nothing, in Sepolia ETH",
    tokens: [
      { symbol: "ETH", decimals: 18, native: true, path: [SEPOLIA.WETH, SEPOLIA.USDC] },
      { symbol: "USDC", decimals: 6, path: null },
    ],
  },
};
