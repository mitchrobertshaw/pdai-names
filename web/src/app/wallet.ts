// Connecting a wallet: every browser wallet that announces itself (EIP-6963: MetaMask, Rabby,
// Internet Money and others), or the one at window.ethereum. The app asks the wallet to sign; it
// never sees a key.

import { useSyncExternalStore } from "react";
import {
  type Account,
  type Address,
  type Chain,
  type Transport,
  type WalletClient,
  createWalletClient,
  custom,
  getAddress,
} from "viem";

import { addChainParams, chainName, CHAINS } from "./network";
import type { ChainKey } from "../lib/tokens";

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: never[]) => void): void;
  removeListener?(event: string, handler: (...args: never[]) => void): void;
}

export interface WalletOption {
  id: string; // rdns, e.g. io.metamask
  name: string;
  icon?: string;
  provider: Eip1193;
}

export interface WalletState {
  options: WalletOption[];
  connected: { option: WalletOption; account: Address; chainId: number } | null;
  connecting: boolean;
  error: string | null;
  /** A network the connected wallet turned out not to have, and didn't add when asked. */
  missing: ChainKey | null;
}

const LAST = "hexns-wallet";
let state: WalletState = { options: [], connected: null, connecting: false, error: null, missing: null };
const listeners = new Set<() => void>();

function set(next: Partial<WalletState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function remember(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST, id);
    else localStorage.removeItem(LAST);
  } catch {
    // Private windows: nothing to remember.
  }
}

function recalled(): string | null {
  try {
    return localStorage.getItem(LAST);
  } catch {
    return null;
  }
}

let started = false;
/** Listens for wallets announcing themselves, and reconnects the last one used, quietly. */
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("eip6963:announceProvider", ((event: CustomEvent) => {
    const { info, provider } = event.detail as {
      info: { rdns: string; name: string; icon: string };
      provider: Eip1193;
    };
    if (state.options.some((o) => o.id === info.rdns)) return;
    set({ options: [...state.options, { id: info.rdns, name: info.name, icon: info.icon, provider }] });
    if (!state.connected && recalled() === info.rdns) void connect(info.rdns, true);
  }) as EventListener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  // Wallets say when they change network, but not always while the page is in the background:
  // ask again whenever it comes back into view.
  const recheck = () => void refreshChain();
  window.addEventListener("focus", recheck);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && recheck());
  // Older wallets don't announce themselves.
  setTimeout(() => {
    const injected = (window as unknown as { ethereum?: Eip1193 }).ethereum;
    if (injected && state.options.length === 0) {
      set({ options: [{ id: "injected", name: "Browser wallet", provider: injected }] });
      if (!state.connected && recalled() === "injected") void connect("injected", true);
    }
  }, 400);
}

let unsubscribe: (() => void) | null = null;

/** Connects a wallet. Quietly (no pop-up) when reconnecting one used before. */
export async function connect(id: string, quietly = false): Promise<void> {
  const option = state.options.find((o) => o.id === id);
  if (!option) return;
  set({ connecting: !quietly, error: null });
  try {
    const accounts = (await option.provider.request({
      method: quietly ? "eth_accounts" : "eth_requestAccounts",
    })) as string[];
    if (!accounts.length) {
      set({ connecting: false });
      return;
    }
    const chainId = Number(await option.provider.request({ method: "eth_chainId" }));
    unsubscribe?.();
    const onAccounts = (list: string[]) =>
      list.length ? set({ connected: { ...state.connected!, account: getAddress(list[0]) } }) : disconnect();
    const onChain = (hex: string) =>
      state.connected && set({ connected: { ...state.connected, chainId: Number(hex) } });
    option.provider.on?.("accountsChanged", onAccounts as never);
    option.provider.on?.("chainChanged", onChain as never);
    unsubscribe = () => {
      option.provider.removeListener?.("accountsChanged", onAccounts as never);
      option.provider.removeListener?.("chainChanged", onChain as never);
    };
    set({ connected: { option, account: getAddress(accounts[0]), chainId }, connecting: false });
    remember(id);
    // Names live on PulseChain: on connecting, offer to move there (adding it if the wallet doesn't
    // have it).
    if (!quietly && chainId !== CHAINS.pulsechain.id) await switchTo("pulsechain").catch(() => undefined);
  } catch (error) {
    set({ connecting: false, error: quietly ? null : messageOf(error) });
  }
}

export function disconnect() {
  unsubscribe?.();
  unsubscribe = null;
  remember(null);
  set({ connected: null, missing: null });
}

/** Reads which network the connected wallet is on now. */
async function refreshChain(): Promise<number | null> {
  const connected = state.connected;
  if (!connected) return null;
  try {
    const chainId = Number(await connected.option.provider.request({ method: "eth_chainId" }));
    if (state.connected && state.connected.chainId !== chainId) set({ connected: { ...state.connected, chainId } });
    if (state.missing && CHAINS[state.missing].id === chainId) set({ missing: null });
    return chainId;
  } catch {
    return null;
  }
}

/**
 * Reads the wallet's network until it's `id`, for up to a second and a half: a few wallets confirm a
 * switch a moment before they make it.
 */
async function settle(id: number): Promise<number | null> {
  let now = await refreshChain();
  for (let tries = 0; now !== null && now !== id && tries < 6; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    now = await refreshChain();
  }
  return now;
}

/**
 * Whether a wallet refused to switch because it doesn't have the network. Wallets say so with code
 * 4902, some wrapped inside another error, and a few only in words.
 */
export function isUnknownChain(error: unknown): boolean {
  const e = error as { code?: number; data?: { originalError?: { code?: number } }; message?: string };
  if (e?.code === 4902 || e?.data?.originalError?.code === 4902) return true;
  return /unrecognized chain|unknown chain|chain .*(not been added|not added|not found|isn't added)|add (the|this) (network|chain)/i.test(
    e?.message ?? "",
  );
}

/**
 * Asks the wallet to move to PulseChain or Ethereum. If the wallet doesn't have it, it asks the
 * wallet to add it, then to switch, for wallets that add a network without moving to it.
 */
export async function switchTo(key: ChainKey): Promise<void> {
  const connected = state.connected;
  if (!connected) throw new Error("Connect a wallet first.");
  const chain = CHAINS[key];
  if (((await refreshChain()) ?? connected.chainId) === chain.id) return;
  const provider = connected.option.provider;
  const chainId = `0x${chain.id.toString(16)}`;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    if (!isUnknownChain(error)) throw error;
    set({ missing: key });
    await provider.request({ method: "wallet_addEthereumChain", params: [addChainParams(key)] });
    set({ missing: null });
    // Most wallets move to a network as they add it; ask the rest to.
    if ((await refreshChain()) !== chain.id) {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    }
  }
  const now = await settle(chain.id);
  if (now !== null && now !== chain.id) throw new Error(`Your wallet is still on ${chainName(now)}.`);
  set({ missing: null, ...(now === null && state.connected ? { connected: { ...state.connected, chainId: chain.id } } : {}) });
}

/** A client that asks the connected wallet to sign on `key`'s chain. */
export function walletClient(key: ChainKey): WalletClient<Transport, Chain, Account> {
  const connected = state.connected;
  if (!connected) throw new Error("Connect a wallet first.");
  return createWalletClient({
    account: connected.account,
    chain: CHAINS[key],
    transport: custom(connected.option.provider),
  });
}

export function useWallet(): WalletState {
  return useSyncExternalStore(
    (listener) => {
      start();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state,
  );
}

/** A wallet's error, said plainly. */
export function messageOf(error: unknown): string {
  const e = error as { code?: number; shortMessage?: string; message?: string; cause?: { code?: number } };
  if (e?.code === 4001 || e?.cause?.code === 4001 || /user (rejected|denied)/i.test(e?.message ?? "")) {
    return "You cancelled it in your wallet.";
  }
  return e?.shortMessage ?? e?.message ?? "Something went wrong.";
}

export const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
