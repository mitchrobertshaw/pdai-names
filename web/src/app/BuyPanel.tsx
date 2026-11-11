import { useEffect, useState } from "react";
import type { Address } from "viem";

import { CheckIcon } from "../components/icons";
import { MAX_YEARS } from "../lib/names";
import { formatToken, formatUsd, quoteIn } from "../lib/quotes";
import { captureReferral, referralLink } from "../lib/referral";
import type { PayToken } from "../lib/tokens";
import { erc20Abi } from "./abis";
import { feeText, useCopyFee } from "./copy";
import { CopyChoice, type CopyWhen } from "./CopyChoice";
import {
  amountText,
  bestQuote,
  buyOnPulseChain,
  changeText,
  type SelfCopied,
  type Step,
  tokenAddress,
  withBuffer,
} from "./flows";
import { usePriceLevel, useSalesOpen } from "./live";
import type { NameInfo } from "./lookup";
import { priceOf } from "./lookup";
import { clients, deployment, PAY } from "./network";
import { referralTag, SECONDS_PER_YEAR } from "./order";
import { linkProps } from "./router";
import { Steps } from "./Steps";
import { WalletChoices } from "./WalletButton";
import { useWallet } from "./wallet";

type Quote =
  | { status: "loading" }
  | { status: "ok"; text: string; amount: bigint; token: PayToken }
  | { status: "error" };
const yearsText = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;

/**
 * What paying for `years` of `label` takes in `token`, refreshed as the choices change. Once the
 * contracts are deployed it's the checkout's own quote: in USDC, the price to the last unit, exactly
 * what's paid, and with `withCopy` the copy fee too. Before then (the walkthrough), `dollars` priced
 * on the exchange.
 */
function useQuote(token: PayToken, label: string, years: number, dollars: number, withCopy = false): Quote {
  const [quote, setQuote] = useState<Quote>({ status: "loading" });
  useEffect(() => {
    const chain = PAY.pulsechain;
    const usdc = BigInt(Math.ceil(dollars * 1e6));
    const show = (amount: bigint) =>
      setQuote({
        status: "ok",
        text: token.path
          ? `≈ ${formatToken(amount, token.decimals)} ${token.symbol} on ${chain.dex} right now`
          : `= ${amountText(token, amount)}`,
        amount,
        token,
      });
    if (!deployment && !token.path) {
      show(usdc);
      return;
    }
    const controller = new AbortController();
    setQuote({ status: "loading" });
    const timer = setTimeout(() => {
      const asked = deployment
        ? bestQuote("quoteRegister", label, BigInt(years) * SECONDS_PER_YEAR, token, withCopy).then((q) => q.amountIn)
        : quoteIn(chain, token, usdc, controller.signal);
      asked
        .then((amount) => !controller.signal.aborted && show(amount))
        .catch(() => !controller.signal.aborted && setQuote({ status: "error" }));
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [token, label, years, dollars, withCopy]);
  return quote;
}

/** Before the contracts are deployed: the steps of a purchase, played through without sending anything. */
async function walkthrough(token: PayToken, report: (steps: Step[]) => void) {
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const titles: [string, string][] = [
    ["chain", `Switch to ${PAY.pulsechain.name}`],
    ["commit", "Reserve the name"],
    ...(token.native ? [] : ([["approve", `Allow ${token.label ?? token.symbol}`]] as [string, string][])),
    ["wait", "Wait a minute"],
    ["pay", "Pay and register"],
  ];
  let steps: Step[] = titles.map(([key, title]) => ({ key, title, status: "todo" }));
  const set = (key: string, patch: Partial<Step>) => {
    steps = steps.map((s) => (s.key === key ? { ...s, ...patch } : s));
    report(steps);
  };
  report(steps);
  for (const [key] of titles) {
    const wait = key === "wait" ? 6000 : 1300;
    set(key, {
      status: "active",
      until: key === "wait" ? Date.now() + wait : undefined,
      detail: key === "wait" ? "A minute on the live site." : undefined,
    });
    await pause(wait);
    set(key, { status: "done", detail: undefined });
  }
}

/**
 * Gas for buying a name, with room to spare: approve, commit and register take about 850,000 gas.
 * At November 2026's gas prices that's about 500 PLS, a fraction of a cent.
 */
const PURCHASE_GAS = 1_200_000n;
/** If the gas price can't be read: about twice what a purchase took in November 2026. */
const FALLBACK_GAS_PLS = 1_000n * 10n ** 18n;

/** The official site, and the only one to link to: copycats exist. */
export const LIBERTYSWAP_URL = "https://libertyswap.finance";

type Funds = "enough" | "short" | "no-gas" | null;

/**
 * Whether the connected wallet holds enough on PulseChain to buy: `need` of `token` (the live quote,
 * plus the 2% a swap sends in case the price moves) and a little PLS for the network fee. Checked again every 20 seconds and whenever the page
 * comes back into view, for buyers returning from LibertySwap. Null until it's known.
 */
function useFunds(account: Address | undefined, token: PayToken, need: bigint | null): Funds {
  const [funds, setFunds] = useState<Funds>(null);
  useEffect(() => {
    setFunds(null);
    if (!account || !deployment || need === null) return;
    let alive = true;
    const check = async () => {
      try {
        const [pls, gasPrice] = await Promise.all([
          clients.pulsechain.getBalance({ address: account }),
          clients.pulsechain.getGasPrice().catch(() => null),
        ]);
        const gas = gasPrice === null ? FALLBACK_GAS_PLS : gasPrice * PURCHASE_GAS;
        const address = tokenAddress("pulsechain", token);
        const held = address
          ? await clients.pulsechain.readContract({ address, abi: erc20Abi, functionName: "balanceOf", args: [account] })
          : pls;
        const result: Funds = address
          ? held < need
            ? "short"
            : pls < gas
              ? "no-gas"
              : "enough"
          : pls < need + gas
            ? "short"
            : "enough";
        if (alive) setFunds(result);
      } catch {
        // Can't tell just now: say nothing rather than something wrong.
      }
    };
    void check();
    const timer = setInterval(check, 20_000);
    window.addEventListener("focus", check);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [account, token, need]);
  return funds;
}

/**
 * What LibertySwap should send, in dollars: the total, its 0.3% fee, the 2% a swap sends on top (it
 * comes back as change), a margin for prices moving, and LibertySwap's $10 minimum.
 */
export function amountToSend(total: number): number {
  return Math.max(10, Math.ceil(total * 1.04 + 1));
}

/**
 * Names are bought on PulseChain. For buyers whose money is on Ethereum or another chain: how to
 * bring it over with LibertySwap, a separate service, as PLS, which also pays the network fee.
 * Open when the connected wallet is short; a closed "Coming from another chain?" otherwise.
 */
function GetFunds({ funds, total, token }: { funds: Funds; total: number; token: PayToken }) {
  const short = funds === "short" || funds === "no-gas";
  // Short of a token other than PLS: another token may do, so say which one is short.
  const tokenShort = funds === "short" && !token.native ? (token.label ?? token.symbol) : null;
  const steps = (
    <ol className="get-funds__steps">
      <li>
        Open <b>libertyswap.finance</b> and connect this wallet. Check the address: copycat sites exist.
      </li>
      <li>
        Send at least <b>${amountToSend(funds === "no-gas" ? 0 : total)}</b> of USDC from Ethereum, Base, Arbitrum
        or another chain, and choose <b>PLS on PulseChain</b> to receive.
      </li>
      <li>
        In a few minutes, come back here and pay with <b>PLS</b>. It covers the name and the network fee. Your name
        works on Ethereum too.
      </li>
    </ol>
  );
  const link = (
    <a className="button button--primary button--small" href={LIBERTYSWAP_URL} target="_blank" rel="noreferrer">
      Open LibertySwap
    </a>
  );
  if (short) {
    return (
      <section className="get-funds get-funds--open" aria-labelledby="get-funds-title" role="status">
        <h3 id="get-funds-title" className="get-funds__title">
          {tokenShort ? `Not enough ${tokenShort}` : "Top up on PulseChain first"}
        </h3>
        <p>
          {funds === "no-gas"
            ? "This wallet needs a little PLS for the network fee."
            : tokenShort
              ? `This wallet doesn't hold enough ${tokenShort} for this. Pick another token above, or bring money over:`
              : "This wallet doesn't hold enough on PulseChain yet."}{" "}
          LibertySwap moves funds over from other chains in a few minutes, for a 0.3% fee.
        </p>
        {steps}
        {link}
      </section>
    );
  }
  return (
    <details className="get-funds">
      <summary>Coming from Ethereum or another chain?</summary>
      <p>
        Names are bought on PulseChain, and work on Ethereum too. LibertySwap brings money over in a few minutes, for
        a 0.3% fee.
      </p>
      {steps}
      {link}
    </details>
  );
}

/** Choose how long and how to pay, see exactly what it costs, and buy. */
export function BuyPanel({ info }: { info: Extract<NameInfo, { kind: "available" }> }) {
  const wallet = useWallet();
  const name = `${info.label}.hex`;
  const [years, setYears] = useState(1);
  // Names are bought on PulseChain. Coming from another chain? LibertySwap brings the money over.
  const chain = PAY.pulsechain;
  const [symbol, setSymbol] = useState(chain.tokens[0].symbol);
  const token = chain.tokens.find((t) => t.symbol === symbol) ?? chain.tokens[0];
  const level = usePriceLevel();
  const salesOpen = useSalesOpen();
  const copy = useCopyFee();
  const [copyWhen, setCopyWhen] = useState<CopyWhen>("later");
  const copyFee = copy?.kind === "offered" && copyWhen === "now" ? copy.fee : null;
  // While HexNS can't copy it at once, the buyer may copy it themselves after paying, in ETH.
  const copyMyself = copy?.kind === "busy" && copyWhen === "myself";
  const price = priceOf(info, years, level);
  const total = Math.round(price.total * 100) / 100;
  const asked = useQuote(token, info.label, years, total, copyFee !== null);
  // Just after another token is chosen, until its quote is asked for, the last token's quote is
  // still held: in its own units (USDC has 6 decimals, PLS 18), so it's taken as still loading.
  const quote: Quote = asked.status === "ok" && asked.token !== token ? { status: "loading" } : asked;
  const need = quote.status === "ok" ? (token.path ? withBuffer(quote.amount) : quote.amount) : null;
  // A swap sends `need`, 2% over the quote, and the change comes back: said under the total.
  const change = changeText(token, quote.status === "ok" ? quote.amount : undefined);
  const funds = useFunds(wallet.connected?.account, token, need);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [phase, setPhase] = useState<"choose" | "buying" | "done" | "failed">("choose");
  const [copyPaid, setCopyPaid] = useState(0n);
  const [copied, setCopied] = useState<SelfCopied | "later" | undefined>(undefined);
  const withFee = Math.round((total + (copyFee === null ? 0 : Number(copyFee) / 1e6)) * 100) / 100;

  async function buy() {
    setPhase("buying");
    const referrer = referralTag(captureReferral(), info.label);
    try {
      if (!deployment) await walkthrough(token, setSteps);
      else {
        const done = await buyOnPulseChain({
          label: info.label,
          years,
          token,
          referrer,
          copyNow: copyFee !== null,
          copyMyself,
          report: setSteps,
        });
        setCopyPaid(done.copyFee);
        setCopied(done.copied);
      }
      setPhase("done");
    } catch {
      setPhase("failed");
    }
  }

  const choosing = phase === "choose";
  return (
    <section className="card buy" aria-labelledby="buy-title">
      <h2 id="buy-title" className="buy__title">
        Register {name}
      </h2>

      <fieldset className="buy__choices" disabled={!choosing}>
        <div className="checkout__field">
          <span className="checkout__label" id="buy-years">
            How long
          </span>
          <div className="stepper" role="group" aria-labelledby="buy-years">
            <button
              type="button"
              onClick={() => setYears(Math.max(1, years - 1))}
              disabled={years <= 1}
              aria-label="One year less"
            >
              −
            </button>
            <output aria-live="polite">{yearsText(years)}</output>
            <button
              type="button"
              onClick={() => setYears(Math.min(MAX_YEARS, years + 1))}
              disabled={years >= MAX_YEARS}
              aria-label="One year more"
            >
              +
            </button>
          </div>
          <p className="checkout__hint">5 years for the price of 2. Up to 5 years at a time.</p>
        </div>

        <div className="checkout__field">
          <span className="checkout__label" id="buy-token">
            Pay with, on {chain.name}
          </span>
          <div className="chips" role="radiogroup" aria-labelledby="buy-token">
            {chain.tokens.map((t) => (
              <button
                key={t.symbol}
                type="button"
                role="radio"
                aria-checked={t.symbol === token.symbol}
                onClick={() => setSymbol(t.symbol)}
              >
                {t.label ?? t.symbol}
              </button>
            ))}
          </div>
          <p className="checkout__hint">{token.note ?? `Holding another token? Swap it for PLS on ${chain.dex} first.`}</p>
        </div>

        <CopyChoice copy={copy} choice={copyWhen} onChange={setCopyWhen} what="your name" />
      </fieldset>

      <GetFunds funds={funds} total={withFee} token={token} />

      <dl className="breakdown">
        <div>
          <dt>
            {name}, {yearsText(years)}
          </dt>
          <dd>{formatUsd(price.full)}</dd>
        </div>
        {price.discount > 0 ? (
          <div className="breakdown__saving">
            <dt>Multi-year discount ({Math.round(price.discount * 10000) / 100}%)</dt>
            <dd>−{formatUsd(price.full - (price.total - info.premium))}</dd>
          </div>
        ) : null}
        {info.premium > 0 ? (
          <div>
            <dt>Recently expired: a premium that halves every day</dt>
            <dd>{formatUsd(info.premium)}</dd>
          </div>
        ) : null}
        {copyFee !== null ? (
          <div>
            <dt>Copy to Ethereum now</dt>
            <dd>{feeText(copyFee)}</dd>
          </div>
        ) : null}
        {copyMyself ? (
          <div>
            <dt>Copy to Ethereum yourself</dt>
            <dd className="breakdown__note">Ethereum&rsquo;s fee, in ETH, after paying</dd>
          </div>
        ) : null}
        <div>
          <dt>Network fee</dt>
          <dd className="breakdown__note">{chain.network}</dd>
        </div>
        <div className="breakdown__total">
          <dt>Total</dt>
          <dd>
            {formatUsd(withFee)}
            <span className="breakdown__quote" aria-live="polite">
              {quote.status === "ok"
                ? quote.text
                : quote.status === "loading"
                  ? "Getting the live price…"
                  : "Live price unavailable; your wallet shows the exact amount"}
            </span>
          </dd>
        </div>
      </dl>
      {change ? <p className="checkout__hint breakdown__change">{change}</p> : null}

      {steps ? <Steps steps={steps} /> : null}

      {phase === "done" ? (
        <div className="buy__done">
          <span className="buy__done-icon">
            <CheckIcon size={20} />
          </span>
          <div>
            <p className="buy__done-title">{deployment ? `${name} is yours.` : "That's the whole purchase."}</p>
            <p>
              {!deployment
                ? "On the live site each step is a real transaction, confirmed in your wallet."
                : copied === "copied"
                  ? "It works on PulseChain now, and you've copied it to Ethereum: it shows there in a moment."
                  : copied === "already" || copied === "someone-else"
                    ? "It works on PulseChain now, and it's been copied to Ethereum."
                    : copied === "later"
                      ? "It works on PulseChain now. Copy it to Ethereum from its page when you're ready, or it's copied free once Ethereum's fees fall."
                      : copyPaid > 0n || copy?.kind === "free" || copy === null
                        ? "It works on PulseChain now, and on Ethereum in about 15 minutes."
                        : `It works on PulseChain now. Ethereum is busy, so its copy there follows once Ethereum's fees fall${
                            copy?.kind === "offered"
                              ? `, or for ${feeText(copy.fee)} at once from its page`
                              : ", or copy it yourself from its page, paying Ethereum's fee in ETH"
                          }.`}
            </p>
            {deployment ? (
              <p className="buy__share">
                Your referral link: <code>{referralLink(info.label)}</code>
              </p>
            ) : null}
            <div className="buy__actions">
              {deployment ? (
                <a className="button button--primary button--small" {...linkProps({ page: "names" })}>
                  See my names
                </a>
              ) : (
                <button
                  type="button"
                  className="button button--ghost button--small"
                  onClick={() => {
                    setSteps(null);
                    setPhase("choose");
                  }}
                >
                  Start again
                </button>
              )}
            </div>
          </div>
        </div>
      ) : phase === "failed" ? (
        <button
          type="button"
          className="button button--primary buy__cta"
          onClick={() => {
            setSteps(null);
            setPhase("choose");
          }}
        >
          Try again
        </button>
      ) : !deployment ? (
        <button type="button" className="button button--primary buy__cta" disabled={!choosing} onClick={buy}>
          {choosing ? "Walk through buying it" : "Walking through…"}
        </button>
      ) : salesOpen === false ? (
        <p className="buy__paused" role="status">
          <b>Sales are paused for now.</b> Names can&rsquo;t be bought until they restart. Names already registered can
          still be renewed.
        </p>
      ) : !wallet.connected ? (
        <div className="buy__connect">
          <p className="checkout__label">Connect a wallet to buy it</p>
          <WalletChoices />
        </div>
      ) : (
        <button type="button" className="button button--primary buy__cta" disabled={!choosing} onClick={buy}>
          {choosing ? `Buy ${name} for ${formatUsd(withFee)}` : "Follow the steps in your wallet…"}
        </button>
      )}
      {!deployment && choosing ? (
        <p className="checkout__hint buy__preview-note">A walkthrough: nothing is sent, and no wallet is needed.</p>
      ) : null}
    </section>
  );
}
