import { useState } from "react";

import { CopyButton } from "./ManagePanel";
import { addChainParams, chainName, CHAINS } from "./network";
import { messageOf, switchTo, useWallet } from "./wallet";

/**
 * Under the top bar while the connected wallet is on another network than PulseChain: which one it's
 * on, and one button to switch to PulseChain, or to add PulseChain if the wallet doesn't have it.
 * For wallets that can't do either from a website, the details to add it by hand.
 */
export function NetworkNotice() {
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = wallet.connected;
  const home = CHAINS.pulsechain;
  if (!connected || connected.chainId === home.id) return null;
  const missing = wallet.missing === "pulsechain";
  const details = addChainParams("pulsechain");

  async function move() {
    setBusy(true);
    setError(null);
    try {
      await switchTo("pulsechain");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="network-notice" aria-label="Your wallet's network">
      <div className="container network-notice__inner">
        <p className="network-notice__text">
          <span className="network-notice__dot" aria-hidden="true" />
          {missing ? (
            <>
              <b>Your wallet doesn&rsquo;t have {home.name} yet.</b> .hex names are bought and managed there.
            </>
          ) : (
            <>
              <b>Your wallet is on {chainName(connected.chainId)}.</b> .hex names are bought and managed on {home.name}.
            </>
          )}
        </p>
        <button type="button" className="button button--primary button--small" disabled={busy} onClick={move}>
          {busy ? "Check your wallet…" : missing ? `Add ${home.name} to your wallet` : `Switch to ${home.name}`}
        </button>
        {error ? (
          <p className="network-notice__error" role="alert">
            {error}
          </p>
        ) : null}
        <details className="network-notice__manual">
          <summary>Add it by hand</summary>
          <p>In your wallet, add a network with these details:</p>
          <dl>
            <div>
              <dt>Network name</dt>
              <dd>{details.chainName}</dd>
            </div>
            <div>
              <dt>RPC URL</dt>
              <dd>
                <code>{details.rpcUrls[0]}</code> <CopyButton text={details.rpcUrls[0]!} />
              </dd>
            </div>
            <div>
              <dt>Chain ID</dt>
              <dd>{home.id}</dd>
            </div>
            <div>
              <dt>Currency symbol</dt>
              <dd>{details.nativeCurrency.symbol}</dd>
            </div>
            {details.blockExplorerUrls[0] ? (
              <div>
                <dt>Block explorer</dt>
                <dd>
                  <code>{details.blockExplorerUrls[0]}</code>
                </dd>
              </div>
            ) : null}
          </dl>
        </details>
      </div>
    </section>
  );
}
