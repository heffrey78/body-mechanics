import { describe, expect, it } from "vitest";
import { AREAS, catalogue, equipped, starterLocations, suggest, type Answers, type Context, type LibraryItem, type Location } from "../src/index.ts";

const library: LibraryItem[] = catalogue().entries.map((e) => ({
  id: e.id, name: e.name, aliases: e.aliases, works: e.works, strains: e.strains, kinds: e.kinds, measure: e.measure,
  sided: e.sided, equipment: e.equipment, sweat: e.sweat, own: false,
}));
const places = Object.fromEntries(starterLocations().map((l) => [l.name, l])) as Record<string, Location>;
const now = new Date("2026-11-17T08:00:00.000Z");
const ctx = (over: Partial<Context> = {}): Context => ({ library, done: [], refused: new Set(), history: [], lastTime: () => undefined, units: "kg", now, ...over });
const byId = new Map(library.map((x) => [x.id, x]));

describe("equipment", () => {
  it("treats stand-ins as either-or and the rest as needed together", () => {
    expect(equipped(["dumbbells", "kettlebell"], new Set(["kettlebell"]))).toBe(true);
    expect(equipped(["barbell", "bench"], new Set(["barbell"]))).toBe(false);
    expect(equipped(["step", "bench"], new Set(["bench"]))).toBe(true);
    expect(equipped(["step", "bench"], new Set(["chair"]))).toBe(false); // only what the exercise lists stands in
    expect(equipped([], new Set())).toBe(true);
  });
});

describe("Suggest next (#42), the #13 scenarios without marks", () => {
  it("1. office, no sweat, 10 minutes: nothing the office lacks, no sweat, and it fits", () => {
    const office = places["Office"]!;
    const s = suggest({ location: office, minutesLeft: 10, sweat: 0, area: [], kinds: [] }, ctx());
    expect(s.length).toBeGreaterThan(5);
    for (const x of s) {
      expect(equipped(x.item.equipment, new Set(office.equipment)), x.item.name).toBe(true);
      expect(x.item.sweat).toBe(0);
      expect(x.minutes).toBeLessThanOrEqual(10);
      expect(x.reasons.length).toBeGreaterThan(0);
    }
    expect(s.some((x) => x.item.equipment.includes("floor"))).toBe(false);
  });

  it("2. gym, bring it, 45 minutes, a mix: a session of suggestions spreads across regions and kinds", () => {
    const answers: Answers = { location: places["Gym"]!, minutesLeft: 45, sweat: 2, area: [], kinds: [] };
    const done: string[] = [];
    for (let i = 0; i < 6; i++) done.push(suggest(answers, ctx({ done: [...done] }))[0]!.item.id);
    const items = done.map((d) => byId.get(d)!);
    expect(new Set(items.map((x) => x.works[0])).size).toBeGreaterThanOrEqual(5);
    expect(new Set(items.flatMap((x) => x.kinds)).size).toBeGreaterThanOrEqual(3);
  });

  it("5. hotel with a band, upper-body strength: band work comes through", () => {
    const hotel = { ...places["Hotel"]!, equipment: [...places["Hotel"]!.equipment, "band" as const] };
    const s = suggest({ location: hotel, sweat: 1, area: AREAS.upper, kinds: ["strength"] }, ctx());
    expect(s.slice(0, 8).some((x) => x.item.equipment.includes("band"))).toBe(true);
    for (const x of s) expect(x.item.works.some((r) => AREAS.upper.includes(r))).toBe(true);
    expect(s[0]!.reasons.join(" ")).toMatch(/your focus/);
    expect(s[0]!.reasons.join(" ")).toMatch(/Strength, as you asked/);
  });
});

describe("Suggest next: the rules", () => {
  it("never suggests a movement without a body region; once tagged, it can be", () => {
    const own: LibraryItem = { id: "oooooooooooooooo", name: "Couch sit to stand", aliases: [], works: [], strains: [], kinds: ["strength"], measure: "reps", sided: false, equipment: [], sweat: 0, own: true };
    const answers: Answers = { sweat: 0, area: ["quads"], kinds: ["strength"] };
    expect(suggest(answers, ctx({ library: [...library, own] })).some((x) => x.item.id === own.id)).toBe(false);
    const tagged = { ...own, works: ["quads" as const, "glutes" as const] };
    expect(suggest(answers, ctx({ library: [...library, tagged] })).some((x) => x.item.id === own.id)).toBe(true);
  });

  it("leaves out what's done or refused this session", () => {
    const answers: Answers = { sweat: 1, area: [], kinds: ["mobility"] };
    const first = suggest(answers, ctx())[0]!.item.id;
    const second = suggest(answers, ctx({ refused: new Set([first]) }))[0]!.item.id;
    expect(second).not.toBe(first);
    expect(suggest(answers, ctx({ done: [first] })).some((x) => x.item.id === first)).toBe(false);
  });

  it("doses from last time, a step up after an easy run", () => {
    const s = suggest({ location: places["Gym"]!, sweat: 2, area: ["quads"], kinds: ["strength"] }, ctx({
      lastTime: (x) => (x === "bm:goblet-squat" ? { exercise: x, effort: "easy", modified: false, sets: [{ at: "x", reps: 10, loadKg: 16 }, { at: "x", reps: 10, loadKg: 16 }] } : undefined),
    }));
    const squat = s.find((x) => x.item.id === "bm:goblet-squat")!;
    expect(squat).toMatchObject({ sets: 2, amount: 10, loadKg: 18.5 });
    expect(squat.reasons).toContain("Easy last time with every set done");
  });

  it("relaxes the kinds before the area when nothing matches both, and says so", () => {
    const s = suggest({ location: places["Office"]!, sweat: 0, area: ["neck"], kinds: ["endurance"] }, ctx());
    expect(s.length).toBeGreaterThan(0);
    expect(s[0]!.item.works).toContain("neck");
    expect(s[0]!.reasons).toContain("Nothing here matches every kind you asked for");
  });

  it("never breaks a hard filter, whatever the answers (exhaustive over the starter locations)", () => {
    const sweats = [0, 1, 2] as const;
    const areas = [[], AREAS.upper, AREAS.lower, AREAS.core];
    const kinds = [[], ["mobility"], ["strength", "balance"], ["endurance"]] as const;
    const minutes = [undefined, 5, 20];
    for (const location of Object.values(places)) for (const sweat of sweats) for (const area of areas) for (const k of kinds) for (const m of minutes) {
      const s = suggest({ location, sweat, area, kinds: [...k], ...(m !== undefined ? { minutesLeft: m } : {}) }, ctx({ done: ["bm:plank"], refused: new Set(["bm:cat-cow"]) }));
      for (const x of s) {
        expect(x.item.sweat).toBeLessThanOrEqual(sweat);
        expect(equipped(x.item.equipment, new Set(location.equipment))).toBe(true);
        if (m !== undefined) expect(x.minutes).toBeLessThanOrEqual(m);
        expect(["bm:plank", "bm:cat-cow"]).not.toContain(x.item.id);
        expect(x.reasons.length).toBeGreaterThan(0);
      }
    }
  });
});
