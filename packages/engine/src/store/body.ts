/**
 * The body (#45, #4, #5): marks and conditions, each with its check-ins. Like routines, they are few
 * and read whole when the records open. A record's current state is its latest check-in; a mark
 * starts with one. Edits are stamped field by field (and check-ins merge by id), so two devices
 * checking in on the same mark keep both check-ins.
 */
import type { Clock } from "../records/hlc.ts";
import { newId } from "../records/ids.ts";
import type { CheckIn, Condition, ConditionRegion, Mark } from "../records/schemas.ts";
import type { Bother, MarkKind, RedFlag, Region, Severity, Side } from "../records/vocab.ts";
import type { Vault } from "../vault/vault.ts";
import { stampChanges } from "./routines.ts";

/** A check-in is due a week after the last (#4). */
export const CHECK_IN_DAYS = 7;
/** A mark this old offers to become a condition (#5). */
export const CONDITION_AFTER_DAYS = 90;
const DAY = 86_400_000;

export interface Body {
  marks: Mark[];
  conditions: Condition[];
}

/** Every mark and condition that isn't deleted (resolved marks and ended conditions included, for history). */
export async function loadBody(vault: Vault): Promise<Body> {
  const read = async (dir: string) => [...(await vault.readMany(await vault.list(dir))).records.values()];
  const [m, c] = await Promise.all([read("marks"), read("conditions")]);
  const marks = m.filter((r): r is Mark => r.type === "mark" && !r.deleted).sort((a, b) => a.onset.localeCompare(b.onset));
  const conditions = c.filter((r): r is Condition => r.type === "condition" && !r.deleted).sort((a, b) => a.name.localeCompare(b.name));
  return { marks, conditions };
}

type Subject = Mark | Condition;
const live = (s: Subject) => s.checkins.filter((c) => !c.deleted).sort((a, b) => a.at.localeCompare(b.at));

/** The latest check-in: the mark's or condition's state now. */
export function currentState(s: Subject): CheckIn | undefined {
  return live(s).at(-1);
}

/** Severity over time, oldest first. */
export function history(s: Subject): { at: string; severity: Severity }[] {
  return live(s).map((c) => ({ at: c.at, severity: c.severity }));
}

const today = (now: Date) => now.toISOString().slice(0, 10);
/** The first day a rough date ("2019", "2019-06", "2019-06-14") could mean. */
const startOf = (d: string) => d.padEnd(10, d.length === 4 ? "-01-01" : "-01").slice(0, 10);
/** The last day it could mean. */
function endOf(d: string): string {
  if (d.length === 10) return d;
  if (d.length === 4) return `${d}-12-31`;
  const [y, m] = d.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function isActive(s: Subject, now = new Date()): boolean {
  if (s.type === "mark") return !s.resolvedAt;
  return startOf(s.since) <= today(now) && (!s.until || endOf(s.until) >= today(now));
}

/**
 * Due a check-in: active, and the last one a week or more ago. A condition is only asked about once
 * it has been checked in on at all, so an old surgery that never bothers you doesn't nag.
 */
export function isDue(s: Subject, now = new Date()): boolean {
  if (!isActive(s, now)) return false;
  const last = currentState(s);
  if (!last) return false;
  return now.getTime() - Date.parse(last.at) >= CHECK_IN_DAYS * DAY;
}

/** Any red flag at the last check-in (#4): see a professional, and keep that area gentle. */
export function redFlags(s: Subject): RedFlag[] {
  return currentState(s)?.redFlags ?? [];
}

/** An active mark that has lasted about three months offers to become a condition (#5). */
export function offersCondition(m: Mark, now = new Date()): boolean {
  return !m.resolvedAt && !m.becameCondition && now.getTime() - Date.parse(`${m.onset}T00:00:00Z`) >= CONDITION_AFTER_DAYS * DAY;
}

export interface CheckInFields {
  severity: Severity;
  bothers?: Bother[];
  redFlags?: RedFlag[];
  note?: string;
}

function checkInOf(f: CheckInFields, now: Date): CheckIn {
  return {
    id: newId(), at: now.toISOString(), severity: f.severity, bothers: f.bothers ?? [], redFlags: f.redFlags ?? [],
    ...(f.note?.trim() ? { note: f.note.trim() } : {}),
  };
}

export function newMark(f: { region: Region; side: Side; kind: MarkKind; onset?: string; note?: string } & CheckInFields, now = new Date()): Mark {
  return {
    type: "mark", v: 1, id: newId(), region: f.region, side: f.side, kind: f.kind, onset: f.onset ?? today(now),
    ...(f.note?.trim() ? { note: f.note.trim() } : {}),
    checkins: [checkInOf(f, now)],
  };
}

export function newCondition(f: { name: string; kind?: string; regions: ConditionRegion[]; since: string; until?: string; note?: string }): Condition {
  return {
    type: "condition", v: 1, id: newId(), name: f.name.trim(), regions: f.regions, since: f.since,
    ...(f.kind ? { kind: f.kind } : {}), ...(f.until ? { until: f.until } : {}), ...(f.note?.trim() ? { note: f.note.trim() } : {}),
    checkins: [],
  };
}

type Obj = Record<string, unknown>;
/** Save an edit to a mark or condition, stamped against what was saved before. */
export function editBody<T extends Subject>(before: T | undefined, after: T, clock: Clock): T {
  return stampChanges(before as unknown as Obj | undefined, after as unknown as Obj, clock.tick()) as unknown as T;
}

/** A new check-in on a mark or condition. */
export function checkIn<T extends Subject>(s: T, f: CheckInFields, clock: Clock, now = new Date()): T {
  return editBody(s, { ...s, checkins: [...s.checkins, checkInOf(f, now)] }, clock);
}

/** It's gone (#4): resolved now, with its history kept. */
export function resolveMark(m: Mark, clock: Clock, now = new Date()): Mark {
  return editBody(m, { ...m, resolvedAt: now.toISOString() }, clock);
}

/** It came back: active again. */
export function reopenMark(m: Mark, clock: Clock): Mark {
  const { resolvedAt: _r, ...rest } = m;
  return editBody(m, rest as Mark, clock);
}
