import { type ReactNode, useEffect, useState } from "react";

import { PRICES } from "../lib/names";
import { formatUsd } from "../lib/quotes";

import {
  anyPower,
  extendName,
  giveBack,
  type Held,
  handOut,
  holdNames,
  type Powers,
  type Prices,
  readHeld,
  readPowers,
  readPrices,
  setPriceLevel,
  setSales,
} from "./admin";
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
 * app.pdains.domains/admin: the admin wallet's powers, made easy to use. Like the referral payouts
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
          <p>This page works once .pdai is deployed.</p>
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
            className="admin__form"
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
                  <th scope="row">{name.label}.pdai</th>
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
            className="admin__form"
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
            className="admin__form"
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
          <p className="payouts__how">It&rsquo;s theirs at once, with everything a buyer gets.</p>
          {giveSteps ? <Steps steps={giveSteps} /> : null}
        </>
      ) : null}

      {powers.extend ? (
        <>
          <h3 className="admin__subtitle">Add time</h3>
          <form
            className="admin__form"
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
