/**
 * The built-in demonstrations (#81): a starter set for catalogue exercises, authored by hand and checked
 * by eye in the app. Angles are [forward, to the side, twist] in degrees (see DemoPose).
 */
import type { DemoClip, DemoPose, DemoProp } from "../records/schemas.ts";
import { both, pose } from "./presets.ts";
import { STANDING } from "./skeleton.ts";

type Prop = Omit<DemoProp, "id" | "edits">;
type Clip = Omit<DemoClip, "frames" | "props"> & { poses: DemoPose[]; props?: Prop[] };

/** Key poses spread evenly over the loop. */
function clip({ poses, props = [], ...rest }: Clip): DemoClip {
  return {
    ...rest,
    frames: poses.map((p, i) => ({ id: `k${i + 1}`, t: poses.length === 1 ? 0 : i / (poses.length - 1), pose: p })),
    props: props.map((p, i) => ({ id: `p${i + 1}`, ...p })),
  };
}

type J = Parameters<typeof pose>[2];
const stand = (...joints: J[]) => pose([0, STANDING, 0], [0, 0, 0], ...joints);
const seated = (lean: number, ...joints: J[]) => pose([0, 0.53, 0], [lean, 0, 0], both("hip", [90 + lean, 6, 0]), both("knee", [-90, 0, 0]), ...joints);
/** Lying on the back, knees up, feet flat. */
const hook = (...joints: J[]) => pose([0, 0.11, 0], [-90, 0, 0], both("hip", [50, 0, 0]), both("knee", [-100, 0, 0]), both("ankle", [-40, 0, 0]), both("shoulder", [0, 12, 0]), ...joints);
const allFours = (...joints: J[]) => pose([0, 0.5, 0], [90, 0, 0], both("hip", [90, 0, 0]), both("knee", [-90, 0, 0]), both("ankle", [-70, 0, 0]), both("shoulder", [90, 0, 0]), { head: [-25, 0, 0] }, ...joints);
const prone = (...joints: J[]) => pose([0, 0.12, 0], [90, 0, 0], both("ankle", [-70, 0, 0]), both("shoulder", [180, 0, 0]), ...joints);
const hang = (...joints: J[]) => pose([0, 1.17, 0], [0, 0, 0], both("shoulder", [180, 0, 0]), ...joints);
/** A hip hinge: flat back tipped forward, hips back, knees soft, arms hanging. */
const hinge = (tip: number, ...joints: J[]) => pose([0, 0.9, 0], [tip, 0, 0], both("hip", [tip + 12, 0, 0]), both("knee", [-12, 0, 0]), both("shoulder", [tip, 0, 0]), { head: [-tip / 2.5, 0, 0] }, ...joints);
/** The bottom of a squat: thighs level, shins forward, chest up, arms out in front. */
const squat = (arms: J = both("shoulder", [110, 0, 0])) =>
  pose([0, 0.5, 0], [35, 0, 0], both("hip", [120, 8, 0]), both("knee", [-110, 0, 0]), both("ankle", [25, 0, 0]), arms, { head: [-25, 0, 0] });

const back = (c: Omit<Clip, "loop">) => clip({ loop: "there-and-back", ...c });
const chair: Prop = { kind: "chair", hold: "none", at: [0, 0, -0.45], turn: 0 };
const mat: Prop = { kind: "mat", hold: "none", at: [0, 0, 0.05], turn: 0 };
const bar: Prop = { kind: "pullup-bar", hold: "none", at: [0, 2.25, 0], turn: 0 };
const dumbbells: Prop = { kind: "dumbbells", hold: "both", at: [0, 0, 0], turn: 0 };
const barbell: Prop = { kind: "barbell", hold: "both", at: [0, 0, 0], turn: 0 };

const pushUpTop = pose([0, 0.45, 0], [68, 0, 0], both("shoulder", [68, 0, 0]), both("ankle", [20, 0, 0]), { head: [-20, 0, 0] });
const pullUp = back({
  seconds: 3.6, anchor: "hands", props: [bar],
  poses: [hang(), hang(both("shoulder", [25, 28, 0]), both("elbow", [150, 0, 0]), both("hip", [10, 0, 0]), both("knee", [-25, 0, 0]), { head: [-15, 0, 0] })],
});
const sitToStand = [seated(0, both("shoulder", [35, 0, 0]), both("elbow", [70, 0, 0])), seated(40, both("shoulder", [80, 0, 0]), both("elbow", [20, 0, 0]), { head: [-25, 0, 0] }), stand()];
const press = [stand(both("shoulder", [0, 80, 90]), both("elbow", [95, 0, 0])), stand(both("shoulder", [0, 172, 90]), both("elbow", [8, 0, 0]))];
const curl = (twist: number) => [stand(both("elbow", [5, 0, twist])), stand(both("elbow", [140, 0, twist]))];

export const BUILT_IN: Record<string, DemoClip> = {
  // Legs
  "bm:bodyweight-squat": back({ seconds: 3.2, anchor: "feet", poses: [stand(both("hip", [0, 8, 0])), squat()] }),
  "bm:sit-to-stand": back({ seconds: 4, anchor: "feet", props: [chair], poses: sitToStand }),
  "bm:box-squat": back({ seconds: 4, anchor: "feet", props: [chair], poses: [...sitToStand].reverse() }),
  "bm:wall-sit": back({ seconds: 4, anchor: "floor", props: [{ kind: "wall", hold: "none", at: [0, 0, -0.17], turn: 0 }], poses: [seated(0)] }),
  "bm:calf-raise": back({ seconds: 2.4, anchor: "feet", poses: [stand(), stand(both("ankle", [-38, 0, 0]))] }),
  "bm:reverse-lunge": back({
    seconds: 3.4, anchor: "left-foot",
    poses: [stand(), pose([0, 0.6, 0], [8, 0, 0], { hipL: [98, 0, 0], kneeL: [-95, 0, 0], ankleL: [5, 0, 0], hipR: [-12, 0, 0], kneeR: [-85, 0, 0], ankleR: [45, 0, 0] }, both("elbow", [30, 0, 0]))],
  }),
  "bm:romanian-deadlift": back({ seconds: 3.6, anchor: "feet", props: [barbell], poses: [stand(), hinge(72)] }),
  "bm:glute-bridge": back({
    seconds: 3.2, anchor: "feet", props: [mat],
    poses: [hook(), pose([0, 0.11, 0], [-115, 0, 0], both("knee", [-87, 0, 0]), both("ankle", [-15, 0, 0]), both("shoulder", [-22, 12, 0]), { neck: [25, 0, 0] })],
  }),
  "bm:straight-leg-raise": back({ seconds: 3.2, anchor: "floor", props: [mat], poses: [hook({ hipL: [0, 0, 0], kneeL: [0, 0, 0], ankleL: [0, 0, 0] }), hook({ hipL: [48, 0, 0], kneeL: [0, 0, 0], ankleL: [0, 0, 0] })] }),
  // Push
  "bm:push-up": back({
    seconds: 3, anchor: "feet",
    poses: [pushUpTop, pose([0, 0.45, 0], [88, 0, 0], both("shoulder", [-35, 25, 0]), both("elbow", [135, 0, 0]), both("ankle", [10, 0, 0]), { head: [-30, 0, 0] })],
  }),
  "bm:wall-push-up": back({
    seconds: 3, anchor: "feet", props: [{ kind: "wall", hold: "none", at: [0, 0, 0.74], turn: 0 }],
    poses: [
      pose([0, 0.96, 0], [12, 0, 0], both("shoulder", [97, 0, 0]), both("ankle", [12, 0, 0]), both("wrist", [-70, 0, 0])),
      pose([0, 0.96, 0], [24, 0, 0], both("shoulder", [45, 30, 0]), both("elbow", [130, 0, 0]), both("ankle", [24, 0, 0]), both("wrist", [-70, 0, 0])),
    ],
  }),
  "bm:dumbbell-shoulder-press": back({ seconds: 3, anchor: "feet", props: [dumbbells], poses: press }),
  "bm:overhead-press": back({ seconds: 3, anchor: "feet", props: [barbell], poses: press }),
  "bm:lateral-raise": back({ seconds: 3, anchor: "feet", props: [dumbbells], poses: [stand(both("elbow", [10, 0, 0])), stand(both("shoulder", [0, 85, 0]), both("elbow", [10, 0, 0]))] }),
  // Pull
  "bm:pull-up": pullUp,
  "bm:chin-up": pullUp,
  "bm:dead-hang": back({ seconds: 4, anchor: "hands", props: [bar], poses: [hang()] }),
  "bm:bent-over-row": back({ seconds: 2.8, anchor: "feet", props: [dumbbells], poses: [hinge(65), hinge(65, both("shoulder", [30, 12, 0]), both("elbow", [105, 0, 0]))] }),
  "bm:biceps-curl": back({ seconds: 2.8, anchor: "feet", props: [dumbbells], poses: curl(90) }),
  "bm:hammer-curl": back({ seconds: 2.8, anchor: "feet", props: [dumbbells], poses: curl(0) }),
  "bm:band-pull-apart": back({
    seconds: 2.8, anchor: "feet", props: [{ kind: "band", hold: "both", at: [0, 0, 0], turn: 0 }],
    poses: [stand(both("shoulder", [90, 8, 0])), stand(both("shoulder", [90, 78, 0]))],
  }),
  // Core and floor work
  "bm:plank": back({ seconds: 4, anchor: "floor", props: [mat], poses: [pose([0, 0.3, 0], [80, 0, 0], both("shoulder", [80, 0, 0]), both("elbow", [90, 0, 0]), both("ankle", [15, 0, 0]), { head: [-15, 0, 0] })] }),
  "bm:bird-dog": back({ seconds: 3.6, anchor: "floor", props: [mat], poses: [allFours(), allFours({ shoulderR: [180, 0, 0], hipL: [0, 0, 0], kneeL: [0, 0, 0], ankleL: [-40, 0, 0] })] }),
  "bm:cat-cow": back({
    seconds: 4, anchor: "floor", props: [mat],
    poses: [
      { ...allFours({ spine: [-14, 0, 0], chest: [-14, 0, 0], head: [-45, 0, 0] }, both("shoulder", [76, 0, 0]), both("hip", [104, 0, 0])), turn: [104, 0, 0] },
      { ...allFours({ spine: [18, 0, 0], chest: [18, 0, 0], neck: [20, 0, 0], head: [25, 0, 0] }, both("shoulder", [108, 0, 0]), both("hip", [72, 0, 0])), turn: [72, 0, 0] },
    ],
  }),
  "bm:dead-bug": back({
    seconds: 3.6, anchor: "floor", props: [mat],
    poses: [
      pose([0, 0.11, 0], [-90, 0, 0], both("hip", [90, 0, 0]), both("knee", [-90, 0, 0]), both("shoulder", [90, 0, 0])),
      pose([0, 0.11, 0], [-90, 0, 0], both("hip", [90, 0, 0]), both("knee", [-90, 0, 0]), both("shoulder", [90, 0, 0]), { shoulderR: [172, 0, 0], hipL: [12, 0, 0], kneeL: [-5, 0, 0] }),
    ],
  }),
  "bm:crunch": back({ seconds: 2.8, anchor: "floor", props: [mat], poses: [hook(both("shoulder", [40, 0, 0]), both("elbow", [120, 0, 0])), hook(both("shoulder", [40, 0, 0]), both("elbow", [120, 0, 0]), { spine: [30, 0, 0], chest: [28, 0, 0], neck: [10, 0, 0] })] }),
  "bm:lying-leg-raise": back({ seconds: 3.6, anchor: "floor", props: [mat], poses: [pose([0, 0.11, 0], [-90, 0, 0], both("shoulder", [0, 12, 0]), both("hip", [8, 0, 0])), pose([0, 0.11, 0], [-90, 0, 0], both("shoulder", [0, 12, 0]), both("hip", [88, 0, 0]))] }),
  "bm:superman": back({
    seconds: 3.2, anchor: "floor", props: [mat],
    poses: [prone(), prone(both("shoulder", [205, 0, 0]), both("hip", [-18, 0, 0]), { spine: [-12, 0, 0], chest: [-14, 0, 0], head: [-20, 0, 0] })],
  }),
  // Whole body
  "bm:jumping-jacks": back({ seconds: 1, anchor: "floor", poses: [stand(), stand(both("hip", [0, 24, 0]), both("shoulder", [0, 165, 0]))] }),
};
