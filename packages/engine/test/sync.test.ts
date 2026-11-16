import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { Clock, Committer, Vault, isSealed, memorySecretsPort, sync, type Session } from "../src/index.ts";
import { nodeFiles } from "./support/node-files.ts";
import { built, rustGitPort } from "./support/rust-git-port.ts";

/**
 * D2's two-device prototype (#29): a desktop and a phone, each a clone of one remote (a bare
 * repository here; GitHub later), edit the same session offline, the phone's clock five minutes
 * behind. Both sync; every set and both edits survive, and the files stay encrypted throughout.
 */
const git = built() ? rustGitPort() : undefined;
afterAll(() => git?.close());
let tmp = "";
beforeAll(() => { tmp = mkdtempSync(join(tmpdir(), "bm-sync-")); });
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const PASS = "correct horse battery";
const T0 = Date.parse("2026-11-16T07:00:00.000Z");

function filesUnder(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (n === ".git" || n === ".local") return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesUnder(p, base) : [p.slice(base.length + 1)];
  });
}

it.runIf(git)("two devices edit the same session offline; after syncing, both have every set and both edits", async () => {
  const remote = join(tmp, "remote.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);

  // The desktop sets up, logs a session and syncs it.
  const desktopDir = join(tmp, "desktop");
  const desktop = (await Vault.create({ files: nodeFiles, secrets: memorySecretsPort(), git: git! }, desktopDir, PASS, { scryptLogN: 10 })).vault;
  await git!.addRemote(desktopDir, "origin", remote);
  const desktopClock = new Clock("aaaaaaaaaaaaaaaa", () => T0 + 10 * 60_000);
  const session: Session = {
    type: "session", v: 1, id: "ssssssssssssssss", startedAt: "2026-11-16T07:00:00.000Z",
    entries: [{ id: "eeeeeeeeeeeeeeee", exercise: "bm:goblet-squat", modifiers: [], sets: [
      { id: "xaaaaaaaaaaaaaaa", at: "2026-11-16T07:05:00.000Z", reps: 10, loadKg: 16 },
      { id: "xbbbbbbbbbbbbbbb", at: "2026-11-16T07:08:00.000Z", reps: 10, loadKg: 16 },
    ] }],
  };
  const path = await desktop.write(session);
  const desktopCommits = new Committer(git!, desktopDir);
  expect(await sync(git!, desktop, desktopCommits)).toMatchObject({ status: "synced", pushed: true });

  // The phone clones and joins with the passphrase.
  const phoneDir = join(tmp, "phone");
  await git!.clone(remote, phoneDir);
  const phone = await Vault.join({ files: nodeFiles, secrets: memorySecretsPort(), git: git! }, phoneDir, PASS);
  const phoneClock = new Clock("pppppppppppppppp", () => T0 + 15 * 60_000 - 5 * 60_000); // five minutes slow
  const phoneCommits = new Committer(git!, phoneDir);

  // Offline: the desktop adds a set; the phone corrects the first set's reps and adds a note.
  const onDesktop = (await desktop.read(path)) as Session;
  onDesktop.entries[0]!.sets.push({ id: "xccccccccccccccc", at: "2026-11-16T07:11:00.000Z", reps: 8, loadKg: 18, edits: { reps: desktopClock.tick() } });
  await desktop.write(onDesktop);
  const onPhone = (await phone.read(path)) as Session;
  onPhone.entries[0]!.sets[0] = { ...onPhone.entries[0]!.sets[0]!, reps: 9, edits: { reps: phoneClock.tick() } };
  onPhone.note = "felt heavy";
  onPhone.edits = { note: phoneClock.tick() };
  await phone.write(onPhone);

  // Both sync: the desktop pushes first, the phone merges, the desktop fast-forwards.
  expect(await sync(git!, desktop, desktopCommits)).toMatchObject({ pushed: true, merged: false });
  expect(await sync(git!, phone, phoneCommits)).toMatchObject({ pulled: true, pushed: true, merged: true, flags: [] });
  expect(await sync(git!, desktop, desktopCommits)).toMatchObject({ pulled: true, merged: false });

  for (const v of [desktop, phone]) {
    const s = (await v.read(path)) as Session;
    expect(s.entries[0]!.sets.map((x) => [x.id.slice(1, 2), x.reps])).toEqual([["a", 9], ["b", 10], ["c", 8]]);
    expect(s.note).toBe("felt heavy");
  }
  expect(await git!.resolve(desktopDir, "HEAD")).toBe(await git!.resolve(phoneDir, "HEAD"));

  // Encrypted throughout: every file on both devices but format.yaml and .gitignore.
  for (const dir of [desktopDir, phoneDir]) {
    for (const p of filesUnder(dir).filter((p) => p !== "format.yaml" && p !== ".gitignore")) {
      expect(isSealed(new Uint8Array(readFileSync(join(dir, p)))), `${dir}/${p}`).toBe(true);
    }
  }
});

it.runIf(git)("sync off and on again loses nothing: what was logged while off goes up when it's back on (#39)", async () => {
  const { Syncer } = await import("../src/index.ts");
  const remote = join(tmp, "remote-off.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  const dir = join(tmp, "device-off");
  const v = (await Vault.create({ files: nodeFiles, secrets: memorySecretsPort(), git: git! }, dir, PASS, { scryptLogN: 10 })).vault;
  await git!.addRemote(dir, "origin", remote);
  const committer = new Committer(git!, dir);
  const syncer = new Syncer(() => sync(git!, v, committer), { beforeRun: () => committer.idle() });
  await syncer.start();
  syncer.stop();
  const s: Session = { type: "session", v: 1, id: "soffsoffsoffsoff", startedAt: "2026-11-17T07:00:00.000Z", entries: [] };
  const path = await v.write(s);
  committer.changed("Session while sync was off");
  await syncer.now(); // off: nothing goes up
  expect(execFileSync("git", ["--git-dir", remote, "ls-tree", "-r", "--name-only", "main"]).toString()).not.toContain(path);
  expect(await v.read(path)).toEqual(s); // and nothing local is lost
  await syncer.start();
  expect(syncer.status.state).toBe("idle");
  expect(execFileSync("git", ["--git-dir", remote, "ls-tree", "-r", "--name-only", "main"]).toString()).toContain(path);
});

it.runIf(git)("a second device joins with the recovery key and reads every record (#40, D2)", async () => {
  const remote = join(tmp, "remote-join.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  const first = join(tmp, "first");
  const made = await Vault.create({ files: nodeFiles, secrets: memorySecretsPort(), git: git! }, first, PASS, { scryptLogN: 10 });
  await git!.addRemote(first, "origin", remote);
  const paths: string[] = [];
  for (let n = 0; n < 5; n++) {
    paths.push(await made.vault.write({ type: "session", v: 1, id: `sjoin${"abcde"[n]}aaaaaaaaaa`, startedAt: `2026-11-1${n}T07:00:00.000Z`, entries: [] }));
  }
  await sync(git!, made.vault, new Committer(git!, first));

  const second = join(tmp, "second");
  await git!.clone(remote, second);
  const secrets = memorySecretsPort();
  const joined = await Vault.join({ files: nodeFiles, secrets, git: git! }, second, made.recoveryKey);
  for (const p of paths) expect(await joined.read(p)).toEqual(await made.vault.read(p));
  expect(await secrets.get("age-identity")).toBe(made.recoveryKey.trim());
  await expect(Vault.join({ files: nodeFiles, secrets: memorySecretsPort(), git: git! }, second, "not the passphrase")).rejects.toThrow();
});
