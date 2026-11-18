/**
 * The record schemas, from the data model D1 (#14): profile, custom exercise, session (with its
 * entries and sets), routine and location (#34), mark and condition with their check-ins (#45), plus
 * the plain format.yaml. Each record is one YAML file (D2,
 * #16). Every object that two devices might edit carries `edits`: an edit stamp per field, for the
 * record merge (#29). Loads are always kilograms; the profile's units are only how they're shown.
 */
import { z } from "zod";
import { HLC_PATTERN } from "./hlc.ts";
import { ID_PATTERN } from "./ids.ts";
import { BOTHERS, EFFORTS, EQUIPMENT, KINDS, MARK_KINDS, MEASURES, MODIFIER_KINDS, RED_FLAGS, REGIONS, SIDED_REGIONS, SIDES, THEMES, THEME_MODES, UNITS } from "./vocab.ts";

export const FORMAT_VERSION = 1;

const id = z.string().regex(ID_PATTERN, "an id of 16 lowercase base32 characters");
const hlc = z.string().regex(HLC_PATTERN, "an edit stamp");
const iso = z.iso.datetime({ offset: false, precision: 3 });
const edits = z.record(z.string(), hlc).optional();
const nonNegInt = z.number().int().nonnegative();
const kg = z.number().nonnegative().max(1000);
/** Built-in equipment, or a piece of the person's own (a custom equipment record's id, #60). */
const equipmentRef = z.union([z.enum(EQUIPMENT), id]);
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
  /** The old flat list (D1), read with the stand-in groups when `needs` isn't set (D4). */
  equipment: z.array(z.enum(EQUIPMENT)).default([]),
  /** What it needs (D4): alternatives, one of each group required. */
  needs: z.array(z.array(equipmentRef).min(1)).optional(),
  /** Nice to have, never required (D4). */
  optional: z.array(equipmentRef).optional(),
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
  /** The location record's id (#41). */
  location: z.string().max(80).optional(),
  answers: z
    .strictObject({ minutes: z.number().int().positive().max(600).optional(), sweat: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional() })
    .optional(),
  focus: z.strictObject({ area: z.array(z.enum(REGIONS)).default([]), kinds: z.array(z.enum(KINDS)).default([]) }).optional(),
  routine: id.optional(),
  note: z.string().max(1000).optional(),
  entries: z.array(Entry),
  /** A tombstone (#53): a deleted session stays until the merge has seen both sides (#29). */
  deleted: z.literal(true).optional(),
  edits,
});
export type Session = z.infer<typeof Session>;

// ---------------------------------------------------------------- routine (#34)

/**
 * One exercise in a routine, with its targets. The amount (reps, seconds or metres, by the exercise's
 * measure) is per side for a one-sided exercise.
 */
export const RoutineItem = z
  .strictObject({
    id,
    exercise: exerciseRef,
    sets: z.number().int().min(1).max(20),
    reps: nonNegInt.optional(),
    seconds: nonNegInt.optional(),
    metres: z.number().nonnegative().optional(),
    loadKg: kg.optional(),
    restSeconds: z.number().int().min(0).max(900).optional(),
    /** How it's done (#51): carried onto the session's entry when the routine runs. */
    modifiers: z.array(Modifier).optional(),
    note: z.string().max(200).optional(),
    deleted: z.literal(true).optional(),
    edits,
  })
  .superRefine((x, ctx) => {
    const n = [x.reps, x.seconds, x.metres].filter((v) => v !== undefined).length;
    if (n > 1) ctx.addIssue({ code: "custom", message: "at most one of reps, seconds or metres" });
  });
export type RoutineItem = z.infer<typeof RoutineItem>;

export const Routine = z.strictObject({
  type: z.literal("routine"),
  v: z.literal(FORMAT_VERSION),
  id,
  name: z.string().min(1).max(80),
  note: z.string().max(1000).optional(),
  items: z.array(RoutineItem),
  deleted: z.literal(true).optional(),
  edits,
});
export type Routine = z.infer<typeof Routine>;

// ---------------------------------------------------------------- location (#34, #3)

export const Location = z.strictObject({
  type: z.literal("location"),
  v: z.literal(FORMAT_VERSION),
  id,
  name: z.string().min(1).max(80),
  /** Built-in items and custom equipment ids (#60). */
  equipment: z.array(equipmentRef),
  /** How much sweat is fine here, by default (#3): 0 none, 1 a little, 2 bring it. */
  sweat: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  deleted: z.literal(true).optional(),
  edits,
});
export type Location = z.infer<typeof Location>;

// ---------------------------------------------------------------- the body: marks and conditions (#45, D1)

/** A day ("2026-11-16"), or for a condition's start a month or a year ("2019-06", "2019"). */
const day = z.iso.date();
const roughDate = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, "a year, a month or a day: 2019, 2019-06, 2019-06-14");
const severity = z.union([z.literal(1), z.literal(2), z.literal(3)]);

/**
 * How a mark or condition is now (D1 CheckIn). The first one is made with the mark; the latest is its
 * current state. Kept in the record's own list, so two devices' check-ins merge by id.
 */
export const CheckIn = z.strictObject({
  id,
  at: iso,
  severity,
  bothers: z.array(z.enum(BOTHERS)).default([]),
  redFlags: z.array(z.enum(RED_FLAGS)).default([]),
  note: z.string().max(500).optional(),
  deleted: z.literal(true).optional(),
  edits,
});
export type CheckIn = z.infer<typeof CheckIn>;

const sideFits = (region: string, side: string) => (SIDED_REGIONS as readonly string[]).includes(region) ? side !== "none" : side === "none";
const sideMessage = "a sided region needs left, right or both; any other region takes none";

/** How a region feels now (#4): meant to be resolved. */
export const Mark = z
  .strictObject({
    type: z.literal("mark"),
    v: z.literal(FORMAT_VERSION),
    id,
    region: z.enum(REGIONS),
    side: z.enum(SIDES),
    kind: z.enum(MARK_KINDS),
    onset: day,
    note: z.string().max(1000).optional(),
    checkins: z.array(CheckIn).min(1),
    resolvedAt: iso.optional(),
    /** Set when it was turned into a condition (#49). */
    becameCondition: id.optional(),
    deleted: z.literal(true).optional(),
    edits,
  })
  .superRefine((m, ctx) => {
    if (!sideFits(m.region, m.side)) ctx.addIssue({ code: "custom", path: ["side"], message: sideMessage });
  });
export type Mark = z.infer<typeof Mark>;

export const ConditionRegion = z
  .strictObject({ region: z.enum(REGIONS), side: z.enum(SIDES) })
  .superRefine((r, ctx) => {
    if (!sideFits(r.region, r.side)) ctx.addIssue({ code: "custom", path: ["side"], message: sideMessage });
  });
export type ConditionRegion = z.infer<typeof ConditionRegion>;

/** A long-lived fact kept on the profile (#5): an old surgery, hypermobility. No regions: the whole body. */
export const Condition = z.strictObject({
  type: z.literal("condition"),
  v: z.literal(FORMAT_VERSION),
  id,
  name: z.string().min(1).max(120),
  /** A shared condition type its rules come from (#46), e.g. "acl-repair". */
  kind: z.string().regex(/^[a-z0-9-]+$/).max(60).optional(),
  regions: z.array(ConditionRegion),
  since: roughDate,
  until: roughDate.optional(),
  note: z.string().max(1000).optional(),
  checkins: z.array(CheckIn).default([]),
  deleted: z.literal(true).optional(),
  edits,
});
export type Condition = z.infer<typeof Condition>;

// ---------------------------------------------------------------- custom equipment (#60, D4)

/** A piece of the person's own equipment: a TRX, a plyo box (standing in for a step, a bench, a chair). */
export const EquipmentItem = z.strictObject({
  type: z.literal("equipment"),
  v: z.literal(FORMAT_VERSION),
  id,
  name: z.string().min(1).max(60),
  /** Built-in items it can stand in for. */
  standsIn: z.array(z.enum(EQUIPMENT)).default([]),
  deleted: z.literal(true).optional(),
  edits,
});
export type EquipmentItem = z.infer<typeof EquipmentItem>;

// ---------------------------------------------------------------- format.yaml (plain, not encrypted)

export const Format = z.strictObject({
  format: z.literal("body-mechanics"),
  version: z.literal(FORMAT_VERSION),
  encryption: z.strictObject({ scheme: z.literal("age-x25519"), identity: z.literal("keys/identity.age") }),
});
export type Format = z.infer<typeof Format>;

export const RECORD_SCHEMAS = { profile: Profile, exercise: Exercise, session: Session, routine: Routine, location: Location, mark: Mark, condition: Condition, equipment: EquipmentItem } as const;
export type RecordType = keyof typeof RECORD_SCHEMAS;
export type AnyRecord = Profile | Exercise | Session | Routine | Location | Mark | Condition | EquipmentItem;
