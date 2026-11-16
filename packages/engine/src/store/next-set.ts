/**
 * What the logging screen offers for the next set (#32), so a set is logged without typing: the
 * last set of this exercise in this session, else the last time it was done, else a starting point
 * for how it's measured.
 */
import type { Measure } from "../records/vocab.ts";
import type { Entry, LoggedSet } from "../records/schemas.ts";
import type { SetSummary } from "./index.ts";

export interface NextSet {
  /** Reps, seconds or metres, by the measure; for a one-sided exercise, per side. */
  amount: number;
  loadKg?: number;
}

const START: Record<Measure, number> = { reps: 10, time: 30, distance: 100 };
export const FIELD: Record<Measure, "reps" | "seconds" | "metres"> = { reps: "reps", time: "seconds", distance: "metres" };

function amountOf(s: Pick<LoggedSet, "reps" | "seconds" | "metres" | "left" | "right">, measure: Measure): number | undefined {
  const f = FIELD[measure];
  return s[f] ?? s.left?.[f] ?? s.right?.[f];
}

export function nextSet(measure: Measure, entry: Entry | undefined, lastTime: SetSummary[] | undefined): NextSet {
  const here = entry?.sets.filter((s) => !s.deleted).at(-1);
  const from = here ?? lastTime?.[0];
  const amount = from ? amountOf(from as LoggedSet, measure) : undefined;
  return { amount: amount ?? START[measure], ...(from?.loadKg !== undefined ? { loadKg: from.loadKg } : {}) };
}

/** A set's amount in words: "10 reps · 16 kg", "L 30 s · R 28 s". */
export function describeSet(s: LoggedSet, measure: Measure, load: (kg: number) => string): string {
  const unit = (n: number | undefined) => (n === undefined ? "–" : measure === "reps" ? `${n}` : measure === "time" ? `${n} s` : `${n} m`);
  const f = FIELD[measure];
  const amount = s.left || s.right ? `L ${unit(s.left?.[f])} · R ${unit(s.right?.[f])}` : measure === "reps" ? `${s.reps ?? "–"} reps` : unit(s[f]);
  return s.loadKg !== undefined ? `${amount} · ${load(s.loadKg)}` : amount;
}
