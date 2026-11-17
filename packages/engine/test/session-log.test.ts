import { describe, expect, it } from "vitest";
import { Clock, catalogue, modifiersOf, routineFromSession, RecordIndex, SessionLog, Vault, createExercise, deviceClock, loadLibrary, memoryFilesPort, memorySecretsPort, search, type Session } from "../src/index.ts";

async function setup() {
  const files = memoryFilesPort();
  const ports = { files, secrets: memorySecretsPort() };
  const { vault } = await Vault.create(ports, "/r", "correct horse battery", { scryptLogN: 10 });
  const { index } = await RecordIndex.build(vault, files);
  return { files, ports, vault, index };
}

describe("logging a session (#31, #32)", () => {
  it("writes every change at once: start, sets, an edit, a deletion, effort, finish", async () => {
    const { ports, vault, index } = await setup();
    let t = Date.parse("2026-11-16T07:00:00.000Z");
    const log = new SessionLog(vault, new Clock("dddddddddddddddd", () => t), { index, now: () => new Date(t) });
    const s = await log.start("bm:goblet-squat");
    const entry = s.entries[0]!;
    t += 60_000; const a = await log.logSet(entry.id, { reps: 10, loadKg: 16 });
    t += 60_000; const b = await log.logSet(entry.id, { reps: 8, loadKg: 16 });
    await log.editSet(entry.id, a.id, { reps: 9 });
    await log.deleteSet(entry.id, b.id);
    await log.setEffort(entry.id, "hard");
    const finished = await log.finish();

    const back = (await (await Vault.open(ports, "/r")).read(`sessions/2026/11/${s.id}.yaml.age`)) as Session;
    expect(back).toEqual(finished);
    expect(back.entries[0]!.sets.map((x) => [x.reps, x.deleted ?? false])).toEqual([[9, false], [8, true]]);
    expect(back.entries[0]!.sets[0]!.edits?.reps).toMatch(/~dddddddddddddddd$/);
    expect(back.entries[0]!.effort).toBe("hard");
    expect(back.finishedAt).toBeDefined();
    expect(index.lastTime("bm:goblet-squat")?.session.id).toBe(s.id);
    expect(log.session).toBeNull();
  });

  it("keeps the Suggest next answers on the session, so they survive a restart (#43)", async () => {
    const { ports, vault } = await setup();
    const log = new SessionLog(vault, new Clock("dddddddddddddddd"));
    const s = await log.start("bm:chin-tuck", { location: "llllllllllllllll" });
    await log.setAnswers({ location: "llllllllllllllll", minutes: 10, sweat: 0, area: ["neck", "shoulder"], kinds: ["mobility"] });
    const back = (await (await Vault.open(ports, "/r")).read(`sessions/${s.startedAt.slice(0, 4)}/${s.startedAt.slice(5, 7)}/${s.id}.yaml.age`)) as Session;
    expect(back).toMatchObject({ location: "llllllllllllllll", answers: { minutes: 10, sweat: 0 }, focus: { area: ["neck", "shoulder"], kinds: ["mobility"] } });
    expect(back.edits?.answers).toMatch(/~dddddddddddddddd$/);
  });

  it("keeps how an exercise was done: modifiers mark it modified, and a routine made from it keeps them (#51)", async () => {
    const { vault, index } = await setup();
    let t = Date.parse("2026-11-17T07:00:00.000Z");
    const log = new SessionLog(vault, new Clock("dddddddddddddddd", () => t), { index, now: () => new Date(t) });
    const s = await log.start("bm:goblet-squat", { modifiers: modifiersOf(["slow-lowering"]) });
    const e = s.entries[0]!;
    expect(e.modifiers).toEqual([{ kind: "tempo", id: "slow-lowering" }]);
    await log.setModifiers(e.id, modifiersOf(["slow-lowering", "to-box", "not-a-modifier"]));
    t += 60_000; await log.logSet(e.id, { reps: 10, loadKg: 12 });
    const band = await log.addEntry("bm:pull-up", modifiersOf(["band-assisted"]));
    t += 60_000; await log.logSet(band.id, { reps: 6 });
    const done = await log.finish();
    expect(done.entries[0]!.modifiers.map((m) => m.id)).toEqual(["slow-lowering", "to-box"]);
    expect(done.entries[0]!.edits?.["modifiers"]).toBeDefined();
    expect(index.progress("bm:pull-up")[0]!.modified).toBe(true);
    expect(index.sessions()[0]!.entries.map((x) => x.modified)).toEqual([true, true]);
    const r = routineFromSession(done, "Gentle", () => "reps");
    expect(r.items.map((i) => i.modifiers?.map((m) => m.id))).toEqual([["slow-lowering", "to-box"], ["band-assisted"]]);
  });

  it("keeps one device id across restarts", async () => {
    const { ports, vault } = await setup();
    const a = await deviceClock(vault);
    const b = await deviceClock(await Vault.open(ports, "/r"));
    expect(a.tick().split("~")[2]).toBe(b.tick().split("~")[2]);
  });

  it("finds a new movement of your own alongside the catalogue", async () => {
    const { vault } = await setup();
    await createExercise(vault, {
      name: "Couch sit to stand", aliases: [], measure: "reps", sided: false, works: ["quads", "glutes"], strains: ["knee"],
      kinds: ["strength"], equipment: [], sweat: 0,
    });
    const library = await loadLibrary(vault);
    expect(library.length).toBe(catalogue().entries.length + 1);
    const top = search("couch sit to stand", library)[0];
    expect(top).toMatchObject({ full: true, item: { name: "Couch sit to stand", own: true } });
  });
});
