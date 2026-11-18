/**
 * Suggest next (D3, #19; #42): a deterministic engine of pure functions, no LLM at runtime.
 *   1. Hard filters: equipment at the location, sweat, time left, done or refused this session,
 *      movements without a body region.
 *   2. Soft filters: the focus area and kinds, dropped only when nothing would be left.
 *   3. Scoring: focus, kinds (a balanced mix when none are chosen), region variety in the session,
 *      variety against recent history, the sweat asked for.
 *   4. Reasons: every score term and filter outcome that matters becomes a "why this" line.
 * The body (#47) works between 1 and 2: an exercise to avoid is dropped, one to modify is swapped
 * for its gentler version (if that fits too) or keeps its modifiers, and one that helps an active
 * mark or condition scores up, more when the mark is in the focus and not yet helped this session.
 */
import type { Kind, Region } from "../records/vocab.ts";
import type { Location } from "../records/schemas.ts";
import type { LibraryItem } from "../store/session-log.ts";
import type { EntrySummary, SessionSummary } from "../store/index.ts";
import { progression } from "../store/progression.ts";
import { FIELD } from "../store/next-set.ts";
import { fits as fitsNeeds, needsFromLegacy } from "../records/equipment.ts";
import { assess, describeConcern, helpersFor, type Concern } from "../body/assess.ts";

export const AREAS: Record<"upper" | "lower" | "core", Region[]> = {
  upper: ["neck", "shoulder", "chest", "upperback", "upperarm", "forearm"],
  lower: ["hips", "glutes", "quads", "hamstrings", "knee", "shin", "calf", "ankle"],
  core: ["core", "lowerback"],
};

export interface Answers {
  location?: Location;
  /** Minutes left for the session; undefined: no limit. */
  minutesLeft?: number;
  sweat: 0 | 1 | 2;
  /** Regions to focus on; empty: the whole body. */
  area: Region[];
  /** Kinds asked for; empty: a balanced mix. */
  kinds: Kind[];
}

export interface Context {
  library: LibraryItem[];
  /** Exercises already in this session, in order. */
  done: string[];
  /** Exercises turned down this session. */
  refused: ReadonlySet<string>;
  /** Recent sessions, newest first (the last two weeks is plenty). */
  history: SessionSummary[];
  /** The last time an exercise was done, before this session. */
  lastTime: (exercise: string) => EntrySummary | undefined;
  units: "kg" | "lb";
  now: Date;
  /** Breaks ties, so equal suggestions vary between sessions but not within one (the session id). */
  seed?: string;
  /** Custom equipment → the built-in items it stands in for (#60). */
  standsIn?: ReadonlyMap<string, readonly string[]>;
  /** The body's active marks and conditions (#47), from concerns(). */
  body?: readonly Concern[];
}

export interface Suggestion {
  item: LibraryItem;
  sets: number;
  /** Reps, seconds or metres by the measure; per side for one-sided exercises. */
  amount: number;
  loadKg?: number;
  score: number;
  reasons: string[];
  /** Estimated minutes, rest included. */
  minutes: number;
  /** Modifier ids for the body (#47): how to do it more gently. */
  modifiers: string[];
  /** The exercise this gentler one stands in for (#47). */
  insteadOf?: LibraryItem;
  /** A caution for a painful area it works (#47). */
  caution?: string;
}

const KIND_WORD: Record<Kind, string> = { mobility: "Mobility", strength: "Strength", endurance: "Endurance", balance: "Balance" };
const REGION_WORD: Record<Region, string> = {
  neck: "neck", shoulder: "shoulders", chest: "chest", upperback: "upper back", upperarm: "arms", forearm: "forearms",
  core: "core", lowerback: "lower back", hips: "hips", glutes: "glutes", quads: "quads", hamstrings: "hamstrings",
  knee: "knees", shin: "shins", calf: "calves", ankle: "ankles",
};
const DAY = 86_400_000;

/** The dose: last time's sets and best amount (moved on by how it felt), else a start for the measure. */
function dose(item: LibraryItem, last: EntrySummary | undefined, units: "kg" | "lb"): { sets: number; amount: number; loadKg?: number; note?: string } {
  const f = FIELD[item.measure];
  const start = { reps: { sets: 2, amount: 10 }, time: { sets: 2, amount: 30 }, distance: { sets: 1, amount: 200 } }[item.measure];
  if (!last || !last.sets.length) return start;
  const amounts = last.sets.map((s) => (s.left || s.right ? Math.min(s.left?.[f] ?? 0, s.right?.[f] ?? 0) : s[f] ?? 0));
  const loads = last.sets.map((s) => s.loadKg ?? 0);
  const heaviest = Math.max(...loads);
  const base = { id: "x", exercise: item.id, sets: Math.min(last.sets.length, 5), [f]: Math.max(...amounts), ...(heaviest > 0 ? { loadKg: heaviest } : {}) };
  const p = progression(base, item.measure, last, units);
  const amount = p?.amount ?? Math.max(...amounts);
  const loadKg = p ? p.loadKg : heaviest > 0 ? heaviest : undefined;
  return { sets: base.sets, amount, ...(loadKg !== undefined ? { loadKg } : {}), ...(p && p.direction !== "hold" ? { note: p.reason } : {}) };
}

/** Rough minutes for a dose: work plus rest. */
function minutesFor(item: LibraryItem, sets: number, amount: number): number {
  const sides = item.sided ? 2 : 1;
  const work = item.measure === "reps" ? amount * 3 : item.measure === "time" ? amount : amount / 2;
  const rest = item.kinds.includes("strength") ? 60 : 20;
  return Math.ceil(((work * sides + rest) * sets) / 60);
}

/** Ranked suggestions, best first. Empty when nothing fits. */
export function suggest(answers: Answers, ctx: Context): Suggestion[] {
  const have = new Set(answers.location?.equipment ?? []);
  const doneSet = new Set(ctx.done);
  const byId = new Map(ctx.library.map((x) => [x.id, x]));
  const doneItems = ctx.done.map((d) => byId.get(d)).filter((x): x is LibraryItem => !!x);
  const workedToday = new Map<Region, number>();
  for (const d of doneItems) d.works.forEach((r, i) => workedToday.set(r, (workedToday.get(r) ?? 0) + (i === 0 ? 1 : 0.5)));
  const kindsToday = new Set(doneItems.flatMap((d) => d.kinds));
  const lastDone = new Map<string, number>();
  for (const s of ctx.history) for (const e of s.entries) if (!lastDone.has(e.exercise)) lastDone.set(e.exercise, Date.parse(s.startedAt));

  // 1. Hard filters, then the body (#47).
  const body = ctx.body ?? [];
  type Cand = { item: LibraryItem; d: ReturnType<typeof dose>; minutes: number; modifiers: string[]; body: string[]; insteadOf?: LibraryItem; caution?: string };
  const fits = (item: LibraryItem) => {
    if (!item.works.length || item.deleted) return false; // never suggest a movement without a body region (#3), or a deleted one
    if (doneSet.has(item.id) || ctx.refused.has(item.id)) return false;
    if (item.sweat > answers.sweat) return false;
    return !answers.location || fitsNeeds(item.needs, have, ctx.standsIn);
  };
  const hard: Cand[] = [];
  for (const original of ctx.library) {
    if (!fits(original)) continue;
    const a = assess(original, body);
    if (a.action === "avoid") continue;
    let item = original;
    let insteadOf: LibraryItem | undefined;
    let modifiers = a.modifiers;
    if (a.swap) {
      const swap = byId.get(a.swap);
      const own = swap ? assess(swap, body) : undefined;
      if (swap && own && fits(swap) && own.action !== "avoid") {
        item = swap;
        insteadOf = original;
        // The swap rule's modifiers, else what the stand-in itself needs (a bodyweight squat still loads the knee).
        modifiers = a.swapModifiers.length ? a.swapModifiers : own.modifiers;
      }
    }
    const d = dose(item, ctx.lastTime(item.id), ctx.units);
    const minutes = minutesFor(item, d.sets, d.amount);
    if (answers.minutesLeft !== undefined && minutes > answers.minutesLeft) continue;
    const caution = a.action === "caution" ? a.reasons[0] : undefined;
    const lines = a.action === "caution" ? [] : [...a.reasons];
    if (insteadOf) lines.unshift(`In place of ${insteadOf.name}, for your ${a.affects.map(describeConcern).join(" and ")}`);
    hard.push({ item, d, minutes, modifiers, body: lines, ...(insteadOf ? { insteadOf } : {}), ...(caution ? { caution } : {}) });
  }
  // What helps each concern, and which concerns this session has already helped.
  const helpers = body.map((c) => ({ c, ids: helpersFor(c) }));
  const helpedToday = new Set(helpers.filter((h) => ctx.done.some((d) => h.ids.includes(d))).map((h) => h.c.id + h.c.region));

  // 2. Soft filters: the focus, unless nothing would be left.
  const inArea = (x: LibraryItem) => !answers.area.length || x.works.some((r) => answers.area.includes(r));
  const inKinds = (x: LibraryItem) => !answers.kinds.length || x.kinds.some((k) => answers.kinds.includes(k));
  let pool = hard.filter((c) => inArea(c.item) && inKinds(c.item));
  let relaxed = "";
  if (!pool.length) { pool = hard.filter((c) => inArea(c.item)); relaxed = "Nothing here matches every kind you asked for"; }
  if (!pool.length) { pool = hard; relaxed = "Nothing here matches your focus"; }

  // 3. Scoring, with the reasons.
  const out: Suggestion[] = pool.map(({ item, d, minutes, modifiers, body: bodyLines, insteadOf, caution }) => {
    let score = 0;
    const reasons: string[] = [];
    // Helping the body comes first (#4): a mark inside the focus, and one not yet helped today, more.
    const helped: string[] = [];
    for (const { c, ids } of helpers) {
      const at = ids.indexOf(item.id);
      if (at < 0) continue;
      const inFocus = !answers.area.length || answers.area.includes(c.region);
      const fresh = !helpedToday.has(c.id + c.region);
      score += (fresh ? 3 : 1) + (inFocus ? 1.5 : 0) + (ids.length - at) / ids.length;
      helped.push(describeConcern(c));
    }
    if (helped.length) reasons.push(`Helps your ${[...new Set(helped)].join(" and ")}`);
    reasons.push(...bodyLines);
    // The caution is shown on its own (Suggestion.caution), not among the reasons.
    if (caution) score -= 0.5;
    const focusHit = item.works.filter((r) => answers.area.includes(r));
    if (answers.area.length && focusHit.length) {
      score += answers.area.includes(item.works[0]!) ? 3 : 1.5;
      reasons.push(`Works your ${focusHit.slice(0, 2).map((r) => REGION_WORD[r]).join(" and ")}, your focus`);
    } else if (!answers.area.length) {
      reasons.push(`Works your ${item.works.slice(0, 2).map((r) => REGION_WORD[r]).join(" and ")}`);
    }
    const kindHit = item.kinds.filter((k) => answers.kinds.includes(k));
    if (kindHit.length) {
      score += 2;
      reasons.push(`${KIND_WORD[kindHit[0]!]}, as you asked`);
    } else if (!answers.kinds.length) {
      const fresh = item.kinds.filter((k) => !kindsToday.has(k));
      if (fresh.length && doneItems.length) { score += 1.5; reasons.push(`${KIND_WORD[fresh[0]!]}: none yet this session`); }
      // Nothing done yet and no kinds asked for: start gently.
      if (!doneItems.length && item.kinds.includes("mobility")) { score += 1; reasons.push("A gentle way to start"); }
    }
    // Variety in the session: a region already worked counts against.
    const repeat = item.works.reduce((n, r, i) => n + (workedToday.get(r) ?? 0) * (i === 0 ? 2 : 0.5), 0);
    if (repeat) score -= repeat;
    else if (doneItems.length) reasons.push("Something different from what you've done so far");
    // Variety against history.
    const when = lastDone.get(item.id);
    if (when !== undefined) {
      const days = (ctx.now.getTime() - when) / DAY;
      if (days < 2) score -= 1.5;
      else if (days < 7) score -= 0.5;
      else { score += 0.5; reasons.push(`Not done for ${Math.floor(days)} days`); }
    }
    // The sweat asked for: lean towards it.
    if (answers.sweat === 2) score += item.sweat * 0.5;
    if (answers.sweat === 0) reasons.push("No sweat");
    if (answers.location) {
      // What it'll use here: the first alternative present in each required group, then optional extras.
      const used = [...item.needs.map((alts) => alts.find((e) => have.has(e))), ...item.optional.filter((e) => have.has(e))]
        .filter((e): e is NonNullable<typeof e> => !!e).map((e) => e.replace("-", " "));
      reasons.push(used.length ? `Uses the ${used.join(" and ")} at ${answers.location.name}` : "Needs no equipment");
    }
    if (answers.minutesLeft !== undefined) reasons.push(`About ${minutes} min`);
    if (d.note) reasons.push(d.note);
    if (relaxed) reasons.push(relaxed);
    return {
      item, sets: d.sets, amount: d.amount, ...(d.loadKg !== undefined ? { loadKg: d.loadKg } : {}), score: Math.round(score * 100) / 100, reasons, minutes,
      modifiers, ...(insteadOf ? { insteadOf } : {}), ...(caution ? { caution } : {}),
    };
  });
  const tie = (id: string) => hash(`${ctx.seed ?? ""}:${id}`);
  const ranked = out.sort((a, b) => b.score - a.score || tie(a.item.id) - tie(b.item.id) || a.item.name.localeCompare(b.item.name));
  // A gentler version can also be a candidate in its own right: show it once, as the stand-in (which
  // says why), at the better of the two scores.
  const best = new Map<string, Suggestion>();
  for (const x of ranked) {
    const had = best.get(x.item.id);
    if (!had) best.set(x.item.id, x);
    else if (x.insteadOf && !had.insteadOf) best.set(x.item.id, { ...x, score: Math.max(x.score, had.score) });
  }
  return [...best.values()].sort((a, b) => b.score - a.score || tie(a.item.id) - tie(b.item.id) || a.item.name.localeCompare(b.item.name));
}

/** FNV-1a: a small, stable string hash for tie-breaking. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * The old reading of a flat equipment list (D1): needed together, except within the stand-in groups.
 * Kept for callers with a flat list; exercises themselves now carry `needs` (D4).
 */
export function equipped(needs: readonly string[], have: ReadonlySet<string>): boolean {
  return fitsNeeds(needsFromLegacy(needs), have);
}
