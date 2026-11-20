/** What draws a demonstration (#80): the 3D stage, or the flat sketch that stands in when 3D isn't to be had. */
import type { DemoClip, DemoPose, Joint } from "@bm/engine";
import type { PropModel } from "./models.ts";

export interface StageColors { bg: string; floor: string; grid: string; body: string; joint: string; gear: string; gearDark: string; select: string }

export interface DemoStage {
  setColors(c: StageColors): void;
  /** The equipment of a demonstration. `modelOf` turns a custom item into what it stands in for. */
  setProps(props: DemoClip["props"], modelOf: (kind: string) => PropModel): void;
  /** Point the view at everything the demonstration covers. */
  frame(clip: DemoClip): void;
  setView(around: number, above?: number): void;
  turnView(dAround: number, dAbove: number): void;
  zoomBy(k: number): void;
  readonly view: { around: number; above: number };
  select(joint: Joint | null): void;
  /** The joint under a point of the canvas, if any. */
  pick(clientX: number, clientY: number): Joint | null;
  drawPhase(clip: DemoClip, phase: number): void;
  drawPose(clip: DemoClip, pose: DemoPose): void;
  /** Draw again as it stands (the view turned, the size changed). */
  render(): void;
  dispose(): void;
}
