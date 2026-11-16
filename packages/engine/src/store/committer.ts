import type { GitPort } from "../ports/git-port.ts";

/**
 * Commits the records' changes in the background (#28; after writer's committer, at writer e89d55c):
 * once nothing has changed for `quietMs`, and at least every `maxMs` while changes keep coming. `now`
 * commits at once (a finished session). Nothing is committed when nothing changed, and one commit
 * runs at a time.
 */
export interface Schedule {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
  now(): number;
}

export const realSchedule: Schedule = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h),
  now: () => Date.now(),
};

export class Committer {
  readonly #git: GitPort;
  readonly #root: string;
  readonly #quietMs: number;
  readonly #maxMs: number;
  readonly #schedule: Schedule;
  #timer: unknown;
  #firstChange: number | undefined;
  #message = "Update records";
  #running: Promise<string | undefined> = Promise.resolve(undefined);

  constructor(git: GitPort, root: string, { quietMs = 30_000, maxMs = 300_000, schedule = realSchedule }: { quietMs?: number; maxMs?: number; schedule?: Schedule } = {}) {
    this.#git = git;
    this.#root = root;
    this.#quietMs = quietMs;
    this.#maxMs = maxMs;
    this.#schedule = schedule;
  }

  /** Something was written: commit once things are quiet (or the longest wait is up). */
  changed(message?: string): void {
    if (message) this.#message = message;
    const now = this.#schedule.now();
    this.#firstChange ??= now;
    if (this.#timer !== undefined) this.#schedule.clear(this.#timer);
    const wait = Math.min(this.#quietMs, Math.max(0, this.#firstChange + this.#maxMs - now));
    this.#timer = this.#schedule.set(() => void this.now(), wait);
  }

  /** Resolves once no commit is running (sync waits on it, #39). */
  async idle(): Promise<void> {
    let seen: Promise<unknown>;
    do {
      seen = this.#running;
      await seen.catch(() => undefined);
    } while (seen !== this.#running);
  }

  /** Commit what's changed now; resolves with the commit's id, or undefined if there was nothing. */
  now(message?: string): Promise<string | undefined> {
    if (this.#timer !== undefined) this.#schedule.clear(this.#timer);
    this.#timer = undefined;
    this.#firstChange = undefined;
    const text = message ?? this.#message;
    this.#message = "Update records";
    this.#running = this.#running.then(async () => {
      if ((await this.#git.status(this.#root)).length === 0) return undefined;
      await this.#git.stage(this.#root);
      return (await this.#git.commit(this.#root, text)) ?? undefined;
    });
    return this.#running;
  }
}
