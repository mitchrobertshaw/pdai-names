import { type FormEvent, useEffect, useMemo, useState } from "react";

import { useLiveStats } from "../components/LiveStrip";
import { Card, Result } from "../components/NameSearch";
import { checkName, type NameCheck, shortName, tooLongText } from "../lib/names";
import { reservedNames } from "../lib/reserved";
import { referralLink } from "../lib/referral";
import { timeAgo } from "../lib/stats";
import { NETWORK } from "../site";
import { AlertIcon, LockIcon, SearchIcon } from "../components/icons";
import { BuyPanel } from "./BuyPanel";
import { EthereumCopyRow } from "./CopyChoice";
import { lookUp, type NameInfo } from "./lookup";
import { CopyButton, OwnerPanel, RenewPanel } from "./ManagePanel";
import { addressUrl, deployment } from "./network";
import { linkProps, navigate } from "./router";
import { short, useWallet } from "./wallet";
import { WalletChoices } from "./WalletButton";

const dateText = (unix: number) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(unix * 1000);

/** The label a check is about (the .hex one, for a .eth name), or null if there's no name in it. */
function labelOf(check: NameCheck): string | null {
  if (check.kind === "eth") return labelOf(check.hex);
  return check.kind === "empty" || check.kind === "invalid" ? null : check.name.replace(/\.hex$/, "");
}

type Taken = Extract<NameInfo, { kind: "registered" | "reserved" }>;

/**
 * Once the contracts are deployed, whether PulseChain says someone already owns (or the registry
 * holds) a name the rules allow. Asked a moment after typing stops, for the latest name only; until
 * the answer comes, the rules' own answer shows.
 */
function useTaken(check: NameCheck): Taken | null {
  const target = check.kind === "eth" ? check.hex : check;
  const label = target.kind === "available" || target.kind === "premium" ? labelOf(target) : null;
  const [found, setFound] = useState<{ label: string; info: NameInfo } | null>(null);
  useEffect(() => {
    if (!deployment || !label) return;
    let alive = true;
    const timer = setTimeout(() => {
      lookUp(label)
        .then((info) => alive && setFound({ label, info }))
        .catch(() => {
          // Can't tell just now: the rules' answer stays, and the name's page checks again.
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [label]);
  if (!label || found?.label !== label) return null;
  return found.info.kind === "registered" || found.info.kind === "reserved" ? found.info : null;
}

/** A name the rules allow, but that someone owns, or the registry holds, on PulseChain. */
function TakenCard({ info }: { info: Taken }) {
  const name = shortName(`${info.label}.hex`);
  const see = (
    <a className="button button--ghost button--small" {...linkProps({ page: "name", label: info.label })}>
      See it
    </a>
  );
  if (info.kind === "reserved") {
    return (
      <Card tone="neutral" icon={<LockIcon />} title={<><b>{name}</b> is reserved</>}>
        <p>Held for {info.reservedFor}.</p>
        {see}
      </Card>
    );
  }
  return info.inGrace ? (
    <Card tone="warn" icon={<AlertIcon />} title={<><b>{name}</b> has just expired</>}>
      <p>
        Its owner can still renew it until {dateText(info.expiry + 28 * 86400)}. After that anyone can buy it.
      </p>
      {see}
    </Card>
  ) : (
    <Card tone="neutral" icon={<LockIcon />} title={<><b>{name}</b> is taken</>}>
      <p>Paid until {dateText(info.expiry)}.</p>
      {see}
    </Card>
  );
}

/** Buying happens on the name's own page. */
const registerHere = (name: string) => (
  <a className="button button--primary button--small" {...linkProps({ page: "name", label: name.replace(/\.hex$/, "") })}>
    Register
  </a>
);

/** The front page of the app: find a name, with an answer as you type. */
export function SearchPage() {
  const [query, setQuery] = useState("");
  const check = useMemo(() => checkName(query), [query]);
  const taken = useTaken(check);
  const stats = useLiveStats();
  const wallet = useWallet();

  function submit(event: FormEvent) {
    event.preventDefault();
    const label = labelOf(check);
    if (label) navigate({ page: "name", label });
  }

  return (
    <div className="app-search">
      <h1>
        Find your <span className="grad-text">.hex</span> name
      </h1>
      <p className="app-search__lede">One name for your wallet, on PulseChain and Ethereum.</p>
      <div className="search app-search__box">
        <form className="search__form" role="search" onSubmit={submit}>
          <label htmlFor="app-search" className="visually-hidden">
            Search for a .hex name
          </label>
          <span className="search__icon">
            <SearchIcon />
          </span>
          <input
            id="app-search"
            type="search"
            placeholder="Find your name"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit" className="button button--primary">
            Search
          </button>
        </form>
        <div className="search__results" aria-live="polite">
          <Result check={check} action={registerHere} taken={taken ? <TakenCard info={taken} /> : undefined} />
        </div>
      </div>

      {wallet.connected ? (
        <p className="app-search__mine">
          <a {...linkProps({ page: "names" })}>See the names in your wallet</a>
        </p>
      ) : null}

      {stats && stats.latest.length ? (
        <section className="recent" aria-labelledby="recent-title">
          <h2 id="recent-title">Just registered</h2>
          <ul>
            {stats.latest.map((r) => (
              <li key={`${r.label}-${r.at}`}>
                <a {...linkProps({ page: "name", label: r.label })}>
                  {r.label}
                  <span>.hex</span>
                </a>
                <span className="recent__when">{timeAgo(r.at, Math.floor(Date.now() / 1000))}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function StatusChip({ info }: { info: NameInfo }) {
  const [text, tone] =
    info.kind === "available"
      ? info.length < 5
        ? [`Available · premium, ${info.length} characters`, "ok"]
        : ["Available", "ok"]
      : info.kind === "registered"
        ? info.inGrace
          ? ["Expired · in its grace period", "warn"]
          : ["Registered", "info"]
        : info.kind === "reserved"
          ? ["Reserved", "neutral"]
          : info.kind === "too-long"
            ? ["Too long", "bad"]
            : ["Not available", "bad"];
  return <span className={`status status--${tone}`}>{text}</span>;
}

/** One name: buy it if it's free, see who owns it if not, and manage it if it's yours. */
export function NamePage({ label }: { label: string }) {
  const [info, setInfo] = useState<NameInfo | null>(null);
  const [failed, setFailed] = useState(false);
  // Bumped after a renewal or a send, to read the name again without clearing the page.
  const [version, setVersion] = useState(0);
  const wallet = useWallet();

  useEffect(() => {
    setInfo(null);
    setFailed(false);
  }, [label]);

  useEffect(() => {
    let alive = true;
    lookUp(label)
      .then((result) => alive && setInfo(result))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [label, version]);

  const name = `${label}.hex`;
  const mine = info?.kind === "registered" && wallet.connected?.account.toLowerCase() === info.owner.toLowerCase();

  return (
    <div className="name-page">
      <a className="name-page__back" {...linkProps({ page: "search" })}>
        ← Search
      </a>
      <header className="name-page__head">
        <h1>
          {label}
          <span className="grad-text">.hex</span>
        </h1>
        {info ? <StatusChip info={info} /> : null}
      </header>

      {failed ? (
        <p className="card name-page__note">Couldn&rsquo;t reach PulseChain just now. Try again in a moment.</p>
      ) : !info ? (
        <p className="name-page__loading">Looking it up…</p>
      ) : info.kind === "available" ? (
        <BuyPanel info={info} />
      ) : info.kind === "registered" ? (
        <>
          <section className="card details" aria-label="Details">
            <dl>
              <div>
                <dt>Owner</dt>
                <dd>
                  <a href={addressUrl("pulsechain", info.owner)} target="_blank" rel="noreferrer">
                    {short(info.owner)}
                  </a>
                  {mine ? <span className="details__you">you</span> : null}
                </dd>
              </div>
              <div>
                <dt>Points to</dt>
                <dd>Its owner, on PulseChain and Ethereum, unless they point it elsewhere</dd>
              </div>
              <div>
                <dt>{info.inGrace ? "Expired on" : "Paid until"}</dt>
                <dd>{dateText(info.expiry)}</dd>
              </div>
              {!info.inGrace ? (
                <EthereumCopyRow
                  label={info.label}
                  owner={info.owner}
                  expiry={info.expiry}
                  version={version}
                  onChanged={() => setVersion((v) => v + 1)}
                />
              ) : null}
            </dl>
            {info.inGrace ? (
              <p className="details__note">
                Its owner has until {dateText(info.expiry + 28 * 86400)} to renew it. After that anyone can buy it,
                at a price that starts at $100 million and halves every day for 21 days.
              </p>
            ) : null}
          </section>
          {mine ? (
            <OwnerPanel
              label={info.label}
              expiry={info.expiry}
              canSend={!info.inGrace}
              onChanged={() => setVersion((v) => v + 1)}
            />
          ) : null}
          <RenewPanel
            label={info.label}
            length={[...info.label].length}
            expiry={info.expiry}
            mine={mine}
            onChanged={() => setVersion((v) => v + 1)}
          />
        </>
      ) : info.kind === "reserved" ? (
        <p className="card name-page__note">
          {name} is reserved for {info.reservedFor}.{" "}
          {reservedNames.get(label)?.given ? "It's theirs from launch." : "It's held until they claim it."}
        </p>
      ) : info.kind === "too-short" ? (
        <p className="card name-page__note">Names need at least 3 characters.</p>
      ) : info.kind === "too-long" ? (
        <p className="card name-page__note">{tooLongText(info)}</p>
      ) : (
        <p className="card name-page__note">{info.reason}</p>
      )}
    </div>
  );
}

interface OwnedName {
  label: string;
  expiry: number;
}

/** The names in the connected wallet, from the site's index of the registry. */
function useOwnedNames(owner: string | undefined): OwnedName[] | null | "unavailable" {
  const [names, setNames] = useState<OwnedName[] | null | "unavailable">(null);
  useEffect(() => {
    if (!owner) return;
    let alive = true;
    setNames(null);
    fetch(`/api/names?network=${NETWORK}&owner=${owner}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("no index"))))
      .then(
        (body: { live: boolean; names?: OwnedName[] }) =>
          alive && setNames(body.live && body.names ? body.names : "unavailable"),
      )
      .catch(() => alive && setNames("unavailable"));
    return () => {
      alive = false;
    };
  }, [owner]);
  return names;
}

/** The names you own, with their renewal dates and referral links. */
export function MyNamesPage() {
  const wallet = useWallet();
  const owned = useOwnedNames(wallet.connected?.account);

  if (!wallet.connected) {
    return (
      <div className="my-names">
        <h1>My names</h1>
        <section className="card my-names__connect">
          <p>Connect your wallet to see the .hex names in it.</p>
          <WalletChoices />
        </section>
      </div>
    );
  }

  return (
    <div className="my-names">
      <h1>My names</h1>
      <p className="my-names__who">
        In {short(wallet.connected.account)}
        {!deployment ? " · a preview: the contracts aren't connected yet" : ""}
      </p>
      {owned === null ? (
        <p className="name-page__loading">Looking…</p>
      ) : owned === "unavailable" ? (
        <p className="card name-page__note">Couldn&rsquo;t load your names just now. Try again in a moment.</p>
      ) : owned.length === 0 ? (
        <section className="card my-names__empty">
          <p>
            <b>No .hex names in this wallet yet.</b>
          </p>
          <a className="button button--primary button--small" {...linkProps({ page: "search" })}>
            Find one
          </a>
        </section>
      ) : (
        <ul className="my-names__list">
          {owned.map((n) => (
            <li key={n.label} className="card my-names__item">
              <div>
                <a className="my-names__name" {...linkProps({ page: "name", label: n.label })}>
                  {n.label}
                  <span className="grad-text">.hex</span>
                </a>
                <p className="my-names__expiry">Paid until {dateText(n.expiry)}</p>
              </div>
              <div className="my-names__actions">
                <CopyButton text={referralLink(n.label)} label="Copy referral link" />
                <a className="button button--primary button--small" {...linkProps({ page: "name", label: n.label })}>
                  Manage
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
