import { type CSSProperties, type PointerEvent, useRef } from "react";

import { type FeaturedName, featuredNames } from "../data/featured";
import { Avatar } from "./Avatar";

/**
 * Where the names float on wide screens, inside the content width like ENS's: `x` is the distance
 * from that side, as a percentage of the content width; `y` is the distance from the middle of the
 * hero in pixels, chosen to sit beside the badge, above the words and beside the search, never
 * beside the wide headline. The first seven people float here; everyone scrolls past on phones.
 */
const SLOTS: { side: "left" | "right"; x: number; y: number; scale: number }[] = [
  { side: "left", x: 7, y: -325, scale: 0.96 },
  { side: "right", x: 6, y: -312, scale: 1 },
  { side: "left", x: 0, y: -232, scale: 1.04 },
  { side: "right", x: 0, y: -240, scale: 1 },
  { side: "left", x: 1, y: 112, scale: 1 },
  { side: "right", x: 1, y: 100, scale: 1.04 },
  // Top middle, between the first two and above the badge.
  { side: "left", x: 33, y: -318, scale: 0.92 },
  // None lower down: the search and the live line below it have the bottom to themselves.
];

function Pill({ name }: { name: FeaturedName }) {
  // The .hex takes the colour of the person's profile picture.
  const tone = name.tone ? ({ "--tld-light": name.tone.light, "--tld-dark": name.tone.dark } as CSSProperties) : undefined;
  return (
    <span className="pill" style={tone} title={name.person ? `Reserved for ${name.person}` : undefined}>
      <Avatar label={name.label} x={name.picture ?? name.x} />
      <span className="pill__name">
        {name.label}
        <span className="pill__tld">.hex</span>
      </span>
    </span>
  );
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Where a name is drawn now, even halfway through springing back: its offset from its place. */
function offsetOf(element: HTMLElement): { x: number; y: number } {
  const transform = getComputedStyle(element).transform;
  const matrix = new DOMMatrixReadOnly(transform === "none" ? undefined : transform);
  return { x: matrix.m41, y: matrix.m42 };
}

const at = (x: number, y: number, scale = 1) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale})`;

/** Springs back from (x, y) to its place: past it, back a little, and settles. */
function springBack(element: HTMLElement, x: number, y: number): Animation {
  element.style.transform = "";
  if (reducedMotion()) return element.animate([{ transform: at(x, y) }, { transform: at(0, 0) }], { duration: 220, easing: "ease-out" });
  const swing = [1, -0.18, 0.07, -0.02, 0];
  const offsets = [0, 0.42, 0.68, 0.86, 1];
  return element.animate(
    swing.map((s, i) => ({ transform: at(x * s, y * s), offset: offsets[i], easing: "ease-in-out" })),
    { duration: 850 },
  );
}

/** A click or tap without a drag: the name hops away from the pointer and snaps back. */
function hop(element: HTMLElement, pointerX: number, pointerY: number): Animation | null {
  if (reducedMotion()) return null;
  const box = element.getBoundingClientRect();
  const dx = box.left + box.width / 2 - pointerX;
  const dy = box.top + box.height / 2 - pointerY;
  const length = Math.hypot(dx, dy) || 1;
  const x = (dx / length) * 22;
  const y = (dy / length) * 22 - 8;
  return element.animate(
    [
      { transform: at(0, 0), easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" },
      { transform: at(x, y, 1.06), offset: 0.3, easing: "ease-in-out" },
      { transform: at(-x * 0.22, -y * 0.22, 0.99), offset: 0.62, easing: "ease-in-out" },
      { transform: at(x * 0.07, y * 0.07), offset: 0.84, easing: "ease-in-out" },
      { transform: at(0, 0) },
    ],
    { duration: 720 },
  );
}

/**
 * One floating name on wide screens. It drifts on its own (styles.css); pick it up and it follows
 * the pointer, let go and it springs back to its place. A click without a drag makes it hop.
 */
function Floater({ name, style }: { name: FeaturedName; style: CSSProperties }) {
  const held = useRef<{ id: number; startX: number; startY: number; fromX: number; fromY: number; x: number; y: number } | null>(null);
  const motion = useRef<Animation | null>(null);

  function onPointerDown(event: PointerEvent<HTMLSpanElement>) {
    if (event.button !== 0) return;
    const element = event.currentTarget;
    const { x, y } = offsetOf(element); // caught mid-bounce, it carries on from there
    motion.current?.cancel();
    element.style.transform = at(x, y);
    held.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, fromX: x, fromY: y, x, y };
    element.setPointerCapture(event.pointerId);
    element.classList.add("is-held");
    element.parentElement?.classList.add("is-holding");
    event.preventDefault(); // no text selection while dragging
  }

  function onPointerMove(event: PointerEvent<HTMLSpanElement>) {
    const h = held.current;
    if (!h || h.id !== event.pointerId) return;
    h.x = h.fromX + event.clientX - h.startX;
    h.y = h.fromY + event.clientY - h.startY;
    event.currentTarget.style.transform = at(h.x, h.y);
  }

  function onPointerUp(event: PointerEvent<HTMLSpanElement>) {
    const h = held.current;
    if (!h || h.id !== event.pointerId) return;
    held.current = null;
    const element = event.currentTarget;
    element.classList.remove("is-held");
    element.parentElement?.classList.remove("is-holding");
    const dragged = Math.hypot(event.clientX - h.startX, event.clientY - h.startY) > 5;
    if (dragged || event.type === "pointercancel" || Math.hypot(h.x, h.y) > 1) {
      motion.current = springBack(element, h.x, h.y);
    } else {
      element.style.transform = "";
      motion.current = hop(element, event.clientX, event.clientY);
    }
  }

  return (
    <span
      className="floater"
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <Pill name={name} />
    </span>
  );
}

/** The KOLs' names: around the words on wide screens, a slowly scrolling row on narrow ones. */
export function FloatingNames({ variant }: { variant: "scatter" | "marquee" }) {
  if (variant === "scatter") {
    return (
      <div className="floating floating--scatter" aria-hidden="true">
        {featuredNames.slice(0, SLOTS.length).map((name, i) => {
          const slot = SLOTS[i];
          const style = {
            [slot.side]: `${slot.x}%`,
            "--y": `${slot.y}px`,
            "--scale": slot.scale,
            // Each drifts at its own pace, so they never move together.
            "--duration": `${8 + (i % 3) * 1.7 + (i % 2) * 0.9}s`,
            "--delay": `${-i * 1.4}s`,
          } as CSSProperties;
          return <Floater key={name.label} name={name} style={style} />;
        })}
      </div>
    );
  }
  return (
    <div className="floating floating--marquee" aria-hidden="true">
      <div className="marquee">
        {[...featuredNames, ...featuredNames].map((name, i) => (
          // A tap makes it hop; the row keeps scrolling.
          <span
            key={`${name.label}-${i}`}
            className="marquee__item"
            onClick={(event) => hop(event.currentTarget, event.clientX, event.clientY)}
          >
            <Pill name={name} />
          </span>
        ))}
      </div>
    </div>
  );
}
