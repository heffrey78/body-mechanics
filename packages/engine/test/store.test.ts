import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  Committer, RecordIndex, Vault, clearDraft, isoWeek, loadDraft, memoryFilesPort, memorySecretsPort, saveDraft,
  type Schedule, type Session,
} from "../src/index.ts";
import { nodeFiles } from "./support/node-files.ts";
import { built, rustGitPort } from "./support/rust-git-port.ts";

const FAST = { scryptLogN: 10 };
/** A valid, distinct id per (n, prefix): n written in letters. */
const id = (n: number, c = "s") => {
  let out = "";
  for (let v = n; out.length < 15; v = Math.floor(v / 26)) out = "abcdefghijklmnopqrstuvwxyz"[v % 26] + out;
  return c + out;
};

function session(n: number, day: string, exercise = "bm:goblet-squat", loadKg = 16): Session {
  return {
    type: "session", v: 1, id: id(n), startedAt: `${day}T07:00:00.000Z`,
    entries: [{
      id: id(n, "e"), exercise, modifiers: [],
      sets: [
        { id: id(n, "x"), at: `${day}T07:05:00.000Z`, reps: 10, loadKg },
        { id: id(n, "y"), at: `${day}T07:08:00.000Z`, reps: 8, loadKg: loadKg + 2 },
      ],
    }],
  };
}

async function newVault() {
  const files = memoryFilesPort();
  const ports = { files, secrets: memorySecretsPort() };
  const { vault } = await Vault.create(ports, "/r", "correct horse battery", FAST);
  return { files, ports, vault };
}

describe("writes survive a crash", () => {
  it("leaves the old record whole when the app dies between writing and putting the file in place", async () => {
    const { vault } = await newVault();
    const s1 = session(1, "2026-11-16");
    const path = await vault.write(s1);
    const s2 = { ...s1, note: "the newer version" };
    await expect(vault.write(s2, { beforeRename: () => { throw new Error("killed"); } })).rejects.toThrow("killed");
    expect(await vault.read(path)).toEqual(s1);
    expect(await vault.list("sessions")).toEqual([path]); // the half-written temp file is never a record
  });

  it("keeps the in-progress set across a restart, encrypted, until it's cleared", async () => {
    const { ports, vault: v } = await newVault();
    await saveDraft(v, { sessionId: id(1), state: { reps: 9, loadKg: 18 }, savedAt: "2026-11-16T07:06:00.000Z" });
    const restarted = await Vault.open(ports, "/r");
    expect((await loadDraft(restarted))?.state).toEqual({ reps: 9, loadKg: 18 });
    const raw = new TextDecoder().decode(ports.files.files.get("/r/.local/draft.json.age"));
    expect(raw.startsWith("age-encryption.org/v1")).toBe(true);
    expect(raw).not.toContain("loadKg");
    await clearDraft(restarted);
    expect(await loadDraft(restarted)).toBeUndefined();
  });
});

describe("the index", () => {
  it("builds cold, then warm from its cache, and re-reads only what changed", async () => {
    const { files, vault: v } = await newVault();
    for (let n = 1; n <= 30; n++) await v.write(session(n, `2026-10-${String(n).padStart(2, "0")}`));
    const cold = await RecordIndex.build(v, files);
    expect(cold.stats).toMatchObject({ files: 30, reread: 30, failed: 0 });
    await cold.saved;
    const warm = await RecordIndex.build(v, files);
    expect(warm.stats).toMatchObject({ files: 30, reread: 0 });
    await v.write({ ...session(5, "2026-10-05"), location: "gym" });
    await warm.saved;
    const again = await RecordIndex.build(v, files);
    expect(again.stats).toMatchObject({ files: 30, reread: 1 });
    expect(again.index.sessions().find((s) => s.id === id(5))?.location).toBe("gym");
  });

  it("answers last time, weeks and progress", async () => {
    const { files, vault: v } = await newVault();
    await v.write(session(1, "2026-11-02", "bm:goblet-squat", 12));
    await v.write(session(2, "2026-11-09", "bm:goblet-squat", 14));
    await v.write(session(3, "2026-11-16", "bm:goblet-squat", 16));
    await v.write(session(4, "2026-11-16", "bm:plank"));
    const { index } = await RecordIndex.build(v, files);
    expect(index.lastTime("bm:goblet-squat")?.entry.sets.map((s) => s.loadKg)).toEqual([16, 18]);
    expect(index.lastTime("bm:goblet-squat", "2026-11-16")?.session.startedAt).toBe("2026-11-09T07:00:00.000Z");
    expect(index.lastTime("bm:nothing")).toBeUndefined();
    // best of load × reps per session: 10 × 12 beats 8 × 14, and so on
    expect(index.progress("bm:goblet-squat").map((p) => p.best)).toEqual([120, 140, 160]);
    expect(index.weeks().map((w) => [w.week, w.sessions.length])).toEqual([["2026-W47", 2], ["2026-W46", 1], ["2026-W45", 1]]);
  });

  it("puts a session just written into the index without a rescan", async () => {
    const { files, vault: v } = await newVault();
    const { index } = await RecordIndex.build(v, files);
    const s = session(9, "2026-11-16");
    index.put(await v.write(s), s);
    expect(index.lastTime("bm:goblet-squat")?.session.id).toBe(id(9));
  });

  it("numbers ISO weeks as ISO does", () => {
    expect(isoWeek("2026-01-01T10:00:00.000Z")).toBe("2026-W01");
    expect(isoWeek("2026-12-31T10:00:00.000Z")).toBe("2026-W53");
    expect(isoWeek("2027-01-03T10:00:00.000Z")).toBe("2026-W53");
    expect(isoWeek("2026-11-16T07:00:00.000Z")).toBe("2026-W47");
  });
});

/** A clock the test moves by hand. */
function fakeSchedule() {
  let now = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let next = 0;
  const schedule: Schedule = {
    set: (fn, ms) => { timers.set(++next, { at: now + ms, fn }); return next; },
    clear: (h) => void timers.delete(h as number),
    now: () => now,
  };
  const advance = async (ms: number) => {
    now += ms;
    for (const [k, t] of [...timers]) if (t.at <= now) { timers.delete(k); t.fn(); }
    await new Promise((r) => setTimeout(r, 50));
  };
  return { schedule, advance };
}

const git = built() ? rustGitPort() : undefined;
afterAll(() => git?.close());
let tmp = "";
beforeAll(() => { tmp = mkdtempSync(join(tmpdir(), "bm-store-")); });
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe.runIf(git)("committing", () => {
  it("sets up a git repository with the app's identity, ignoring .local/", async () => {
    const root = join(tmp, "setup");
    const { vault: v } = await Vault.create({ files: nodeFiles, secrets: memorySecretsPort(), git: git! }, root, "correct horse battery", FAST);
    const log = await git!.log(root);
    expect(log).toHaveLength(1);
    expect(await git!.getConfig(root, "user.name")).toBe("Body Mechanics");
    await saveDraft(v, { sessionId: id(1), state: {}, savedAt: "2026-11-16T07:00:00.000Z" });
    expect(await git!.status(root)).toEqual([]); // the draft in .local/ isn't a change
  });

  it("commits after a quiet period, at once when asked, and never when nothing changed", async () => {
    const root = join(tmp, "commits");
    const { vault: v } = await Vault.create({ files: nodeFiles, secrets: memorySecretsPort(), git: git! }, root, "correct horse battery", FAST);
    const { schedule, advance } = fakeSchedule();
    const committer = new Committer(git!, root, { quietMs: 30_000, maxMs: 300_000, schedule });

    await v.write(session(1, "2026-11-16"));
    committer.changed("Session, 16 Nov");
    await advance(20_000);
    expect(await git!.log(root)).toHaveLength(1); // not yet: still within the quiet period
    await advance(15_000);
    expect(await git!.log(root)).toHaveLength(2);

    await v.write(session(2, "2026-11-17"));
    expect(await committer.now("Finished session, 17 Nov")).toBeTruthy();
    expect(await git!.log(root)).toHaveLength(3);
    expect(await committer.now()).toBeUndefined(); // nothing changed
    mkdirSync(join(root, ".local"), { recursive: true });
    writeFileSync(join(root, ".local", "scratch"), "x");
    expect(await committer.now()).toBeUndefined(); // .local/ is ignored
  });
});

describe("the profile", () => {
  it("is made with defaults the first time and read back after", async () => {
    const { loadProfile, showLoad, toKg } = await import("../src/index.ts");
    const { ports, vault: v } = await newVault();
    const first = await loadProfile(v, { units: "lb" });
    expect(first.created).toBe(true);
    expect(first.profile).toMatchObject({ type: "profile", units: "lb", theme: { name: "clinic", mode: "system" } });
    const again = await loadProfile(await Vault.open(ports, "/r"));
    expect(again).toMatchObject({ created: false, profile: { id: first.profile.id, units: "lb" } });
    expect(showLoad(16, "kg")).toBe("16 kg");
    expect(showLoad(16, "lb")).toBe("35.5 lb");
    expect(toKg(35, "lb")).toBeCloseTo(15.876, 3);
  });
});
