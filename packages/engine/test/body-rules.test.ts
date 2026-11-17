import { describe, expect, it } from "vitest";
import {
  AREAS, assess, catalogue, concerns, describeConcern, helpersFor, newCondition, newMark, reviewRoutine, starterLocations, suggest,
  type Concern, type Context, type LibraryItem, type Location,
} from "../src/index.ts";

const library: LibraryItem[] = catalogue().entries.map((e) => ({
  id: e.id, name: e.name, aliases: e.aliases, works: e.works, strains: e.strains, kinds: e.kinds, measure: e.measure,
  sided: e.sided, equipment: e.equipment, sweat: e.sweat, own: false,
}));
const byId = new Map(library.map((x) => [x.id, x]));
const ex = (id: string) => byId.get(`bm:${id}`)!;
const now = new Date("2026-11-17T08:00:00.000Z");
const gym = starterLocations().find((l) => l.name === "Gym") as Location;
const home = starterLocations().find((l) => l.name === "Home") as Location;
const ctx = (body: Concern[], over: Partial<Context> = {}): Context => ({ library, done: [], refused: new Set(), history: [], lastTime: () => undefined, units: "kg", now, body, ...over });

const mark = (region: Parameters<typeof newMark>[0]["region"], side: Parameters<typeof newMark>[0]["side"], kind: Parameters<typeof newMark>[0]["kind"], severity: 1 | 2 | 3, redFlags: ("numbness" | "swelling")[] = []) =>
  newMark({ region, side, kind, severity, redFlags }, now);
const body = (...marks: ReturnType<typeof newMark>[]) => concerns({ marks, conditions: [] }, now);

describe("the body in the engine (#47)", () => {
  it("lower-back stiffness: mobility work for it, and loaded spinal flexion in a routine is flagged", () => {
    const cs = body(mark("lowerback", "none", "stiffness", 1));
    const top = suggest({ location: gym, sweat: 1, area: [], kinds: [] }, ctx(cs)).slice(0, 3);
    for (const s of top) {
      expect(helpersFor(cs[0]!), s.item.name).toContain(s.item.id);
      expect(s.reasons[0]).toBe("Helps your lower back stiffness");
    }
    expect(top.some((s) => s.item.kinds.includes("mobility"))).toBe(true);

    const routine = [
      { id: "a", exercise: "bm:cat-cow" }, { id: "b", exercise: "bm:deadlift" }, { id: "c", exercise: "bm:good-morning" }, { id: "d", exercise: "bm:biceps-curl" },
    ];
    const flags = reviewRoutine(routine, library, cs);
    expect(flags.map((f) => f.exercise)).toEqual(["bm:deadlift", "bm:good-morning"]);
    expect(flags[0]!.assessment).toMatchObject({ action: "modify", swap: "bm:romanian-deadlift", modifiers: ["lighter"] });
    expect(flags[1]!.assessment).toMatchObject({ action: "modify", swap: "bm:glute-bridge" });
    expect(flags[0]!.assessment.reasons[0]).toBe("Strains your lower back stiffness (mild): a gentler version");
  });

  it("a moderate or red-flagged mark leaves out what strains the area; a mild one modifies it", () => {
    const mild = body(mark("knee", "right", "pain", 1));
    const moderate = body(mark("knee", "right", "pain", 2));
    const flagged = body(mark("knee", "right", "pain", 1, ["swelling"]));
    expect(assess(ex("goblet-squat"), mild)).toMatchObject({ action: "modify", swap: "bm:box-squat", swapModifiers: ["slow-lowering"], modifiers: ["slow-lowering"] });
    // A swap-only rule: the swap alone, or the region's default if the swap can't be done.
    expect(assess(ex("bodyweight-squat"), mild)).toMatchObject({ swap: "bm:box-squat", swapModifiers: [], modifiers: ["short-range", "slow-lowering", "pain-free-range"] });
    expect(assess(ex("lateral-lunge"), mild)).toMatchObject({ action: "modify", modifiers: ["short-range", "slow-lowering", "pain-free-range"] });
    expect(assess(ex("goblet-squat"), moderate).action).toBe("avoid");
    expect(assess(ex("goblet-squat"), flagged).action).toBe("avoid");
    expect(assess(ex("goblet-squat"), flagged).reasons[0]).toMatch(/red flag: left out until it's been checked/);
    // A painful area worked but not strained: a caution, not a change.
    expect(assess(ex("terminal-knee-extension"), mild)).toMatchObject({ action: "caution", reasons: ["Works your right knee pain: keep it light and pain-free"] });

    const lower = { location: gym, sweat: 2 as const, area: AREAS.lower, kinds: ["strength" as const] };
    const none = suggest(lower, ctx(moderate));
    for (const s of none) expect(s.item.strains, s.item.name).not.toContain("knee");
    const some = suggest(lower, ctx(mild));
    // The gym has no chair for a box squat: the goblet squat stays, done more gently.
    expect(some.find((s) => s.item.id === "bm:goblet-squat")?.modifiers).toEqual(["slow-lowering"]);
    // At home there is one: the bodyweight squat becomes a box squat, and says why.
    const atHome = suggest({ ...lower, location: home, sweat: 1 }, ctx(mild));
    const swapped = atHome.find((s) => s.item.id === "bm:box-squat");
    expect(swapped?.insteadOf?.id).toBe("bm:bodyweight-squat");
    expect(swapped?.reasons).toContain("In place of Bodyweight squat, for your right knee pain");
    expect(atHome.some((s) => s.item.id === "bm:bodyweight-squat")).toBe(false);
    for (const s of some.filter((x) => x.item.strains.includes("knee"))) expect(s.modifiers.length, s.item.name).toBeGreaterThan(0);
  });

  it("weighs every marked area an exercise strains, not just the first", () => {
    const cs = body(mark("lowerback", "none", "stiffness", 1), mark("knee", "left", "pain", 2));
    const a = assess(ex("deadlift"), cs); // strains the lower back and the knee
    expect(a.action).toBe("avoid");
    expect(a.affects.map(describeConcern)).toEqual(["lower back stiffness", "left knee pain"]);
    const b = assess(ex("goblet-squat"), body(mark("lowerback", "none", "stiffness", 1), mark("knee", "left", "pain", 1)));
    expect(b).toMatchObject({ action: "modify", swap: "bm:box-squat" });
    expect(b.modifiers).toEqual(expect.arrayContaining(["lighter", "slow-lowering"]));
    expect(b.reasons).toHaveLength(2);
  });

  it("upper body with lower-back stiffness, right-shoulder pain and an ACL repair: the shoulder leads and is named", () => {
    const acl = newCondition({ name: "ACL repair", kind: "acl-repair", regions: [{ region: "knee", side: "left" }], since: "2019" });
    const cs = concerns({ marks: [mark("lowerback", "none", "stiffness", 1), mark("shoulder", "right", "pain", 1)], conditions: [acl] }, now);
    const s = suggest({ location: gym, sweat: 1, area: AREAS.upper, kinds: [] }, ctx(cs));
    expect(s[0]!.reasons[0]).toMatch(/^Helps your right shoulder pain/);
    for (const x of s) {
      if (x.item.strains.includes("shoulder")) expect(x.reasons.join(" "), x.item.name).toMatch(/right shoulder pain/);
      // The knee condition only comes up where the knee is loaded (kneeling, say), and is named there.
      if (x.item.strains.includes("knee")) expect(x.reasons.join(" "), x.item.name).toMatch(/left knee \(ACL repair\)/);
      else expect(x.reasons.join(" "), x.item.name).not.toMatch(/ACL/);
    }
  });

  it("a condition's avoid list holds; the rest that strains its region is modified", () => {
    const acl = newCondition({ name: "ACL repair", kind: "acl-repair", regions: [{ region: "knee", side: "left" }], since: "2019" });
    const cs = concerns({ marks: [], conditions: [acl] }, now);
    expect(assess(ex("jump-squat"), cs)).toMatchObject({ action: "avoid", reasons: ["Left out for your left knee (ACL repair)"] });
    expect(assess(ex("goblet-squat"), cs)).toMatchObject({ action: "modify", swap: "bm:box-squat" });
    expect(helpersFor(cs[0]!)).toContain("bm:terminal-knee-extension");
    // An ended condition, and a whole-body one, change nothing.
    expect(concerns({ marks: [], conditions: [{ ...acl, until: "2020" }] }, now)).toEqual([]);
    expect(concerns({ marks: [], conditions: [newCondition({ name: "Hypermobility", kind: "hypermobility", regions: [], since: "2000" })] }, now)).toEqual([]);
  });

  it("moves on to a mark not yet helped once one has been", () => {
    const cs = body(mark("lowerback", "none", "stiffness", 1), mark("neck", "none", "stiffness", 1));
    const first = suggest({ location: gym, sweat: 1, area: [], kinds: [] }, ctx(cs))[0]!;
    const next = suggest({ location: gym, sweat: 1, area: [], kinds: [] }, ctx(cs, { done: [first.item.id] }))[0]!;
    const which = (id: string) => cs.filter((c) => helpersFor(c).includes(id)).map(describeConcern);
    expect(which(first.item.id)).not.toEqual(which(next.item.id));
  });
});
