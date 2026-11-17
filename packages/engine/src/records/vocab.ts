/**
 * The shared vocabularies of the data model (D1, #14). Records store these ids; the UI shows labels.
 */
export const REGIONS = [
  "neck", "shoulder", "chest", "upperback", "upperarm", "forearm", "core", "lowerback",
  "hips", "glutes", "quads", "hamstrings", "knee", "shin", "calf", "ankle",
] as const;
export type Region = (typeof REGIONS)[number];

/** Regions that have a left and a right. */
export const SIDED_REGIONS: readonly Region[] = [
  "shoulder", "upperarm", "forearm", "quads", "hamstrings", "knee", "shin", "calf", "ankle",
];

/** Equipment, shared by locations and exercises (#15). An exercise with none needs nothing. */
export const EQUIPMENT = [
  "floor", "wall", "chair", "desk", "step", "bench", "mat", "band", "dumbbells",
  "kettlebell", "barbell", "pullup-bar", "cable", "foam-roller", "machine",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const KINDS = ["mobility", "strength", "endurance", "balance"] as const;
export type Kind = (typeof KINDS)[number];

export const MEASURES = ["reps", "time", "distance"] as const;
export type Measure = (typeof MEASURES)[number];

export const EFFORTS = ["easy", "right", "hard", "pain"] as const;
export type Effort = (typeof EFFORTS)[number];

export const MODIFIER_KINDS = ["range", "load", "support", "tempo", "position", "grip-stance", "side"] as const;
export type ModifierKind = (typeof MODIFIER_KINDS)[number];

export const UNITS = ["kg", "lb"] as const;
export type Units = (typeof UNITS)[number];

export const THEMES = ["clinic", "studio", "utility"] as const;
export const THEME_MODES = ["system", "light", "dark"] as const;

// ---------------------------------------------------------------- the body (#4, #5, D1)

/** What a body-map mark is (#4). */
export const MARK_KINDS = ["pain", "stiffness", "weakness", "injury"] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

/** 1 mild, 2 moderate, 3 severe. */
export const SEVERITIES = [1, 2, 3] as const;
export type Severity = (typeof SEVERITIES)[number];

/** The person's own sides; a region that isn't sided is "none". */
export const SIDES = ["left", "right", "both", "none"] as const;
export type Side = (typeof SIDES)[number];

/** When a mark or condition bothers you (#4). */
export const BOTHERS = [
  "mornings", "sitting", "standing", "walking", "bending", "overhead", "under-load", "after-exercise", "at-night", "all-the-time",
] as const;
export type Bother = (typeof BOTHERS)[number];

/** Red flags (#4): any of these sends the person to a professional, and keeps that area gentle. */
export const RED_FLAGS = ["numbness", "swelling", "after-fall", "night-pain", "getting-weaker"] as const;
export type RedFlag = (typeof RED_FLAGS)[number];
