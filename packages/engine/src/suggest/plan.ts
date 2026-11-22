/**
 * A session plan built around the body (#50, as the #9 mockup): kind recipes filled from Suggest next's
 * ranks, one slot at a time, each pick knowing what the plan already holds. The body's rules apply to
 * every pick (#47); concerns the plan doesn't touch are listed as not affected.
 */
import type { Kind } from "../records/vocab.ts";
import { describeConcern, type Concern } from "../body/assess.ts";
import { suggest, type Answers, type Context, type Suggestion } from "./suggest.ts";
import { MODE_SPECS, positionRank } from "./modes.ts";

export interface PlanSection {
  label: string;
  items: Suggestion[];
}

export interface Plan {
  sections: PlanSection[];
  /** Active marks and conditions no exercise in the plan works or strains, and outside the focus. */
  notAffected: Concern[];
}

type Slot = { kind: Kind | "hold"; count: number; label: string };

/** The recipe for the kinds asked for: none, a balanced mix; one, its own plan; several, shared out. */
export function recipe(kinds: readonly Kind[]): Slot[] {
  if (!kinds.length) return [{ kind: "mobility", count: 2, label: "Warm-up" }, { kind: "strength", count: 3, label: "Main" }, { kind: "hold", count: 1, label: "Finish" }];
  if (kinds.length === 1) {
    return {
      mobility: [{ kind: "mobility", count: 4, label: "Mobility" }, { kind: "hold", count: 1, label: "Finish" }],
      strength: [{ kind: "mobility", count: 1, label: "Warm-up" }, { kind: "strength", count: 4, label: "Main" }],
      endurance: [{ kind: "mobility", count: 1, label: "Warm-up" }, { kind: "endurance", count: 4, label: "Circuit" }],
      balance: [{ kind: "mobility", count: 1, label: "Warm-up" }, { kind: "balance", count: 3, label: "Balance" }, { kind: "hold", count: 1, label: "Finish" }],
    }[kinds[0]!] as Slot[];
  }
  const order = (["mobility", "balance", "strength", "endurance"] as const).filter((k) => kinds.includes(k));
  const out: Slot[] = [];
  let total = 6;
  if (!kinds.includes("mobility")) { out.push({ kind: "mobility", count: 1, label: "Warm-up" }); total = 5; }
  const each = Math.floor(total / order.length);
  const extra = total % order.length;
  const LABEL: Record<Kind, string> = { mobility: "Mobility", balance: "Balance", strength: "Strength", endurance: "Endurance" };
  order.forEach((k, i) => out.push({ kind: k, count: each + (i < extra ? 1 : 0), label: LABEL[k] }));
  return out;
}

/** A hold to finish on: a timed strength exercise (a plank, a wall sit), else mobility. */
const isHold = (s: Suggestion) => s.item.measure === "time" && s.item.kinds.includes("strength");

/**
 * Build a plan. `skip` holds exercises to pass over (Swap): each slot takes the best one not already
 * in the plan or skipped. A time limit is spread over the plan's slots.
 */
export function buildPlan(answers: Answers, ctx: Context, skip: ReadonlySet<string> = new Set()): Plan {
  const spec = MODE_SPECS[answers.mode ?? "workout"];
  if (spec.slots) return modePlan(answers, ctx, skip);
  const slots = recipe(answers.kinds);
  const n = slots.reduce((a, s) => a + s.count, 0);
  const per = answers.minutesLeft !== undefined ? Math.max(3, Math.floor(answers.minutesLeft / n)) : undefined;
  const chosen: string[] = [...ctx.done];
  const sections: PlanSection[] = [];
  for (const slot of slots) {
    const items: Suggestion[] = [];
    for (let i = 0; i < slot.count; i++) {
      const kinds: Kind[] = slot.kind === "hold" ? ["strength", "mobility"] : [slot.kind];
      const { minutesLeft: _m, ...rest } = answers;
      const ranked = suggest({ ...rest, kinds, ...(per !== undefined ? { minutesLeft: per } : {}) }, { ...ctx, done: chosen, refused: new Set([...ctx.refused, ...skip]) });
      const fit = ranked.filter((s) => (slot.kind === "hold" ? isHold(s) : s.item.kinds.includes(slot.kind)));
      const pick = (slot.kind === "hold" && !fit.length ? ranked.filter((s) => s.item.kinds.includes("mobility")) : fit)[0];
      if (!pick) break;
      items.push(pick);
      chosen.push(pick.item.id);
    }
    if (items.length) sections.push({ label: slot.label, items });
  }
  return { sections, notAffected: untouched(answers, ctx, sections) };
}

/**
 * A plan for a mode (#109): its own sections, each filled from the mode's ranks, then ordered by
 * position, down to the floor (Wind down, Yoga…) or up from it (Wake up).
 */
function modePlan(answers: Answers, ctx: Context, skip: ReadonlySet<string>): Plan {
  const spec = MODE_SPECS[answers.mode!];
  const slots = spec.slots!;
  // Time is spent as the plan fills, keeping about two minutes for each pick still to come, so a
  // three-minute breathing finish still fits after the stretches.
  let left = answers.minutesLeft;
  let toCome = slots.reduce((a, s) => a + s.count, 0);
  const chosen: string[] = [...ctx.done];
  const sections: PlanSection[] = [];
  const { minutesLeft: _m, ...rest } = answers;
  for (const slot of slots) {
    const items: Suggestion[] = [];
    for (let i = 0; i < slot.count; i++) {
      toCome--;
      const limit = left === undefined ? undefined : left - 2 * toCome;
      if (limit !== undefined && limit < 1) continue;
      const ranked = suggest({ ...rest, ...(limit !== undefined ? { minutesLeft: limit } : {}) }, { ...ctx, done: chosen, refused: new Set([...ctx.refused, ...skip]) });
      const pick = ranked.find((s) => slot.fit(s.item));
      if (!pick) continue;
      items.push(pick);
      chosen.push(pick.item.id);
      if (left !== undefined) left -= pick.minutes;
    }
    const dir = spec.order === "up" ? -1 : 1;
    // A stable sort keeps the ranking among exercises in the same position.
    if (spec.order) items.sort((a, b) => dir * (positionRank(a.item) - positionRank(b.item)));
    if (items.length) sections.push({ label: slot.label, items });
  }
  return { sections, notAffected: untouched(answers, ctx, sections) };
}

/** Active marks and conditions the plan doesn't work or strain, outside the focus. */
function untouched(answers: Answers, ctx: Context, sections: PlanSection[]): Concern[] {
  const all = sections.flatMap((s) => s.items);
  const touched = (c: Concern) => answers.area.includes(c.region) || all.some((s) => s.item.works.includes(c.region) || s.item.strains.includes(c.region));
  const seen = new Set<string>();
  return (ctx.body ?? []).filter((c) => !touched(c) && !seen.has(describeConcern(c)) && seen.add(describeConcern(c)));
}
