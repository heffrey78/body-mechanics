import { describe, expect, it } from "vitest";
import {
  RecordIndex, Vault, loadLocations, loadRoutines, memoryFilesPort, memorySecretsPort, mergeRecords, parseRecord, serializeRecord, starterLocations,
  type Routine, type Session,
} from "../src/index.ts";

const routine: Routine = {
  type: "routine", v: 1, id: "rrrrrrrrrrrrrrrr", name: "Morning mobility",
  items: [
    { id: "iaaaaaaaaaaaaaaa", exercise: "bm:cat-cow", sets: 1, reps: 10 },
    { id: "ibbbbbbbbbbbbbbb", exercise: "bm:calf-stretch-step", sets: 2, seconds: 30, restSeconds: 20 },
    { id: "iccccccccccccccc", exercise: "bm:goblet-squat", sets: 3, reps: 10, loadKg: 16, restSeconds: 90 },
  ],
};

describe("routines and locations (#34)", () => {
  it("round-trip through YAML and reject a target with two amounts", () => {
    expect(parseRecord(serializeRecord(routine))).toEqual(routine);
    const [home] = starterLocations();
    expect(parseRecord(serializeRecord(home!))).toEqual(home);
    const bad = { ...routine, items: [{ ...routine.items[0]!, seconds: 30 }] };
    expect(() => serializeRecord(bad as Routine)).toThrow(/at most one of reps, seconds or metres/);
  });

  it("are written encrypted where D2 puts them, and listed without the deleted ones", async () => {
    const files = memoryFilesPort();
    const { vault } = await Vault.create({ files, secrets: memorySecretsPort() }, "/r", "correct horse battery", { scryptLogN: 10 });
    expect(await vault.write(routine)).toBe("routines/rrrrrrrrrrrrrrrr.yaml.age");
    await vault.write({ ...routine, id: "rddddddddddddddd", name: "Gone", deleted: true });
    for (const l of starterLocations()) await vault.write(l);
    expect((await loadRoutines(vault)).map((r) => r.name)).toEqual(["Morning mobility"]);
    expect((await loadLocations(vault)).map((l) => [l.name, l.sweat])).toEqual([["Gym", 2], ["Home", 1], ["Hotel", 1], ["Office", 0]]);
    const raw = new TextDecoder().decode(files.files.get("/r/routines/rrrrrrrrrrrrrrrr.yaml.age"));
    expect(raw.startsWith("age-encryption.org/v1")).toBe(true);
  });

  it("merge two devices' edits of one routine: a reorder-free edit, an added item, a deleted one", () => {
    const ours: Routine = JSON.parse(JSON.stringify(routine));
    ours.items[2]!.loadKg = 18;
    ours.items[2]!.edits = { loadKg: "2026-11-17T07:00:00.000Z~0000~aaaaaaaaaaaaaaaa" };
    ours.items.push({ id: "iddddddddddddddd", exercise: "bm:plank", sets: 2, seconds: 30 });
    const theirs: Routine = JSON.parse(JSON.stringify(routine));
    theirs.items[0] = { ...theirs.items[0]!, deleted: true, edits: { deleted: "2026-11-17T07:01:00.000Z~0000~pppppppppppppppp" } };
    theirs.name = "Morning";
    const m = mergeRecords(routine, ours, theirs).record as Routine;
    expect(m.name).toBe("Morning");
    expect(m.items.map((i) => [i.exercise, i.deleted ?? false, i.loadKg])).toEqual([
      ["bm:cat-cow", true, undefined], ["bm:calf-stretch-step", false, undefined], ["bm:goblet-squat", false, 18], ["bm:plank", false, undefined],
    ]);
  });

  it("finds the sessions run from a routine", async () => {
    const files = memoryFilesPort();
    const { vault } = await Vault.create({ files, secrets: memorySecretsPort() }, "/r", "correct horse battery", { scryptLogN: 10 });
    const s = (id: string, day: string, r?: string): Session => ({ type: "session", v: 1, id, startedAt: `${day}T07:00:00.000Z`, ...(r ? { routine: r } : {}), entries: [] });
    await vault.write(s("saaaaaaaaaaaaaaa", "2026-11-10", routine.id));
    await vault.write(s("sbbbbbbbbbbbbbbb", "2026-11-12"));
    await vault.write(s("scccccccccccccccc".slice(0, 16), "2026-11-14", routine.id));
    const { index } = await RecordIndex.build(vault, files);
    expect(index.runs(routine.id).map((x) => x.startedAt.slice(0, 10))).toEqual(["2026-11-14", "2026-11-10"]);
  });
});
