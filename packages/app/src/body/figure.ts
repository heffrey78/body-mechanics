/**
 * The body map's figure (#89): a front and a back view, each drawn as half a body and mirrored.
 * Coordinates are in a 200 × 460 box with the midline at x = 100. Each area is one shape on the half
 * that lies right of the midline; `at` is where its mark letter sits.
 */
import type { Region } from "@bm/engine";

export type Face = "front" | "back";
export type Area = {
  region: Region;
  d: string;
  at: readonly [number, number];
  /** Drawn once across the midline rather than as two halves. */
  whole?: true;
};

/** Shared by both faces: the arm, the knee, the lower leg's outline and the foot. */
const SHOULDER = "M128 64 C140 62 152 68 156 82 C158 92 156 102 152 110 C147 107 143 105 140 104 C137 100 134 98 130 96 C132 86 131 74 128 64 Z";
const UPPER_ARM = "M140 104 C144 105 148 107 152 110 C158 111 162 119 163 130 C164 146 162 158 160 170 L146 168 C143 152 141 130 140 104 Z";
const FOREARM = "M146 168 L160 170 C164 188 166 208 164 236 L154 236 C149 214 146 190 146 170 Z";
const KNEE = "M110 312 L128 312 C131 322 131 336 128 346 L112 346 C108 336 108 322 110 312 Z";
const LOWER_LEG = "M112 346 L128 346 C132 362 131 392 126 420 L116 420 C111 396 110 366 112 346 Z";
const FOOT = "M116 420 L126 420 C127 430 132 440 134 446 C128 452 112 452 110 446 C113 438 115 430 116 422 Z";
const THIGH = "C141 244 139 274 134 300 C132 306 130 310 128 312 L110 312 C106 296 104 262 104 232";

export const AREAS: Record<Face, readonly Area[]> = {
  front: [
    { region: "neck", whole: true, at: [100, 57], d: "M92 46 L108 46 C108 54 114 60 128 64 L72 64 C86 60 92 54 92 46 Z" },
    { region: "shoulder", at: [143, 84], d: SHOULDER },
    { region: "chest", at: [115, 90], d: "M100 64 L128 64 C131 74 132 86 130 96 C126 108 114 114 100 112 Z" },
    { region: "upperarm", at: [152, 140], d: UPPER_ARM },
    { region: "forearm", at: [156, 204], d: FOREARM },
    { region: "core", at: [115, 150], d: "M100 112 C114 114 126 108 130 96 L133 104 C135 122 131 140 129 152 C128 162 130 172 133 180 L100 186 Z" },
    { region: "hips", at: [118, 200], d: "M100 186 L133 180 C137 190 139 200 139 210 C128 214 112 222 104 232 L100 232 Z" },
    { region: "quads", at: [121, 264], d: `M139 210 ${THIGH} C112 222 128 214 139 210 Z` },
    { region: "knee", at: [119.5, 329], d: KNEE },
    { region: "shin", at: [120.5, 382], d: LOWER_LEG },
    { region: "ankle", at: [121, 438], d: FOOT },
  ],
  back: [
    { region: "neck", whole: true, at: [100, 53], d: "M92 46 L108 46 L110 58 L90 58 Z" },
    { region: "shoulder", at: [143, 84], d: SHOULDER },
    { region: "upperback", at: [115, 100], d: "M100 58 L110 58 C116 62 122 64 128 64 C131 74 132 86 130 96 L133 104 C134 116 132 128 130 138 L100 146 Z" },
    { region: "upperarm", at: [152, 140], d: UPPER_ARM },
    { region: "forearm", at: [156, 204], d: FOREARM },
    { region: "lowerback", at: [115, 164], d: "M100 146 L130 138 C128 152 129 166 133 180 L100 184 Z" },
    { region: "glutes", at: [119, 208], d: "M100 184 L133 180 C138 192 140 206 139 218 C134 230 116 236 104 232 L100 230 Z" },
    { region: "hamstrings", at: [121, 270], d: `M139 218 ${THIGH} C116 236 134 230 139 218 Z` },
    { region: "knee", at: [119.5, 329], d: KNEE },
    { region: "calf", at: [120.5, 378], d: LOWER_LEG },
    { region: "ankle", at: [121, 438], d: FOOT },
  ],
};

/** The parts that aren't areas: the hand on each half, and the head. */
export const HAND = "M154 236 L164 236 C167 246 166 258 161 264 C156 262 153 250 154 238 Z";
export const HEAD = { cx: 100, cy: 27, rx: 15.5, ry: 19.5 } as const;

/** Muscle lines, drawn over the areas on each half. They take no taps. */
export const MUSCLES: Record<Face, readonly string[]> = {
  front: [
    "M102 68 C110 66 120 66 128 66", // collarbone
    "M104 100 C113 104 122 100 127 92", // under the chest
    "M134 68 C142 76 148 90 150 106", // deltoid
    "M147 112 C144 128 144 150 149 166", "M155 114 C158 130 158 150 156 168", // biceps
    "M152 174 C150 194 153 216 157 234", // forearm
    "M100 128 L116 127", "M100 144 L116 143", "M100 160 L115 160", // abdominals
    "M117 114 C119 136 118 162 114 184",
    "M124 112 L130 116", "M125 121 L131 125", "M125 130 L130 134", // ribs
    "M133 182 C124 198 112 216 102 228", // hip crease
    "M116 224 C114 256 116 288 120 310", "M130 216 C134 248 132 284 127 306", "M108 280 C106 294 110 306 116 310", // quadriceps
    "M113.5 328 a6 8 0 1 0 12 0 a6 8 0 1 0 -12 0", // kneecap
    "M118 348 C117 372 119 398 120 418", "M127 350 C130 366 129 382 126 396", // shin
  ],
  back: [
    "M110 58 L128 66", "M128 66 C118 84 108 100 100 112", // trapezius
    "M112 76 C122 78 128 88 124 100", // shoulder blade
    "M131 100 C126 120 114 136 102 144", // lats
    "M134 68 C142 76 148 90 150 106", // deltoid
    "M146 114 C150 130 152 150 152 166", "M157 112 C160 130 160 150 158 168", // triceps
    "M152 174 C154 194 155 216 157 234", // forearm
    "M106 148 L105 182", // beside the spine
    "M102 190 C114 186 128 190 136 200", // top of the glutes
    "M120 236 C118 262 119 290 121 310", "M129 228 C132 256 131 286 127 306", // hamstrings
    "M112 318 C116 324 124 324 128 318", // back of the knee
    "M113 350 C113 372 116 388 120 398 C124 388 128 372 128 350", "M120 398 L121 420", // calf and Achilles
  ],
};

/** The midline: breastbone and abdomen in front, the spine behind. */
export const MIDLINE: Record<Face, string> = { front: "M100 66 L100 186", back: "M100 60 L100 230" };

/**
 * Which of the person's sides lies right of the midline on screen. The front is a mirror, so that is
 * their left; from behind it is their right.
 */
export const SCREEN_RIGHT: Record<Face, "left" | "right"> = { front: "left", back: "right" };
