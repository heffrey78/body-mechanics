import { describe, expect, it } from "vitest";
import { applyUpdates, progression, targetUpdates, type EntrySummary, type Routine, type RoutineItem, type Session } from "../src/index.ts";

const squat: RoutineItem = { id: "iaaaaaaaaaaaaaaa", exercise: "bm:goblet-squat", sets: 3, reps: 10, loadKg: 16 };
const plank: RoutineItem = { id: "ibbbbbbbbbbbbbbb", exercise: "bm:plank", sets: 2, seconds: 30 };
const last = (effort: EntrySummary["effort"], sets: EntrySummary["sets"]): EntrySummary => ({ exercise: "x", modified: false, sets, ...(effort ? { effort } : {}) });
const at = "2026-11-16T07:00:00.000Z";

describe("progression (#37)", () => {
  it("goes up a load step after an easy run with every set done", () => {
    const p = progression(squat, "reps", last("easy", [{ at, reps: 10, loadKg: 16 }, { at, reps: 10, loadKg: 16 }, { at, reps: 11, loadKg: 16 }]), "kg");
    expect(p).toMatchObject({ direction: "up", amount: 10, loadKg: 18.5 });
    expect(progression(squat, "reps", last("easy", [{ at, reps: 10 }, { at, reps: 10 }, { at, reps: 10 }]), "lb")?.loadKg).toBeCloseTo(18.268, 2);
  });

  it("goes up the amount where there's no load, and not at all when a set fell short", () => {
    expect(progression(plank, "time", last("easy", [{ at, seconds: 31 }, { at, seconds: 30 }]), "kg")).toMatchObject({ direction: "up", amount: 35 });
    expect(progression(plank, "time", last("easy", [{ at, seconds: 31 }, { at, seconds: 20 }]), "kg")).toBeUndefined();
    expect(progression(plank, "time", last("easy", [{ at, seconds: 31 }]), "kg")).toBeUndefined();
  });

  it("holds after hard, steps down after painful, and says nothing after about right", () => {
    expect(progression(squat, "reps", last("hard", []), "kg")).toMatchObject({ direction: "hold", amount: 10, loadKg: 16 });
    expect(progression(squat, "reps", last("pain", []), "kg")).toMatchObject({ direction: "down", loadKg: 13.5 });
    expect(progression(plank, "time", last("pain", []), "kg")).toMatchObject({ direction: "down", amount: 25 });
    expect(progression(squat, "reps", last("right", []), "kg")).toBeUndefined();
    expect(progression(squat, "reps", undefined, "kg")).toBeUndefined();
  });
});

describe("updating targets after a run (#37)", () => {
  it("proposes what was done where it differs, and applies the chosen ones", () => {
    const routine: Routine = { type: "routine", v: 1, id: "rrrrrrrrrrrrrrrr", name: "Legs", items: [squat, plank] };
    const s: Session = {
      type: "session", v: 1, id: "ssssssssssssssss", startedAt: at, routine: routine.id,
      entries: [
        { id: "eaaaaaaaaaaaaaaa", exercise: "bm:goblet-squat", modifiers: [], sets: [
          { id: "xaaaaaaaaaaaaaaa", at, reps: 10, loadKg: 18 }, { id: "xbbbbbbbbbbbbbbb", at, reps: 10, loadKg: 18 }, { id: "xccccccccccccccc", at, reps: 10, loadKg: 18 },
        ] },
        { id: "ebbbbbbbbbbbbbbb", exercise: "bm:plank", modifiers: [], sets: [{ id: "xddddddddddddddd", at, seconds: 30 }, { id: "xeeeeeeeeeeeeeee", at, seconds: 28 }] },
      ],
    };
    const u = targetUpdates(routine, s, (x) => (x === "bm:plank" ? "time" : "reps"));
    expect(u.map((x) => [x.exercise, x.to.loadKg])).toEqual([["bm:goblet-squat", 18]]);
    expect(applyUpdates(routine, u).items.map((i) => i.loadKg)).toEqual([18, undefined]);
  });
});
