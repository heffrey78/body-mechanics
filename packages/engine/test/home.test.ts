import { describe, expect, it } from "vitest";
import {
  assess, catalogue, concerns, fromCatalogue, minding, newMark, routineCard, sessionCue, sinceText, weekStrip,
  type LibraryItem,
} from "../src/index.ts";

const library: LibraryItem[] = catalogue().entries.map(fromCatalogue);
const now = new Date("2026-11-19T12:00:00.000Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("Minding cards (#73)", () => {
  it("names the place, how long, and what goes lighter or sits out", () => {
    const stiff = newMark({ region: "knee", side: "left", kind: "stiffness", severity: 1, redFlags: [] }, daysAgo(8));
    const [card] = minding({ marks: [stiff], conditions: [] }, library, ["bm:goblet-squat", "bm:biceps-curl", "bm:lateral-lunge"], now);
    expect(card).toMatchObject({ id: stiff.id, title: "Your left knee", due: true });
    expect(card!.line).toBe("Stiff for a week. Goblet squat and lateral lunge go lighter.");
  });

  it("a moderate mark sits strained exercises out", () => {
    const sore = newMark({ region: "knee", side: "right", kind: "pain", severity: 2, redFlags: [] }, daysAgo(2));
    const [card] = minding({ marks: [sore], conditions: [] }, library, ["bm:goblet-squat", "bm:terminal-knee-extension"], now);
    expect(card!.line).toBe("Sore for 2 days. Goblet squat sits out until it settles, and band terminal knee extension stays light.");
  });

  it("says so when nothing you do works it, and skips resolved marks", () => {
    const neck = newMark({ region: "neck", side: "none", kind: "stiffness", severity: 1, redFlags: [] }, now);
    const done = { ...newMark({ region: "shoulder", side: "left", kind: "pain", severity: 1, redFlags: [] }, now), resolvedAt: now.toISOString() };
    const cards = minding({ marks: [neck, done], conditions: [] }, library, ["bm:biceps-curl"], now);
    expect(cards).toEqual([{ id: neck.id, title: "Your neck", line: "Stiff since today. Nothing you usually do works it hard.", due: false }]);
  });

  it("puts due check-ins first", () => {
    const fresh = newMark({ region: "neck", side: "none", kind: "pain", severity: 3, redFlags: [] }, now);
    const old = newMark({ region: "calf", side: "left", kind: "stiffness", severity: 1, redFlags: [] }, daysAgo(10));
    expect(minding({ marks: [fresh, old], conditions: [] }, library, [], now).map((c) => c.id)).toEqual([old.id, fresh.id]);
  });

  it("counts time in plain words", () => {
    expect(sinceText("2026-11-18", now)).toBe("since yesterday");
    expect(sinceText("2026-11-05", now)).toBe("for 2 weeks");
    expect(sinceText("2026-07-01", now)).toBe("for 5 months");
  });
});

describe("the session cue (#73)", () => {
  it("says what the body changes about the exercise, or nothing", () => {
    const cs = concerns({ marks: [newMark({ region: "knee", side: "left", kind: "stiffness", severity: 1, redFlags: [] }, now)], conditions: [] }, now);
    const goblet = library.find((x) => x.id === "bm:goblet-squat")!;
    const curl = library.find((x) => x.id === "bm:biceps-curl")!;
    expect(sessionCue(assess(goblet, cs))).toBe("Lighter today, for your left knee.");
    expect(sessionCue(assess(curl, cs))).toBeNull();
  });
});

describe("this week (#73)", () => {
  it("Monday to Sunday: finished sessions only, today marked", () => {
    // 2026-11-19 is a Thursday.
    const local = (d: number, h = 9) => new Date(2026, 10, d, h).toISOString();
    const w = weekStrip([
      { startedAt: local(16), finishedAt: local(16, 10) },
      { startedAt: local(17), finishedAt: local(17, 10) },
      { startedAt: local(17, 18), finishedAt: local(17, 19) },
      { startedAt: local(19) },
      { startedAt: local(15), finishedAt: local(15, 10) },
    ], new Date(2026, 10, 19, 12));
    expect(w.count).toBe(3);
    expect(w.days.map((d) => d.done)).toEqual([true, true, false, false, false, false, false]);
    expect(w.days.findIndex((d) => d.today)).toBe(3);
    expect(w.days.map((d) => d.label).join("")).toBe("MTWTFSS");
  });
});

describe("routine cards (#73)", () => {
  it("moves, and minutes from the last finished run", () => {
    const items = [{ deleted: undefined }, { deleted: undefined }, { deleted: true as const }] as never;
    expect(routineCard({ items }, [])).toEqual({ moves: 2 });
    expect(routineCard({ items }, [{ startedAt: "2026-11-18T08:00:00.000Z" }, { startedAt: "2026-11-17T08:00:00.000Z", finishedAt: "2026-11-17T08:34:40.000Z" }])).toEqual({ moves: 2, minutes: 35 });
  });
});
