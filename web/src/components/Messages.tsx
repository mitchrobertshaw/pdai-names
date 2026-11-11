import { useEffect, useMemo, useRef, useState } from "react";

import { playLabel, searchFor, setPlayName, usePlayName } from "../lib/playName";
import { ArrowIcon, CheckIcon } from "./icons";

const ADDRESS = "0x7a3F9c21E0b44d18A6f3c95b27D5e0aB4c8691c2";
const SHORT_ADDRESS = "0x7a3F…91c2";
const NOISE = "0123456789abcdefABCDEF";

type Mode = "address" | "name";

type Line =
  | { id: string; from: "them" | "you"; text: string }
  | { id: string; from: "you"; reply: true } // the answer: the address, or the name
  | { id: string; from: "them"; receipt: true };

const ASK: Line = { id: "ask", from: "them", text: "Sending you the 10,000 HEX I owe you. What's your address?" };
const REPLY: Line = { id: "reply", from: "you", reply: true };

const SCRIPTS: Record<Mode, Line[]> = {
  address: [
    ASK,
    REPLY,
    { id: "a1", from: "them", text: "Is that 91c2 or 9lc2 at the end? 😬" },
    { id: "a2", from: "you", text: "Copy and paste it, don't type it! Then check the first and last four." },
    { id: "a3", from: "them", text: "Sent… I think? Can you check it arrived?" },
  ],
  name: [ASK, REPLY, { id: "n1", from: "them", receipt: true }, { id: "n2", from: "them", text: "Done! That was easy 🙌" }],
};

const easeInOut = (x: number) => x * x * (3 - 2 * x);

/**
 * "Goodbye 0x…": a chat in which a friend asks where to send some HEX, played first with an
 * address, then, by itself, with a name: the address scrambles down into the name. The toggle
 * replays either. Visitors can try it with their own name, which the name card further down
 * picks up too.
 */
export function Messages() {
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const name = usePlayName();
  const [typed, setTyped] = useState("");
  const [mode, setMode] = useState<Mode>("address");
  const [started, setStarted] = useState(false);
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const [scramble, setScramble] = useState<string | null>(null);
  const [invite, setInvite] = useState(false);
  const phone = useRef<HTMLDivElement>(null);
  const target = useRef(`${name}.hex`);
  target.current = `${name}.hex`;
  const playedMode = useRef<Mode | null>(null);
  const touched = useRef(false); // the visitor picked a version or typed a name
  const advanced = useRef(false); // the chat has moved on to the name by itself

  // Start when the chat comes into view.
  useEffect(() => {
    const element = phone.current;
    if (!element || started) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setStarted(true);
      },
      { threshold: 0.35 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [started]);

  // Play the conversation; on a switch, keep the question and morph the answer.
  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    let frame = 0;
    const timers = new Set<number>();
    const pause = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = window.setTimeout(() => {
          timers.delete(id);
          resolve();
        }, ms);
        timers.add(id);
      });
    const wait = (ms: number) => pause(reduced ? 0 : ms); // typing and replies: instant with less motion
    const morph = (from: string, to: () => string) =>
      new Promise<void>((resolve) => {
        if (reduced) return resolve();
        const begin = performance.now();
        const source = [...from];
        const step = (now: number) => {
          if (cancelled) return resolve();
          const p = Math.min(1, (now - begin) / 900);
          if (p >= 1) {
            setScramble(null);
            return resolve();
          }
          const goal = [...to()];
          const length = Math.round(source.length + (goal.length - source.length) * easeInOut(p));
          const settled = Math.floor(goal.length * Math.max(0, (p - 0.4) / 0.6)); // the answer settles from the left
          let text = "";
          for (let i = 0; i < length; i++) text += i < settled ? (goal[i] ?? "") : NOISE[(Math.random() * NOISE.length) | 0];
          setScramble(text);
          frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      });

    const lines = SCRIPTS[mode];
    const previous = playedMode.current;
    playedMode.current = mode;

    (async () => {
      let next = 0;
      setInvite(false);
      setTyping(false);
      if (previous && previous !== mode) {
        setShown(2);
        await morph(previous === "address" ? ADDRESS : target.current, () =>
          mode === "address" ? ADDRESS : target.current,
        );
        next = 2;
      } else {
        setShown(0);
        await wait(400);
      }
      for (; next < lines.length; next++) {
        if (cancelled) return;
        if (lines[next].from === "them") {
          setTyping(true);
          await wait(1100);
          if (cancelled) return;
          setTyping(false);
        } else {
          await wait(750);
          if (cancelled) return;
        }
        setShown(next + 1);
      }
      if (mode === "address") {
        await wait(500);
        if (cancelled) return;
        setInvite(true);
        // Then the fix, without waiting for a click: the address turns into a name. Once, and
        // not if the visitor has chosen for themselves. A real pause even with less motion,
        // since it's a change of words rather than movement.
        if (touched.current || advanced.current) return;
        await pause(reduced ? 5000 : 2400); // with less motion the whole exchange appears at once: time to read it
        if (cancelled || touched.current) return;
        advanced.current = true;
        setMode("name");
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      timers.forEach((id) => clearTimeout(id));
      setScramble(null);
    };
  }, [mode, started, reduced]);

  function choose(next: Mode) {
    touched.current = true;
    setStarted(true);
    setMode(next);
  }

  function onType(value: string) {
    setTyped(value);
    setPlayName(playLabel(value));
    if (mode === "address") choose("name");
  }

  const lines = SCRIPTS[mode].slice(0, shown);
  const summary =
    mode === "address"
      ? "Example chat: a friend asks for your address, you send 42 characters, and they have to check it twice."
      : `Example chat: a friend asks for your address, you send ${name}.hex, and the HEX arrives.`;

  return (
    <section className="section section--tint" id="names" aria-labelledby="messages-title">
      <div className="container split messages">
        <div>
          <p className="kicker">Why a name</p>
          <h2 id="messages-title">
            Goodbye <span className="nowrap">0x7a3F…91c2</span>. Hello <span className="grad-text">you.hex</span>
          </h2>
          <p className="section__intro">
            An address is 42 random characters, and one wrong one sends your coins somewhere you can&rsquo;t get them
            back from. A name is easy to say, easy to check, and it always lands in your wallet.
          </p>

          <div className="try">
            <div className="segmented" role="radiogroup" aria-label="Show the chat">
              <button type="button" role="radio" aria-checked={mode === "address"} onClick={() => choose("address")}>
                With an address
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === "name"}
                className={invite ? "is-inviting" : undefined}
                onClick={() => choose("name")}
              >
                With a .hex name
              </button>
            </div>
            <label className="try__field">
              <span className="try__label">Try it with your name</span>
              <span className="try__input">
                <input
                  type="text"
                  value={typed}
                  placeholder="yourname"
                  maxLength={32}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => onType(event.target.value)}
                />
                <span className="try__tld" aria-hidden="true">
                  .hex
                </span>
              </span>
            </label>
            {typed.trim() ? (
              <button type="button" className="try__search" onClick={() => searchFor(name)}>
                See if {name}.hex is free <ArrowIcon />
              </button>
            ) : null}
          </div>
          <p className="visually-hidden" aria-live="polite">
            {summary}
          </p>
        </div>

        <div className="phone-wrap" aria-hidden="true">
          <div className="phone" ref={phone}>
            <div className="phone__bar">
              <span className="phone__avatar">A</span>
              <span className="phone__who">
                <b>Alex</b>
                <span>{typing ? "typing…" : "online"}</span>
              </span>
            </div>
            <div className="chat">
              {lines.map((line) => {
                if ("reply" in line) {
                  const state = scramble !== null ? "is-scrambling" : mode === "address" ? "is-address" : "is-name";
                  return (
                    <p key={line.id} className={`bubble bubble--you bubble--reply ${state}`}>
                      {scramble ??
                        (mode === "address" ? (
                          ADDRESS
                        ) : (
                          <>
                            {name}
                            <span className="bubble__tld">.hex</span>
                          </>
                        ))}
                    </p>
                  );
                }
                if ("receipt" in line) {
                  return (
                    <div key={line.id} className="bubble bubble--them bubble--receipt">
                      <span className="receipt__icon">
                        <CheckIcon size={16} />
                      </span>
                      <span>
                        <b>Sent 10,000 HEX</b>
                        <span>
                          to {name}.hex · {SHORT_ADDRESS}
                        </span>
                      </span>
                    </div>
                  );
                }
                return (
                  <p key={line.id} className={`bubble bubble--${line.from}`}>
                    {line.text}
                  </p>
                );
              })}
              {typing ? (
                <p className="bubble bubble--them bubble--typing">
                  <span />
                  <span />
                  <span />
                </p>
              ) : null}
            </div>
            <div className="phone__composer">
              <span>Message</span>
            </div>
          </div>
          <p className="phone__caption">
            {mode === "address"
              ? "42 random characters, two checks and one nervous wait."
              : "One name you already know. Nothing to check."}
          </p>
        </div>
      </div>
    </section>
  );
}
