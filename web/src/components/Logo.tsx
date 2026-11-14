import { useId } from "react";

/**
 * The pDAI Name Service mark, "Echo": Dai's D with its upright taken away, and Dai's two lines
 * joined into a loop inside it, like a lookup that goes in and comes back with the answer. Two
 * shapes in one path, so it scales cleanly. The on-chain name cards draw the same path
 * (src/PdaiNameCard.sol).
 *
 * Drawn on a 64-unit grid and centred on (32, 32). The bowl's centre line is a half circle of radius
 * 19.1 round (34.268, 32), with straight ends running back to x = 22.45. The loop's is a half circle
 * of radius 5.886 round the same point, with Dai's two lines running back to x = 10.632.
 * Everything is 6 thick with round ends. The two lines sit 5.77 apart, and the loop keeps 7.21 from
 * the bowl all the way round, so the gaps look even.
 */
export const MARK_PATH =
  "M22.45 9.9H34.268A22.1 22.1 0 0 1 34.268 54.1H22.45A3 3 0 0 1 22.45 48.1H34.268A16.1 16.1 0 0 0 34.268 15.9H22.45A3 3 0 0 1 22.45 9.9ZM10.632 23.114H34.268A8.886 8.886 0 0 1 34.268 40.886H10.632A3 3 0 0 1 10.632 34.886H34.268A2.886 2.886 0 0 0 34.268 29.114H10.632A3 3 0 0 1 10.632 23.114Z";

/** The mark's box on the 64-unit grid, cropped tight. */
export const MARK_VIEWBOX = "7.632 9.9 48.736 44.2";
const RATIO = 48.736 / 44.2; // width / height

/**
 * pDAI's own gradient, the token's five colours: cyan, blue, purple, magenta and red. The same
 * colours run left to right on words in colour and on lines (--rainbow in styles.css).
 */
export const MARK_STOPS: ReadonlyArray<readonly [string, string]> = [
  ["0", "#00EAFF"],
  ["0.2525", "#0080FF"],
  ["0.4974", "#8000FF"],
  ["0.7499", "#E619E6"],
  ["0.9991", "#FF0000"],
];

/**
 * Across the mark the gradient runs at the token's own angle, from the top right (cyan) to the
 * bottom left (red). It spans the 56 by 44.2 box round the mark the way the token's spans its coin.
 */
export const MARK_GRADIENT = { x1: 46.69, y1: 10.13, x2: 17.25, y2: 53.88 } as const;

/**
 * The mark in pDAI's gradient, `height` pixels tall. Beside the wordmark it's 1.55 times the
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
