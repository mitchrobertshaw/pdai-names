// The Ethereum copy fee on the page (copy.ts): the choice when buying or renewing while Ethereum is
// busy, the token to pay it with, and a name's copy on Ethereum with ways to copy it at once: paying
// the fee on PulseChain, or copying it yourself on Ethereum, paying its fee in ETH.

import { useEffect, useState } from "react";
import type { Address } from "viem";

import type { PayToken } from "../lib/tokens";
import {
  capText,
  type CopyFee,
  ethText,
  FREE_COPY,
  feeText,
  selfCopyCost,
  type SelfCopyCost,
  useCopyFee,
  useEthereumCopy,
  useSelfCopy,
} from "./copy";
import { changeText, copyNow, copyOnEthereum, type Step } from "./flows";
import { PAY } from "./network";
import { Steps } from "./Steps";
import { useWallet } from "./wallet";

/**
 * When to copy a name to Ethereum while Ethereum is busy: free once its fees fall, now for the copy
 * fee, or yourself after paying, paying Ethereum's fee in ETH.
 */
export type CopyWhen = "later" | "now" | "myself";

/**
 * While Ethereum is busy, the choice of when to copy a name there: free once its fees fall, or at
 * once, for the copy fee while HexNS offers that, or yourself when it can't. Nothing to choose
 * otherwise.
 */
export function CopyChoice({
  copy,
  choice,
  onChange,
  disabled,
  what,
}: {
  copy: CopyFee | null;
  choice: CopyWhen;
  onChange: (choice: CopyWhen) => void;
  disabled?: boolean;
  /** What's copied: "your name", or "the new date". */
  what: string;
}) {
  const What = what[0].toUpperCase() + what.slice(1);
  if (copy?.kind === "busy") {
    const myself = choice === "myself";
    return (
      <div className="checkout__field">
        <span className="checkout__label" id="copy-when">
          Copy to Ethereum
        </span>
        <div className="copy-choice" role="radiogroup" aria-labelledby="copy-when">
          <button type="button" role="radio" aria-checked={!myself} disabled={disabled} onClick={() => onChange("later")}>
            <b>Later, free</b>
            <span>once Ethereum&rsquo;s fees fall</span>
          </button>
          <button type="button" role="radio" aria-checked={myself} disabled={disabled} onClick={() => onChange("myself")}>
            <b>Myself, in ETH</b>
            <span>about 15 minutes after paying</span>
          </button>
        </div>
        <p className="checkout__hint copy-choice__busy" role="status">
          {copy.overCap
            ? `Ethereum is extremely busy right now: copying to it at once would cost more than ${capText(copy.cap)}, the most HexNS charges to copy a name.`
            : "Ethereum is extremely busy right now, so HexNS can't copy it there at once."}{" "}
          {myself
            ? "After paying, the bridge signs the copy (usually 10 to 15 minutes), then your wallet sends it on Ethereum, paying Ethereum's fee in ETH. You'll need some ETH there: the app shows how much before your wallet asks."
            : `${What} is copied there free once Ethereum's fees fall. Or copy it yourself, paying Ethereum's fee in ETH from your wallet.`}{" "}
          It works on PulseChain straight away either way.
        </p>
      </div>
    );
  }
  if (copy?.kind !== "offered") return null;
  const now = choice === "now";
  return (
    <div className="checkout__field">
      <span className="checkout__label" id="copy-when">
        Copy to Ethereum
      </span>
      <div className="copy-choice" role="radiogroup" aria-labelledby="copy-when">
        <button type="button" role="radio" aria-checked={!now} disabled={disabled} onClick={() => onChange("later")}>
          <b>Later, free</b>
          <span>once Ethereum&rsquo;s fees fall</span>
        </button>
        <button type="button" role="radio" aria-checked={now} disabled={disabled} onClick={() => onChange("now")}>
          <b>Now, +{feeText(copy.fee)}</b>
          <span>in about 15 minutes</span>
        </button>
      </div>
      <p className="checkout__hint">
        Ethereum is busy, so copying there costs more than usual. HexNS pays the first {FREE_COPY} of each copy, and the
        fee is the rest. Or choose later and copy it yourself from the name&rsquo;s page in about 15 minutes, paying
        Ethereum&rsquo;s fee in ETH from your wallet. It works on PulseChain straight away either way.
      </p>
    </div>
  );
}

/** What the copy fee can be paid with on its own: PLS, which every wallet here has for gas, or USDC. */
export const FEE_TOKENS: PayToken[] = PAY.pulsechain.tokens.filter((t) => t.native || !t.path);

/** Choose the token to pay the copy fee with. */
export function FeeTokens({
  token,
  onChange,
  disabled,
}: {
  token: PayToken;
  onChange: (token: PayToken) => void;
  disabled?: boolean;
}) {
  return (
    <div className="chips chips--small" role="radiogroup" aria-label="Pay the copy fee with">
      {FEE_TOKENS.map((t) => (
        <button
          key={t.symbol}
          type="button"
          role="radio"
          aria-checked={t.symbol === token.symbol}
          disabled={disabled}
          onClick={() => onChange(t)}
        >
          {t.label ?? t.symbol}
        </button>
      ))}
    </div>
  );
}

/**
 * A name's copy on Ethereum, for its page: up to date, or on its way. While Ethereum is busy and a
 * copy is behind, anyone connected can pay the copy fee to have it copied at once (while HexNS
 * offers that), or copy it themselves on Ethereum, paying its fee in ETH.
 */
export function EthereumCopyRow({
  label,
  owner,
  expiry,
  version,
  onChanged,
}: {
  label: string;
  owner: Address;
  expiry: number;
  version: number;
  onChanged?: () => void;
}) {
  const copy = useEthereumCopy(label, owner, expiry, version);
  const fee = useCopyFee();
  const wallet = useWallet();
  const [token, setToken] = useState(FEE_TOKENS[0]);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);
  const [copied, setCopied] = useState(false);
  const ethereumBusy = fee?.kind === "offered" || fee?.kind === "busy";
  const self = useSelfCopy(label, owner, expiry, copy === "behind" && ethereumBusy && !copied, version);
  const account = wallet.connected?.account;
  const [cost, setCost] = useState<SelfCopyCost | null>(null);
  useEffect(() => {
    setCost(null);
    if (self?.kind !== "ready" || !account) return;
    let alive = true;
    selfCopyCost(self, account)
      .then((c) => alive && setCost(c))
      .catch(() => {
        // The wallet shows the fee when it asks.
      });
    return () => {
      alive = false;
    };
  }, [self, account]);
  if (copy === null || copy === "unknown") return null;

  const text =
    copy === "same"
      ? "Up to date"
      : copied
        ? "Copied: Ethereum shows it in a moment"
        : paid || copy === "paid"
          ? "Paid for: copied in about 15 minutes"
          : fee?.kind === "offered"
            ? "Not yet: Ethereum is busy, so it's copied once its fees fall"
            : fee?.kind === "busy"
              ? "Not yet: Ethereum is very busy, so it's copied once its fees fall"
              : "On its way: usually within half an hour";
  const behind = copy === "behind" && !paid && !copied && Boolean(wallet.connected);
  const offer = behind && fee?.kind === "offered" ? fee.fee : null;
  const yourself = behind && ethereumBusy && (self?.kind === "ready" || self?.kind === "signing") ? self : null;
  const wide = offer !== null || yourself !== null || steps !== null;
  const run = async (go: () => Promise<boolean>) => {
    setBusy(true);
    try {
      if (await go()) onChanged?.();
    } catch {
      // Shown in the steps.
    }
    setBusy(false);
  };
  return (
    <div className={wide ? "details__wide" : undefined}>
      <dt>On Ethereum</dt>
      <dd>
        {text}
        {wide ? (
          <div className="copy-now">
            {offer !== null ? (
              <div className="copy-now__row">
                <FeeTokens token={token} onChange={setToken} disabled={busy} />
                <button
                  type="button"
                  className="button button--primary button--small"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const fee = await copyNow({ label, token, report: setSteps });
                      if (fee > 0n) setPaid(true);
                      return true;
                    })
                  }
                >
                  Copy it now, {feeText(offer)}
                </button>
              </div>
            ) : null}
            {offer !== null && changeText(token) ? <p className="copy-now__or">{changeText(token)}</p> : null}
            {yourself?.kind === "ready" ? (
              <>
                <div className="copy-now__row">
                  <span className="copy-now__or">
                    {offer !== null ? "Or pay Ethereum's fee yourself, in ETH:" : "Pay Ethereum's fee yourself, in ETH:"}
                  </span>
                  <button
                    type="button"
                    className={`button button--small ${offer !== null ? "button--ghost" : "button--primary"}`}
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await copyOnEthereum({ label, owner, expiry, report: setSteps });
                        setCopied(true);
                        return true;
                      })
                    }
                  >
                    Copy it yourself{cost ? `, about ${ethText(cost.cost)}` : ""}
                  </button>
                </div>
                {cost && cost.balance < cost.need ? (
                  <p className="copy-now__or">
                    Your wallet needs {ethText(cost.need)} on {PAY.ethereum.name} to send it, and holds{" "}
                    {ethText(cost.balance)}. It&rsquo;s charged only about {ethText(cost.cost)}: Ethereum sets the rest
                    aside while the copy runs, then gives it back.
                  </p>
                ) : null}
              </>
            ) : yourself?.kind === "signing" ? (
              <p className="copy-now__or">
                You can also copy it yourself on Ethereum, paying its fee in ETH, once the bridge has signed it: usually
                10 to 15 minutes after the change.
              </p>
            ) : null}
            {steps ? <Steps steps={steps} /> : null}
          </div>
        ) : null}
      </dd>
    </div>
  );
}
