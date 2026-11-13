import { describe, expect, it } from "vitest";

import { type Box, overlaps, scatter, scatterToFit, seeded } from "./scatter";

// The top of the page, as measured in a browser, with the 22px kept clear around the words: the
// badge, the headline and the paragraph line by line, and the search, with the space under the
// search kept for its results and the live line. The names float across the content width and up
// to 200px past it on each side.
const LAPTOP = {
  area: { w: 1248, h: 736 }, // 1280 by 800
  keepOut: [
    { x: 442, y: 150, w: 363, h: 84 },
    { x: 334, y: 204, w: 581, h: 139 },
    { x: 364, y: 280, w: 519, h: 139 },
    { x: 333, y: 388, w: 581, h: 69 },
    { x: 386, y: 421, w: 476, h: 69 },
    { x: 292, y: 482, w: 664, h: 254 },
  ],
};
const SMALL_LAPTOP = {
  area: { w: 1068, h: 636 }, // 1100 by 700, the narrowest screen the names float on
  keepOut: [
    { x: 352, y: 143, w: 363, h: 84 },
    { x: 51, y: 198, w: 966, h: 128 },
    { x: 249, y: 295, w: 571, h: 69 },
    { x: 300, y: 328, w: 468, h: 69 },
    { x: 202, y: 390, w: 664, h: 246 },
  ],
};
// The eight names' pills, at the largest they're drawn (1.04 times).
const sizes = [223, 191, 216, 236, 193, 172, 198, 174].map((w) => ({ w: w * 1.04, h: 52 }));

const placedIn = (screen: typeof LAPTOP, seed: number) =>
  scatter(screen.area, screen.keepOut, sizes, seeded(seed)).filter((b): b is Box => b !== null);

describe("scattering the floating names", () => {
  it("never covers the words, and keeps the names apart and on screen", () => {
    for (const screen of [LAPTOP, SMALL_LAPTOP]) {
      for (let seed = 1; seed <= 200; seed++) {
        const placed = placedIn(screen, seed);
        for (const box of placed) {
          expect(screen.keepOut.some((k) => overlaps(box, k))).toBe(false);
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.x + box.w).toBeLessThanOrEqual(screen.area.w);
          expect(box.y + box.h).toBeLessThanOrEqual(screen.area.h);
        }
        for (let i = 0; i < placed.length; i++) {
          for (let j = i + 1; j < placed.length; j++) expect(overlaps(placed[i], placed[j], 23)).toBe(false);
        }
      }
    }
  });

  it("finds room for all eight on a laptop at full size", () => {
    let short = 0;
    for (let seed = 1; seed <= 200; seed++) if (placedIn(LAPTOP, seed).length < 8) short++;
    expect(short / 200).toBeLessThan(0.02);
  });

  it("fits all eight on a small laptop by drawing them a little smaller, never over the words", () => {
    let short = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { boxes, shrink } = scatterToFit(SMALL_LAPTOP.area, SMALL_LAPTOP.keepOut, sizes, seeded(seed));
      const placed = boxes.filter((b): b is Box => b !== null);
      if (placed.length < 8) short++;
      expect(shrink).toBeGreaterThanOrEqual(0.8);
      for (const box of placed) expect(SMALL_LAPTOP.keepOut.some((k) => overlaps(box, k))).toBe(false);
    }
    expect(short / 200).toBeLessThan(0.05);
  });

  it("lays the names out the same way for the same seed, and differently for another", () => {
    const a = scatter(LAPTOP.area, LAPTOP.keepOut, sizes, seeded(7));
    expect(scatter(LAPTOP.area, LAPTOP.keepOut, sizes, seeded(7))).toEqual(a);
    expect(scatter(LAPTOP.area, LAPTOP.keepOut, sizes, seeded(8))).not.toEqual(a);
  });

  it("leaves out a name with no room rather than covering anything", () => {
    const boxes = scatter({ w: 400, h: 200 }, [{ x: 0, y: 0, w: 400, h: 200 }], sizes, seeded(1));
    expect(boxes.every((b) => b === null)).toBe(true);
  });
});
