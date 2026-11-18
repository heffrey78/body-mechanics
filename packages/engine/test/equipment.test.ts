import { describe, expect, it } from "vitest";
import { catalogue, fits, fromCatalogue, mentioned, needsFromLegacy, starterLocations, suggest, type Context, type LibraryItem } from "../src/index.ts";

const library: LibraryItem[] = catalogue().entries.map(fromCatalogue);
const now = new Date("2026-11-17T08:00:00.000Z");
const ctx = (lib: LibraryItem[]): Context => ({ library: lib, done: [], refused: new Set(), history: [], lastTime: () => undefined, units: "kg", now });

describe("equipment as alternatives and optional items (D4, #58)", () => {
  it("needs one alternative of every group; optional items never stop it", () => {
    expect(fits([["chair", "bench", "step"]], new Set(["bench"]))).toBe(true);
    expect(fits([["barbell", "dumbbells"], ["bench"]], new Set(["dumbbells"]))).toBe(false);
    expect(fits([], new Set())).toBe(true);
    expect(mentioned({ needs: [["chair", "bench"]], optional: ["mat"] })).toEqual(["chair", "bench", "mat"]);
  });

  it("reads an old flat list with the old stand-in groups", () => {
    expect(needsFromLegacy(["dumbbells", "kettlebell"])).toEqual([["dumbbells", "kettlebell"]]);
    expect(needsFromLegacy(["barbell", "bench"])).toEqual([["barbell"], ["bench"]]);
    expect(needsFromLegacy(["floor", "mat", "band"])).toEqual([["floor", "mat"], ["band"]]);
  });

  it("lets an item stand in for others (a plyo box for a step, bench or chair)", () => {
    expect(fits([["chair"]], new Set(["plyo-box"]), new Map([["plyo-box", ["step", "bench", "chair"]]]))).toBe(true);
    expect(fits([["chair"]], new Set(["plyo-box"]))).toBe(false);
  });

  it("suggests a box squat at a gym with only a bench once it says chair, bench or step", () => {
    const gym = starterLocations().find((l) => l.name === "Gym")!;
    const answers = { location: gym, sweat: 2 as const, area: ["quads" as const], kinds: ["strength" as const] };
    const box = (over: Partial<LibraryItem>) => library.map((x) => (x.id === "bm:box-squat" ? { ...x, ...over } : x));
    expect(suggest(answers, ctx(library)).some((s) => s.item.id === "bm:box-squat")).toBe(false);
    expect(suggest(answers, ctx(box({ needs: [["chair", "bench", "step"]] }))).some((s) => s.item.id === "bm:box-squat")).toBe(true);
    // A mat as optional: suggested at the office, which has none.
    const office = starterLocations().find((l) => l.name === "Office")!;
    const withMat = library.map((x) => (x.id === "bm:chin-tuck" ? { ...x, needs: [], optional: ["mat" as const] } : x));
    expect(suggest({ location: office, sweat: 0, area: ["neck"], kinds: [] }, ctx(withMat)).some((s) => s.item.id === "bm:chin-tuck")).toBe(true);
  });
});
