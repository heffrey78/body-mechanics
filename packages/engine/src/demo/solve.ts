/**
 * From a demonstration to where every joint is (D5, #78): blend the key poses at a moment in the loop,
 * walk the skeleton, then move the body so that what should stay put does (the floor under it, the
 * planted feet, the hands on a bar). The app draws the result (#80).
 */
import type { DemoClip, DemoPose } from "../records/schemas.ts";
import { type Quat, type Vec3, add, ease, lerp, mid, qEuler, qmul, qrot, slerp, sub } from "./math.ts";
import { BALL, BONES, CONTACTS, JOINTS, PALM, type Joint, otherSide } from "./skeleton.ts";

export interface Placed { pos: Vec3; rot: Quat }
/** Every joint's place and facing in the scene. */
export type Solved = Record<Joint, Placed>;

/** A pose as rotations, ready to blend: one per joint, in JOINTS order. */
interface QPose { at: Vec3; rots: Quat[] }

const ZERO: Vec3 = [0, 0, 0];

/** A joint's own rotation from its [forward, side, twist] angles. */
export function jointRotation(joint: Joint, [forward, side, twist]: Vec3): Quat {
  const s = BONES[joint].side;
  // The trunk and head: bent forward, leaned left, turned left. A limb: forward, away from the midline, turned out.
  return s === 0 ? qEuler(forward, twist, -side) : qEuler(-forward, s * twist, s * side);
}

function toQ(pose: DemoPose): QPose {
  return { at: pose.at, rots: JOINTS.map((j) => jointRotation(j, j === "pelvis" ? pose.turn : pose.joints[j] ?? ZERO)) };
}

function blend(a: QPose, b: QPose, k: number): QPose {
  return { at: lerp(a.at, b.at, k), rots: a.rots.map((q, i) => slerp(q, b.rots[i]!, k)) };
}

function walk(q: QPose): Solved {
  const out = {} as Solved;
  JOINTS.forEach((j, i) => {
    const bone = BONES[j];
    if (!bone.parent) out[j] = { pos: q.at, rot: q.rots[i]! };
    else {
      const p = out[bone.parent];
      out[j] = { pos: add(p.pos, qrot(p.rot, bone.offset)), rot: qmul(p.rot, q.rots[i]!) };
    }
  });
  return out;
}

const point = (s: Solved, joint: Joint, at: Vec3): Vec3 => add(s[joint].pos, qrot(s[joint].rot, at));
/** The middle of a palm: where held equipment sits. */
export const palm = (s: Solved, side: "L" | "R"): Vec3 => point(s, `wrist${side}`, PALM);
/** Where one item held in both hands sits (#95): midway between the palms, turned halfway between the hands. */
export const grip = (s: Solved): Placed => ({ pos: mid(palm(s, "L"), palm(s, "R")), rot: slerp(s.wristL.rot, s.wristR.rot, 0.5) });
/** The ball of a foot. */
export const ball = (s: Solved, side: "L" | "R"): Vec3 => point(s, `ankle${side}`, BALL);

function moved(s: Solved, by: Vec3): Solved {
  const out = {} as Solved;
  for (const j of JOINTS) out[j] = { pos: add(s[j].pos, by), rot: s[j].rot };
  return out;
}

/** The body lowered or raised so its lowest point rests on the floor. */
function onFloor(s: Solved): Solved {
  let low = Infinity;
  for (const c of CONTACTS) low = Math.min(low, point(s, c.joint, c.at)[1] - c.r);
  return moved(s, [0, -low, 0]);
}

function pin(s: Solved, anchor: DemoClip["anchor"]): Vec3 {
  switch (anchor) {
    case "left-foot": return ball(s, "L");
    case "right-foot": return ball(s, "R");
    case "hands": return mid(palm(s, "L"), palm(s, "R"));
    default: return mid(ball(s, "L"), ball(s, "R"));
  }
}

const sorted = (clip: DemoClip) => [...clip.frames].sort((a, b) => a.t - b.t);

function settle(clip: DemoClip, s: Solved): Solved {
  if (clip.anchor === "free") return s;
  if (clip.anchor === "floor") return onFloor(s);
  // Pinned: the point stays where the first key pose has it. Feet start on the floor; hands start where they were put.
  const first = walk(toQ(sorted(clip)[0]!.pose));
  const ref = pin(clip.anchor === "hands" ? first : onFloor(first), clip.anchor);
  return moved(s, sub(ref, pin(s, clip.anchor)));
}

function poseAt(clip: DemoClip, phase: number): QPose {
  const f = sorted(clip);
  const q = (i: number) => toQ(f[i]!.pose);
  if (f.length === 1) return q(0);
  const p = ((phase % 1) + 1) % 1;
  const last = f.length - 1;
  if (clip.loop === "round") {
    // Past the last key pose (or before the first) it comes round to the first again.
    if (p < f[0]!.t || p >= f[last]!.t) {
      const span = f[0]!.t + 1 - f[last]!.t;
      return blend(q(last), q(0), span > 0 ? ease((((p - f[last]!.t) % 1) + 1) % 1 / span) : 1);
    }
  }
  const u = clip.loop === "round" ? p : p < 0.5 ? p * 2 : 2 - p * 2;
  if (u <= f[0]!.t) return q(0);
  if (u >= f[last]!.t) return q(last);
  const i = f.findIndex((x, n) => n < last && u >= x.t && u <= f[n + 1]!.t);
  const span = f[i + 1]!.t - f[i]!.t;
  return blend(q(i), q(i + 1), span > 0 ? ease((u - f[i]!.t) / span) : 1);
}

/** Where every joint is at `phase` of the loop (0 to 1; it wraps). */
export function solve(clip: DemoClip, phase: number): Solved {
  return settle(clip, walk(toQ0(clip, phase)));
}
const toQ0 = poseAt;

/** Where every joint is in one pose, settled as the demonstration settles it: for the builder (#83). */
export function solvePose(clip: DemoClip, pose: DemoPose): Solved {
  return settle(clip, walk(toQ(pose)));
}

/** The loop position (0 to 1) at which a key pose at time `t` is showing. */
export function phaseOf(clip: DemoClip, t: number): number {
  return clip.loop === "round" ? t : t / 2;
}

/** The pelvis height that puts this pose's lowest point on the floor. */
export function floorHeight(pose: DemoPose): number {
  return onFloor(walk(toQ(pose))).pelvis.pos[1];
}

// ---------------------------------------------------------------- editing poses

const flip = ([f, s, t]: Vec3): Vec3 => [f, s === 0 ? 0 : -s, t === 0 ? 0 : -t];

/** The pose as in a mirror: left and right swapped. */
export function mirrorPose(pose: DemoPose): DemoPose {
  const joints: DemoPose["joints"] = {};
  for (const j of JOINTS) {
    const a = pose.joints[j];
    if (!a || j === "pelvis") continue;
    if (BONES[j].side === 0) joints[j] = flip(a);
    else joints[otherSide(j)] = a;
  }
  return { at: [pose.at[0] === 0 ? 0 : -pose.at[0], pose.at[1], pose.at[2]], turn: flip(pose.turn), joints };
}

/** One side's arm and leg copied to the other. */
export function copySide(pose: DemoPose, from: "L" | "R"): DemoPose {
  const joints: DemoPose["joints"] = { ...pose.joints };
  for (const j of JOINTS) {
    if (!j.endsWith(from)) continue;
    const a = pose.joints[j];
    if (a) joints[otherSide(j)] = a;
    else delete joints[otherSide(j)];
  }
  return { ...pose, joints };
}
