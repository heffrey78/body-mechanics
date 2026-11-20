/**
 * Which demonstration an exercise shows (#76): the person's own record if they built one (#77), else
 * the built-in one for a catalogue exercise, else none.
 */
import { newId } from "../records/ids.ts";
import type { Demo, DemoClip } from "../records/schemas.ts";
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

/** The person's demonstrations (#82). Deleted ones are tombstones for the merge, left out here. */
export async function loadDemos(vault: Vault): Promise<Demo[]> {
  const { records } = await vault.readMany(await vault.list("demos"));
  return [...records.values()].filter((r): r is Demo => r.type === "demo" && !r.deleted);
}
