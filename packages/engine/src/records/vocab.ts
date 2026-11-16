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
