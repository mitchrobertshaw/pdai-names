import { useState } from "react";
import { type Address, isAddress } from "viem";

import { formatUsd } from "../lib/quotes";
import { captureReferral, launchOffer, referralLink, referralOfferText } from "../lib/referral";
import { MAX_YEARS, priceFor } from "../lib/names";
import { feeText, useCopyFee } from "./copy";
import { CopyChoice, type CopyWhen, FEE_TOKENS, FeeTokens } from "./CopyChoice";
import { changeText, renew, send, type Step } from "./flows";
import { usePriceLevel } from "./live";
import { addressUrl, deployment, PAY } from "./network";
import { referralTag } from "./order";
import { Steps } from "./Steps";

const yearsText = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;
const YEAR = 365 * 86_400;
const dayText = (unix: number) =>
  new Date(unix * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/**
 * How many whole years a name expiring at `expiry` can be renewed for now: a name can be paid for
 * at most 5 years ahead (HexNameRules), so a name with 4½ years left can't add a whole year yet.
 */
export function renewableYears(expiry: number, now = Math.floor(Date.now() / 1000)): number {
  return Math.max(0, Math.min(MAX_YEARS, Math.floor((now + MAX_YEARS * YEAR - expiry) / YEAR)));
}

/** Copies text, and says so for a moment. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="button button--ghost button--small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard blocked: the text is on the page to copy by hand.
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

/** Renew a name for more years, up to 5 years ahead. Anyone may; it stays its owner's. */
export function RenewPanel({
  label,
  length,
  expiry,
  mine = false,
  onChanged,
}: {
  label: string;
  length: number;
  /** When the name expires now, in unix seconds. */
  expiry: number;
  /** Whether the connected wallet owns it: anyone else renewing is told it stays the owner's. */
  mine?: boolean;
  onChanged?: () => void;
}) {
  const most = renewableYears(expiry);
  const [chosen, setYears] = useState(1);
  const years = Math.max(1, Math.min(chosen, most));
  const tokens = PAY.pulsechain.tokens;
  const [symbol, setSymbol] = useState(tokens[0].symbol);
  const token = tokens.find((t) => t.symbol === symbol) ?? tokens[0];
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [busy, setBusy] = useState(false);
  const level = usePriceLevel();
  const price = priceFor(length, years);
  const copy = useCopyFee();
  const [copyWhen, setCopyWhen] = useState<CopyWhen>("later");
  const copyFee = copy?.kind === "offered" && copyWhen === "now" ? copy.fee : null;
  const copyMyself = copy?.kind === "busy" && copyWhen === "myself";

  return (
    <section className="card manage" aria-labelledby="renew-title">
      <h2 id="renew-title" className="manage__title">
        Renew
      </h2>
      <div className="manage__row">
        <div className="stepper" role="group" aria-label="How long to renew for">
          <button
            type="button"
            onClick={() => setYears(Math.max(1, years - 1))}
            disabled={years <= 1 || busy}
            aria-label="One year less"
          >
            −
          </button>
          <output>{yearsText(years)}</output>
          <button
            type="button"
            onClick={() => setYears(Math.min(most, years + 1))}
            disabled={years >= most || busy}
            aria-label="One year more"
          >
            +
          </button>
        </div>
        <div className="chips" role="radiogroup" aria-label="Pay with">
          {tokens.map((t) => (
            <button
              key={t.symbol}
              type="button"
              role="radio"
              aria-checked={t.symbol === token.symbol}
              disabled={busy}
              onClick={() => setSymbol(t.symbol)}
            >
              {t.label ?? t.symbol}
            </button>
          ))}
        </div>
      </div>
      {changeText(token) ? <p className="manage__note manage__change">{changeText(token)}</p> : null}
      <div className="manage__fee">
        <CopyChoice copy={copy} choice={copyWhen} onChange={setCopyWhen} disabled={busy} what="the new date" />
      </div>
      {!mine ? (
        <p className="manage__note">
          Anyone can renew a name, but it stays its owner&rsquo;s: this adds time for them, it doesn&rsquo;t buy it.
        </p>
      ) : null}
      {most === 0 ? (
        <p className="manage__note">
          It&rsquo;s paid up more than {MAX_YEARS - 1} years ahead, and a name can be paid for at most {MAX_YEARS}{" "}
          years ahead. It can be renewed again from {dayText(expiry - (MAX_YEARS - 1) * YEAR)}.
        </p>
      ) : null}
      {steps ? <Steps steps={steps} /> : null}
      <button
        type="button"
        className="button button--primary"
        disabled={busy || most === 0}
        onClick={async () => {
          setBusy(true);
          try {
            await renew({
              label,
              years,
              token,
              referrer: referralTag(captureReferral(), label),
              copyNow: copyFee !== null,
              copyMyself,
              report: setSteps,
            });
            onChanged?.();
          } catch {
            // Shown in the steps.
          }
          setBusy(false);
        }}
      >
        Renew for {yearsText(years)}, {formatUsd(Math.round(price.total * level * 100) / 100)}
        {copyFee !== null ? ` + ${feeText(copyFee)} to copy now` : copyMyself ? ", then copy it yourself" : ""}
      </button>
    </section>
  );
}

/** For the owner: their referral link, send the name to another wallet, and how to sell it. */
export function OwnerPanel({
  label,
  expiry,
  canSend = true,
  onChanged,
}: {
  label: string;
  /** When it's paid until (unix seconds). */
  expiry: number;
  /** False while the name is in its grace period: the registry won't move an expired name. */
  canSend?: boolean;
  onChanged?: () => void;
}) {
  const [to, setTo] = useState("");
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = isAddress(to.trim());
  const link = referralLink(label);
  const copy = useCopyFee();
  const [feeToken, setFeeToken] = useState(FEE_TOKENS[0]);
  const copyFee = copy?.kind === "offered" ? copy.fee : null;

  return (
    <>
      <section className="card manage" aria-labelledby="referral-title">
        <h2 id="referral-title" className="manage__title">
          Your referral link
        </h2>
        <p className="manage__text">{referralOfferText(launchOffer(deployment?.launchDate))}</p>
        <div className="manage__row">
          <code className="manage__link">{link}</code>
          <CopyButton text={link} />
        </div>
      </section>

      <section className="card manage" aria-labelledby="send-title">
        <h2 id="send-title" className="manage__title">
          Send it to another wallet
        </h2>
        <p className="manage__text">
          {!canSend
            ? "Renew it first: an expired name can't be sent."
            : copyFee !== null
              ? "It moves for good: only the new owner can send it back."
              : "It moves for good: only the new owner can send it back. Its Ethereum copy follows by itself, about 15 minutes later."}
        </p>
        {canSend && copyFee !== null ? (
          <div className="manage__fee">
            <p className="manage__note">
              Ethereum is busy, so sending it here also pays for its copy there, {feeText(copyFee)}, so the new owner
              shows on Ethereum in about 15 minutes. Pay it with:
            </p>
            <FeeTokens token={feeToken} onChange={setFeeToken} disabled={busy} />
            {changeText(feeToken) ? <p className="manage__note">{changeText(feeToken)}</p> : null}
          </div>
        ) : null}
        {canSend ? (
          <div className="manage__row">
            <input
              className="manage__input"
              type="text"
              placeholder="0x… wallet address"
              spellCheck={false}
              autoComplete="off"
              value={to}
              disabled={busy}
              onChange={(event) => setTo(event.target.value)}
            />
            <button
              type="button"
              className="button button--primary button--small"
              disabled={!valid || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await send({
                    label,
                    to: to.trim() as Address,
                    copyWith: copyFee !== null ? feeToken : undefined,
                    report: setSteps,
                  });
                  onChanged?.();
                } catch {
                  // Shown in the steps.
                }
                setBusy(false);
              }}
            >
              {copyFee !== null ? `Send, +${feeText(copyFee)}` : "Send"}
            </button>
          </div>
        ) : null}
        {steps ? <Steps steps={steps} /> : null}
      </section>

      <SellPanel label={label} expiry={expiry} canSell={canSend} />
    </>
  );
}

/**
 * How to sell a name, as ENS explains it for .eth names: there's no HexNS marketplace. Each name is
 * an NFT (ERC-1155) in the .hex registry, so it sells on PulseChain NFT marketplaces, which show its
 * card (HexNameCard). None is named: they come and go.
 */
function SellPanel({ label, expiry, canSell }: { label: string; expiry: number; canSell: boolean }) {
  const registry = deployment?.pulsechain.registry;
  return (
    <section className="card manage" aria-labelledby="sell-title">
      <h2 id="sell-title" className="manage__title">
        Sell it
      </h2>
      {canSell ? (
        <>
          <p className="manage__text">
            Your name is an NFT on PulseChain, so you can sell it on a PulseChain NFT marketplace, the way .eth names
            sell on Ethereum&rsquo;s. Connect this wallet there, pick {label}.hex from your NFTs and set a price: when
            someone buys it, the marketplace swaps the name for their payment in one go.
          </p>
          <ul className="manage__list">
            <li>
              The buyer gets it paid for until {dayText(expiry)}, and its Ethereum copy follows them by itself.
            </li>
            <li>HexNS takes no cut. The marketplace may charge a fee.</li>
            <li>
              To list it, your wallet asks you to let the marketplace move your .hex names. Only say yes to a marketplace
              you trust.
            </li>
            <li>
              An expired name can&rsquo;t change hands, so renew it before {dayText(expiry)} if it might not sell by
              then.
            </li>
            <li>
              Selling to someone you know? A marketplace still protects you both: neither of you has to pay or send
              first.
            </li>
          </ul>
          {registry ? (
            <>
              <p className="manage__note">
                Buyers can check it&rsquo;s a real .hex name: it comes from{" "}
                <a href={addressUrl("pulsechain", registry)} target="_blank" rel="noreferrer">
                  this contract
                </a>
                .
              </p>
              <div className="manage__row manage__row--after-note">
                <code className="manage__link">{registry}</code>
                <CopyButton text={registry} />
              </div>
            </>
          ) : null}
        </>
      ) : (
        <p className="manage__text">Renew it first: an expired name can&rsquo;t be sold.</p>
      )}
    </section>
  );
}
