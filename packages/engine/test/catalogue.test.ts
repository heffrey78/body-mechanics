import { describe, expect, it } from "vitest";
import { MARK_KINDS, REGIONS, bodyRules, catalogue, catalogueEntry, modifierInfo } from "../src/index.ts";

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

  it("has enough for every session mode with nothing but a floor (#100, #109)", () => {
    const bare = entries.filter((e) => e.sweat === 0 && (e.needs ?? e.equipment.map((x) => [x])).every((g) => g.some((x) => x === "floor")));
    const count = (tag: "stretch" | "yoga" | "breathing" | "calming") => bare.filter((e) => e.tags?.includes(tag)).length;
    expect(count("stretch")).toBeGreaterThanOrEqual(6);
    expect(count("yoga")).toBeGreaterThanOrEqual(6);
    expect(count("calming")).toBeGreaterThanOrEqual(6);
    expect(count("breathing")).toBeGreaterThanOrEqual(3);
    // Wind down runs from standing to lying: each position has something calming.
    for (const p of ["standing", "kneeling", "seated", "lying"] as const) {
      expect(entries.some((e) => e.position === p && (e.tags?.includes("calming") || e.tags?.includes("stretch"))), p).toBe(true);
    }
    // Every tagged exercise says where the body is.
    for (const e of entries.filter((x) => x.tags?.length)) expect(e.position, e.id).toBeDefined();
  });

  it("keeps left and right out of names: one-sidedness is `sided`", () => {
    for (const e of entries) for (const n of [e.name, ...e.aliases]) expect(n, e.id).not.toMatch(/^(left|right)\b|\b(left|right)$/i);
  });

  describe("body rules (#46)", () => {
    const rules = bodyRules();
    it("name only catalogue exercises and vocabulary modifiers", () => {
      const ids = [...rules.helps.flatMap((h) => h.exercises), ...rules.modify.flatMap((m) => [m.exercise, ...(m.swap ? [m.swap] : [])]), ...rules.conditions.flatMap((c) => [...c.avoid, ...c.helps])];
      for (const id of ids) expect(catalogueEntry(id), id).toBeDefined();
      for (const m of [...rules.modify.flatMap((x) => x.modifiers), ...Object.values(rules.defaults).flat()]) expect(modifierInfo(m), m).toBeDefined();
    });
    it("have something that helps every kind of mark on every region, and defaults for every region", () => {
      for (const region of REGIONS) {
        expect(rules.defaults[region], region).toBeDefined();
        for (const kind of MARK_KINDS) expect(rules.helps.some((h) => h.region === region && h.marks.includes(kind)), `${region} ${kind}`).toBe(true);
      }
    });
    it("only modify an exercise for a region it strains, and swap to one that is gentler there", () => {
      for (const m of rules.modify) {
        expect(catalogueEntry(m.exercise)!.strains, `${m.exercise} ${m.region}`).toContain(m.region);
        // A swap is the gentler version (a box squat still loads the knee, less), never one that strains more.
        if (m.swap) expect(catalogueEntry(m.swap)!.strains.length, `${m.exercise} → ${m.swap}`).toBeLessThanOrEqual(catalogueEntry(m.exercise)!.strains.length);
      }
    });
  });
});
