import { describe, expect, it } from "vitest";
import { catalogue, catalogueEntry } from "../src/index.ts";

/** The bundled catalogue (#26): valid, consistent, and credited. Built by scripts/catalogue/build.ts. */
describe("the catalogue", () => {
  const { entries } = catalogue();

  it("has about 150 exercises, each id once", () => {
    expect(entries.length).toBeGreaterThanOrEqual(140);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });

  it("has instructions, a licence and an author for every exercise", () => {
    for (const e of entries) {
      expect(e.instructions.trim(), e.id).not.toBe("");
      expect(e.licence.name, e.id).toMatch(/CC/);
      expect(e.authors.length, e.id).toBeGreaterThan(0);
    }
  });

  it("links every variation to an exercise in the catalogue", () => {
    for (const e of entries.filter((x) => x.variationOf)) expect(catalogueEntry(e.variationOf!), `${e.id} → ${e.variationOf}`).toBeDefined();
  });

  it("covers every kind and the rehab staples D3 named", () => {
    for (const kind of ["mobility", "strength", "endurance", "balance"] as const) expect(entries.some((e) => e.kinds.includes(kind)), kind).toBe(true);
    for (const id of ["bm:mcgill-curl-up", "bm:chin-tuck", "bm:cat-cow", "bm:terminal-knee-extension", "bm:wall-slides", "bm:single-leg-stand"]) expect(catalogueEntry(id), id).toBeDefined();
  });

  it("keeps left and right out of names: one-sidedness is `sided`", () => {
    for (const e of entries) for (const n of [e.name, ...e.aliases]) expect(n, e.id).not.toMatch(/^(left|right)\b|\b(left|right)$/i);
  });
});
