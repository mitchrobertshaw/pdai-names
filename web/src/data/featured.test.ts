import { ens_normalize } from "@adraffy/ens-normalize";
import { describe, expect, it } from "vitest";

import { reservedNames } from "../lib/reserved";
import { featuredNames } from "./featured";

describe("featured names", () => {
  it("only shows people whose names are reserved", () => {
    for (const f of featuredNames.filter((f) => f.person)) {
      expect(reservedNames.has(f.label), `${f.label}.hex must be in script/reserved-names.csv`).toBe(true);
    }
  });

  it("have a picture saved for every person", () => {
    const saved = Object.keys(import.meta.glob("../assets/avatars/*.jpg"));
    for (const f of featuredNames.filter((f) => f.person)) {
      const key = f.picture ?? f.x;
      expect(key, `${f.label}.hex needs an X handle or a picture`).toBeDefined();
      expect(saved, f.x && !f.picture ? `run "npm run avatars" to save @${f.x}'s picture` : `save ${key}.jpg`).toContain(
        `../assets/avatars/${key!.toLowerCase()}.jpg`,
      );
    }
  });

  it("are written as wallets will look them up", () => {
    for (const f of featuredNames) expect(ens_normalize(f.label)).toBe(f.label);
  });

  it("give every person's .hex their colour, easy to read in both themes", () => {
    // WCAG contrast against the pill: 3:1 on white (the names are decoration), 4.5:1 on dark.
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const f of featuredNames.filter((f) => f.person)) {
      expect(f.tone, `${f.label}.hex needs a tone picked from their picture`).toBeDefined();
      expect(f.tone!.light).toMatch(/^#[0-9a-f]{6}$/);
      expect(f.tone!.dark).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrast(f.tone!.light, "#ffffff"), `${f.label}.hex on the light theme`).toBeGreaterThanOrEqual(3);
      expect(contrast(f.tone!.dark, "#1f1527"), `${f.label}.hex on the dark theme`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("are not repeated", () => {
    const labels = featuredNames.map((f) => f.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
