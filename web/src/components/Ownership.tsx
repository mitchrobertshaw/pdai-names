import { type CSSProperties, type PointerEvent, useMemo, useRef, useState } from "react";

import { usePlayName } from "../lib/playName";
import { CheckIcon, CrossIcon, LockIcon } from "./icons";
import { Logo } from "./Logo";

const WALLETS = {
  you: "0x7a3F…91c2",
  cold: "0x51e0…a7b3",
  buyer: "0x3c9d…5f21",
};

interface Entry {
  id: number;
  ok: boolean;
  title: string;
  detail: string;
}

const monthYear = new Intl.DateTimeFormat("en", { month: "short", year: "numeric" });

/** It gives a little, then holds, like pulling against a rubber band. */
const giveOf = (distance: number, most: number) => Math.sign(distance) * most * (1 - Math.exp(-Math.abs(distance) / 140));

/**
 * "Yours. Not ours.": a name card to try to take, as a stranger or as HexNS (refused, with a
 * honeycomb shield), or to use as its owner: point it somewhere new, renew it, sell it. Once sold,
 * not even the seller can take it back. The card tilts towards the pointer and can be tugged at.
 */
export function Ownership() {
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const name = usePlayName();
  const [sold, setSold] = useState(false);
  const [pointsTo, setPointsTo] = useState(WALLETS.you);
  const [years, setYears] = useState(1);
  const [log, setLog] = useState<Entry[]>([]);
  const nextId = useRef(1);
  const card = useRef<HTMLDivElement>(null);
  const shield = useRef<HTMLSpanElement>(null);
  const glow = useRef<HTMLSpanElement>(null);
  const tug = useRef<{ pointer: number; x: number; y: number; distance: number } | null>(null);

  const renews = new Date();
  renews.setFullYear(renews.getFullYear() + years);
  const label = `${name}.hex`;

  function react(ok: boolean) {
    if (ok) {
      glow.current?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], {
        duration: 1100,
        easing: "ease-out",
      });
      return;
    }
    // A honeycomb shield lights up around the card.
    shield.current?.animate(
      [
        { opacity: 0, transform: "scale(0.96)" },
        { opacity: 1, transform: "scale(1.01)", offset: 0.2 },
        { opacity: 0, transform: "scale(1.04)" },
      ],
      { duration: 1200, easing: "ease-out" },
    );
    if (!reduced) {
      card.current?.animate(
        [
          { translate: "0 0" },
          { translate: "-10px 0" },
          { translate: "9px 0" },
          { translate: "-6px 0" },
          { translate: "4px 0" },
          { translate: "0 0" },
        ],
        { duration: 450, easing: "ease-out" },
      );
    }
  }

  function record(ok: boolean, title: string, detail: string) {
    const id = nextId.current++;
    setLog((entries) => [{ id, ok, title, detail }, ...entries].slice(0, 3));
    react(ok);
  }

  const takeAsStranger = () => record(false, "Refused", `Only the wallet that owns ${label} can move it.`);
  const takeAsHexNS = () =>
    record(false, "Refused, even for us", "HexNS kept no power to move, cancel or redirect anyone's name.");

  function pointSomewhereNew() {
    if (sold) return record(false, "Refused", "You sold it, so only its new owner can change where it points.");
    const next = pointsTo === WALLETS.you ? WALLETS.cold : WALLETS.you;
    setPointsTo(next);
    record(true, "Done", `${label} now points to ${next}${next === WALLETS.you ? ", your main wallet" : ", your cold wallet"}.`);
  }

  function renew() {
    const until = new Date();
    until.setFullYear(until.getFullYear() + years + 1);
    setYears(years + 1);
    record(
      true,
      `Renewed until ${monthYear.format(until)}`,
      sold ? "Anyone can pay to renew a name. It's still theirs, though." : "Still yours, for another year.",
    );
  }

  function sellOrTakeBack() {
    if (sold) return record(false, "Refused", "It's theirs now. Not even the person who sold it can take it back.");
    setSold(true);
    setPointsTo(WALLETS.buyer);
    record(true, `Sold to ${WALLETS.buyer}`, "It moved to their wallet and points to them now. Your sale, your price.");
  }

  function startAgain() {
    setSold(false);
    setPointsTo(WALLETS.you);
    setYears(1);
    setLog([]);
  }

  // Tilting towards the pointer, and tugging.
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const element = card.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    element.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    element.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    const held = tug.current;
    if (held && held.pointer === event.pointerId) {
      const dx = event.clientX - held.x;
      const dy = event.clientY - held.y;
      held.distance = Math.hypot(dx, dy);
      element.style.setProperty("--tx", `${giveOf(dx, 56).toFixed(1)}px`);
      element.style.setProperty("--ty", `${giveOf(dy, 28).toFixed(1)}px`);
      element.style.setProperty("--rz", `${(giveOf(dx, 56) / 12).toFixed(2)}deg`);
    } else if (!reduced && event.pointerType === "mouse") {
      element.style.setProperty("--rx", `${((0.5 - y) * 12).toFixed(2)}deg`);
      element.style.setProperty("--ry", `${((x - 0.5) * 16).toFixed(2)}deg`);
    }
  }

  function settle() {
    const element = card.current;
    if (!element) return;
    for (const property of ["--rx", "--ry", "--tx", "--ty", "--rz"]) element.style.removeProperty(property);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    tug.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, distance: 0 };
    card.current?.setPointerCapture(event.pointerId);
    card.current?.classList.add("is-tugged");
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const held = tug.current;
    if (!held || held.pointer !== event.pointerId) return;
    tug.current = null;
    card.current?.classList.remove("is-tugged");
    settle();
    if (event.type === "pointerup" && held.distance > 36) {
      record(false, "Nice try", `You can't pull ${label} out of a wallet. Only its owner can move it.`);
    }
  }

  return (
    <section className="section section--vault" id="ownership" aria-labelledby="ownership-title">
      <div className="container ownership">
        <div className="ownership__copy">
          <p className="kicker">True ownership</p>
          <h2 id="ownership-title">Yours. Not ours.</h2>
          <p className="section__intro">
            A .hex name is a token in your wallet, not an account on our website. Nobody can take it, move it or
            change where it points: not a stranger, not a scammer, not even us. Go on, try.
          </p>
        </div>

        <div className="ownership__stage">
          <div className="vault">
            <span className="vault__shield" ref={shield} aria-hidden="true">
              <span />
            </span>
            <span className="vault__glow" ref={glow} aria-hidden="true" />
            <div
              className={`name-card${sold ? " is-sold" : ""}`}
              ref={card}
              role="img"
              aria-label={`${label}: owned by ${sold ? `a buyer, ${WALLETS.buyer}` : `you, ${WALLETS.you}`}, pointing to ${pointsTo}, renews ${monthYear.format(renews)}`}
              onPointerMove={onPointerMove}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={() => {
                if (!tug.current) settle();
              }}
            >
              <div className="name-card__top">
                <Logo height={24} />
                <span className="name-card__lock">
                  <LockIcon /> Owner only
                </span>
              </div>
              <p className="name-card__name" style={{ "--length": [...label].length } as CSSProperties}>
                {name}
                <span>.hex</span>
              </p>
              <p className="name-card__chains">On PulseChain and Ethereum</p>
              <dl className="name-card__rows">
                <div>
                  <dt>Owner</dt>
                  <dd>{sold ? WALLETS.buyer : `${WALLETS.you} (you)`}</dd>
                </div>
                <div>
                  <dt>Points to</dt>
                  <dd key={pointsTo} className="name-card__changed">
                    {pointsTo}
                  </dd>
                </div>
                <div>
                  <dt>Renews</dt>
                  <dd key={years} className="name-card__changed">
                    {monthYear.format(renews)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          <p className="vault__hint" aria-hidden="true">
            Try pulling it away
          </p>
          <ol className="ledger" aria-live="polite" aria-label="What happened">
            {log.length === 0 ? (
              <li className="ledger__empty">Nothing yet. Pick someone to try to take it.</li>
            ) : (
              log.map((entry) => (
                <li key={entry.id} className={entry.ok ? "ledger__ok" : "ledger__refused"}>
                  <span className="ledger__icon">{entry.ok ? <CheckIcon size={16} /> : <CrossIcon size={16} />}</span>
                  <span>
                    <b>{entry.title}.</b> {entry.detail}
                  </span>
                </li>
              ))
            )}
          </ol>
        </div>

        <div className="ownership__actions">
          <div className="attempts" role="group" aria-labelledby="take-label">
            <p className="attempts__label" id="take-label">
              Try to take it
            </p>
            <div className="attempts__buttons">
              <button type="button" className="attempt attempt--take" onClick={takeAsStranger}>
                As a stranger
              </button>
              <button type="button" className="attempt attempt--take" onClick={takeAsHexNS}>
                As the HexNS team
              </button>
            </div>
          </div>
          <div className="attempts" role="group" aria-labelledby="own-label">
            <p className="attempts__label" id="own-label">
              {sold ? "Now that you've sold it" : "Or do what only you, the owner, can"}
            </p>
            <div className="attempts__buttons">
              <button type="button" className="attempt" onClick={pointSomewhereNew}>
                Point it somewhere new
              </button>
              <button type="button" className="attempt" onClick={renew}>
                Renew it for a year
              </button>
              <button type="button" className={`attempt${sold ? " attempt--take" : ""}`} onClick={sellOrTakeBack}>
                {sold ? "Take it back" : "Sell it"}
              </button>
            </div>
          </div>
          {sold ? (
            <button type="button" className="ownership__reset" onClick={startAgain}>
              Start again
            </button>
          ) : null}
          <p className="ownership__note">
            Your wallet is the key: whoever holds it holds the name. Keep your seed phrase safe, as you would for your
            coins.
          </p>
        </div>
      </div>
    </section>
  );
}
