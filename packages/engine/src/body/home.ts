/**
 * What Home and the session say about the body and the week (#73, the #63 voice): plain and specific,
 * naming the body part and what it changes in the exercises you actually do.
 */
import { bodyRules } from "../catalogue/index.ts";
import type { BodyRules } from "../catalogue/schema.ts";
import type { Mark, Routine } from "../records/schemas.ts";
import type { MarkKind } from "../records/vocab.ts";
import { isDue, type Body } from "../store/body.ts";
import type { SessionSummary } from "../store/index.ts";
import type { LibraryItem } from "../store/session-log.ts";
import { assess, concerns, placeOf, type Assessment } from "./assess.ts";

const DAY = 86_400_000;
const FEEL: Record<MarkKind, string> = { pain: "Sore", stiffness: "Stiff", weakness: "Weak", injury: "Injured" };

/** "since today", "for 3 days", "for a week", "for 5 weeks", "for 4 months". */
export function sinceText(onset: string, now = new Date()): string {
  const days = Math.floor((Date.parse(now.toISOString().slice(0, 10)) - Date.parse(onset)) / DAY);
  if (days <= 0) return "since today";
  if (days === 1) return "since yesterday";
  if (days < 7) return `for ${days} days`;
  if (days < 14) return "for a week";
  if (days < 60) return `for ${Math.floor(days / 7)} weeks`;
  return `for ${Math.round(days / 30)} months`;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "goblet squat", "goblet squat and split squat", "goblet squat, split squat and 2 more"; and whether it reads as plural. */
function names(list: string[]): { text: string; plural: boolean } {
  const n = list.map(lower);
  if (n.length === 1) return { text: n[0]!, plural: false };
  if (n.length === 2) return { text: `${n[0]} and ${n[1]}`, plural: true };
  return { text: `${n[0]}, ${n[1]} and ${n.length - 2} more`, plural: true };
}

function joinParts(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

/** One active mark as Home's Minding card shows it. */
export interface Minding {
  /** The mark's record id: Check in opens it. */
  id: string;
  /** "Your left knee". */
  title: string;
  /** "Stiff for a week. Goblet squat goes lighter, and reverse lunge sits out until it settles." */
  line: string;
  /** A check-in is due (#48). */
  due: boolean;
}

/**
 * The Minding cards (#73): each active mark, with what it changes among `exercises` (the ones you do:
 * your routines' and recent sessions'). Due check-ins first, then the worse ones.
 */
export function minding(body: Body, library: readonly LibraryItem[], exercises: readonly string[], now = new Date(), rules: BodyRules = bodyRules()): Minding[] {
  const byId = new Map(library.map((x) => [x.id, x]));
  const pool = [...new Set(exercises)].map((id) => byId.get(id)).filter((x): x is LibraryItem => !!x);
  const out: (Minding & { severity: number })[] = [];
  for (const c of concerns(body, now)) {
    if (c.source !== "mark") continue;
    const mark = (body.marks as Mark[]).find((m) => m.id === c.id);
    if (!mark) continue;
    const lighter: string[] = [], sitOut: string[] = [], careful: string[] = [];
    for (const item of pool) {
      const a = assess(item, [c], rules);
      if (a.action === "modify") lighter.push(item.name);
      else if (a.action === "avoid") sitOut.push(item.name);
      else if (a.action === "caution") careful.push(item.name);
    }
    const parts: string[] = [];
    if (lighter.length) { const n = names(lighter); parts.push(`${n.text} ${n.plural ? "go" : "goes"} lighter`); }
    if (sitOut.length) { const n = names(sitOut); parts.push(`${n.text} ${n.plural ? "sit" : "sits"} out until it settles`); }
    if (careful.length) { const n = names(careful); parts.push(`${n.text} ${n.plural ? "stay" : "stays"} light`); }
    const effect = parts.length ? `${upper(joinParts(parts))}.` : "Nothing you usually do works it hard.";
    out.push({
      id: mark.id, title: `Your ${placeOf(mark.region, mark.side)}`,
      line: `${FEEL[mark.kind]} ${sinceText(mark.onset, now)}. ${effect}`,
      due: isDue(mark, now), severity: c.severity,
    });
  }
  return out
    .sort((a, b) => Number(b.due) - Number(a.due) || b.severity - a.severity)
    .map(({ severity: _s, ...m }) => m);
}

/** The cue on the session's exercise card (#73): what the body changes about this one, or nothing. */
export function sessionCue(a: Assessment): string | null {
  const c = a.affects[0];
  if (a.action === "ok" || !c) return null;
  const place = placeOf(c.region, c.side);
  if (a.action === "modify") return `Lighter today, for your ${place}.`;
  if (a.action === "caution") return `Keep it light and pain-free, for your ${place}.`;
  return `Usually left out for your ${place}. Stop if it hurts.`;
}

/** This week on Home (#73): Monday to Sunday, which days had a finished session, today, and the count. */
export interface WeekStrip {
  days: { label: string; done: boolean; today: boolean }[];
  count: number;
}

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function weekStrip(sessions: readonly Pick<SessionSummary, "startedAt" | "finishedAt">[], now = new Date()): WeekStrip {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const dates = Array.from({ length: 7 }, (_, i) => localDay(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
  const finished = sessions.filter((s) => s.finishedAt).map((s) => localDay(new Date(s.startedAt)));
  const days = dates.map((d, i) => ({ label: "MTWTFSS"[i]!, done: finished.includes(d), today: d === localDay(now) }));
  return { days, count: finished.filter((d) => dates.includes(d)).length };
}

/** A routine on Home's cards (#73): how many moves, and how long its last finished run took. */
export function routineCard(routine: Pick<Routine, "items">, runs: readonly Pick<SessionSummary, "startedAt" | "finishedAt">[]): { moves: number; minutes?: number } {
  const moves = routine.items.filter((i) => !i.deleted).length;
  const last = runs.find((r) => r.finishedAt);
  if (!last) return { moves };
  return { moves, minutes: Math.max(1, Math.round((Date.parse(last.finishedAt!) - Date.parse(last.startedAt)) / 60_000)) };
}
