import { useState } from "react";

import { NETWORK } from "../site";

// What a wallet needs to add PulseChain (or its testnet, on a testnet copy of the site).
const PULSECHAIN = {
  mainnet: {
    chainId: "0x171",
    chainName: "PulseChain",
    nativeCurrency: { name: "Pulse", symbol: "PLS", decimals: 18 },
    rpcUrls: ["https://rpc.pulsechain.com"],
    blockExplorerUrls: ["https://scan.pulsechain.com"],
  },
  testnet: {
    chainId: "0x3af",
    chainName: "PulseChain Testnet v4",
    nativeCurrency: { name: "Test Pulse", symbol: "tPLS", decimals: 18 },
    rpcUrls: ["https://rpc.v4.testnet.pulsechain.com"],
    blockExplorerUrls: ["https://scan.v4.testnet.pulsechain.com"],
  },
};

type Ethereum = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

const codeOf = (error: unknown) => {
  const e = error as { code?: number; data?: { originalError?: { code?: number } } };
  return e?.data?.originalError?.code ?? e?.code;
};

/** One click to add PulseChain to the visitor's wallet, or to switch to it if the wallet has it. */
export function AddPulseChain() {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const ethereum = (window as unknown as { ethereum?: Ethereum }).ethereum;
  const chain = PULSECHAIN[NETWORK];

  if (!ethereum) {
    return (
      <a
        className="add-chain"
        href={`https://chainlist.org/chain/${parseInt(chain.chainId, 16)}`}
        target="_blank"
        rel="noreferrer"
      >
        Add PulseChain to your wallet
      </a>
    );
  }

  async function add() {
    try {
      try {
        await ethereum!.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.chainId }] });
      } catch (error) {
        if (codeOf(error) === 4001) throw error; // the visitor said no
        await ethereum!.request({ method: "wallet_addEthereumChain", params: [chain] });
      }
      setState("done");
    } catch {
      setState("failed");
    }
  }

  return (
    <button type="button" className="add-chain" onClick={add}>
      {state === "done"
        ? "PulseChain is in your wallet"
        : state === "failed"
          ? "Try again: add PulseChain"
          : "Add PulseChain to your wallet"}
    </button>
  );
}
