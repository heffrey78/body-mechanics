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

/**
 * What a piece of equipment is drawn as in a demonstration (#96): a built-in item's own model, or a
 * plain shape for the person's own equipment (a wheel with handles for an ab roller).
 */
export const SHAPES = [
  "wall", "chair", "desk", "step", "bench", "mat", "band", "dumbbells", "kettlebell", "barbell", "pullup-bar", "cable", "foam-roller", "machine",
  "wheel", "ball", "box",
] as const;
export type Shape = (typeof SHAPES)[number];

export const KINDS = ["mobility", "strength", "endurance", "balance"] as const;
export type Kind = (typeof KINDS)[number];

/** What a session mode looks for (#100, #109), beside the kinds: a static stretch, a yoga pose, a breathing exercise, a calming one. */
export const EXERCISE_TAGS = ["stretch", "yoga", "breathing", "calming"] as const;
export type ExerciseTag = (typeof EXERCISE_TAGS)[number];
/** Where the body is (#109): Wind down orders its sequence from standing to lying. */
export const POSITIONS = ["standing", "kneeling", "seated", "lying"] as const;
export type Position = (typeof POSITIONS)[number];
/** What a session is for (#100, #109). Workout is the default. */
export const MODES = ["workout", "stretch", "wind-down", "relax", "yoga", "wake-up"] as const;
export type Mode = (typeof MODES)[number];

export const MEASURES = ["reps", "time", "distance"] as const;
export type Measure = (typeof MEASURES)[number];

export const EFFORTS = ["easy", "right", "hard", "pain"] as const;
export type Effort = (typeof EFFORTS)[number];

export const MODIFIER_KINDS = ["range", "load", "support", "tempo", "position", "grip-stance", "side"] as const;
export type ModifierKind = (typeof MODIFIER_KINDS)[number];

export const UNITS = ["kg", "lb"] as const;
export type Units = (typeof UNITS)[number];

export const THEMES = ["fieldnotes", "slate", "turquoise", "riso", "handheld"] as const;
/** Themes removed in #72. A profile that still names one reads as Field Notes; nothing is rewritten until the profile is next saved. */
export const RETIRED_THEMES = ["clinic", "studio", "utility"] as const;
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

/**
 * The modifier vocabulary (#5, #46): a change to how an exercise is done. A modifier on a record is
 * {kind, id} from here, plus an optional value and note.
 */
export const MODIFIERS = {
  range: { "short-range": "Short range", "to-box": "To a box or chair", "pain-free-range": "Pain-free range only", "below-shoulder": "Below shoulder height" },
  load: { lighter: "Lighter", bodyweight: "Body weight only", "band-assisted": "Band-assisted" },
  support: { "wall-support": "Hand on a wall", "hold-support": "Hold a support", "feet-down": "Feet on the floor" },
  tempo: { "slow-lowering": "Slow lowering (3 s)", "pause-bottom": "Pause at the bottom", "no-bounce": "Smooth, no bouncing" },
  position: { incline: "Incline", seated: "Seated", "half-kneeling": "Half-kneeling", "supported-chest": "Chest supported", kneeling: "From the knees" },
  "grip-stance": { "neutral-grip": "Neutral grip", fists: "On fists", "shorter-step": "Shorter step", "wider-stance": "Wider stance" },
  side: { "one-side": "One side only" },
} as const satisfies Record<ModifierKind, Record<string, string>>;
export type ModifierId = { [K in ModifierKind]: keyof (typeof MODIFIERS)[K] }[ModifierKind];

/** A modifier id's kind and label. */
export function modifierInfo(id: string): { kind: ModifierKind; label: string } | undefined {
  for (const kind of MODIFIER_KINDS) {
    const label = (MODIFIERS[kind] as Record<string, string>)[id];
    if (label) return { kind, label };
  }
  return undefined;
}

/** Modifier ids as records keep them ({kind, id}), from the vocabulary. */
export function modifiersOf(ids: readonly string[]): { kind: ModifierKind; id: string }[] {
  return ids.flatMap((id) => { const m = modifierInfo(id); return m ? [{ kind: m.kind, id }] : []; });
}
