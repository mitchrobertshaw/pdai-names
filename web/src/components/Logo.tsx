import { useId } from "react";

/**
 * The pDAI Names mark, "Coin": a lowercase p whose bowl is a coin, with a node at its centre, your
 * name. One filled path, so it scales cleanly. The on-chain name cards draw the same path
 * (src/PdaiNameCard.sol).
 */
export const MARK_PATH =
  "M12.1 25.5A19.9 19.9 0 1 1 51.9 25.5A19.9 19.9 0 1 1 12.1 25.5ZM17.9 25.5A14.1 14.1 0 1 0 46.1 25.5A14.1 14.1 0 1 0 17.9 25.5ZM17.9 25.5L17.9 55.5A2.9 2.9 0 0 1 12.1 55.5L12.1 25.5A2.9 2.9 0 0 1 17.9 25.5ZM24.6 25.5A7.4 7.4 0 1 1 39.4 25.5A7.4 7.4 0 1 1 24.6 25.5Z";

const RATIO = 0.7538; // width / height

/**
 * The mark in pDAI Names' gold, `height` pixels tall. Beside the wordmark it's 1.5 times the
 * wordmark's font size. Decorative: "pDAI Names" is always written beside it or nearby.
 */
export function Logo({ height = 30 }: { height?: number }) {
  const id = `pdains-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      className="logo"
      width={Math.round(height * RATIO * 10) / 10}
      height={height}
      viewBox="12.1 5.6 39.8 52.8"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="12" y1="6" x2="52" y2="58">
          <stop offset="0" stopColor="#FFCF40" />
          <stop offset="0.5" stopColor="#F5AC37" />
          <stop offset="1" stopColor="#D47A16" />
        </linearGradient>
      </defs>
      <path fill={`url(#${id})`} d={MARK_PATH} />
    </svg>
  );
}
