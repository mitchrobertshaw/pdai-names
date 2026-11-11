import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { checkName, type NameCheck, shortName, tooLongText } from "../lib/names";
import { onSearchFor } from "../lib/playName";
import { appUrl } from "../site";
import { AlertIcon, CheckIcon, CrossIcon, LockIcon, SearchIcon, StarIcon } from "./icons";

type Tone = "ok" | "neutral" | "bad" | "warn";

export function Card({ tone, icon, title, children }: { tone: Tone; icon: ReactNode; title: ReactNode; children: ReactNode }) {
  return (
    <div className={`result result--${tone}`}>
      <span className="result__icon">{icon}</span>
      <div className="result__body">
        <p className="result__title">{title}</p>
        <div className="result__detail">{children}</div>
      </div>
    </div>
  );
}

/** Buying happens in the app, on the name's own page. */
function RegisterLink({ name }: { name: string }) {
  return (
    <a className="button button--primary button--small" href={appUrl(`/${name}`)}>
      Register
    </a>
  );
}

const registerLink = (name: string) => <RegisterLink name={name} />;

/**
 * What a name check says, as a card. `action` is the button on a name that can be bought (on the
 * homepage, a link into the app); `taken`, when given, replaces that card: in the app, PulseChain
 * may say someone owns the name already.
 */
export function Result({
  check,
  action = registerLink,
  taken,
}: {
  check: NameCheck;
  action?: (name: string) => ReactNode;
  taken?: ReactNode;
}) {
  switch (check.kind) {
    case "empty":
      return null;
    case "available":
      return (
        taken ?? (
          <Card tone="ok" icon={<CheckIcon />} title={<><b>{check.name}</b> is available</>}>
            <p>
              ${check.yearlyPrice} a year for both chains. Pay on PulseChain, with PLS, HEX and more.
            </p>
            {action(check.name)}
          </Card>
        )
      );
    case "premium":
      // Green like any name that can be bought; the star marks it as premium.
      return (
        taken ?? (
          <Card tone="ok" icon={<StarIcon />} title={<><b>{check.name}</b> is a premium name</>}>
            <p>
              Names of {check.length} characters are rarer, so they cost ${check.yearlyPrice} a year for both chains.
            </p>
            {action(check.name)}
          </Card>
        )
      );
    case "reserved":
      return (
        <Card tone="neutral" icon={<LockIcon />} title={<><b>{check.name}</b> is reserved</>}>
          <p>
            {check.given
              ? `Reserved for ${check.reservedFor}. It's theirs from launch.`
              : `Held for ${check.reservedFor} until they claim it.`}
          </p>
        </Card>
      );
    case "too-short":
      return (
        <Card tone="bad" icon={<CrossIcon />} title={<><b>{check.name}</b> is too short</>}>
          <p>Names need at least 3 characters.</p>
        </Card>
      );
    case "too-long":
      return (
        <Card tone="bad" icon={<CrossIcon />} title={<><b>{shortName(check.name)}</b> is too long</>}>
          <p>{tooLongText(check)}</p>
        </Card>
      );
    case "invalid":
      return (
        <Card tone="bad" icon={<CrossIcon />} title="That name won't work">
          <p>{check.reason}</p>
        </Card>
      );
    case "eth":
      return (
        <>
          <Card tone="warn" icon={<AlertIcon />} title={<><b>{check.name}</b> is a .eth name</>}>
            <p>.hex names never end in .eth. Here&rsquo;s the .hex one:</p>
          </Card>
          <Result check={check.hex} action={action} taken={taken} />
        </>
      );
  }
}

/** The search box: checks a name as you type, against the same rules the contracts use. */
export function NameSearch() {
  const [query, setQuery] = useState("");
  const check = useMemo(() => checkName(query), [query]);
  const input = useRef<HTMLInputElement>(null);

  // "See if it's free" further down the page fills the box in.
  useEffect(
    () =>
      onSearchFor((name) => {
        setQuery(name);
        // With a mouse, ready to edit; on a phone, no keyboard popping up over the result.
        if (window.matchMedia("(pointer: fine)").matches) input.current?.focus({ preventScroll: true });
      }),
    [],
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur(); // closes the keyboard on phones
  }

  return (
    <div className="search">
      <form className="search__form" role="search" onSubmit={onSubmit}>
        <label htmlFor="name-search" className="visually-hidden">
          Search for a .hex name
        </label>
        <span className="search__icon">
          <SearchIcon />
        </span>
        <input
          ref={input}
          id="name-search"
          type="search"
          placeholder="Find your name"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={255}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" className="button button--primary">
          Search
        </button>
      </form>
      <div className="search__results" aria-live="polite">
        <Result check={check} />
      </div>
    </div>
  );
}
