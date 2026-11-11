import { type ReactNode, useEffect, useState } from "react";

import { PRICES } from "../lib/names";
import { formatUsd } from "../lib/quotes";
import { zeroAddress } from "viem";

import {
  anyPower,
  capFrom,
  copyToEthereum,
  type CopySettings,
  extendName,
  giveBack,
  type Held,
  handOut,
  holdNames,
  type Powers,
  type Prices,
  readCopySettings,
  readHeld,
  readPowers,
  readPrices,
  setCopyBot,
  setCopyCap,
  setPriceLevel,
  setSales,
} from "./admin";
import { copyFeeOf, feeText } from "./copy";
import type { Step } from "./flows";
import { LIST_LEVEL, readSalesOpen } from "./live";
import { deployment } from "./network";
import { Steps } from "./Steps";
import { useWallet } from "./wallet";
import { WalletChoices } from "./WalletButton";

const dayText = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** A price level as people say it: 10000 is "100%", 12550 is "125.5%". */
const percentText = (level: bigint) => `${Number(level) / 100}%`;

/** "125.5" (a percent) as a level, or null if it isn't one the page accepts. */
function levelFrom(text: string): bigint | null {
  const percent = Number(text);
  if (!Number.isFinite(percent) || percent < 1 || percent > 1000) return null;
  return BigInt(Math.round(percent * 100));
}

/** The yearly list prices at `level`. */
function pricesAt(level: bigint): string {
  const at = (dollars: number) => formatUsd((dollars * Number(level)) / Number(LIST_LEVEL));
  const [five, four, three] = [PRICES.fivePlus, PRICES.four, PRICES.three].map(at);
  return `${five} a year for 5 or more characters, ${four} for 4 and ${three} for 3`;
}

/**
 * app.hexns.domains/admin: the admin wallet's powers, made easy to use. Like the referral payouts
 * page, it's not in the menu and doesn't say which wallet opens it: it opens for a wallet the
 * contracts give admin powers to, and shows only the powers that wallet has.
 */
export function AdminPage() {
  const account = useWallet().connected?.account;
  const [powers, setPowers] = useState<Powers | "failed" | null>(null);
  const [version, setVersion] = useState(0);

  // A different wallet starts afresh. After an action the page stays as it is while the powers are
  // read again, so nothing typed into it is lost.
  useEffect(() => setPowers(null), [account]);
  useEffect(() => {
    if (!deployment || !account) return;
    let alive = true;
    readPowers(account)
      .then((value) => alive && setPowers(value))
      .catch(() => alive && setPowers((current) => (current && current !== "failed" ? current : "failed")));
    return () => {
      alive = false;
    };
  }, [account, version]);

  if (!deployment) {
    return (
      <Shell>
        <section className="card payouts__card">
          <p>This page works once .hex is deployed.</p>
        </section>
      </Shell>
    );
  }
  if (!account) {
    return (
      <Shell>
        <section className="card payouts__card">
          <p>This page is private. Connect your wallet to continue.</p>
          <WalletChoices />
        </section>
      </Shell>
    );
  }
  if (powers === null) {
    return (
      <Shell>
        <p className="name-page__loading">Checking…</p>
      </Shell>
    );
  }
  if (powers === "failed") {
    return (
      <Shell>
        <section className="card payouts__card" role="alert">
          <p>Couldn&rsquo;t read PulseChain just now. Reload the page in a minute.</p>
        </section>
      </Shell>
    );
  }
  if (!anyPower(powers)) {
    return (
      <Shell>
        <section className="card payouts__card">
          <p>This page is private, and this wallet can&rsquo;t open it.</p>
        </section>
      </Shell>
    );
  }
  return (
    <Shell>
      <p className="payouts__lede">
        What this wallet can change. Each change is a transaction from it, and the contracts check it&rsquo;s allowed.
      </p>
      {powers.leftover !== 0n ? <Leftover roles={powers.leftover} onDone={() => setVersion((v) => v + 1)} /> : null}
      {powers.pause ? <SalesCard /> : null}
      {powers.prices ? <PricesCard /> : null}
      {powers.hold || powers.handOut || powers.extend ? (
        <HeldCard powers={powers} onDone={() => setVersion((v) => v + 1)} />
      ) : null}
      {powers.copyFee ? <CopyFeeCard /> : null}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="payouts">
      <h1>Admin</h1>
      {children}
    </div>
  );
}

/** Runs an action, showing its steps; true if it went through. */
function useAction(): [
  Step[] | null,
  boolean,
  (work: (report: (steps: Step[]) => void) => Promise<void>) => Promise<boolean>,
] {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function act(work: (report: (steps: Step[]) => void) => Promise<void>) {
    setBusy(true);
    setSteps(null);
    try {
      await work(setSteps);
      return true;
    } catch (error) {
      // A problem found before any step started (a name that isn't free, say) shows as a step too.
      setSteps(
        (current) =>
          current ?? [
            {
              key: "check",
              title: "Check",
              status: "error",
              detail: error instanceof Error ? error.message : String(error),
            },
          ],
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return [steps, busy, act];
}

function Leftover({ roles, onDone }: { roles: bigint; onDone: () => void }) {
  const [steps, busy, act] = useAction();
  return (
    <section className="card payouts__card" role="alert" aria-labelledby="leftover-title">
      <h2 id="leftover-title" className="payouts__title">
        Give back a leftover power
      </h2>
      <p className="payouts__how">
        This wallet can still register or add time to any name for free. The page only takes that power for the moment
        an action needs it, so an action didn&rsquo;t finish. Give it back now.
      </p>
      <div>
        <button
          type="button"
          className="button button--primary"
          disabled={busy}
          onClick={async () => (await act((report) => giveBack({ roles, report }))) && onDone()}
        >
          Give it back
        </button>
      </div>
      {steps ? <Steps steps={steps} /> : null}
    </section>
  );
}

function SalesCard() {
  const [open, setOpen] = useState<boolean | "failed" | null>(null);
  const [version, setVersion] = useState(0);
  const [steps, busy, act] = useAction();

  useEffect(() => {
    let alive = true;
    readSalesOpen()
      .then((value) => alive && setOpen(value))
      .catch(() => alive && setOpen("failed"));
    return () => {
      alive = false;
    };
  }, [version]);

  return (
    <section className="card payouts__card" aria-labelledby="sales-title">
      <h2 id="sales-title" className="payouts__title">
        Sales
      </h2>
      {open === "failed" ? (
        <p>Couldn&rsquo;t read PulseChain just now. Reload the page in a minute.</p>
      ) : open === null ? (
        <p className="name-page__loading">Reading…</p>
      ) : (
        <>
          <p>
            <b className="admin__status">{open ? "Open." : "Paused."}</b>{" "}
            {open
              ? "Anyone can buy a name."
              : "Nobody can buy a name. Renewals carry on, so nobody loses one meanwhile."}
          </p>
          <p className="payouts__how">
            {open
              ? "Pausing stops new names being bought, until you restart sales. Renewals carry on."
              : "Restarting lets anyone buy names again, at the prices below."}
          </p>
          <div>
            <button
              type="button"
              className={open ? "button button--ghost" : "button button--primary"}
              disabled={busy}
              onClick={async () =>
                (await act((report) => setSales({ open: !open, report }))) && setVersion((v) => v + 1)
              }
            >
              {open ? "Pause sales" : "Restart sales"}
            </button>
          </div>
        </>
      )}
      {steps ? <Steps steps={steps} /> : null}
    </section>
  );
}

function PricesCard() {
  const [prices, setPrices] = useState<Prices | "failed" | null>(null);
  const [version, setVersion] = useState(0);
  const [percent, setPercent] = useState("100");
  const [steps, busy, act] = useAction();

  useEffect(() => {
    let alive = true;
    readPrices()
      .then((value) => {
        if (!alive) return;
        setPrices(value);
        setPercent(String(Number(value.level) / 100));
      })
      .catch(() => alive && setPrices("failed"));
    return () => {
      alive = false;
    };
  }, [version]);

  const level = levelFrom(percent);
  return (
    <section className="card payouts__card" aria-labelledby="prices-title">
      <h2 id="prices-title" className="payouts__title">
        Prices
      </h2>
      {prices === "failed" ? (
        <p>Couldn&rsquo;t read the prices just now. Reload the page in a minute.</p>
      ) : prices === null ? (
        <p className="name-page__loading">Reading…</p>
      ) : (
        <>
          <p>
            <b className="admin__status">{percentText(prices.level)} of the list prices:</b> {pricesAt(prices.level)}.
            Multi-year discounts and the premium for recently expired names follow along.
          </p>
          <form
            className="bot__form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (level === null) return;
              if (await act((report) => setPriceLevel({ level, prices, report }))) setVersion((v) => v + 1);
            }}
          >
            <label>
              All prices, as % of the list prices
              <input
                type="number"
                min="1"
                max="1000"
                step="0.01"
                value={percent}
                onChange={(event) => setPercent(event.target.value)}
                required
              />
            </label>
            <button type="submit" className="button button--primary" disabled={busy || level === null}>
              Set prices
            </button>
          </form>
          <p className="payouts__how">
            {level === null
              ? "Choose between 1% and 1000%. "
              : level === prices.level
                ? ""
                : `At ${percentText(level)}: ${pricesAt(level)}. `}
            It changes buying and renewing, in every token the registrar takes (
            {prices.tokens.map((token) => token.symbol).join(" and ")}): one transaction each. The app shows the new
            prices at once; the homepage lists the list prices as text, so ask for it to be updated after a change.
          </p>
        </>
      )}
      {steps ? <Steps steps={steps} /> : null}
    </section>
  );
}

function HeldCard({ powers, onDone }: { powers: Powers; onDone: () => void }) {
  const [held, setHeld] = useState<Held[] | "failed" | null>(null);
  const [version, setVersion] = useState(0);
  const [toHold, setToHold] = useState("");
  const [holdYears, setHoldYears] = useState("5");
  const [giveName, setGiveName] = useState("");
  const [giveTo, setGiveTo] = useState("");
  const [extendWhat, setExtendWhat] = useState("");
  const [extendYears, setExtendYears] = useState("1");
  const [holdSteps, holding, holdAct] = useAction();
  const [giveSteps, giving, giveAct] = useAction();
  const [extendSteps, extending, extendAct] = useAction();
  const busy = holding || giving || extending;

  useEffect(() => {
    let alive = true;
    readHeld()
      .then((value) => alive && setHeld(value))
      .catch(() => alive && setHeld("failed"));
    return () => {
      alive = false;
    };
  }, [version]);

  const refresh = () => {
    setVersion((v) => v + 1);
    onDone();
  };
  const years = (text: string) => Math.min(10, Math.max(1, Math.round(Number(text) || 1)));

  return (
    <section className="card payouts__card" aria-labelledby="held-title">
      <h2 id="held-title" className="payouts__title">
        Held names
      </h2>
      <p className="payouts__how">
        A held name can&rsquo;t be bought until its hold ends, unless you hand it to its owner first. Its owner then has
        it until the hold would have ended, and can renew it from then.
      </p>

      {held === "failed" ? (
        <p>Couldn&rsquo;t read the held names just now. Reload the page in a minute.</p>
      ) : held === null ? (
        <p className="name-page__loading">Reading the held names…</p>
      ) : held.length === 0 ? (
        <p>No names are held.</p>
      ) : (
        <div className="payouts__scroll">
          <table className="payouts__table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Held until</th>
                <th scope="col">For</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {held.map((name) => (
                <tr key={name.label}>
                  <th scope="row">{name.label}.hex</th>
                  <td data-label="Held until">{dayText(name.expiry)}</td>
                  <td data-label="For">{name.forWhom ?? "—"}</td>
                  <td data-label="Actions">
                    <span className="admin__row-actions">
                      {powers.handOut ? (
                        <button
                          type="button"
                          className="button button--ghost button--small"
                          onClick={() => setGiveName(name.label)}
                        >
                          Hand out
                        </button>
                      ) : null}
                      {powers.extend ? (
                        <button
                          type="button"
                          className="button button--ghost button--small"
                          onClick={() => setExtendWhat(name.label)}
                        >
                          Add time
                        </button>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {powers.hold ? (
        <>
          <h3 className="admin__subtitle">Hold more names</h3>
          <form
            className="bot__form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await holdAct((report) => holdNames({ text: toHold, years: years(holdYears), report }))) {
                setToHold("");
                refresh();
              }
            }}
          >
            <label className="admin__wide">
              Names, separated by commas or spaces
              <textarea
                value={toHold}
                onChange={(event) => setToHold(event.target.value)}
                placeholder="alice, bob"
                required
              />
            </label>
            <label>
              For how many years
              <input
                type="number"
                min="1"
                max="10"
                step="1"
                value={holdYears}
                onChange={(event) => setHoldYears(event.target.value)}
                required
              />
            </label>
            <button type="submit" className="button button--primary" disabled={busy}>
              Hold them
            </button>
          </form>
          <p className="payouts__how">
            Only names nobody owns can be held. Holding them takes the power to register names for these steps only, and
            gives it back after: each name is a transaction, plus one before and one after.
          </p>
          {holdSteps ? <Steps steps={holdSteps} /> : null}
        </>
      ) : null}

      {powers.handOut ? (
        <>
          <h3 className="admin__subtitle">Hand a held name to its owner</h3>
          <form
            className="bot__form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await giveAct((report) => handOut({ name: giveName, owner: giveTo, report }))) {
                setGiveName("");
                setGiveTo("");
                refresh();
              }
            }}
          >
            <label>
              Name
              <input
                value={giveName}
                onChange={(event) => setGiveName(event.target.value)}
                placeholder="alice"
                spellCheck={false}
                autoComplete="off"
                required
              />
            </label>
            <label>
              Their wallet
              <input
                value={giveTo}
                onChange={(event) => setGiveTo(event.target.value)}
                placeholder="0x…"
                spellCheck={false}
                autoComplete="off"
                required
              />
            </label>
            <button type="submit" className="button button--primary" disabled={busy}>
              Hand it out
            </button>
          </form>
          <p className="payouts__how">
            It&rsquo;s theirs at once, with everything a buyer gets. A second transaction sends its copy to Ethereum,
            and the bot copies it at once, whatever Ethereum&rsquo;s fees.
          </p>
          {giveSteps ? <Steps steps={giveSteps} /> : null}
        </>
      ) : null}

      {powers.extend ? (
        <>
          <h3 className="admin__subtitle">Add time</h3>
          <form
            className="bot__form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await extendAct((report) => extendName({ name: extendWhat, years: years(extendYears), report }))) {
                setExtendWhat("");
                refresh();
              }
            }}
          >
            <label>
              Name
              <input
                value={extendWhat}
                onChange={(event) => setExtendWhat(event.target.value)}
                placeholder="alice"
                spellCheck={false}
                autoComplete="off"
                required
              />
            </label>
            <label>
              Years to add
              <input
                type="number"
                min="1"
                max="10"
                step="1"
                value={extendYears}
                onChange={(event) => setExtendYears(event.target.value)}
                required
              />
            </label>
            <button type="submit" className="button button--primary" disabled={busy}>
              Add time
            </button>
          </form>
          <p className="payouts__how">
            For a held name, it holds it longer. For an owned name, it&rsquo;s free time for its owner. It takes the
            power to add time to names for these steps only, and gives it back after.
          </p>
          {extendSteps ? <Steps steps={extendSteps} /> : null}
        </>
      ) : null}
    </section>
  );
}

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/**
 * The Ethereum copy fee: what it is now, the bot that sets it (and receives it), and the most it may
 * be. Also copies any name to Ethereum at once, at the project's cost.
 */
function CopyFeeCard() {
  const [settings, setSettings] = useState<CopySettings | "failed" | null>(null);
  const [version, setVersion] = useState(0);
  const [bot, setBot] = useState(deployment?.bot.address ?? "");
  const [cap, setCap] = useState("1000");
  const [copyName, setCopyName] = useState("");
  const [botSteps, choosing, botAct] = useAction();
  const [capSteps, capping, capAct] = useAction();
  const [copySteps, copying, copyAct] = useAction();
  const busy = choosing || capping || copying;

  useEffect(() => {
    let alive = true;
    readCopySettings()
      .then((value) => {
        if (!alive) return;
        setSettings(value);
        setCap((Number(value.cap) / 1e6).toFixed(2).replace(/\.00$/, ""));
        if (value.bot !== zeroAddress) setBot(value.bot);
      })
      .catch(() => alive && setSettings("failed"));
    return () => {
      alive = false;
    };
  }, [version]);

  const newCap = capFrom(cap);
  const now = settings && settings !== "failed" ? copyFeeOf(settings.fee, settings.cap) : null;
  return (
    <section className="card payouts__card" aria-labelledby="copy-fee-title">
      <h2 id="copy-fee-title" className="payouts__title">
        Ethereum copy fee
      </h2>
      <p className="payouts__how">
        The bot pays Ethereum&rsquo;s gas to copy each name there. The project covers up to $2 a copy. When Ethereum is
        busy and a copy costs more, the bot sets a fee for the rest: buyers can pay it to copy their name at once, or
        wait for it to be copied free once fees fall. Sending a name through the app pays it too. The fee goes to the
        bot, which keeps a little ETH on hand for copies paid for (COPY_NOW_ETH). Busier than that covers, buyers can
        copy their name themselves on Ethereum instead, paying its fee in ETH.
      </p>
      {settings === "failed" ? (
        <p>Couldn&rsquo;t read the checkout just now. Reload the page in a minute.</p>
      ) : settings === null ? (
        <p className="name-page__loading">Reading…</p>
      ) : (
        <>
          <p>
            <b className="admin__status">
              {settings.bot === zeroAddress
                ? "Off: no copy bot chosen."
                : settings.cap === 0n
                  ? "Off: the most a copy can cost is $0."
                  : now?.kind === "offered"
                    ? `${feeText(now.fee)} to copy a name at once.`
                    : now?.kind === "busy"
                      ? now.overCap
                        ? `Over the most a copy can cost (${feeText(settings.cap)}): copying at once isn't offered.`
                        : "Copying at once paused: the bot hasn't the ETH on hand to do it straight away at today's gas. It tops up while copies are free."
                      : "None now: copies cost under $2, so they're free."}
            </b>{" "}
            {settings.bot === zeroAddress || settings.cap === 0n
              ? "Every copy is free, and goes as the bot's daily limit allows."
              : `Set by the bot ${short(settings.bot)}, at most ${feeText(settings.cap)}.`}
          </p>

          <h3 className="admin__subtitle">The copy bot</h3>
          <form
            className="bot__form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await botAct((report) => setCopyBot({ bot, report }))) setVersion((v) => v + 1);
            }}
          >
            <label className="admin__wide">
              The bot&rsquo;s wallet: the first 0x… in its log
              <input
                value={bot}
                onChange={(event) => setBot(event.target.value)}
                placeholder="0x…"
                spellCheck={false}
                autoComplete="off"
                required
              />
            </label>
            <button type="submit" className="button button--primary" disabled={busy}>
              Choose it
            </button>
          </form>
          <p className="payouts__how">
            Once chosen, the bot keeps the fee up to date by itself. The bot needs PULSECHAIN_CHECKOUT in its settings.
          </p>
          {botSteps ? <Steps steps={botSteps} /> : null}

          <h3 className="admin__subtitle">The most a copy can cost</h3>
          <form
            className="bot__form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (newCap === null) return;
              if (await capAct((report) => setCopyCap({ cap: newCap, report }))) setVersion((v) => v + 1);
            }}
          >
            <label>
              In dollars (0 switches it off)
              <input
                type="number"
                min="0"
                max="10000"
                step="0.01"
                value={cap}
                onChange={(event) => setCap(event.target.value)}
                required
              />
            </label>
            <button type="submit" className="button button--primary" disabled={busy || newCap === null}>
              Set it
            </button>
          </form>
          <p className="payouts__how">
            A safety limit, in case the bot ever sets a wrong fee: below it, buyers can pay whatever copying at once
            costs. If a copy would cost more, copying at once isn&rsquo;t offered, and copies wait for Ethereum&rsquo;s
            fees to fall. Ethereum would reach $1,000 at about 1,500 gwei. Switched off (0), every copy is free.
          </p>
          {capSteps ? <Steps steps={capSteps} /> : null}
        </>
      )}

      <h3 className="admin__subtitle">Copy a name to Ethereum now</h3>
      <form
        className="bot__form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await copyAct((report) => copyToEthereum({ name: copyName, report }))) setCopyName("");
        }}
      >
        <label>
          Name
          <input
            value={copyName}
            onChange={(event) => setCopyName(event.target.value)}
            placeholder="alice"
            spellCheck={false}
            autoComplete="off"
            required
          />
        </label>
        <button type="submit" className="button button--primary" disabled={busy}>
          Copy it now
        </button>
      </form>
      <p className="payouts__how">
        The bot copies names sent from this wallet at once, whatever Ethereum&rsquo;s fees, at the project&rsquo;s cost:
        for a name stuck waiting, say.
      </p>
      {copySteps ? <Steps steps={copySteps} /> : null}
    </section>
  );
}
