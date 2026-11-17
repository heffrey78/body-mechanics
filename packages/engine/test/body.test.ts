import { describe, expect, it } from "vitest";
import {
  Clock, Vault, checkIn, currentState, history, isActive, isDue, loadBody, memoryFilesPort, memorySecretsPort, mergeRecords, newCondition, newMark,
  offersCondition, parseRecord, redFlags, reopenMark, resolveMark, serializeRecord, type Mark,
} from "../src/index.ts";

const t0 = new Date("2026-11-16T08:00:00.000Z");
const days = (n: number) => new Date(t0.getTime() + n * 86_400_000);
const clockA = new Clock("aaaaaaaaaaaaaaaa", () => t0.getTime());
const clockB = new Clock("bbbbbbbbbbbbbbbb", () => t0.getTime() + 1000);

describe("marks, conditions and check-ins (#45)", () => {
  it("round-trip through YAML, and sides follow the region", () => {
    const back = newMark({ region: "lowerback", side: "none", kind: "stiffness", severity: 1, bothers: ["mornings", "sitting"] }, t0);
    expect(back.onset).toBe("2026-11-16");
    expect(parseRecord(serializeRecord(back))).toEqual(back);
    const knee = newCondition({ name: "ACL repair", kind: "acl-repair", regions: [{ region: "knee", side: "left" }], since: "2019" });
    expect(parseRecord(serializeRecord(knee))).toEqual(knee);
    expect(() => serializeRecord({ ...back, side: "left" })).toThrow(/sided region/);
    expect(() => serializeRecord(newMark({ region: "shoulder", side: "none", kind: "pain", severity: 1 }, t0))).toThrow(/sided region/);
    expect(() => serializeRecord({ ...knee, since: "June 2019" })).toThrow(/a year, a month or a day/);
  });

  it("are written encrypted under marks/ and conditions/, and load with deleted ones left out", async () => {
    const files = memoryFilesPort();
    const { vault } = await Vault.create({ files, secrets: memorySecretsPort() }, "/r", "correct horse battery", { scryptLogN: 10 });
    const shoulder = newMark({ region: "shoulder", side: "right", kind: "pain", severity: 2 }, t0);
    expect(await vault.write(shoulder)).toBe(`marks/${shoulder.id}.yaml.age`);
    await vault.write({ ...newMark({ region: "neck", side: "none", kind: "stiffness", severity: 1 }, t0), deleted: true });
    const knee = newCondition({ name: "ACL repair", regions: [{ region: "knee", side: "left" }], since: "2019-06" });
    expect(await vault.write(knee)).toBe(`conditions/${knee.id}.yaml.age`);
    const body = await loadBody(vault);
    expect(body.marks.map((m) => m.region)).toEqual(["shoulder"]);
    expect(body.conditions.map((c) => c.name)).toEqual(["ACL repair"]);
    expect(new TextDecoder().decode(files.files.get(`/r/marks/${shoulder.id}.yaml.age`)).startsWith("age-encryption.org/v1")).toBe(true);
  });

  it("keep both devices' check-ins on one mark, and the latest is its state", () => {
    const base = newMark({ region: "lowerback", side: "none", kind: "stiffness", severity: 2 }, t0);
    const ours = checkIn(base, { severity: 1, bothers: ["mornings"] }, clockA, days(7));
    const theirs = checkIn(base, { severity: 2, redFlags: ["numbness"] }, clockB, days(8));
    const { record } = mergeRecords(base, ours, theirs);
    const merged = record as Mark;
    expect(history(merged).map((h) => h.severity)).toEqual([2, 1, 2]);
    expect(currentState(merged)?.at).toBe(days(8).toISOString());
    expect(redFlags(merged)).toEqual(["numbness"]);
  });

  it("are due a check-in a week after the last; resolved marks and untouched conditions aren't", () => {
    let m = newMark({ region: "knee", side: "right", kind: "pain", severity: 1 }, t0);
    expect(isDue(m, days(6))).toBe(false);
    expect(isDue(m, days(7))).toBe(true);
    m = checkIn(m, { severity: 1 }, clockA, days(7));
    expect(isDue(m, days(10))).toBe(false);
    const done = resolveMark(m, clockA, days(10));
    expect(isActive(done)).toBe(false);
    expect(isDue(done, days(30))).toBe(false);
    expect(isActive(reopenMark(done, clockA))).toBe(true);
    expect(reopenMark(done, clockA).resolvedAt).toBeUndefined();

    const surgery = newCondition({ name: "Hip replacement", regions: [{ region: "hips", side: "none" }], since: "2020" });
    expect(isDue(surgery, days(60))).toBe(false);
    expect(isDue(checkIn(surgery, { severity: 1 }, clockA, t0), days(7))).toBe(true);
  });

  it("count a condition active from its start to the end of its end (a month or year included)", () => {
    const preg = newCondition({ name: "Pregnancy", regions: [], since: "2026-06", until: "2027-02" });
    expect(isActive(preg, new Date("2026-05-31T12:00:00Z"))).toBe(false);
    expect(isActive(preg, new Date("2026-06-01T12:00:00Z"))).toBe(true);
    expect(isActive(preg, new Date("2027-02-28T12:00:00Z"))).toBe(true);
    expect(isActive(preg, new Date("2027-03-01T12:00:00Z"))).toBe(false);
  });

  it("offer to turn a mark that has lasted three months into a condition", () => {
    const m = newMark({ region: "shoulder", side: "left", kind: "pain", severity: 1, onset: "2026-08-01" }, t0);
    expect(offersCondition(m, new Date("2026-10-29T00:00:00Z"))).toBe(false);
    expect(offersCondition(m, new Date("2026-10-30T00:00:00Z"))).toBe(true);
    expect(offersCondition({ ...m, becameCondition: "cccccccccccccccc" }, days(0))).toBe(false);
  });
});
