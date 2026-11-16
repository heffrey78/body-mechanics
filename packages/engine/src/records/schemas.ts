/**
 * The record schemas for Build 1 (#24), from the data model D1 (#14): profile, custom exercise and
 * session (with its entries and sets), plus the plain format.yaml. Each record is one YAML file (D2,
 * #16). Every object that two devices might edit carries `edits`: an edit stamp per field, for the
 * record merge (#29). Loads are always kilograms; the profile's units are only how they're shown.
 */
import { z } from "zod";
import { HLC_PATTERN } from "./hlc.ts";
import { ID_PATTERN } from "./ids.ts";
import { EFFORTS, EQUIPMENT, KINDS, MEASURES, MODIFIER_KINDS, REGIONS, THEMES, THEME_MODES, UNITS } from "./vocab.ts";

export const FORMAT_VERSION = 1;

const id = z.string().regex(ID_PATTERN, "an id of 16 lowercase base32 characters");
const hlc = z.string().regex(HLC_PATTERN, "an edit stamp");
const iso = z.iso.datetime({ offset: false, precision: 3 });
const edits = z.record(z.string(), hlc).optional();
const nonNegInt = z.number().int().nonnegative();
const kg = z.number().nonnegative().max(1000);
/** A catalogue exercise ("wger:123", "bm:mcgill-curl-up") or one of the person's own (a record id). */
const exerciseRef = z.union([id, z.string().regex(/^[a-z]+:[a-z0-9-]+$/, "a catalogue id like wger:123")]);

// ---------------------------------------------------------------- profile

export const Profile = z.strictObject({
  type: z.literal("profile"),
  v: z.literal(FORMAT_VERSION),
  id,
  name: z.string().min(1).max(80).optional(),
  units: z.enum(UNITS),
  theme: z.strictObject({ name: z.enum(THEMES), mode: z.enum(THEME_MODES) }),
  edits,
});
export type Profile = z.infer<typeof Profile>;

// ---------------------------------------------------------------- custom exercise

export const Exercise = z.strictObject({
  type: z.literal("exercise"),
  v: z.literal(FORMAT_VERSION),
  id,
  name: z.string().min(1).max(120),
  aliases: z.array(z.string().min(1).max(120)).default([]),
  measure: z.enum(MEASURES),
  sided: z.boolean(),
  /** Regions it works. Empty: it can be logged but never suggested (#2, #3). */
  works: z.array(z.enum(REGIONS)),
  /** Regions it loads, for the body map's warnings (#4). */
  strains: z.array(z.enum(REGIONS)).default([]),
  kinds: z.array(z.enum(KINDS)).default([]),
  equipment: z.array(z.enum(EQUIPMENT)).default([]),
  sweat: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  variationOf: exerciseRef.optional(),
  /** Set when it was merged into a catalogue exercise (#15): its history counts toward that one. */
  mergedInto: exerciseRef.optional(),
  edits,
});
export type Exercise = z.infer<typeof Exercise>;

// ---------------------------------------------------------------- session

export const Modifier = z.strictObject({
  kind: z.enum(MODIFIER_KINDS),
  id: z.string().regex(/^[a-z0-9-]+$/),
  value: z.string().max(80).optional(),
  note: z.string().max(200).optional(),
});
export type Modifier = z.infer<typeof Modifier>;

/** One side's amount, or a set's when it isn't one-sided: exactly one of reps, seconds, metres. */
const Amount = z.strictObject({
  reps: nonNegInt.optional(),
  seconds: nonNegInt.optional(),
  metres: z.number().nonnegative().optional(),
});

function measureOf(a: z.infer<typeof Amount>): string | null {
  const present = (["reps", "seconds", "metres"] as const).filter((k) => a[k] !== undefined);
  return present.length === 1 ? present[0]! : null;
}

export const LoggedSet = z
  .strictObject({
    id,
    /** When it was logged. */
    at: iso,
    reps: nonNegInt.optional(),
    seconds: nonNegInt.optional(),
    metres: z.number().nonnegative().optional(),
    left: Amount.optional(),
    right: Amount.optional(),
    loadKg: kg.optional(),
    note: z.string().max(200).optional(),
    /** A tombstone: deleted sets stay until the merge has seen both sides (#29). */
    deleted: z.literal(true).optional(),
    edits,
  })
  .superRefine((s, ctx) => {
    const sided = s.left !== undefined || s.right !== undefined;
    const whole = measureOf(s);
    if (sided) {
      if (whole !== null || s.reps !== undefined || s.seconds !== undefined || s.metres !== undefined) {
        ctx.addIssue({ code: "custom", message: "a one-sided set has left and right, not its own amount" });
      }
      if (!s.left || !s.right) {
        ctx.addIssue({ code: "custom", path: [s.left ? "right" : "left"], message: "a one-sided set needs both left and right" });
        return;
      }
      const l = measureOf(s.left), r = measureOf(s.right);
      if (!l) ctx.addIssue({ code: "custom", path: ["left"], message: "exactly one of reps, seconds or metres" });
      if (!r) ctx.addIssue({ code: "custom", path: ["right"], message: "exactly one of reps, seconds or metres" });
      if (l && r && l !== r) ctx.addIssue({ code: "custom", path: ["right"], message: `measured in ${r}, but left is in ${l}` });
    } else if (!whole) {
      ctx.addIssue({ code: "custom", message: "exactly one of reps, seconds or metres (or left and right)" });
    }
  });
export type LoggedSet = z.infer<typeof LoggedSet>;

export const Entry = z.strictObject({
  id,
  exercise: exerciseRef,
  effort: z.enum(EFFORTS).optional(),
  modifiers: z.array(Modifier).default([]),
  note: z.string().max(500).optional(),
  deleted: z.literal(true).optional(),
  sets: z.array(LoggedSet),
  edits,
});
export type Entry = z.infer<typeof Entry>;

export const Session = z.strictObject({
  type: z.literal("session"),
  v: z.literal(FORMAT_VERSION),
  id,
  startedAt: iso,
  finishedAt: iso.optional(),
  location: z.string().max(80).optional(),
  answers: z
    .strictObject({ minutes: z.number().int().positive().max(600).optional(), sweat: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional() })
    .optional(),
  focus: z.strictObject({ area: z.array(z.enum(REGIONS)).default([]), kinds: z.array(z.enum(KINDS)).default([]) }).optional(),
  routine: id.optional(),
  note: z.string().max(1000).optional(),
  entries: z.array(Entry),
  edits,
});
export type Session = z.infer<typeof Session>;

// ---------------------------------------------------------------- format.yaml (plain, not encrypted)

export const Format = z.strictObject({
  format: z.literal("body-mechanics"),
  version: z.literal(FORMAT_VERSION),
  encryption: z.strictObject({ scheme: z.literal("age-x25519"), identity: z.literal("keys/identity.age") }),
});
export type Format = z.infer<typeof Format>;

export const RECORD_SCHEMAS = { profile: Profile, exercise: Exercise, session: Session } as const;
export type RecordType = keyof typeof RECORD_SCHEMAS;
export type AnyRecord = Profile | Exercise | Session;
