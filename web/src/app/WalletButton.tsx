import { useEffect, useRef, useState } from "react";

import { chainName, CHAINS, PAY } from "./network";
import { linkProps } from "./router";
import { connect, disconnect, short, switchTo, useWallet } from "./wallet";

/** The wallets this browser has, to pick one; or how to get one. */
export function WalletChoices({ onDone }: { onDone?: () => void }) {
  const wallet = useWallet();
  if (wallet.options.length === 0) {
    return (
      <div className="wallet-choices wallet-choices--none">
        <p>
          <b>No wallet found in this browser.</b> Install{" "}
          <a href="https://metamask.io" target="_blank" rel="noreferrer">
            MetaMask
          </a>{" "}
          or{" "}
          <a href="https://rabby.io" target="_blank" rel="noreferrer">
            Rabby
          </a>
          , or open this page in your wallet app&rsquo;s browser, such as Internet Money&rsquo;s.
        </p>
      </div>
    );
  }
  return (
    <div className="wallet-choices">
      {wallet.options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="wallet-choice"
          disabled={wallet.connecting}
          onClick={async () => {
            await connect(option.id);
            onDone?.();
          }}
        >
          {option.icon ? (
            <img src={option.icon} alt="" width={28} height={28} />
          ) : (
            <span className="wallet-choice__blank" />
          )}
          {option.name}
        </button>
      ))}
      {wallet.error ? <p className="wallet-choices__error">{wallet.error}</p> : null}
    </div>
  );
}

/** "Connect wallet" in the top bar, or the connected wallet with its menu. */
export function WalletButton() {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="wallet-button" ref={box}>
      <button
        type="button"
        className={`button button--small ${wallet.connected ? "button--ghost" : "button--primary"}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {wallet.connected ? (
          <>
            <span
              className={`wallet-button__dot${wallet.connected.chainId === CHAINS.pulsechain.id ? "" : " wallet-button__dot--away"}`}
              title={`On ${chainName(wallet.connected.chainId)}`}
              aria-hidden="true"
            />
            {short(wallet.connected.account)}
            <span className="visually-hidden">, on {chainName(wallet.connected.chainId)}</span>
          </>
        ) : (
          <>
            Connect<span className="wallet-button__more"> wallet</span>
          </>
        )}
      </button>
      {open ? (
        <div className="wallet-menu" role="menu">
          {wallet.connected ? (
            <>
              <p className="wallet-menu__who">
                {wallet.connected.option.name}
                <span>
                  {short(wallet.connected.account)} · on {chainName(wallet.connected.chainId)}
                </span>
              </p>
              {wallet.connected.chainId !== CHAINS.pulsechain.id ? (
                <button
                  type="button"
                  className="wallet-menu__item"
                  role="menuitem"
                  onClick={() => {
                    void switchTo("pulsechain").catch(() => undefined);
                    setOpen(false);
                  }}
                >
                  Switch to {PAY.pulsechain.name}
                </button>
              ) : null}
              <a
                className="wallet-menu__item"
                role="menuitem"
                {...linkProps({ page: "names" })}
                onClickCapture={() => setOpen(false)}
              >
                My names
              </a>
              <button
                type="button"
                className="wallet-menu__item"
                role="menuitem"
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <WalletChoices onDone={() => setOpen(false)} />
          )}
        </div>
      ) : null}
    </div>
  );
}
