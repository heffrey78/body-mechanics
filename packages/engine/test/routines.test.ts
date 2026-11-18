import { describe, expect, it } from "vitest";
import { Clock, editRoutine, mergeRecords, newItem, routineFromSession, type Routine, type Session } from "../src/index.ts";

const T = Date.parse("2026-11-17T07:00:00.000Z");
const base: Routine = {
  type: "routine", v: 1, id: "rrrrrrrrrrrrrrrr", name: "Legs",
  items: [
    { id: "iaaaaaaaaaaaaaaa", exercise: "bm:goblet-squat", sets: 3, reps: 10, loadKg: 16 },
    { id: "ibbbbbbbbbbbbbbb", exercise: "bm:calf-raise", sets: 2, reps: 15 },
    { id: "iccccccccccccccc", exercise: "bm:plank", sets: 2, seconds: 30 },
  ],
};
const clone = (r: Routine): Routine => JSON.parse(JSON.stringify(r));

describe("editing routines (#35)", () => {
  it("stamps only what changed, item by item, and a reorder", () => {
    const after = clone(base);
    after.items[0]!.loadKg = 18;
    after.items = [after.items[2]!, after.items[0]!, after.items[1]!];
    const r = editRoutine(base, after, new Clock("dddddddddddddddd", () => T));
    expect(r.edits && Object.keys(r.edits)).toEqual(["items.order"]);
    expect(r.items.find((i) => i.exercise === "bm:goblet-squat")!.edits).toEqual({ loadKg: expect.stringMatching(/~dddddddddddddddd$/) });
    expect(r.items.find((i) => i.exercise === "bm:plank")!.edits).toBeUndefined();
  });

  it("merges a reorder on one device with a target change on the other, the later reorder winning", () => {
    const desk = new Clock("aaaaaaaaaaaaaaaa", () => T);
    const phone = new Clock("pppppppppppppppp", () => T + 60_000);
    const ours = clone(base);
    ours.items[1]!.reps = 20;
    const o = editRoutine(base, ours, desk);
    const theirs = clone(base);
    theirs.items = [theirs.items[2]!, theirs.items[0]!, theirs.items[1]!];
    const t = editRoutine(base, theirs, phone);
    for (const m of [mergeRecords(base, o, t).record, mergeRecords(base, t, o).record] as Routine[]) {
      expect(m.items.map((i) => [i.exercise, i.reps ?? i.seconds])).toEqual([["bm:plank", 30], ["bm:goblet-squat", 10], ["bm:calf-raise", 20]]);
    }
  });

  it("starts a new item from how the exercise is measured", () => {
    expect(newItem("bm:plank", "time")).toMatchObject({ sets: 2, seconds: 30 });
    expect(newItem("bm:goblet-squat", "reps")).toMatchObject({ sets: 3, reps: 10 });
  });
});

describe("Save as routine (#35)", () => {
  it("takes the exercises in order, the sets done, the best amount and the heaviest load", () => {
    const s: Session = {
      type: "session", v: 1, id: "ssssssssssssssss", startedAt: "2026-11-16T07:00:00.000Z",
      entries: [
        { id: "eaaaaaaaaaaaaaaa", exercise: "bm:goblet-squat", modifiers: [], sets: [
          { id: "xaaaaaaaaaaaaaaa", at: "2026-11-16T07:01:00.000Z", reps: 10, loadKg: 16 },
          { id: "xbbbbbbbbbbbbbbb", at: "2026-11-16T07:03:00.000Z", reps: 8, loadKg: 18 },
          { id: "xccccccccccccccc", at: "2026-11-16T07:05:00.000Z", reps: 6, loadKg: 20, deleted: true },
        ] },
        { id: "ebbbbbbbbbbbbbbb", exercise: "bm:calf-stretch-step", modifiers: [], sets: [
          { id: "xddddddddddddddd", at: "2026-11-16T07:07:00.000Z", left: { seconds: 35 }, right: { seconds: 30 } },
        ] },
        { id: "ecccccccccccccccc".slice(0, 16), exercise: "bm:plank", modifiers: [], sets: [] },
      ],
    };
    const r = routineFromSession(s, "From Monday", (x) => (x === "bm:goblet-squat" ? "reps" : "time"));
    expect(r.name).toBe("From Monday");
    expect(r.items.map(({ id: _id, ...i }) => i)).toEqual([
      { exercise: "bm:goblet-squat", sets: 2, reps: 10, loadKg: 18 },
      { exercise: "bm:calf-stretch-step", sets: 1, seconds: 30 },
    ]);
  });
});

describe("running a routine (#36)", () => {
  it("tracks each planned exercise's sets and finds the next one, skipping what's done or skipped", async () => {
    const { planStatus, nextStep } = await import("../src/index.ts");
    const s: Session = {
      type: "session", v: 1, id: "ssssssssssssssss", startedAt: "2026-11-17T07:00:00.000Z", routine: base.id,
      entries: [{ id: "eaaaaaaaaaaaaaaa", exercise: "bm:goblet-squat", modifiers: [], sets: [
        { id: "xaaaaaaaaaaaaaaa", at: "2026-11-17T07:01:00.000Z", reps: 10, loadKg: 16 },
        { id: "xbbbbbbbbbbbbbbb", at: "2026-11-17T07:03:00.000Z", reps: 10, loadKg: 16 },
        { id: "xccccccccccccccc", at: "2026-11-17T07:05:00.000Z", reps: 9, loadKg: 16 },
      ] }],
    };
    const steps = planStatus(base.items, s);
    expect(steps.map((x) => [x.item.exercise, x.done, x.complete])).toEqual([["bm:goblet-squat", 3, true], ["bm:calf-raise", 0, false], ["bm:plank", 0, false]]);
    expect(nextStep(steps)?.item.exercise).toBe("bm:calf-raise");
    expect(nextStep(steps, new Set([base.items[1]!.id]))?.item.exercise).toBe("bm:plank");
    expect(nextStep(steps, new Set(), base.items[2]!.id)?.item.exercise).toBe("bm:calf-raise");
  });
});
