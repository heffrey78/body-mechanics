/**
 * Session modes (#100, #109): what a session is for. Each mode is a recipe over the exercises' tags
 * and position: which exercises it admits, what it favours (with a reason that names the mode), the
 * dose it starts from, and how a plan is laid out and ordered. Workout is the engine as it was.
 */
import type { ExerciseTag, Mode, Position, Region } from "../records/vocab.ts";
import type { LibraryItem } from "../store/session-log.ts";

export interface PlanSlot {
  label: string;
  count: number;
  /** What a pick for this slot must be. */
  fit: (item: LibraryItem) => boolean;
}

export interface ModeSpec {
  label: string;
  /** The sweat a session in this mode starts from. */
  sweat: 0 | 1 | 2;
  /** Whether the mode takes this exercise at all. */
  admits: (item: LibraryItem) => boolean;
  /** Extra score and the reason, which names the mode. */
  favour: (item: LibraryItem) => { score: number; reason: string };
  /** The dose for an exercise with no history in this mode; undefined: the usual start. */
  start?: (item: LibraryItem) => { sets: number; amount: number } | undefined;
  /** The plan's sections; undefined for Workout, whose recipe follows the kinds. */
  slots?: PlanSlot[];
  /** How a plan's sections are ordered inside: by position, down to the floor or up from it. */
  order?: "down" | "up";
}

const has = (item: LibraryItem, tag: ExerciseTag) => item.tags.includes(tag);
const RANK: Record<Position, number> = { standing: 0, kneeling: 1, seated: 2, lying: 3 };
/** An exercise without a position sorts with the seated ones, between standing and lying. */
export const positionRank = (item: LibraryItem) => RANK[item.position ?? "seated"];
const onTheFloor = (item: LibraryItem) => positionRank(item) > 0;
const hold = (item: LibraryItem) => item.measure === "time";
const WHERE: Record<Position, string> = { standing: "standing", kneeling: "on hands and knees", seated: "seated", lying: "lying down" };
const where = (item: LibraryItem) => (item.position ? `, ${WHERE[item.position]}` : "");
const REGION_WORD: Partial<Record<Region, string>> = { upperback: "upper back", lowerback: "lower back", upperarm: "arms", forearm: "wrists", shoulder: "shoulders", ankle: "ankles", knee: "knees" };
const regions = (item: LibraryItem) => item.works.slice(0, 2).map((r) => REGION_WORD[r] ?? r).join(" and ");

/** Wind down and Relax: one easy round of each, breathing for a few minutes. */
const calmStart = (x: LibraryItem) =>
  has(x, "breathing") ? { sets: 1, amount: x.id === "bm:body-scan" ? 300 : 180 } : hold(x) ? { sets: 1, amount: 60 } : x.measure === "reps" ? { sets: 1, amount: 8 } : undefined;
const calm = (item: LibraryItem) => has(item, "calming") || has(item, "stretch") || has(item, "breathing");

export const MODE_SPECS: Record<Mode, ModeSpec> = {
  workout: {
    label: "Workout",
    sweat: 1,
    admits: () => true,
    favour: () => ({ score: 0, reason: "" }),
  },
  stretch: {
    label: "Stretch",
    sweat: 0,
    admits: (x) => has(x, "stretch") && x.sweat === 0,
    favour: (x) => (hold(x) ? { score: 2, reason: `Stretch: a static hold${where(x)}` } : { score: 0, reason: "Stretch: a slow, moving stretch" }),
    start: (x) => (hold(x) ? { sets: 2, amount: 45 } : undefined),
    slots: [{ label: "Stretches", count: 6, fit: (x) => has(x, "stretch") }],
    order: "down",
  },
  "wind-down": {
    label: "Wind down",
    sweat: 0,
    admits: (x) => x.sweat === 0 && calm(x) && !x.kinds.includes("endurance"),
    favour: (x) => {
      if (has(x, "breathing")) return { score: 1, reason: "Wind down: slow breathing to finish" };
      const score = (has(x, "calming") ? 2 : 0) + (has(x, "stretch") ? 1 : 0) + (onTheFloor(x) ? 1 : 0);
      return { score, reason: `Wind down: ${has(x, "calming") ? "calming" : "a slow stretch"}${where(x)}` };
    },
    start: calmStart,
    slots: [
      { label: "Unwind", count: 5, fit: (x) => !has(x, "breathing") },
      { label: "Breathe", count: 1, fit: (x) => has(x, "breathing") },
    ],
    order: "down",
  },
  relax: {
    label: "Relax",
    sweat: 0,
    admits: (x) => x.sweat === 0 && (has(x, "breathing") || (has(x, "calming") && onTheFloor(x))),
    favour: (x) => (has(x, "breathing") ? { score: 3, reason: `Relax: slow breathing${where(x)}` } : { score: 1, reason: `Relax: calming${where(x)}` }),
    start: calmStart,
    slots: [
      { label: "Settle", count: 2, fit: (x) => !has(x, "breathing") },
      { label: "Breathe", count: 2, fit: (x) => has(x, "breathing") },
    ],
    order: "down",
  },
  yoga: {
    label: "Yoga",
    sweat: 1,
    admits: (x) => has(x, "yoga") || has(x, "breathing"),
    favour: (x) => {
      if (has(x, "breathing")) return { score: has(x, "yoga") ? 3 : 0, reason: "Yoga: rest and breathe to finish" };
      return { score: 2, reason: hold(x) ? "Yoga: hold for about five breaths" : "Yoga: move with your breath" };
    },
    start: (x) => (has(x, "breathing") ? { sets: 1, amount: 180 } : has(x, "yoga") && hold(x) ? { sets: 1, amount: 30 } : has(x, "yoga") ? { sets: 1, amount: 3 } : undefined),
    slots: [
      { label: "Flow", count: 6, fit: (x) => has(x, "yoga") && !has(x, "breathing") },
      { label: "Rest", count: 1, fit: (x) => has(x, "breathing") },
    ],
    order: "down",
  },
  "wake-up": {
    label: "Wake up",
    sweat: 0,
    admits: (x) => x.sweat <= 1 && !has(x, "breathing") && !has(x, "calming") && (x.kinds.includes("mobility") || (x.sweat === 0 && !x.needs.length)),
    favour: (x) => {
      const moving = x.measure === "reps" ? 2 : 0;
      return { score: moving + (x.position === "standing" ? 1 : 0), reason: x.kinds.includes("mobility") ? `Wake up: gets your ${regions(x)} moving` : `Wake up: switches on your ${regions(x)}` };
    },
    start: (x) => (x.measure === "reps" ? { sets: 1, amount: 10 } : x.measure === "time" ? { sets: 1, amount: 30 } : undefined),
    slots: [
      { label: "Loosen up", count: 4, fit: (x) => x.kinds.includes("mobility") },
      { label: "Switch on", count: 2, fit: (x) => !x.kinds.includes("mobility") || x.kinds.length > 1 },
    ],
    order: "up",
  },
};
