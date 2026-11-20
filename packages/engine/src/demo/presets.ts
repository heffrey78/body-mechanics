/** Ready-made positions to start a demonstration from (#77). */
import type { DemoAnchor, DemoPose } from "../records/schemas.ts";
import type { Vec3 } from "./math.ts";
import { STANDING, type Joint } from "./skeleton.ts";

type Angles = Partial<Record<Joint, Vec3>>;

/** Both sides at once: `both("hip", [90, 0, 0])`. */
export function both(joint: "shoulder" | "elbow" | "wrist" | "hip" | "knee" | "ankle", angles: Vec3): Angles {
  return { [`${joint}L`]: angles, [`${joint}R`]: angles };
}

export function pose(at: Vec3, turn: Vec3, ...joints: Angles[]): DemoPose {
  return { at, turn, joints: Object.assign({}, ...joints) as DemoPose["joints"] };
}

export const PRESETS = [
  { id: "standing", name: "Standing", anchor: "feet", pose: pose([0, STANDING, 0], [0, 0, 0]) },
  { id: "seated", name: "Seated", anchor: "floor", pose: pose([0, 0.53, 0], [0, 0, 0], both("hip", [90, 0, 0]), both("knee", [-90, 0, 0])) },
  { id: "on-back", name: "On your back", anchor: "floor", pose: pose([0, 0.11, 0], [-90, 0, 0], both("ankle", [-30, 0, 0])) },
  { id: "face-down", name: "Face down", anchor: "floor", pose: pose([0, 0.12, 0], [90, 0, 0], both("ankle", [-70, 0, 0])) },
  { id: "all-fours", name: "All fours", anchor: "floor", pose: pose([0, 0.5, 0], [68, 0, 0], both("hip", [68, 0, 0]), both("knee", [-90, 0, 0]), both("ankle", [-60, 0, 0]), both("shoulder", [68, 0, 0]), { head: [-25, 0, 0] }) },
  { id: "plank", name: "Plank", anchor: "floor", pose: pose([0, 0.45, 0], [68, 0, 0], both("shoulder", [68, 0, 0]), both("ankle", [20, 0, 0]), { head: [-20, 0, 0] }) },
  { id: "hanging", name: "Hanging", anchor: "hands", pose: pose([0, 1.17, 0], [0, 0, 0], both("shoulder", [180, 0, 0])) },
] as const satisfies readonly { id: string; name: string; anchor: DemoAnchor; pose: DemoPose }[];
