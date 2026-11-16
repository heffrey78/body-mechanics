import { describe, expect, it } from "vitest";
import { Decrypter } from "age-encryption";
import {
  IDENTITY_SECRET, NotSetUp, Vault, WrongPassphrase, isSealed, memoryFilesPort, memorySecretsPort,
  type AnyRecord, type Profile, type Session,
} from "../src/index.ts";

// scrypt's real work factor (2^18) takes seconds in JavaScript: tests use a small one.
const FAST = { scryptLogN: 10 };
const ROOT = "/repo";
const PASS = "correct horse battery";

const profile: Profile = { type: "profile", v: 1, id: "pppppppppppppppp", units: "kg", theme: { name: "clinic", mode: "system" } };
const session: Session = {
  type: "session", v: 1, id: "ssssssssssssssss", startedAt: "2026-11-16T07:42:00.000Z", location: "garage",
  entries: [{
    id: "aaaaaaaaaaaaaaaa", exercise: "wger:111", modifiers: [],
    sets: [{ id: "aaaaaaaaaaaaaaa2", at: "2026-11-16T07:45:00.000Z", reps: 10, loadKg: 16, note: "felt strong" }],
  }],
};
const RECORDS: AnyRecord[] = [profile, session];

async function setUp() {
  const files = memoryFilesPort();
  const secrets = memorySecretsPort();
  const { vault, recoveryKey } = await Vault.create({ files, secrets }, ROOT, PASS, FAST);
  for (const r of RECORDS) await vault.write(r);
  return { files, secrets, vault, recoveryKey };
}

/** Another device: the same files (as a clone would have them), its own secrets. */
function cloneOf(files: ReturnType<typeof memoryFilesPort>) {
  return memoryFilesPort(Object.fromEntries(files.files));
}

describe("the vault", () => {
  it("sets up a repository: plain format.yaml, a wrapped identity, the identity in the device's secrets", async () => {
    const { files, secrets, recoveryKey } = await setUp();
    const format = new TextDecoder().decode(files.files.get("/repo/format.yaml"));
    expect(format).toContain("scheme: age-x25519");
    expect(isSealed(files.files.get("/repo/keys/identity.age")!)).toBe(true);
    expect(recoveryKey).toMatch(/^AGE-SECRET-KEY-1[0-9A-Z]+$/);
    expect(secrets.values.get(IDENTITY_SECRET)).toBe(recoveryKey);
  });

  it("never lets plaintext reach the repository", async () => {
    const { files } = await setUp();
    const paths = [...files.files.keys()].filter((p) => p !== "/repo/format.yaml");
    expect(paths.sort()).toEqual(["/repo/keys/identity.age", "/repo/profile.yaml.age", "/repo/sessions/2026/11/ssssssssssssssss.yaml.age"]);
    for (const path of paths) {
      const bytes = files.files.get(path)!;
      expect(isSealed(bytes), path).toBe(true);
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      for (const secret of ["type:", "garage", "felt strong", "loadKg", "wger:111", "AGE-SECRET-KEY"]) expect(text, `${path} contains ${secret}`).not.toContain(secret);
    }
  });

  it("reads back what it wrote, and lists records", async () => {
    const { vault } = await setUp();
    expect(await vault.list()).toEqual(["profile.yaml.age", "sessions/2026/11/ssssssssssssssss.yaml.age"]);
    expect(await vault.list("sessions")).toEqual(["sessions/2026/11/ssssssssssssssss.yaml.age"]);
    expect(await vault.read("profile.yaml.age")).toEqual(profile);
    expect(await vault.read("sessions/2026/11/ssssssssssssssss.yaml.age")).toEqual(session);
    expect(await vault.read("sessions/2026/11/nope.yaml.age")).toBeUndefined();
  });

  it("D2 prototype: a second device joins with the passphrase and reads every record", async () => {
    const { files } = await setUp();
    const phone = { files: cloneOf(files), secrets: memorySecretsPort() };
    const vault = await Vault.join(phone, ROOT, PASS);
    expect(await vault.list()).toEqual(["profile.yaml.age", "sessions/2026/11/ssssssssssssssss.yaml.age"]);
    expect(await vault.read("profile.yaml.age")).toEqual(profile);
    expect(await vault.read("sessions/2026/11/ssssssssssssssss.yaml.age")).toEqual(session);
    // and it stays joined: opened next time from its own secrets
    expect(await (await Vault.open(phone, ROOT)).read("profile.yaml.age")).toEqual(profile);
  });

  it("joins with the recovery key instead of the passphrase", async () => {
    const { files, recoveryKey } = await setUp();
    const vault = await Vault.join({ files: cloneOf(files), secrets: memorySecretsPort() }, ROOT, recoveryKey);
    expect(await vault.read("profile.yaml.age")).toEqual(profile);
  });

  it("refuses a wrong passphrase clearly", async () => {
    const { files } = await setUp();
    await expect(Vault.join({ files: cloneOf(files), secrets: memorySecretsPort() }, ROOT, "not the passphrase")).rejects.toThrow(WrongPassphrase);
    await expect(Vault.join({ files: cloneOf(files), secrets: memorySecretsPort() }, ROOT, "not the passphrase")).rejects.toThrow("That passphrase doesn't open this repository's key.");
  });

  it("won't open on a device that hasn't joined, or where there's no repository", async () => {
    const { files } = await setUp();
    await expect(Vault.open({ files: cloneOf(files), secrets: memorySecretsPort() }, ROOT)).rejects.toThrow(NotSetUp);
    await expect(Vault.open({ files: memoryFilesPort(), secrets: memorySecretsPort() }, ROOT)).rejects.toThrow(NotSetUp);
  });

  it("won't set up over an existing repository, or with a short passphrase", async () => {
    const { files, secrets } = await setUp();
    await expect(Vault.create({ files, secrets }, ROOT, PASS, FAST)).rejects.toThrow("already a repository");
    await expect(Vault.create({ files: memoryFilesPort(), secrets }, ROOT, "short", FAST)).rejects.toThrow("at least 8");
  });

  it("refuses to read a record that isn't encrypted", async () => {
    const { files, vault } = await setUp();
    files.files.set("/repo/profile.yaml.age", new TextEncoder().encode("type: profile\n"));
    await expect(vault.read("profile.yaml.age")).rejects.toThrow("isn't encrypted");
  });

  it("writes real age files: the recovery key decrypts them with age itself", async () => {
    const { files, recoveryKey } = await setUp();
    const d = new Decrypter();
    d.addIdentity(recoveryKey);
    const text = await d.decrypt(files.files.get("/repo/profile.yaml.age")!, "text");
    expect(text).toContain("type: profile");
  });
});
