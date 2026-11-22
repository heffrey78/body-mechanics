import { describe, expect, it } from "vitest";
import { AREAS, MODE_SPECS, buildPlan, catalogue, fits, fromCatalogue, equipped, starterLocations, suggest, type Answers, type Context, type LibraryItem, type Location } from "../src/index.ts";

const library: LibraryItem[] = catalogue().entries.map(fromCatalogue);
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
      expect(fits(x.item.needs, new Set(office.equipment)), x.item.name).toBe(true);
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
    const own: LibraryItem = { id: "oooooooooooooooo", name: "Couch sit to stand", aliases: [], works: [], strains: [], kinds: ["strength"], tags: [], measure: "reps", sided: false, equipment: [], needs: [], optional: [], sweat: 0, own: true };
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
        expect(fits(x.item.needs, new Set(location.equipment)), x.item.name).toBe(true);
        if (m !== undefined) expect(x.minutes).toBeLessThanOrEqual(m);
        expect(["bm:plank", "bm:cat-cow"]).not.toContain(x.item.id);
        expect(x.reasons.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("session modes (#100, #109)", () => {
  const home = places["Home"]!;
  const office = places["Office"]!;
  const modes = ["stretch", "wind-down", "relax", "yoga", "wake-up"] as const;
  const RANK = { standing: 0, kneeling: 1, seated: 2, lying: 3 } as const;
  const rank = (x: LibraryItem) => RANK[x.position ?? "seated"];

  it("suggests only what each mode admits, and every suggestion's reasons name the mode", () => {
    for (const mode of modes) for (const location of [home, office]) {
      const s = suggest({ location, sweat: 1, area: [], kinds: [], mode }, ctx());
      expect(s.length, `${mode} at ${location.name}`).toBeGreaterThan(3);
      for (const x of s) {
        expect(MODE_SPECS[mode].admits(x.item), `${mode}: ${x.item.name}`).toBe(true);
        expect(x.reasons[0], `${mode}: ${x.item.name}`).toMatch(new RegExp(`^${MODE_SPECS[mode].label}: `));
      }
    }
  });

  it("plans a full session in every mode, at home and at the office, inside the time", () => {
    for (const mode of modes) for (const location of [home, office]) {
      const plan = buildPlan({ location, sweat: 1, area: [], kinds: [], mode, minutesLeft: 20 }, ctx());
      const items = plan.sections.flatMap((s) => s.items);
      expect(items.length, `${mode} at ${location.name}`).toBeGreaterThanOrEqual(4);
      expect(new Set(items.map((x) => x.item.id)).size).toBe(items.length);
      expect(items.reduce((a, x) => a + x.minutes, 0), `${mode} at ${location.name}`).toBeLessThanOrEqual(20);
    }
  });

  it("winds down from standing to lying, and ends on breathing", () => {
    const plan = buildPlan({ location: home, sweat: 0, area: [], kinds: [], mode: "wind-down", minutesLeft: 25 }, ctx());
    const items = plan.sections.flatMap((s) => s.items);
    for (let i = 1; i < items.length; i++) expect(rank(items[i]!.item)).toBeGreaterThanOrEqual(rank(items[i - 1]!.item));
    expect(plan.sections.at(-1)!.label).toBe("Breathe");
    expect(items.at(-1)!.item.tags).toContain("breathing");
    for (const x of items) expect(x.item.sweat).toBe(0);
  });

  it("stretches with static holds, relaxes mostly with breathing, and holds yoga poses for about five breaths", () => {
    const stretch = buildPlan({ location: home, sweat: 0, area: [], kinds: [], mode: "stretch" }, ctx()).sections.flatMap((s) => s.items);
    for (const x of stretch) expect(x.item.tags).toContain("stretch");
    expect(stretch.filter((x) => x.item.measure === "time").every((x) => x.amount === 45)).toBe(true);
    const relax = suggest({ location: home, sweat: 0, area: [], kinds: [], mode: "relax" }, ctx());
    expect(relax[0]!.item.tags).toContain("breathing");
    expect(relax[0]!.amount).toBeGreaterThanOrEqual(180);
    const yoga = buildPlan({ location: home, sweat: 1, area: [], kinds: [], mode: "yoga" }, ctx()).sections[0]!.items;
    for (const x of yoga) expect(x.item.tags).toContain("yoga");
    expect(yoga.find((x) => x.item.measure === "time")!.amount).toBe(30);
  });

  it("wakes up with moving exercises, nothing sweaty or sleepy", () => {
    const s = suggest({ location: home, sweat: 2, area: [], kinds: [], mode: "wake-up" }, ctx());
    for (const x of s) {
      expect(x.item.sweat).toBeLessThanOrEqual(1);
      expect(x.item.tags).not.toContain("calming");
    }
    expect(s.slice(0, 5).every((x) => x.item.measure === "reps")).toBe(true);
  });

  it("falls back to the gentlest exercises, and says so, when nothing here fits the mode", () => {
    const yogaFree = library.filter((x) => !x.tags.includes("yoga") && !x.tags.includes("breathing"));
    const s = suggest({ location: home, sweat: 1, area: [], kinds: [], mode: "yoga" }, ctx({ library: yogaFree }));
    expect(s.length).toBeGreaterThan(0);
    for (const x of s) expect(x.item.kinds).toContain("mobility");
    expect(s[0]!.reasons).toContain("Nothing here fits Yoga exactly");
  });

  it("leaves a workout as it was: no mode and mode workout give the same suggestions", () => {
    const a: Answers = { location: places["Gym"]!, sweat: 2, area: [], kinds: [] };
    expect(suggest({ ...a, mode: "workout" }, ctx({ seed: "x" }))).toEqual(suggest(a, ctx({ seed: "x" })));
  });
});
