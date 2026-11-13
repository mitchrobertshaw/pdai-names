// Where the floating names go on wide screens: somewhere random in the open space around the
// words at the top of the page, never over them, and spread out rather than lined up.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** True if two boxes overlap, or come within `gap` of each other. */
export function overlaps(a: Box, b: Box, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

/**
 * A small random number generator that repeats for the same seed (mulberry32), so a layout
 * worked out again after a resize keeps its character instead of starting over.
 */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One go at placing every box: each takes the farthest of `tries` random spots that are clear. */
function layout(area: { w: number; h: number }, keepOut: Box[], sizes: { w: number; h: number }[], random: () => number, tries: number, gap: number, margin: number) {
  const placed: Box[] = [];
  const result: (Box | null)[] = sizes.map(() => null);
  // A random order, so no name always gets first pick.
  const order = sizes.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const i of order) {
    const { w, h } = sizes[i];
    if (w <= 0 || h <= 0 || w + 2 * margin > area.w || h + 2 * margin > area.h) continue;
    let best: Box | null = null;
    let bestScore = -1;
    for (let k = 0; k < tries; k++) {
      const box = { x: margin + random() * (area.w - w - 2 * margin), y: margin + random() * (area.h - h - 2 * margin), w, h };
      if (keepOut.some((other) => overlaps(box, other))) continue;
      if (placed.some((other) => overlaps(box, other, gap))) continue;
      const score = placed.length
        ? Math.min(...placed.map((p) => Math.hypot(p.x + p.w / 2 - (box.x + w / 2), p.y + p.h / 2 - (box.y + h / 2))))
        : random();
      if (score > bestScore) {
        bestScore = score;
        best = box;
      }
    }
    if (best) {
      placed.push(best);
      result[i] = best;
    }
  }
  return result;
}

/**
 * Places boxes of the given sizes in `area`, clear of every `keepOut` box and at least `gap` from
 * each other and `margin` from the edges. Each box takes the farthest of `tries` random spots
 * from the boxes already placed, so the names scatter across the space rather than bunching up.
 * Several layouts are tried until one fits everyone, the later ones a little closer together;
 * otherwise the one that fits the most wins. A box with no room is `null`, and shouldn't be shown.
 */
export function scatter(
  area: { w: number; h: number },
  keepOut: Box[],
  sizes: { w: number; h: number }[],
  random: () => number,
  { tries = 80, gap = 40, closeGap = 24, attempts = 16, margin = 16 } = {},
): (Box | null)[] {
  let best: (Box | null)[] = sizes.map(() => null);
  let bestCount = -1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = layout(area, keepOut, sizes, random, tries, attempt < attempts / 2 ? gap : closeGap, margin);
    const count = result.filter((b) => b !== null).length;
    if (count > bestCount) {
      best = result;
      bestCount = count;
    }
    if (count === sizes.length) break;
  }
  return best;
}

/**
 * Like `scatter`, but when not everyone fits it tries again with every box a little smaller, so a
 * small screen still shows all the names. `shrink` is how much smaller they were drawn.
 */
export function scatterToFit(
  area: { w: number; h: number },
  keepOut: Box[],
  sizes: { w: number; h: number }[],
  random: () => number,
  shrinks = [1, 0.9, 0.8],
): { boxes: (Box | null)[]; shrink: number } {
  let best: { boxes: (Box | null)[]; shrink: number } = { boxes: sizes.map(() => null), shrink: 1 };
  let bestCount = -1;
  for (const shrink of shrinks) {
    const boxes = scatter(area, keepOut, sizes.map((s) => ({ w: s.w * shrink, h: s.h * shrink })), random);
    const count = boxes.filter((b) => b !== null).length;
    if (count > bestCount) {
      best = { boxes, shrink };
      bestCount = count;
    }
    if (count === sizes.length) break;
  }
  return best;
}
