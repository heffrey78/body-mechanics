/**
 * Finding an exercise by what's typed (#2, #15): names, aliases and body words (the regions it
 * works, in plain anatomy), forgiving typos by word length (one edit from 3 letters, two from 7),
 * ignoring little words, ranked by how many typed words match. Enter adds the top result only when
 * every typed word matched it (`full`); otherwise the person creates a new movement.
 */
import type { Region } from "../records/vocab.ts";

/** Words a person might use for each region, beyond its own name. */
export const BODY_WORDS: Record<Region, string[]> = {
  neck: ["neck", "traps", "trapezius", "cervical"],
  shoulder: ["shoulder", "shoulders", "delts", "deltoid", "rotator", "cuff"],
  chest: ["chest", "pecs", "pectoral", "pectorals"],
  upperback: ["upper back", "back", "lats", "lat", "rhomboids", "thoracic", "posture"],
  upperarm: ["arm", "arms", "biceps", "bicep", "triceps", "tricep"],
  forearm: ["forearm", "forearms", "wrist", "wrists", "grip", "hand", "hands", "elbow"],
  core: ["core", "abs", "abdominals", "obliques", "trunk", "stomach"],
  lowerback: ["lower back", "low back", "back", "lumbar", "spine"],
  hips: ["hip", "hips", "hip flexors", "psoas", "groin", "adductors"],
  glutes: ["glutes", "glute", "butt", "buttocks", "bum"],
  quads: ["quads", "quadriceps", "thigh", "thighs", "front of thigh", "legs"],
  hamstrings: ["hamstring", "hamstrings", "back of thigh", "legs"],
  knee: ["knee", "knees"],
  shin: ["shin", "shins", "tibialis"],
  calf: ["calf", "calves", "achilles"],
  ankle: ["ankle", "ankles", "foot", "feet", "achilles"],
};

const STOP = ["a", "an", "the", "to", "on", "of", "with", "and", "in", "from", "for", "my"];

export interface Searchable {
  id: string;
  name: string;
  aliases: string[];
  works: Region[];
}

export interface Hit<T extends Searchable> {
  item: T;
  /** Every typed word matched: Enter may add it. */
  full: boolean;
  hits: number;
  score: number;
}

export function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n]!;
}

/** 2: the word, or a prefix of it; 1: within the typo allowance; 0: no. */
function wordHit(q: string, w: string): number {
  if (w === q || (q.length >= 2 && w.startsWith(q))) return 2;
  const tol = q.length >= 7 ? 2 : q.length >= 3 ? 1 : 0;
  if (tol && lev(q, w) <= tol) return 1;
  if (q.length >= 3 && w.length > q.length && lev(q, w.slice(0, q.length)) <= 1) return 1;
  return 0;
}

export function queryWords(query: string): string[] {
  return norm(query).split(" ").filter((w) => w && !STOP.includes(w));
}

/** Matches for `query`, best first; at most `limit`. A match must cover at least half the typed words. */
export function search<T extends Searchable>(query: string, items: T[], limit = 6): Hit<T>[] {
  const qs = queryWords(query);
  if (!qs.length) return [];
  const hits: Hit<T>[] = [];
  for (const item of items) {
    // A deleted exercise (#61) is kept for history's names, never found.
    if ((item as { deleted?: boolean }).deleted) continue;
    const nameWords = new Set(norm([item.name, ...item.aliases].join(" ")).split(" "));
    // Body words, the main region's counting more than the rest.
    const bodyWords = new Map<string, number>();
    item.works.forEach((r, i) => {
      for (const w of norm((BODY_WORDS[r] ?? [r]).join(" ")).split(" ")) bodyWords.set(w, Math.max(bodyWords.get(w) ?? 0, i === 0 ? 1.5 : 1));
    });
    let count = 0, score = 0;
    for (const q of qs) {
      let best = 0;
      for (const w of nameWords) best = Math.max(best, wordHit(q, w) * 2); // the name counts more than the body
      for (const [w, weight] of bodyWords) best = Math.max(best, wordHit(q, w) * weight);
      if (best) { count++; score += best; }
    }
    if (count * 2 >= qs.length) hits.push({ item, full: count === qs.length, hits: count, score });
  }
  return hits.sort((a, b) => b.hits - a.hits || b.score - a.score || a.item.name.length - b.item.name.length).slice(0, limit);
}
