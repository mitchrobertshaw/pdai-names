import { useId } from "react";

/**
 * The pDAI Name Service mark, "Open D": Dai's letter with its upright taken away. Its round bowl,
 * and Dai's two lines running through it and out both sides. Three shapes that overlap, in one
 * path, so it scales cleanly. The on-chain name cards draw the same path (src/PdaiNameCard.sol).
 *
 * Drawn on a 64-unit grid: the bowl's centre line is a half circle of radius 19.1 round (30.636, 32),
 * with straight ends running back to x = 18.818; the lines run from x = 7 to 57, 5.886 above and
 * below the middle. Everything is 6 thick with round ends. The lines sit closer to each other than
 * to the bowl (gaps of 5.77 between them, 7.21 either side) so all three gaps look the same.
 */
export const MARK_PATH =
  "M18.818 9.9H30.636A22.1 22.1 0 0 1 30.636 54.1H18.818A3 3 0 0 1 18.818 48.1H30.636A16.1 16.1 0 0 0 30.636 15.9H18.818A3 3 0 0 1 18.818 9.9ZM7 23.114H57A3 3 0 0 1 57 29.114H7A3 3 0 0 1 7 23.114ZM7 34.886H57A3 3 0 0 1 57 40.886H7A3 3 0 0 1 7 34.886Z";

/** The mark's box on the 64-unit grid, cropped tight. */
export const MARK_VIEWBOX = "4 9.9 56 44.2";
const RATIO = 56 / 44.2; // width / height

/**
 * The brand's gradient, three of pDAI's colours: cyan, magenta and red. Each stands out on the navy
 * by at least 5 to 1. The same three colours run left to right on the buttons and words in colour
 * (--rainbow in styles.css).
 */
export const MARK_STOPS: ReadonlyArray<readonly [string, string]> = [
  ["0", "#00EAFF"],
  ["0.5", "#E619E6"],
  ["1", "#FF0000"],
];

/**
 * Across the mark the gradient runs from its bottom left (cyan) towards its top right (red), set a
 * little to the right of the mark's middle so more of the cyan and blue shows: the magenta falls in
 * the bowl, and the red only at its top right.
 */
export const MARK_GRADIENT = { x1: 10.3, y1: 49.1, x2: 66.3, y2: 4.9 } as const;

/**
 * The mark in the brand's gradient, `height` pixels tall. Beside the wordmark it's 1.55 times the
 * wordmark's font size. Decorative: "pDAI Name Service" is always written beside it or nearby.
 */
export function Logo({ height = 24 }: { height?: number }) {
  const id = `pdains-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      className="logo"
      width={Math.round(height * RATIO * 10) / 10}
      height={height}
      viewBox={MARK_VIEWBOX}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" {...MARK_GRADIENT}>
          {MARK_STOPS.map(([offset, color]) => (
            <stop key={offset} offset={offset} stopColor={color} />
          ))}
        </linearGradient>
      </defs>
      <path fill={`url(#${id})`} d={MARK_PATH} />
    </svg>
  );
}
