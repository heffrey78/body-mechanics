/**
 * Progression (#37): what to aim for next time, from how the last time felt, and what a finished
 * routine run would change in the routine's targets.
 */
import type { Measure } from "../records/vocab.ts";
import type { Routine, RoutineItem, Session } from "../records/schemas.ts";
import type { EntrySummary } from "./index.ts";
import { FIELD } from "./next-set.ts";

export interface Progression {
  amount: number;
  loadKg?: number;
  direction: "up" | "hold" | "down";
  reason: string;
}

/** The load step: 2.5 kg, or 5 lb (in kg) for someone working in pounds. */
export const loadStep = (units: "kg" | "lb") => (units === "kg" ? 2.5 : 5 / 2.2046226218);
const amountStep = (m: Measure, n: number) => (m === "reps" ? 1 : m === "time" ? 5 : Math.max(10, Math.round(n * 0.1 / 10) * 10));
const round = (kg: number) => Math.round(kg * 1000) / 1000;

function amountOf(s: EntrySummary["sets"][number], f: "reps" | "seconds" | "metres"): number {
  return s.left || s.right ? Math.min(s.left?.[f] ?? 0, s.right?.[f] ?? 0) : s[f] ?? 0;
}

/**
 * The next target for a planned exercise, from its last run: Easy with every planned set at or over
 * the target goes up a step (load where there is load, else the amount); Hard holds; Painful drops a
 * step. Undefined when last time gives no reason to change (no effort, About right, or Easy but short).
 */
export function progression(item: RoutineItem, measure: Measure, last: EntrySummary | undefined, units: "kg" | "lb"): Progression | undefined {
  if (!last?.effort || last.effort === "right") return undefined;
  const f = FIELD[measure];
  const target = item[f] ?? 0;
  const load = item.loadKg;
  const step = loadStep(units);
  if (last.effort === "easy") {
    const met = last.sets.length >= item.sets && last.sets.every((s) => amountOf(s, f) >= target);
    if (!met) return undefined;
    if (load) return { amount: target, loadKg: round(load + step), direction: "up", reason: "Easy last time with every set done" };
    return { amount: target + amountStep(measure, target), direction: "up", reason: "Easy last time with every set done" };
  }
  if (last.effort === "hard") return { amount: target, ...(load ? { loadKg: load } : {}), direction: "hold", reason: "Hard last time: holding the target" };
  // Painful
  if (load && load > step) return { amount: target, loadKg: round(load - step), direction: "down", reason: "Painful last time: a step lighter" };
  return { amount: Math.max(measure === "reps" ? 1 : amountStep(measure, target), target - amountStep(measure, target)), ...(load ? { loadKg: load } : {}), direction: "down", reason: "Painful last time: a step easier" };
}

export interface TargetUpdate {
  itemId: string;
  exercise: string;
  from: RoutineItem;
  to: RoutineItem;
}

/**
 * After a routine run (#37): each planned exercise whose sets done, best amount or heaviest load
 * differ from its targets, with the targets it would get from what was done.
 */
export function targetUpdates(routine: Routine, session: Session, measureOf: (exercise: string) => Measure): TargetUpdate[] {
  const out: TargetUpdate[] = [];
  const used = new Set<string>();
  for (const item of routine.items.filter((i) => !i.deleted)) {
    const entry = session.entries.find((e) => !e.deleted && e.exercise === item.exercise && !used.has(e.id));
    if (!entry) continue;
    used.add(entry.id);
    const sets = entry.sets.filter((s) => !s.deleted);
    if (!sets.length) continue;
    const f = FIELD[measureOf(item.exercise)];
    const best = Math.max(...sets.map((s) => (s.left || s.right ? Math.min(s.left?.[f] ?? 0, s.right?.[f] ?? 0) : s[f] ?? 0)));
    const heaviest = Math.max(0, ...sets.map((s) => s.loadKg ?? 0));
    const to: RoutineItem = { ...item, sets: Math.min(20, sets.length), [f]: best };
    if (heaviest > 0) to.loadKg = heaviest;
    else delete to.loadKg;
    delete to.edits;
    const strip = ({ edits: _e, ...x }: RoutineItem) => JSON.stringify(x);
    if (strip(to) !== strip(item)) out.push({ itemId: item.id, exercise: item.exercise, from: item, to });
  }
  return out;
}

/** The routine with the chosen updates applied (stamped by editRoutine when saved). */
export function applyUpdates(routine: Routine, updates: TargetUpdate[]): Routine {
  const by = new Map(updates.map((u) => [u.itemId, u.to]));
  return { ...routine, items: routine.items.map((i) => (by.has(i.id) ? { ...by.get(i.id)!, ...(i.edits ? { edits: i.edits } : {}) } : i)) };
}
