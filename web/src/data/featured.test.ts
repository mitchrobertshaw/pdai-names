import { ens_normalize } from "@adraffy/ens-normalize";
import { describe, expect, it } from "vitest";

import { reservedNames } from "../lib/reserved";
import { featuredNames } from "./featured";

describe("featured names", () => {
  it("only shows people whose names are reserved", () => {
    for (const f of featuredNames.filter((f) => f.person)) {
      expect(reservedNames.has(f.label), `${f.label}.pdai must be in script/reserved-names.csv`).toBe(true);
    }
  });

  it("have a picture saved for every person", () => {
    const saved = Object.keys(import.meta.glob("../assets/avatars/*.jpg"));
    for (const f of featuredNames.filter((f) => f.person)) {
      const key = f.picture ?? f.x;
      expect(key, `${f.label}.pdai needs an X handle or a picture`).toBeDefined();
      expect(saved, f.x && !f.picture ? `run "npm run avatars" to save @${f.x}'s picture` : `save ${key}.jpg`).toContain(
        `../assets/avatars/${key!.toLowerCase()}.jpg`,
      );
    }
  });

  it("are written as wallets will look them up", () => {
    for (const f of featuredNames) expect(ens_normalize(f.label)).toBe(f.label);
  });

  it("are not repeated", () => {
    const labels = featuredNames.map((f) => f.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
