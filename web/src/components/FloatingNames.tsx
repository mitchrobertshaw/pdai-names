import { type CSSProperties, type PointerEvent, useLayoutEffect, useRef, useState } from "react";

import { type FeaturedName, featuredNames } from "../data/featured";
import { type Box, scatterToFit, seeded } from "../lib/scatter";
import { Avatar } from "./Avatar";

/** Room kept clear around the words at the top of the page, in pixels. */
const CLEAR = 22;

/** How far above the badge and below the search the names may float, so they stay around the
 *  words even on a tall screen. */
const ABOVE = 200;
const BELOW = 140;

/** The words at the top of the page, which no floating name may cover: the badge and the search as
 *  boxes, the headline and the paragraph line by line, so the space beside a short line is free. */
const BOXES = ".hero__content .eyebrow, .hero__content .search, .hero__content .live";
const LINES = ".hero__content h1, .hero__content .lede";

/** Each line of text in `element`, as boxes on the screen. */
function lines(element: Element): DOMRect[] {
  const range = document.createRange();
  range.selectNodeContents(element);
  return [...range.getClientRects()];
}

function Pill({ name }: { name: FeaturedName }) {
  // The .pdai takes the main colour of the person's profile picture.
  const tone = name.tone ? ({ "--tld": name.tone } as CSSProperties) : undefined;
  return (
    <span
      className={name.tone ? "pill pill--toned" : "pill"}
      style={tone}
      title={name.person ? `Reserved for ${name.person}` : undefined}
    >
      <Avatar label={name.label} x={name.picture ?? name.x} />
      <span className="pill__name">
        {name.label}
        <span className="pill__tld">.pdai</span>
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
function Floater({ name, style, placed }: { name: FeaturedName; style: CSSProperties; placed: boolean }) {
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
      className={placed ? "floater is-placed" : "floater"}
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

/**
 * On wide screens: the names float in the open space around the words, somewhere new on every
 * visit (src/lib/scatter.ts). The page is measured, so they never cover the words at any size.
 */
function Scatter() {
  const layer = useRef<HTMLDivElement>(null);
  const seed = useRef(Math.floor(Math.random() * 2 ** 32));
  const [places, setPlaces] = useState<({ x: number; y: number; scale: number } | null)[]>([]);

  useLayoutEffect(() => {
    const box = layer.current;
    if (!box) return;
    let frame = 0;
    const place = () => {
      const area = box.getBoundingClientRect();
      const hero = box.closest(".hero");
      if (!hero || area.width === 0) return; // hidden on narrow screens
      const local = (r: DOMRect): Box => ({ x: r.left - area.left - CLEAR, y: r.top - area.top - CLEAR, w: r.width + 2 * CLEAR, h: r.height + 2 * CLEAR });
      const keepOut = [
        ...[...hero.querySelectorAll(BOXES)].map((element) => local(element.getBoundingClientRect())),
        ...[...hero.querySelectorAll(LINES)].flatMap((element) => lines(element).map(local)),
      ];
      // Under the search, down to the bottom: its results and the live line appear there.
      const search = hero.querySelector(".hero__content .search");
      if (search) {
        const r = local(search.getBoundingClientRect());
        keepOut.push({ x: r.x, y: r.y, w: r.w, h: area.height - r.y });
      }
      // The band they float in: from a little above the badge to a little below the search.
      const badge = hero.querySelector(".hero__content .eyebrow")?.getBoundingClientRect();
      const field = hero.querySelector(".hero__content .search")?.getBoundingClientRect();
      const top = badge ? Math.max(0, badge.top - area.top - ABOVE) : 0;
      const bottom = field ? Math.min(area.height, field.bottom - area.top + BELOW) : area.height;
      const band = keepOut.map((k) => ({ ...k, y: k.y - top }));
      const random = seeded(seed.current);
      const floaters = [...box.querySelectorAll<HTMLElement>(".floater")];
      const scales = floaters.map(() => 0.92 + random() * 0.12);
      const sizes = floaters.map((element, i) => ({ w: element.offsetWidth * scales[i], h: element.offsetHeight * scales[i] }));
      const { boxes, shrink } = scatterToFit({ w: area.width, h: bottom - top }, band, sizes, random);
      setPlaces(boxes.map((b, i) => (b ? { x: b.x, y: b.y + top, scale: scales[i] * shrink } : null)));
    };
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    window.addEventListener("resize", later);
    void document.fonts?.ready.then(later); // the words take their final size once the fonts load
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", later);
    };
  }, []);

  return (
    <div className="floating floating--scatter" aria-hidden="true" ref={layer}>
      {featuredNames.map((name, i) => {
        const at = places[i];
        const style = {
          ...(at ? { left: `${at.x}px`, top: `${at.y}px`, "--scale": at.scale } : {}),
          // Each drifts at its own pace, so they never move together.
          "--duration": `${8 + (i % 3) * 1.7 + (i % 2) * 0.9}s`,
          "--delay": `${-i * 1.4}s`,
        } as CSSProperties;
        return <Floater key={name.label} name={name} style={style} placed={!!at} />;
      })}
    </div>
  );
}

/** The featured names: around the words on wide screens, a slowly scrolling row on narrow ones. */
export function FloatingNames({ variant }: { variant: "scatter" | "marquee" }) {
  if (variant === "scatter") return <Scatter />;
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
