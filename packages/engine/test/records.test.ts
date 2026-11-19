import { describe, expect, it } from "vitest";
import {
  Clock, ID_PATTERN, RecordError, later, newId, parseFormat, parseRecord, recordPath,
  serializeFormat, serializeRecord, type Exercise, type Profile, type Session,
} from "../src/index.ts";

const DEVICE = "devaaaaaaaaaaaaa";
const stamp = (iso: string, n = 0) => `${iso}~${String(n).padStart(4, "0")}~${DEVICE}`;

const profile: Profile = {
  type: "profile", v: 1, id: "pppppppppppppppp", name: "Me", units: "kg",
  theme: { name: "fieldnotes", mode: "system" },
};

const couch: Exercise = {
  type: "exercise", v: 1, id: "eeeeeeeeeeeeeeee", name: "Couch sit-to-stand", aliases: ["sofa stand"],
  measure: "reps", sided: false, works: ["quads", "glutes"], strains: [], kinds: ["strength"],
  equipment: ["chair"], sweat: 1, variationOf: "bm:sit-to-stand",
};

const session: Session = {
  type: "session", v: 1, id: "ssssssssssssssss",
  startedAt: "2026-11-16T07:42:00.000Z", finishedAt: "2026-11-16T08:20:00.000Z",
  location: "home", answers: { minutes: 45, sweat: 2 }, focus: { area: ["quads", "glutes"], kinds: ["strength"] },
  entries: [
    {
      id: "aaaaaaaaaaaaaaaa", exercise: "wger:111", effort: "easy",
      modifiers: [{ kind: "load", id: "lighter" }],
      sets: [
        { id: "aaaaaaaaaaaaaaa2", at: "2026-11-16T07:45:00.000Z", reps: 10, loadKg: 16 },
        // an edited set: its reps were corrected after it was logged
        {
          id: "aaaaaaaaaaaaaaa3", at: "2026-11-16T07:48:00.000Z", reps: 9, loadKg: 16,
          edits: { reps: stamp("2026-11-16T07:55:00.000Z", 1) },
        },
      ],
    },
    {
      id: "bbbbbbbbbbbbbbbb", exercise: "eeeeeeeeeeeeeeee", modifiers: [],
      sets: [{ id: "bbbbbbbbbbbbbbb2", at: "2026-11-16T07:52:00.000Z", left: { seconds: 31 }, right: { seconds: 28 } }],
    },
    {
      id: "cccccccccccccccc", exercise: "wger:222", modifiers: [], deleted: true,
      sets: [{ id: "ccccccccccccccc2", at: "2026-11-16T07:58:00.000Z", metres: 30, loadKg: 32, deleted: true }],
    },
  ],
  edits: { note: stamp("2026-11-16T08:21:00.000Z") },
};

describe("records round-trip", () => {
  for (const [name, record] of [["profile", profile], ["custom exercise", couch], ["session", session]] as const) {
    it(`${name}: serialise → parse gives the same record, and the text is stable`, () => {
      const text = serializeRecord(record);
      const back = parseRecord(text);
      expect(back).toEqual(record);
      expect(serializeRecord(back)).toBe(text);
    });
  }

  it("writes defaults out, so a file always has every list", () => {
    const { aliases: _a, strains: _s, kinds: _k, equipment: _e, ...bare } = couch;
    const back = parseRecord(serializeRecord(bare as Exercise)) as Exercise;
    expect(back.strains).toEqual([]);
    expect(back.equipment).toEqual([]);
  });

  it("format.yaml round-trips", () => {
    const f = { format: "body-mechanics", version: 1, encryption: { scheme: "age-x25519", identity: "keys/identity.age" } } as const;
    expect(parseFormat(serializeFormat(f))).toEqual(f);
  });
});

function problems(text: string): string[] {
  try {
    parseRecord(text);
  } catch (e) {
    if (e instanceof RecordError) return e.problems.map((p) => `${p.path}: ${p.message}`);
    throw e;
  }
  throw new Error("expected the record to be rejected");
}

describe("invalid records are rejected, naming the field", () => {
  const withSet = (set: string) => `type: session
v: 1
id: ssssssssssssssss
startedAt: 2026-11-16T07:42:00.000Z
entries:
  - id: aaaaaaaaaaaaaaaa
    exercise: wger:111
    sets:
      - ${set}
`;

  it("a set with two amounts", () => {
    expect(problems(withSet("{ id: aaaaaaaaaaaaaaa2, at: 2026-11-16T07:45:00.000Z, reps: 10, seconds: 30 }")).join())
      .toContain("entries[0].sets[0]: exactly one of reps, seconds or metres");
  });

  it("a one-sided set with only a left", () => {
    expect(problems(withSet("{ id: aaaaaaaaaaaaaaa2, at: 2026-11-16T07:45:00.000Z, left: { reps: 8 } }")).join())
      .toContain("entries[0].sets[0].right: a one-sided set needs both left and right");
  });

  it("left in reps, right in seconds", () => {
    expect(problems(withSet("{ id: aaaaaaaaaaaaaaa2, at: 2026-11-16T07:45:00.000Z, left: { reps: 8 }, right: { seconds: 30 } }")).join())
      .toContain("entries[0].sets[0].right: measured in seconds, but left is in reps");
  });

  it("a negative load", () => {
    expect(problems(withSet("{ id: aaaaaaaaaaaaaaa2, at: 2026-11-16T07:45:00.000Z, reps: 10, loadKg: -5 }")).join())
      .toMatch(/entries\[0\]\.sets\[0\]\.loadKg:/);
  });

  it("an unknown field", () => {
    expect(problems(withSet("{ id: aaaaaaaaaaaaaaa2, at: 2026-11-16T07:45:00.000Z, reps: 10, weight: 16 }")).join())
      .toMatch(/entries\[0\]\.sets\[0\]: .*weight/);
  });

  it("a bad id and an unknown region", () => {
    const p = problems(`type: exercise
v: 1
id: Not-An-Id
name: X
measure: reps
sided: false
works: [elbows]
sweat: 0
`).join("\n");
    expect(p).toMatch(/^id: /m);
    expect(p).toMatch(/^works\[0\]: /m);
  });

  it("an unknown record type", () => {
    expect(problems("type: workout\nv: 1\n").join()).toContain("type: one of profile, exercise, session");
  });

  it("a newer format version", () => {
    expect(problems("type: profile\nv: 2\nid: pppppppppppppppp\nunits: kg\ntheme: { name: fieldnotes, mode: system }\n").join()).toMatch(/^v: /);
  });
});

describe("the strict YAML subset", () => {
  const ok = "type: profile\nv: 1\nid: pppppppppppppppp\nunits: kg\ntheme: { name: fieldnotes, mode: system }\n";

  it("accepts a plain record", () => {
    expect(parseRecord(ok).type).toBe("profile");
  });

  it("refuses duplicate keys", () => {
    expect(() => parseRecord(ok + "units: lb\n")).toThrow(RecordError);
  });

  it("refuses anchors and aliases", () => {
    expect(() => parseRecord("type: profile\nv: 1\nid: pppppppppppppppp\nunits: kg\ntheme: &t { name: fieldnotes, mode: system }\nx: *t\n")).toThrow(/alias|anchor/);
  });

  it("refuses custom tags", () => {
    expect(() => parseRecord("type: profile\nv: 1\nid: !secret pppppppppppppppp\nunits: kg\ntheme: { name: fieldnotes, mode: system }\n")).toThrow(RecordError);
  });

  it("refuses a second document", () => {
    expect(() => parseRecord(ok + "---\n" + ok)).toThrow(RecordError);
  });
});

describe("ids, stamps and paths", () => {
  it("makes opaque ids", () => {
    const a = newId(), b = newId();
    expect(a).toMatch(ID_PATTERN);
    expect(a).not.toBe(b);
  });

  it("orders stamps by time, then counter, as strings", () => {
    let t = Date.parse("2026-11-16T07:00:00.000Z");
    const clock = new Clock(DEVICE, () => t);
    const s1 = clock.tick();
    const s2 = clock.tick(); // same millisecond: the counter goes up
    t += 5;
    const s3 = clock.tick();
    expect([s3, s1, s2].sort()).toEqual([s1, s2, s3]);
    expect(later(s1, s3)).toBe(s3);
  });

  it("stays ahead of a stamp from a device whose clock runs fast", () => {
    const t = Date.parse("2026-11-16T07:00:00.000Z");
    const mine = new Clock(DEVICE, () => t);
    const theirs = `2026-11-16T07:03:00.000Z~0002~${"b".repeat(16)}`; // three minutes ahead
    mine.receive(theirs);
    expect(mine.tick() > theirs).toBe(true);
  });

  it("puts records where D2 says, with nothing but ids in the names", () => {
    expect(recordPath(session)).toBe("sessions/2026/11/ssssssssssssssss.yaml.age");
    expect(recordPath(couch)).toBe("exercises/eeeeeeeeeeeeeeee.yaml.age");
    expect(recordPath(profile)).toBe("profile.yaml.age");
  });
});

describe("retired themes (#72)", () => {
  for (const old of ["clinic", "studio", "utility"]) {
    it(`a profile naming ${old} reads as fieldnotes, everything else unchanged`, () => {
      const text = `type: profile\nv: 1\nid: pppppppppppppppp\nname: Me\nunits: lb\ntheme: { name: ${old}, mode: dark }\n`;
      expect(parseRecord(text)).toEqual({
        type: "profile", v: 1, id: "pppppppppppppppp", name: "Me", units: "lb", theme: { name: "fieldnotes", mode: "dark" },
      });
    });
  }

  it("an unknown theme that was never offered is still refused", () => {
    expect(() => parseRecord("type: profile\nv: 1\nid: pppppppppppppppp\nunits: kg\ntheme: { name: neon, mode: system }\n")).toThrow(RecordError);
  });

  it("each of the five themes round-trips", () => {
    for (const name of ["fieldnotes", "slate", "turquoise", "riso", "handheld"] as const) {
      const p: Profile = { ...profile, theme: { name, mode: "light" } };
      expect(parseRecord(serializeRecord(p))).toEqual(p);
    }
  });
});
