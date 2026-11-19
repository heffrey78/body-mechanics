/**
 * The built-in demonstrations (#81): a starter set for catalogue exercises, authored by hand and checked
 * by eye in the app. Angles are [forward, to the side, twist] in degrees (see DemoPose).
 */
import type { DemoClip, DemoPose, DemoProp } from "../records/schemas.ts";
import { both, pose } from "./presets.ts";
import { STANDING } from "./skeleton.ts";

type Clip = Omit<DemoClip, "frames" | "props"> & { poses: DemoPose[]; props?: Omit<DemoProp, "id">[] };

/** Key poses spread evenly over the loop. */
function clip({ poses, props = [], ...rest }: Clip): DemoClip {
  return {
    ...rest,
    frames: poses.map((p, i) => ({ id: `k${i + 1}`, t: poses.length === 1 ? 0 : i / (poses.length - 1), pose: p })),
    props: props.map((p, i) => ({ id: `p${i + 1}`, ...p })),
  };
}

const stand = (...joints: Parameters<typeof pose>[2][]) => pose([0, STANDING, 0], [0, 0, 0], ...joints);
/** The bottom of a squat: thighs level, shins forward, chest up, arms out in front. */
const squat = (arms = both("shoulder", [110, 0, 0])) =>
  pose([0, 0.5, 0], [35, 0, 0], both("hip", [120, 8, 0]), both("knee", [-110, 0, 0]), both("ankle", [25, 0, 0]), arms, { head: [-25, 0, 0] });

export const BUILT_IN: Record<string, DemoClip> = {
  "bm:bodyweight-squat": clip({ seconds: 3.2, loop: "there-and-back", anchor: "feet", poses: [stand(both("hip", [0, 8, 0])), squat()] }),
};
