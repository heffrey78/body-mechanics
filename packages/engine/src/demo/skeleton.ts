/**
 * The body model's skeleton (D5, #78): 17 joints, lengths in metres, about 1.75 m tall. It stands at the
 * origin facing +z; y is up; the person's left is +x. The app draws a mannequin on it (#80).
 */
import type { Vec3 } from "./math.ts";

export const JOINTS = [
  "pelvis", "spine", "chest", "neck", "head",
  "shoulderL", "elbowL", "wristL", "shoulderR", "elbowR", "wristR",
  "hipL", "kneeL", "ankleL", "hipR", "kneeR", "ankleR",
] as const;
export type Joint = (typeof JOINTS)[number];

/** Every joint but the pelvis, whose turn and place are the whole body's. */
export const POSED_JOINTS = JOINTS.filter((j) => j !== "pelvis") as Exclude<Joint, "pelvis">[];

export interface Bone {
  parent: Joint | null;
  /** Where the joint sits from its parent, standing. */
  offset: Vec3;
  /** +1 the person's left, -1 their right, 0 the midline. */
  side: 1 | 0 | -1;
}

const limb = (parent: Joint, offset: Vec3, side: 1 | -1): Bone => ({ parent, offset, side });
const arm = (s: 1 | -1) => ({
  shoulder: limb("chest", [0.19 * s, 0.19, 0], s),
  elbow: limb(s === 1 ? "shoulderL" : "shoulderR", [0, -0.29, 0], s),
  wrist: limb(s === 1 ? "elbowL" : "elbowR", [0, -0.26, 0], s),
});
const leg = (s: 1 | -1) => ({
  hip: limb("pelvis", [0.095 * s, -0.04, 0], s),
  knee: limb(s === 1 ? "hipL" : "hipR", [0, -0.43, 0], s),
  ankle: limb(s === 1 ? "kneeL" : "kneeR", [0, -0.42, 0], s),
});

export const BONES: Record<Joint, Bone> = {
  pelvis: { parent: null, offset: [0, 0, 0], side: 0 },
  spine: { parent: "pelvis", offset: [0, 0.1, 0], side: 0 },
  chest: { parent: "spine", offset: [0, 0.16, 0], side: 0 },
  neck: { parent: "chest", offset: [0, 0.24, 0], side: 0 },
  head: { parent: "neck", offset: [0, 0.09, 0], side: 0 },
  shoulderL: arm(1).shoulder, elbowL: arm(1).elbow, wristL: arm(1).wrist,
  shoulderR: arm(-1).shoulder, elbowR: arm(-1).elbow, wristR: arm(-1).wrist,
  hipL: leg(1).hip, kneeL: leg(1).knee, ankleL: leg(1).ankle,
  hipR: leg(-1).hip, kneeR: leg(-1).knee, ankleR: leg(-1).ankle,
};

/** The pelvis's height when standing with the soles on the floor. */
export const STANDING = 0.96;

/** The middle of the palm, from the wrist: where held equipment sits. */
export const PALM: Vec3 = [0, -0.08, 0];
/** The ball of the foot, from the ankle: the point a planted foot turns on. */
export const BALL: Vec3 = [0, -0.05, 0.13];
/** The middle of the head, from the head joint, and its size. */
export const HEAD_CENTRE: Vec3 = [0, 0.1, 0.015];
export const HEAD_RADIUS = 0.105;

/** The points that can rest on the floor, each a ball of `r` at `at` from its joint. */
export const CONTACTS: { joint: Joint; at: Vec3; r: number }[] = [
  ...(["L", "R"] as const).flatMap((s) => [
    { joint: `ankle${s}` as Joint, at: [0, -0.05, 0.15] as Vec3, r: 0.02 },
    { joint: `ankle${s}` as Joint, at: [0, -0.05, -0.05] as Vec3, r: 0.02 },
    { joint: `ankle${s}` as Joint, at: [0, 0, 0] as Vec3, r: 0.045 },
    { joint: `knee${s}` as Joint, at: [0, 0, 0] as Vec3, r: 0.055 },
    { joint: `wrist${s}` as Joint, at: PALM, r: 0.035 },
    { joint: `elbow${s}` as Joint, at: [0, 0, 0] as Vec3, r: 0.04 },
    { joint: `shoulder${s}` as Joint, at: [0, 0, 0] as Vec3, r: 0.055 },
    { joint: `hip${s}` as Joint, at: [0, 0, 0] as Vec3, r: 0.085 },
  ]),
  { joint: "pelvis", at: [0, 0, 0], r: 0.11 },
  { joint: "chest", at: [0, 0.08, 0], r: 0.12 },
  { joint: "head", at: HEAD_CENTRE, r: HEAD_RADIUS },
];

/** The left joint for a right one and back; a midline joint is its own. */
export function otherSide(j: Joint): Joint {
  return (j.endsWith("L") ? `${j.slice(0, -1)}R` : j.endsWith("R") ? `${j.slice(0, -1)}L` : j) as Joint;
}
