import { useId } from "react";

/**
 * The HexNS mark, "Route": one network line runs round a hexagon and turns in to end at a node in
 * the centre, your name. One filled path, so it scales cleanly.
 */
export const ROUTE_PATH =
  "M33.45 5.989L53.802 17.739A2.9 2.9 0 0 1 50.902 22.761L30.55 11.011A2.9 2.9 0 0 1 33.45 5.989ZM55.252 20.25L55.252 43.75A2.9 2.9 0 0 1 49.452 43.75L49.452 20.25A2.9 2.9 0 0 1 55.252 20.25ZM53.802 46.261L33.45 58.011A2.9 2.9 0 0 1 30.55 52.989L50.902 41.239A2.9 2.9 0 0 1 53.802 46.261ZM30.55 58.011L10.198 46.261A2.9 2.9 0 0 1 13.098 41.239L33.45 52.989A2.9 2.9 0 0 1 30.55 58.011ZM8.748 43.75L8.748 20.25A2.9 2.9 0 0 1 14.548 20.25L14.548 43.75A2.9 2.9 0 0 1 8.748 43.75ZM13.098 17.739L33.45 29.489A2.9 2.9 0 0 1 30.55 34.511L10.198 22.761A2.9 2.9 0 0 1 13.098 17.739ZM24.6 32A7.4 7.4 0 1 1 39.4 32A7.4 7.4 0 1 1 24.6 32Z";

const RATIO = 0.8807; // width / height

/**
 * The mark in the HexNS gradient, `height` pixels tall. Beside the HexNS wordmark it's 1.5 times
 * the wordmark's font size. Decorative: "HexNS" is always written beside it or nearby.
 */
export function Logo({ height = 30 }: { height?: number }) {
  const id = `hexns-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      className="logo"
      width={Math.round(height * RATIO * 10) / 10}
      height={height}
      viewBox="8.748 5.6 46.503 52.8"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="10" y1="6" x2="54" y2="58">
          <stop offset="0" stopColor="#FFC400" />
          <stop offset="0.5" stopColor="#FF6A1F" />
          <stop offset="1" stopColor="#E5007A" />
        </linearGradient>
      </defs>
      <path fill={`url(#${id})`} d={ROUTE_PATH} />
    </svg>
  );
}
