// The checkout preview must quote the tokens and routers the contracts are deployed with
// (script/Addresses.sol). On PulseChain that means USDC bridged from Ethereum, never the copy of
// USDC made when PulseChain forked from Ethereum, which wallets also call USDC.
import { describe, expect, it } from "vitest";

import addresses from "../../../script/Addresses.sol?raw";
import { PAY_CHAIN } from "./tokens";

function constantsOf(library: string): Record<string, string> {
  const body = addresses.split(`library ${library}`)[1].split("}")[0];
  const found = body.matchAll(/address internal constant (\w+) = (0x[0-9a-fA-F]{40});/g);
  return Object.fromEntries([...found].map((m) => [m[1], m[2].toLowerCase()]));
}

const pulsechain = constantsOf("PulseChainAddresses");
const lower = (address: string) => address.toLowerCase();
const pulsexRouters = [pulsechain.PULSEX_V1_ROUTER, pulsechain.PULSEX_V2_ROUTER];
const tokens = PAY_CHAIN.tokens;
const bySymbol = (symbol: string) => tokens.find((token) => token.symbol === symbol)!;

describe("the checkout's tokens match the deployment", () => {
  it("pays in USDC bridged from Ethereum on PulseChain, and says so", () => {
    expect(pulsechain.USDC).toBe("0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07");
    for (const token of tokens) {
      if (token.path) expect(lower(token.path[token.path.length - 1])).toBe(pulsechain.USDC);
    }
    const usdc = tokens.find((token) => !token.path);
    expect(usdc?.label).toBe("USDC from Ethereum");
    expect(usdc?.note).toMatch(/bridged from Ethereum/);
  });

  it("pays with WETH and HEX bridged from Ethereum, as the bridge made them", () => {
    const weth = bySymbol("WETH");
    const eHex = bySymbol("eHEX");
    expect(lower(weth.path![0])).toBe(pulsechain.WETH_FROM_ETHEREUM);
    expect(lower(eHex.path![0])).toBe(pulsechain.HEX_FROM_ETHEREUM);
    expect(pulsechain.HEX_FROM_ETHEREUM).not.toBe(pulsechain.HEX); // eHEX is not PulseChain's HEX
    expect(weth.label).toBe("WETH from Ethereum");
    expect(eHex.note).toMatch(/bridged from Ethereum/);
    expect(new Set(tokens.map((token) => token.symbol)).size).toBe(tokens.length);
  });

  it("pays with USDT and DAI bridged from Ethereum, as the bridge made them", () => {
    const usdt = bySymbol("USDT");
    const dai = bySymbol("DAI");
    // The official bridge's bridgedTokenAddress for Ethereum's USDT and DAI ("Tether USD from
    // Ethereum", "Dai Stablecoin from Ethereum").
    expect(pulsechain.USDT).toBe("0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f");
    expect(pulsechain.DAI).toBe("0xefd766ccb38eaf1dfd701853bfce31359239f305");
    // USDT goes through WPLS, as PulseX has no USDT/USDC pool worth the name; DAI straight to USDC.
    expect(usdt.path!.map(lower)).toEqual([pulsechain.USDT, pulsechain.WPLS, pulsechain.USDC]);
    expect(dai.path!.map(lower)).toEqual([pulsechain.DAI, pulsechain.USDC]);
    expect([usdt.decimals, dai.decimals]).toEqual([6, 18]);
    expect(usdt.label).toBe("USDT from Ethereum");
    expect(dai.label).toBe("DAI from Ethereum");
    expect(usdt.note).toMatch(/bridged from Ethereum.*different token/);
    expect(dai.note).toMatch(/bridged from Ethereum.*different token/);
  });

  it("pays with pDAI, the DAI copied at PulseChain's fork, through WPLS, right after PLS", () => {
    const pdai = bySymbol("pDAI");
    // The fork copied DAI to the address it has on Ethereum (0x6B17…1d0F), where wallets may still
    // call it DAI. Not DAI bridged from Ethereum, which the page calls "DAI from Ethereum".
    expect(pulsechain.PDAI).toBe("0x6b175474e89094c44da98b954eedeac495271d0f");
    expect(pulsechain.PDAI).not.toBe(pulsechain.DAI);
    // Its pools with WPLS are PulseX's deepest for it; its pools with USDC held under $250.
    expect(pdai.path!.map(lower)).toEqual([pulsechain.PDAI, pulsechain.WPLS, pulsechain.USDC]);
    expect(pdai.decimals).toBe(18);
    expect(pdai.label ?? pdai.symbol).toBe("pDAI");
    expect(pdai.note).toMatch(/copied when PulseChain launched.*many pDAI/);
    expect(tokens.indexOf(pdai)).toBe(1);
  });

  it("never touches the copies of USDC or USDT made at PulseChain's fork", () => {
    // The fork copied Ethereum's contracts to the same addresses, and wallets call the copies by the
    // same names: USDC (0xA0b8…eB48) and USDT (0xdAC1…1ec7).
    const copies = ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", "0xdac17f958d2ee523a2206206994597c13d831ec7"];
    for (const token of tokens) {
      for (const hop of token.path ?? []) expect(copies).not.toContain(lower(hop));
    }
  });

  it("asks the same routers the checkout contracts swap on, both of PulseX's", () => {
    // Each payment is quoted on both and paid along the cheaper (the fork tests buy on each).
    expect(PAY_CHAIN.routers.map(lower).sort()).toEqual([...pulsexRouters].sort());
    for (const token of tokens) {
      if (token.path) expect(lower(token.path[0])).not.toBe(pulsechain.USDC);
    }
    expect(lower(tokens[0].path![0])).toBe(pulsechain.WPLS);
  });
});
