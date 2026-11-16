import { describe, expect, it } from "vitest";
import { Vault, exportAll, memoryFilesPort, memorySecretsPort, parseRecord, setsCsv, type Profile, type Session } from "../src/index.ts";

const session: Session = {
  type: "session", v: 1, id: "ssssssssssssssss", startedAt: "2026-11-16T07:00:00.000Z",
  entries: [
    { id: "eeeeeeeeeeeeeeee", exercise: "bm:goblet-squat", effort: "easy", modifiers: [{ kind: "load", id: "lighter" }], sets: [
      { id: "aaaaaaaaaaaaaaaa", at: "2026-11-16T07:05:00.000Z", reps: 10, loadKg: 16, note: "slow, \"controlled\"" },
      { id: "bbbbbbbbbbbbbbbb", at: "2026-11-16T07:07:00.000Z", reps: 9, loadKg: 16, deleted: true },
    ] },
    { id: "ffffffffffffffff", exercise: "bm:calf-stretch-step", modifiers: [], sets: [
      { id: "cccccccccccccccc", at: "2026-11-16T07:10:00.000Z", left: { seconds: 31 }, right: { seconds: 28 } },
    ] },
  ],
};
const profile: Profile = { type: "profile", v: 1, id: "pppppppppppppppp", units: "kg", theme: { name: "clinic", mode: "system" } };

describe("export", () => {
  it("writes sets.csv: one row per set, one per side, deleted sets left out, loads in the person's units", () => {
    const csv = setsCsv([session], "lb", (x) => ({ "bm:goblet-squat": "Goblet squat", "bm:calf-stretch-step": "Calf stretch on a step" })[x] ?? x);
    expect(csv.trimEnd().split("\n")).toEqual([
      "date,session,exercise,set,side,reps,seconds,metres,load_lb,effort,modifiers,note",
      '2026-11-16,ssssssssssssssss,Goblet squat,1,,10,,,35.3,easy,lighter,"slow, ""controlled"""',
      "2026-11-16,ssssssssssssssss,Calf stretch on a step,1,left,,31,,,,,",
      "2026-11-16,ssssssssssssssss,Calf stretch on a step,1,right,,28,,,,,",
    ]);
  });

  it("writes every record as plain YAML in the repository's layout, readable without the app", async () => {
    const files = memoryFilesPort();
    const { vault } = await Vault.create({ files, secrets: memorySecretsPort() }, "/r", "correct horse battery", { scryptLogN: 10 });
    await vault.write(profile);
    await vault.write(session);
    const result = await exportAll(vault, files, "/out", "kg");
    expect(result).toEqual({ records: 2, rows: 3 });
    expect([...files.files.keys()].filter((p) => p.startsWith("/out/")).sort()).toEqual(["/out/README.txt", "/out/profile.yaml", "/out/sessions/2026/11/ssssssssssssssss.yaml", "/out/sets.csv"]);
    const text = new TextDecoder().decode(files.files.get("/out/sessions/2026/11/ssssssssssssssss.yaml"));
    expect(text).toContain("type: session");
    expect(parseRecord(text)).toEqual(session);
  });
});
