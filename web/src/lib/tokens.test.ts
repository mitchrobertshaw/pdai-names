// The checkout preview must quote the tokens and routers the contracts are deployed with
// (script/Addresses.sol). On PulseChain that means USDC bridged from Ethereum, never the copy of
// USDC made when PulseChain forked from Ethereum, which wallets also call USDC.
import { describe, expect, it } from "vitest";

import addresses from "../../../script/Addresses.sol?raw";
import { PAY_CHAINS } from "./tokens";

function constantsOf(library: string): Record<string, string> {
  const body = addresses.split(`library ${library}`)[1].split("}")[0];
  const found = body.matchAll(/address internal constant (\w+) = (0x[0-9a-fA-F]{40});/g);
  return Object.fromEntries([...found].map((m) => [m[1], m[2].toLowerCase()]));
}

const pulsechain = constantsOf("PulseChainAddresses");
const ethereum = constantsOf("EthereumAddresses");
const lower = (address: string) => address.toLowerCase();
const pulsexRouters = [pulsechain.PULSEX_V1_ROUTER, pulsechain.PULSEX_V2_ROUTER];

describe("the checkout's tokens match the deployment", () => {
  it("pays in USDC bridged from Ethereum on PulseChain, and says so", () => {
    expect(pulsechain.USDC).toBe("0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07");
    for (const token of PAY_CHAINS.pulsechain.tokens) {
      if (token.path) expect(lower(token.path[token.path.length - 1])).toBe(pulsechain.USDC);
    }
    const usdc = PAY_CHAINS.pulsechain.tokens.find((token) => !token.path);
    expect(usdc?.label).toBe("USDC from Ethereum");
    expect(usdc?.note).toMatch(/bridged from Ethereum/);
  });

  it("pays with WETH and HEX bridged from Ethereum, as the bridge made them", () => {
    const weth = PAY_CHAINS.pulsechain.tokens.find((token) => token.symbol === "WETH");
    const eHex = PAY_CHAINS.pulsechain.tokens.find((token) => token.symbol === "eHEX");
    expect(lower(weth!.path![0])).toBe(pulsechain.WETH_FROM_ETHEREUM);
    expect(lower(eHex!.path![0])).toBe(pulsechain.HEX_FROM_ETHEREUM);
    expect(pulsechain.HEX_FROM_ETHEREUM).not.toBe(pulsechain.HEX); // eHEX is not PulseChain's HEX
    expect(weth!.label).toBe("WETH from Ethereum");
    expect(eHex!.note).toMatch(/bridged from Ethereum/);
    expect(new Set(PAY_CHAINS.pulsechain.tokens.map((token) => token.symbol)).size).toBe(PAY_CHAINS.pulsechain.tokens.length);
  });

  it("pays with USDT and DAI bridged from Ethereum, as the bridge made them", () => {
    const usdt = PAY_CHAINS.pulsechain.tokens.find((token) => token.symbol === "USDT");
    const dai = PAY_CHAINS.pulsechain.tokens.find((token) => token.symbol === "DAI");
    // The official bridge's bridgedTokenAddress for Ethereum's USDT and DAI ("Tether USD from
    // Ethereum", "Dai Stablecoin from Ethereum").
    expect(pulsechain.USDT).toBe("0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f");
    expect(pulsechain.DAI).toBe("0xefd766ccb38eaf1dfd701853bfce31359239f305");
    // USDT goes through WPLS, as PulseX has no USDT/USDC pool worth the name; DAI straight to USDC.
    expect(usdt!.path!.map(lower)).toEqual([pulsechain.USDT, pulsechain.WPLS, pulsechain.USDC]);
    expect(dai!.path!.map(lower)).toEqual([pulsechain.DAI, pulsechain.USDC]);
    expect([usdt!.decimals, dai!.decimals]).toEqual([6, 18]);
    expect(usdt!.label).toBe("USDT from Ethereum");
    expect(dai!.label).toBe("DAI from Ethereum");
    expect(usdt!.note).toMatch(/bridged from Ethereum.*different token/);
    expect(dai!.note).toMatch(/bridged from Ethereum.*different token/);
  });

  it("never touches the copies of USDC, USDT or DAI made at PulseChain's fork", () => {
    // The fork copied Ethereum's contracts to the same addresses, and wallets call the copies by the
    // same names: USDC, USDT (0xdAC1…1ec7) and DAI (0x6B17…1d0F, known as pDAI).
    const copies = [ethereum.USDC, "0xdac17f958d2ee523a2206206994597c13d831ec7", "0x6b175474e89094c44da98b954eedeac495271d0f"];
    for (const token of PAY_CHAINS.pulsechain.tokens) {
      for (const hop of token.path ?? []) expect(copies).not.toContain(lower(hop));
    }
  });

  it("asks the same routers the checkout contracts swap on, both of PulseX's", () => {
    // Each payment is quoted on both and paid along the cheaper (the fork tests buy on each).
    expect(PAY_CHAINS.pulsechain.routers.map(lower).sort()).toEqual([...pulsexRouters].sort());
    for (const token of PAY_CHAINS.pulsechain.tokens) {
      if (token.path) expect(lower(token.path[0])).not.toBe(pulsechain.USDC);
    }
    expect(lower(PAY_CHAINS.pulsechain.tokens[0].path![0])).toBe(pulsechain.WPLS);

    expect(PAY_CHAINS.ethereum.routers.map(lower)).toEqual([ethereum.UNISWAP_V2_ROUTER]);
    for (const token of PAY_CHAINS.ethereum.tokens) {
      if (token.path) expect(lower(token.path[token.path.length - 1])).toBe(ethereum.USDC);
    }
    expect(lower(PAY_CHAINS.ethereum.tokens[0].path![0])).toBe(ethereum.WETH);
  });
});
