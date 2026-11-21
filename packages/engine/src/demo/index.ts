/** Demonstrations (#76, #77, D5): the body model's skeleton, the pose maths, and the built-in set. */
export { type Vec3, type Quat } from "./math.ts";
export { JOINTS, POSED_JOINTS, BONES, STANDING, PALM, BALL, HEAD_CENTRE, HEAD_RADIUS, otherSide, type Joint, type Bone } from "./skeleton.ts";
export { solve, solvePose, phaseOf, floorHeight, palm, ball, mirrorPose, copySide, jointRotation, type Solved, type Placed } from "./solve.ts";
export { PRESETS, pose as demoPose } from "./presets.ts";
export { BUILT_IN_DEMOS, demoFor, newDemo, loadDemos } from "./demos.ts";
