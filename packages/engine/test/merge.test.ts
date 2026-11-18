import { describe, expect, it } from "vitest";
import { mergeRecords, type Session } from "../src/index.ts";

const D = "dddddddddddddddd";
const at = (min: number, dev = D) => `2026-11-16T07:${String(min).padStart(2, "0")}:00.000Z~0000~${dev}`;

const base: Session = {
  type: "session", v: 1, id: "ssssssssssssssss", startedAt: "2026-11-16T07:00:00.000Z",
  entries: [{
    id: "eeeeeeeeeeeeeeee", exercise: "bm:goblet-squat", modifiers: [],
    sets: [
      { id: "aaaaaaaaaaaaaaaa", at: "2026-11-16T07:05:00.000Z", reps: 10, loadKg: 16 },
      { id: "bbbbbbbbbbbbbbbb", at: "2026-11-16T07:08:00.000Z", reps: 10, loadKg: 16 },
    ],
  }],
};
const clone = (s: Session): Session => JSON.parse(JSON.stringify(s));
const sets = (s: Session) => s.entries[0]!.sets;

describe("the record merge", () => {
  it("keeps a set added on one side and an edit on the other", () => {
    const ours = clone(base);
    sets(ours).push({ id: "cccccccccccccccc", at: "2026-11-16T07:11:00.000Z", reps: 8, loadKg: 18 });
    const theirs = clone(base);
    sets(theirs)[0] = { ...sets(theirs)[0]!, reps: 9, edits: { reps: at(20) } };
    theirs.note = "felt heavy";
    const { record, flags } = mergeRecords(base, ours, theirs);
    const m = record as Session;
    expect(sets(m).map((s) => [s.id.slice(0, 1), s.reps])).toEqual([["a", 9], ["b", 10], ["c", 8]]);
    expect(m.note).toBe("felt heavy");
    expect(flags).toEqual([]);
  });

  it("gives the same field, changed on both sides, to the later edit", () => {
    const ours = clone(base);
    sets(ours)[1] = { ...sets(ours)[1]!, reps: 7, edits: { reps: at(30) } };
    const theirs = clone(base);
    sets(theirs)[1] = { ...sets(theirs)[1]!, reps: 6, edits: { reps: at(25) } };
    expect(sets(mergeRecords(base, ours, theirs).record as Session)[1]!.reps).toBe(7);
    expect(sets(mergeRecords(base, theirs, ours).record as Session)[1]!.reps).toBe(7);
  });

  it("keeps an edit over a deletion, and flags it", () => {
    const ours = clone(base);
    sets(ours)[0] = { ...sets(ours)[0]!, deleted: true, edits: { deleted: at(30) } };
    const theirs = clone(base);
    sets(theirs)[0] = { ...sets(theirs)[0]!, loadKg: 20, edits: { loadKg: at(20) } };
    const { record, flags } = mergeRecords(base, ours, theirs);
    expect(sets(record as Session)[0]).toMatchObject({ loadKg: 20 });
    expect(sets(record as Session)[0]!.deleted).toBeUndefined();
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatch(/deleted on one device but edited on the other device; kept the edit/);
  });

  it("keeps a deletion nobody edited against", () => {
    const ours = clone(base);
    sets(ours)[0] = { ...sets(ours)[0]!, deleted: true, edits: { deleted: at(30) } };
    const theirs = clone(base);
    theirs.note = "unrelated";
    const m = mergeRecords(base, ours, theirs).record as Session;
    expect(sets(m)[0]!.deleted).toBe(true);
    expect(m.note).toBe("unrelated");
  });

  it("keeps entries both sides added", () => {
    const ours = clone(base);
    ours.entries.push({ id: "ffffffffffffffff", exercise: "bm:plank", modifiers: [], sets: [] });
    const theirs = clone(base);
    theirs.entries.push({ id: "gggggggggggggggg", exercise: "bm:cat-cow", modifiers: [], sets: [] });
    expect((mergeRecords(base, ours, theirs).record as Session).entries.map((e) => e.exercise)).toEqual(["bm:goblet-squat", "bm:plank", "bm:cat-cow"]);
  });

  it("takes a record only one side has", () => {
    expect(mergeRecords(undefined, base, undefined).record).toEqual(base);
    expect(mergeRecords(undefined, undefined, base).record).toEqual(base);
  });
});
