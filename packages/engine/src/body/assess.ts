/**
 * Body rules in the engine (#47, D3): how active marks and conditions change an exercise.
 *   - avoid: a mark that is moderate or worse, or has a red flag, on a region the exercise strains;
 *     a condition's avoid list; a red-flagged condition on a region it strains.
 *   - modify: a mild mark, or a condition, on a region it strains: the exercise's own rule (a gentler
 *     swap and/or modifiers), else the region's default modifiers.
 *   - caution: pain or injury on a region it works without straining it.
 * Every marked area is considered, not just the first; each outcome carries its reason.
 */
import { bodyRules } from "../catalogue/index.ts";
import type { BodyRules } from "../catalogue/schema.ts";
import type { Condition, Mark, RoutineItem } from "../records/schemas.ts";
import { modifiersOf, type MarkKind, type Measure, type Region, type Severity, type Side } from "../records/vocab.ts";
import { FIELD } from "../store/next-set.ts";
import { newItem } from "../store/routines.ts";
import { currentState, isActive, type Body } from "../store/body.ts";
import type { LibraryItem } from "../store/session-log.ts";

/** One region an active mark or condition is about, as the engine sees it. */
export interface Concern {
  source: "mark" | "condition";
  /** The mark's or condition's record id. */
  id: string;
  region: Region;
  side: Side;
  severity: Severity;
  redFlag: boolean;
  /** A mark's kind. */
  kind?: MarkKind;
  /** A condition's type (its rules), and its name. */
  conditionKind?: string;
  name?: string;
}

const REGION_NAME: Record<Region, string> = {
  neck: "neck", shoulder: "shoulder", chest: "chest", upperback: "upper back", upperarm: "upper arm", forearm: "forearm and wrist",
  core: "core", lowerback: "lower back", hips: "hips", glutes: "glutes", quads: "front of thigh", hamstrings: "hamstring",
  knee: "knee", shin: "shin", calf: "calf", ankle: "ankle and foot",
};
const SEVERITY_WORD: Record<Severity, string> = { 1: "mild", 2: "moderate", 3: "severe" };

/** "right shoulder", "both knees", "lower back". */
export function placeOf(region: Region, side: Side): string {
  const name = REGION_NAME[region];
  if (side === "left" || side === "right") return `${side} ${name}`;
  if (side === "both") return `${name}, both sides`;
  return name;
}

/** "right shoulder pain", "left knee (ACL repair)". */
export function describeConcern(c: Concern): string {
  return c.source === "mark" ? `${placeOf(c.region, c.side)} ${c.kind}` : `${placeOf(c.region, c.side)} (${c.name})`;
}

/**
 * The concerns of the body now: every active mark, and each region of every active condition.
 * Whole-body conditions name no region and have no rules yet (#5), so they add none.
 */
export function concerns(body: Body, now = new Date()): Concern[] {
  const out: Concern[] = [];
  for (const m of body.marks as Mark[]) {
    if (!isActive(m, now)) continue;
    const s = currentState(m);
    if (!s) continue;
    out.push({ source: "mark", id: m.id, region: m.region, side: m.side, severity: s.severity, redFlag: s.redFlags.length > 0, kind: m.kind });
  }
  for (const c of body.conditions as Condition[]) {
    if (!isActive(c, now)) continue;
    const s = currentState(c);
    for (const r of c.regions) {
      out.push({
        source: "condition", id: c.id, region: r.region, side: r.side, severity: s?.severity ?? 1, redFlag: (s?.redFlags.length ?? 0) > 0,
        name: c.name, ...(c.kind ? { conditionKind: c.kind } : {}),
      });
    }
  }
  return out;
}

export type Action = "ok" | "caution" | "modify" | "avoid";
const RANK: Record<Action, number> = { ok: 0, caution: 1, modify: 2, avoid: 3 };

export interface Assessment {
  action: Action;
  /** A gentler exercise to do instead (modify). */
  swap?: string;
  /** Modifier ids for doing this exercise itself more gently (modify), when there's no swap or it can't be done. */
  modifiers: string[];
  /** Modifier ids to go with the swap, when its rule names any. */
  swapModifiers: string[];
  /** Why, one line per concern that mattered. */
  reasons: string[];
  /** The concerns that changed it. */
  affects: Concern[];
}

/** What the body's concerns do to one exercise. */
export function assess(item: Pick<LibraryItem, "id" | "works" | "strains">, cs: readonly Concern[], rules: BodyRules = bodyRules()): Assessment {
  const out: Assessment = { action: "ok", modifiers: [], swapModifiers: [], reasons: [], affects: [] };
  const add = (list: string[], mods: readonly string[]) => { for (const m of mods) if (!list.includes(m)) list.push(m); };
  const raise = (a: Action) => { if (RANK[a] > RANK[out.action]) out.action = a; };
  for (const c of cs) {
    const where = describeConcern(c);
    const ruleSet = c.conditionKind ? rules.conditions.find((k) => k.kind === c.conditionKind) : undefined;
    if (ruleSet?.avoid.includes(item.id)) {
      raise("avoid");
      out.reasons.push(`Left out for your ${where}`);
      out.affects.push(c);
      continue;
    }
    if (item.strains.includes(c.region)) {
      out.affects.push(c);
      const heavy = c.redFlag || (c.source === "mark" && c.severity >= 2);
      if (heavy) {
        raise("avoid");
        out.reasons.push(c.redFlag
          ? `Strains your ${where}, which has a red flag: left out until it's been checked`
          : `Strains your ${where} (${SEVERITY_WORD[c.severity]}): left out for now`);
        continue;
      }
      raise("modify");
      const own = rules.modify.find((m) => m.exercise === item.id && m.region === c.region);
      if (own?.swap) {
        out.swap ??= own.swap;
        add(out.swapModifiers, own.modifiers);
      }
      // Without a swap (or one that can't be done), the rule's own modifiers, else the region's default.
      add(out.modifiers, own?.modifiers.length ? own.modifiers : rules.defaults[c.region] ?? []);
      out.reasons.push(`Strains your ${where}${c.source === "mark" ? " (mild)" : ""}: ${own?.swap ? "a gentler version" : "go easy"}`);
      continue;
    }
    if (item.works.includes(c.region) && (c.kind === "pain" || c.kind === "injury")) {
      raise("caution");
      out.affects.push(c);
      out.reasons.push(`Works your ${where}: keep it light and pain-free`);
    }
  }
  if (out.action === "avoid") { delete out.swap; out.modifiers = []; out.swapModifiers = []; }
  return out;
}

/** The exercises the rules suggest for a concern, best first (a mark by region and kind; a condition by its type). */
export function helpersFor(c: Concern, rules: BodyRules = bodyRules()): string[] {
  if (c.source === "condition") {
    const k = c.conditionKind ? rules.conditions.find((x) => x.kind === c.conditionKind) : undefined;
    if (k?.helps.length) return k.helps;
    // A condition with no type of its own: what helps weakness there, gently.
    return rules.helps.find((h) => h.region === c.region && h.marks.includes("weakness"))?.exercises ?? [];
  }
  return rules.helps.find((h) => h.region === c.region && h.marks.includes(c.kind!))?.exercises ?? [];
}

/** One routine item the body changes (#47): what to do about it, and why. */
export interface RoutineFlag {
  itemId: string;
  exercise: string;
  assessment: Assessment;
}

/** True when a routine item already does what its assessment asks: no swap left, every modifier on it. */
export function alreadyModified(item: { exercise: string; modifiers?: readonly { id: string }[] | undefined }, a: Assessment): boolean {
  if (a.action !== "modify" || (a.swap && a.swap !== item.exercise)) return false;
  const have = new Set((item.modifiers ?? []).map((m) => m.id));
  return a.modifiers.every((m) => have.has(m));
}

/** The items in a routine that the body's concerns change, in the routine's order (#4: flag them). */
export function reviewRoutine(items: readonly { id: string; exercise: string; deleted?: true | undefined }[], library: readonly LibraryItem[], cs: readonly Concern[], rules: BodyRules = bodyRules()): RoutineFlag[] {
  const byId = new Map(library.map((x) => [x.id, x]));
  const out: RoutineFlag[] = [];
  for (const it of items) {
    if (it.deleted) continue;
    const ex = byId.get(it.exercise);
    if (!ex) continue;
    const a = assess(ex, cs, rules);
    if (a.action !== "ok") out.push({ itemId: it.id, exercise: it.exercise, assessment: a });
  }
  return out;
}

/**
 * "Use modified" (#50): a routine item changed as its assessment says: swapped for the gentler exercise
 * (with the swap's modifiers), or the same exercise with the modifiers. A swap measured differently
 * (reps for seconds) starts from that measure's targets.
 */
export function applyModified(item: RoutineItem, a: Assessment, measureOf: (exercise: string) => Measure): RoutineItem {
  const mods = (ids: readonly string[]) => modifiersOf(ids);
  if (a.swap && a.swap !== item.exercise) {
    const { reps: _r, seconds: _s, metres: _m, modifiers: _mo, ...rest } = item;
    const same = measureOf(a.swap) === measureOf(item.exercise);
    const base = same ? item : newItem(a.swap, measureOf(a.swap));
    const f = FIELD[measureOf(a.swap)];
    return {
      ...rest, exercise: a.swap, ...(same ? {} : { sets: base.sets }), [f]: base[f],
      ...(a.swapModifiers.length ? { modifiers: mods(a.swapModifiers) } : {}),
    } as RoutineItem;
  }
  const merged = [...(item.modifiers ?? [])];
  for (const m of mods(a.modifiers)) if (!merged.some((x) => x.id === m.id)) merged.push(m);
  return { ...item, ...(merged.length ? { modifiers: merged } : {}) };
}
