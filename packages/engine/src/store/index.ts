/**
 * The derived index (D2 item 5, #28): what the app shows and suggests from, built from the decrypted
 * session records and never synced. Each session file's summary is cached in .local/ under its size
 * and modification time, so a start-up re-reads only the files that changed; the first build (or a
 * new device) reads them all. Writes update it in place.
 */
import type { FilesPort } from "../ports/files-port.ts";
import type { Session } from "../records/schemas.ts";
import type { Vault } from "../vault/vault.ts";

/** A set as the index keeps it: the amounts, no notes. */
export interface SetSummary {
  at: string;
  reps?: number;
  seconds?: number;
  metres?: number;
  left?: { reps?: number; seconds?: number; metres?: number };
  right?: { reps?: number; seconds?: number; metres?: number };
  loadKg?: number;
}

export interface EntrySummary {
  exercise: string;
  effort?: string;
  modified: boolean;
  sets: SetSummary[];
}

export interface ProgressPoint {
  startedAt: string;
  sessionPath: string;
  best: number;
  unit: "kg·reps" | "reps" | "s" | "m";
  /** The best set itself. */
  set: SetSummary;
  /** Done with a modifier (#9): not like for like. */
  modified: boolean;
  /** One-sided: each side's best amount. */
  left?: number;
  right?: number;
}
export interface SessionSummary {
  path: string;
  id: string;
  startedAt: string;
  finishedAt?: string;
  location?: string;
  routine?: string;
  /** Deleted (#53): kept so the cache knows it, left out of everything else. */
  deleted?: true;
  entries: EntrySummary[];
}

const CACHE = "index.json.age";
const CACHE_VERSION = 3;

interface CacheFile {
  v: number;
  files: Record<string, { key: string; session: SessionSummary }>;
}

export function summarize(path: string, s: Session): SessionSummary {
  return {
    path, id: s.id, startedAt: s.startedAt,
    ...(s.finishedAt ? { finishedAt: s.finishedAt } : {}),
    ...(s.location ? { location: s.location } : {}),
    ...(s.routine ? { routine: s.routine } : {}),
    ...(s.deleted ? { deleted: true as const } : {}),
    entries: s.entries.filter((e) => !e.deleted).map((e) => ({
      exercise: e.exercise,
      ...(e.effort ? { effort: e.effort } : {}),
      modified: e.modifiers.length > 0,
      sets: e.sets.filter((x) => !x.deleted).map((x) => {
        const out: SetSummary = { at: x.at };
        for (const k of ["reps", "seconds", "metres", "left", "right", "loadKg"] as const) if (x[k] !== undefined) (out as unknown as Record<string, unknown>)[k] = x[k];
        return out;
      }),
    })),
  };
}

export interface BuildStats {
  files: number;
  reread: number;
  failed: number;
  ms: number;
  /** Where the time went: listing, stat, the cache, reading and decrypting. */
  phases: Record<string, number>;
}

export class RecordIndex {
  readonly #byPath = new Map<string, SessionSummary>();
  #keys = new Map<string, string>();

  /** Builds the index: the cache where it still matches the files, the rest read and decrypted. */
  static async build(vault: Vault, files: FilesPort, now: () => number = () => performance.now()): Promise<{ index: RecordIndex; saved: Promise<void>; stats: BuildStats }> {
    const started = now();
    const phases: Record<string, number> = {};
    let mark = started;
    const lap = (name: string) => { const t = now(); phases[name] = Math.round(t - mark); mark = t; };
    const index = new RecordIndex();
    const paths = await vault.list("sessions");
    lap("list");
    const stats = await files.statMany(paths.map((p) => files.join(vault.root, ...p.split("/"))));
    lap("stat");
    const keyOf = (p: string) => {
      const s = stats.get(files.join(vault.root, ...p.split("/")));
      return s ? `${s.size}:${s.mtimeMs}` : "";
    };
    const cache = await vault.readLocal<CacheFile>(CACHE);
    lap("cache");
    const cached = cache?.v === CACHE_VERSION ? cache.files : {};
    const reread: string[] = [];
    for (const p of paths) {
      const key = keyOf(p);
      const hit = cached[p];
      if (hit && hit.key === key) {
        index.#byPath.set(p, hit.session);
        index.#keys.set(p, key);
      } else {
        reread.push(p);
      }
    }
    const { records, failed, phases: readPhases } = await vault.readMany(reread);
    Object.assign(phases, readPhases);
    mark = now();
    for (const [p, r] of records) {
      if (r.type !== "session") continue;
      index.#byPath.set(p, summarize(p, r));
      index.#keys.set(p, keyOf(p));
    }
    lap("index");
    // The index is ready now; the cache for the next start-up is saved behind it.
    const saved = reread.length || Object.keys(cached).length !== paths.length ? index.save(vault) : Promise.resolve();
    return { index, saved, stats: { files: paths.length, reread: reread.length, failed: failed.size, ms: now() - started, phases } };
  }

  /** Keep the cache for the next start-up. */
  async save(vault: Vault): Promise<void> {
    const out: CacheFile = { v: CACHE_VERSION, files: {} };
    for (const [p, s] of this.#byPath) out.files[p] = { key: this.#keys.get(p) ?? "", session: s };
    await vault.writeLocal(CACHE, out);
  }

  /** A session just written: the index follows without a rescan (its cache key is refreshed on the next build). */
  put(path: string, session: Session): void {
    this.#byPath.set(path, summarize(path, session));
    this.#keys.set(path, "");
  }

  /** Every session, newest first. */
  sessions(): SessionSummary[] {
    return [...this.#byPath.values()].filter((s) => !s.deleted).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  /** The most recent session's sets of an exercise, for "last time" (#1). */
  lastTime(exercise: string, before?: string): { session: SessionSummary; entry: EntrySummary } | undefined {
    for (const s of this.sessions()) {
      if (before && s.startedAt >= before) continue;
      const entry = s.entries.find((e) => e.exercise === exercise && e.sets.length > 0);
      if (entry) return { session: s, entry };
    }
    return undefined;
  }

  /** Sessions by ISO week (Monday first), newest week first, for History (#33). */
  /** Sessions run from a routine (#36), newest first. */
  runs(routine: string): SessionSummary[] {
    return this.sessions().filter((s) => s.routine === routine);
  }

  weeks(): { week: string; sessions: SessionSummary[] }[] {
    const groups = new Map<string, SessionSummary[]>();
    for (const s of this.sessions()) {
      const week = isoWeek(s.startedAt);
      groups.set(week, [...(groups.get(week) ?? []), s]);
    }
    return [...groups].map(([week, sessions]) => ({ week, sessions }));
  }

  /** An exercise's best set per session, oldest first, for progress (#33): load × reps, or the longest hold or distance. */
  /**
   * The best set per session for an exercise (#33): by load × reps where there's load, else reps,
   * seconds or metres (a one-sided set counts its weaker side). One-sided exercises also get each
   * side's best, for the balance table. Oldest first.
   */
  progress(exercise: string): ProgressPoint[] {
    const out: ProgressPoint[] = [];
    const amount = (a: { reps?: number; seconds?: number; metres?: number } | undefined) => (a ? a.reps ?? a.seconds ?? a.metres ?? 0 : 0);
    for (const s of [...this.sessions()].reverse()) {
      for (const e of s.entries.filter((x) => x.exercise === exercise)) {
        let best = 0, unit: ProgressPoint["unit"] = "reps", bestSet: SetSummary | undefined;
        let left: number | undefined, right: number | undefined;
        for (const set of e.sets) {
          const sided = !!(set.left || set.right);
          const v = sided ? Math.min(amount(set.left), amount(set.right)) : amount(set);
          const sample = set.left ?? set.right ?? set;
          unit = sample.seconds !== undefined ? "s" : sample.metres !== undefined ? "m" : set.loadKg ? "kg·reps" : "reps";
          const score = unit === "kg·reps" ? (set.loadKg ?? 0) * v : v;
          if (!bestSet || score > best) { best = score; bestSet = set; }
          if (sided) {
            left = Math.max(left ?? 0, amount(set.left));
            right = Math.max(right ?? 0, amount(set.right));
          }
        }
        if (!bestSet) continue;
        out.push({ startedAt: s.startedAt, sessionPath: s.path, best, unit, set: bestSet, modified: e.modified, ...(left !== undefined ? { left } : {}), ...(right !== undefined ? { right } : {}) });
      }
    }
    return out;
  }

}

/** "2026-W47" for an ISO date-time. */
export function isoWeek(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
