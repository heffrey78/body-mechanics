/**
 * Building and editing routines (#35). Edits to a routine are stamped field by field (and item by
 * item) with this device's clock, so two devices' edits merge (#29) the same way sessions' do.
 */
import type { Clock } from "../records/hlc.ts";
import { newId } from "../records/ids.ts";
import type { Measure } from "../records/vocab.ts";
import type { Routine, RoutineItem, Session } from "../records/schemas.ts";
import { FIELD } from "./next-set.ts";

type Obj = Record<string, unknown>;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * `after` with an edit stamp on every field that differs from `before`, at every level where the
 * objects carry ids (the routine and its items). New items need no stamps: an added id never conflicts.
 */
export function stampChanges<T extends Obj>(before: T | undefined, after: T, stamp: string): T {
  if (!before) return after;
  const out: Obj = { ...after };
  const edits: Record<string, string> = { ...((after["edits"] ?? {}) as Record<string, string>) };
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (k === "edits" || k === "id") continue;
    const [b, a] = [before[k], after[k]];
    if (Array.isArray(a) && a.every((x) => x && typeof x === "object" && "id" in x)) {
      const old = new Map(((Array.isArray(b) ? b : []) as Obj[]).map((x) => [x["id"], x]));
      out[k] = (a as Obj[]).map((x) => stampChanges(old.get(x["id"]), x, stamp));
      // The list's order is the routine's own field (a reorder is an edit of it).
      const order = (l: unknown) => ((Array.isArray(l) ? l : []) as Obj[]).map((x) => x["id"]);
      if (!same(order(b), order(a))) edits[`${k}.order`] = stamp;
    } else if (!same(b, a)) {
      edits[k] = stamp;
    }
  }
  if (Object.keys(edits).length) out["edits"] = edits;
  return out as T;
}

/** Save a routine edit: stamped against what was saved before. */
export function editRoutine(before: Routine | undefined, after: Routine, clock: Clock): Routine {
  return stampChanges(before as unknown as Obj | undefined, after as unknown as Obj, clock.tick()) as unknown as Routine;
}

export function newRoutine(name: string): Routine {
  return { type: "routine", v: 1, id: newId(), name, items: [] };
}

/** A new item for `exercise`, with the starting targets for how it's measured. */
export function newItem(exercise: string, measure: Measure): RoutineItem {
  const start = { reps: 10, time: 30, distance: 100 }[measure];
  return { id: newId(), exercise, sets: measure === "reps" ? 3 : 2, [FIELD[measure]]: start };
}

/**
 * Save as routine (#35): an ad hoc session's exercises in order, each with as many sets as were done,
 * the best amount (the weaker side's, for one-sided sets) and the heaviest load as the targets.
 */
export function routineFromSession(session: Session, name: string, measureOf: (exercise: string) => Measure): Routine {
  const items: RoutineItem[] = [];
  for (const e of session.entries.filter((x) => !x.deleted)) {
    const sets = e.sets.filter((x) => !x.deleted);
    if (!sets.length) continue;
    const f = FIELD[measureOf(e.exercise)];
    const amounts = sets.map((s) => (s.left || s.right ? Math.min(s.left?.[f] ?? 0, s.right?.[f] ?? 0) : s[f] ?? 0));
    const loads = sets.map((s) => s.loadKg ?? 0);
    const load = Math.max(...loads);
    items.push({
      id: newId(), exercise: e.exercise, sets: Math.min(sets.length, 20), [f]: Math.max(...amounts), ...(load > 0 ? { loadKg: load } : {}),
      ...(e.modifiers.length ? { modifiers: e.modifiers } : {}),
    });
  }
  return { type: "routine", v: 1, id: newId(), name, items };
}

/** Where a routine run stands (#36): each planned exercise with its entry and how many sets are done. */
export interface PlanStep {
  item: RoutineItem;
  entryId?: string;
  done: number;
  complete: boolean;
}

export function planStatus(plan: RoutineItem[], session: Session): PlanStep[] {
  const used = new Set<string>();
  return plan.filter((i) => !i.deleted).map((item) => {
    const entry = session.entries.find((e) => !e.deleted && e.exercise === item.exercise && !used.has(e.id));
    if (entry) used.add(entry.id);
    const done = entry ? entry.sets.filter((s) => !s.deleted).length : 0;
    return { item, ...(entry ? { entryId: entry.id } : {}), done, complete: done >= item.sets };
  });
}

/** The next planned exercise not yet done and not skipped, after `fromItem` (or from the start). */
export function nextStep(steps: PlanStep[], skipped: ReadonlySet<string> = new Set(), fromItem?: string): PlanStep | undefined {
  const start = fromItem ? steps.findIndex((s) => s.item.id === fromItem) + 1 : 0;
  const open = (s: PlanStep) => !s.complete && !skipped.has(s.item.id);
  return steps.slice(start).find(open) ?? steps.slice(0, start).find(open);
}
