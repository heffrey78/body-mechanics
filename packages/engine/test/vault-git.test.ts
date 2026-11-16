import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { Vault, isSealed, memorySecretsPort, type Session } from "../src/index.ts";
import { nodeFiles } from "./support/node-files.ts";
import { built, rustGitPort } from "./support/rust-git-port.ts";

/**
 * D2's prototype test for joining (#25), through real git: the desktop sets up and commits, a second
 * clone is made with libgit2 (the port the app uses), the phone joins it with the passphrase and
 * reads every record. And every committed file but format.yaml is age-encrypted.
 */
const git = built() ? rustGitPort() : undefined;
afterAll(() => git?.close());

let tmp = "";
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "bm-vault-git-"));
  const config = join(tmp, "gitconfig");
  writeFileSync(config, "[user]\n\tname = Test\n\temail = test@example.com\n[init]\n\tdefaultBranch = main\n");
  process.env["GIT_CONFIG_GLOBAL"] = config;
  process.env["GIT_CONFIG_NOSYSTEM"] = "1";
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const session: Session = {
  type: "session", v: 1, id: "ssssssssssssssss", startedAt: "2026-11-16T07:42:00.000Z",
  entries: [{ id: "aaaaaaaaaaaaaaaa", exercise: "wger:111", modifiers: [], sets: [{ id: "aaaaaaaaaaaaaaa2", at: "2026-11-16T07:45:00.000Z", reps: 10, loadKg: 16 }] }],
};

function filesUnder(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === ".git") return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? filesUnder(p, base) : [p.slice(base.length + 1)];
  });
}

it.runIf(git)("a second device clones with libgit2, joins with the passphrase and reads every record", async () => {
  const desktop = join(tmp, "desktop");
  const { vault } = await Vault.create({ files: nodeFiles, secrets: memorySecretsPort() }, desktop, "correct horse battery", { scryptLogN: 10 });
  await vault.write(session);
  await git!.init(desktop, "main");
  await git!.stage(desktop);
  await git!.commit(desktop, "First session");

  // Every committed file but format.yaml is encrypted.
  for (const path of filesUnder(desktop).filter((p) => p !== "format.yaml")) {
    expect(isSealed(new Uint8Array(readFileSync(join(desktop, path)))), path).toBe(true);
  }

  const phone = join(tmp, "phone");
  await git!.clone(desktop, phone);
  const joined = await Vault.join({ files: nodeFiles, secrets: memorySecretsPort() }, phone, "correct horse battery");
  expect(await joined.list()).toEqual(["sessions/2026/11/ssssssssssssssss.yaml.age"]);
  expect(await joined.read("sessions/2026/11/ssssssssssssssss.yaml.age")).toEqual(session);
});
