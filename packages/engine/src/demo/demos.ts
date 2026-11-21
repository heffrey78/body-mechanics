/**
 * Which demonstration an exercise shows (#76): the person's own record if they built one (#77), else
 * the built-in one for a catalogue exercise, else none.
 */
import { newId } from "../records/ids.ts";
import type { Demo, DemoClip, DemoFrame } from "../records/schemas.ts";
import type { Vault } from "../vault/vault.ts";
import { BUILT_IN } from "./builtin.ts";
import { PRESETS } from "./presets.ts";

/** The built-in demonstrations, by catalogue id. */
export const BUILT_IN_DEMOS: Readonly<Record<string, DemoClip>> = BUILT_IN;

export function demoFor(exercise: string, own: readonly Demo[]): { clip: DemoClip; own?: Demo } | undefined {
  const mine = own.find((d) => d.exercise === exercise && !d.deleted);
  if (mine) return { clip: mine, own: mine };
  const builtIn = BUILT_IN[exercise];
  return builtIn ? { clip: builtIn } : undefined;
}

/** A new demonstration for `exercise`: a copy of `from` (the built-in one, say), or two standing key poses. */
export function newDemo(exercise: string, from?: DemoClip): Demo {
  const base: DemoClip = from ?? {
    seconds: 3, loop: "there-and-back", anchor: PRESETS[0].anchor, props: [],
    frames: [{ id: "a", t: 0, pose: PRESETS[0].pose }, { id: "b", t: 1, pose: PRESETS[0].pose }],
  };
  return {
    type: "demo", v: 1, id: newId(), exercise, seconds: base.seconds, loop: base.loop, anchor: base.anchor,
    frames: base.frames.map((f) => ({ id: newId(), t: f.t, pose: JSON.parse(JSON.stringify(f.pose)) as typeof f.pose })),
    props: base.props.map((p) => ({ id: newId(), kind: p.kind, hold: p.hold, at: [...p.at], turn: p.turn })),
  };
}

/** The other exercise's demonstration copied into this one (#94): this one keeps its id, exercise and history. */
export function cloneInto(target: Demo, from: DemoClip): Demo {
  const { id: _id, ...copy } = newDemo(target.exercise, from);
  return { ...target, ...copy, id: target.id };
}

// ---------------------------------------------------------------- key poses, in order (#93)

/** A demonstration holds at most this many key poses. */
export const MAX_POSES = 24;
const round2 = (t: number) => Math.round(t * 100) / 100;

/** The key poses in the order they're played: by their time in the loop. */
export const orderedPoses = (frames: readonly DemoFrame[]): DemoFrame[] => [...frames].sort((a, b) => a.t - b.t);

/**
 * A pose moved one place earlier (-1) or later (+1): it swaps places with its neighbour. The times in
 * the loop stay where they were; the poses change which time they have.
 */
export function movePose(frames: readonly DemoFrame[], id: string, by: -1 | 1): DemoFrame[] {
  const order = orderedPoses(frames);
  const i = order.findIndex((f) => f.id === id), other = order[i + by];
  const one = order[i];
  if (!one || !other) return [...frames];
  return frames.map((f) => (f.id === one.id ? { ...f, t: other.t } : f.id === other.id ? { ...f, t: one.t } : f));
}

/**
 * A copy of a pose as a new one, with the id `newId`: straight after the original, halfway to the next
 * pose, or at the end of the movement. A copy that would land past the end moves the last pose back
 * to make room.
 */
export function copyPose(frames: readonly DemoFrame[], id: string, where: "after" | "end", newId: string): DemoFrame[] {
  const order = orderedPoses(frames);
  const i = order.findIndex((f) => f.id === id), from = order[i];
  if (!from || frames.length >= MAX_POSES) return [...frames];
  const copy = (t: number): DemoFrame => ({ id: newId, t, pose: JSON.parse(JSON.stringify(from.pose)) as DemoFrame["pose"] });
  const next = where === "after" ? order[i + 1] : undefined;
  if (next) return [...frames, copy(round2((from.t + next.t) / 2))];
  const last = order.at(-1)!, before = order.at(-2);
  if (last.t < 0.99) return [...frames, copy(1)];
  const moved = round2(((before?.t ?? 0) + 1) / 2);
  return [...frames.map((f) => (f.id === last.id ? { ...f, t: moved } : f)), copy(1)];
}

/** How early and how late a pose's time can go without passing its neighbours. */
export function poseTimeLimits(frames: readonly DemoFrame[], id: string): [number, number] {
  const order = orderedPoses(frames);
  const i = order.findIndex((f) => f.id === id);
  const lo = i > 0 ? Math.min(1, round2(order[i - 1]!.t + 0.01)) : 0;
  const hi = i >= 0 && i < order.length - 1 ? Math.max(0, round2(order[i + 1]!.t - 0.01)) : 1;
  return [Math.min(lo, hi), Math.max(lo, hi)];
}

/** The poses spread evenly over the loop, in their order. */
export function spacePoses(frames: readonly DemoFrame[]): DemoFrame[] {
  const order = orderedPoses(frames);
  const t = new Map(order.map((f, i) => [f.id, order.length > 1 ? round2(i / (order.length - 1)) : 0]));
  return frames.map((f) => ({ ...f, t: t.get(f.id)! }));
}

/** The person's demonstrations (#82). Deleted ones are tombstones for the merge, left out here. */
export async function loadDemos(vault: Vault): Promise<Demo[]> {
  const { records } = await vault.readMany(await vault.list("demos"));
  return [...records.values()].filter((r): r is Demo => r.type === "demo" && !r.deleted);
}
