/**
 * Sync in the background (#39; after writer's Syncer): every few minutes while the app is open, after
 * a session finishes, and when asked; one run at a time, and never while a commit is being made. It
 * reports a status the app shows. Turning it off stops it and keeps every local record.
 */
import { GitFailure } from "../ports/git-port.ts";
import type { Schedule } from "./committer.ts";
import { realSchedule } from "./committer.ts";
import type { SyncOutcome } from "./sync.ts";

export type SyncStatus =
  | { state: "off" }
  | { state: "idle"; at?: number; last?: SyncOutcome }
  | { state: "syncing" }
  | { state: "offline"; at: number }
  | { state: "needs-sign-in" }
  | { state: "failed"; at: number; reason: string };

/** What went wrong, as a status: offline, signed out, or a failure to show. */
export function classify(e: unknown, at: number): SyncStatus {
  const code = (e as { code?: string } | null)?.code;
  if (code === "OFFLINE" || (e instanceof GitFailure && e.code === "NETWORK")) return { state: "offline", at };
  if (code === "NO_SIGN_IN" || (e instanceof GitFailure && (e.code === "AUTH" || e.code === "SCOPE"))) return { state: "needs-sign-in" };
  return { state: "failed", at, reason: e instanceof Error ? e.message : String(e) };
}

export class Syncer {
  readonly #run: () => Promise<SyncOutcome>;
  readonly #beforeRun: () => Promise<void>;
  readonly #intervalMs: number;
  readonly #schedule: Schedule;
  readonly #onStatus: (s: SyncStatus) => void;
  #status: SyncStatus = { state: "off" };
  #timer: unknown;
  #running: Promise<void> | undefined;

  constructor(run: () => Promise<SyncOutcome>, { beforeRun = async () => {}, intervalMs = 5 * 60_000, schedule = realSchedule, onStatus = () => {} }: {
    /** Waits for anything that mustn't overlap a sync (the committer's commit). */
    beforeRun?: () => Promise<void>;
    intervalMs?: number;
    schedule?: Schedule;
    onStatus?: (s: SyncStatus) => void;
  } = {}) {
    this.#run = run;
    this.#beforeRun = beforeRun;
    this.#intervalMs = intervalMs;
    this.#schedule = schedule;
    this.#onStatus = onStatus;
  }

  get status(): SyncStatus {
    return this.#status;
  }

  get on(): boolean {
    return this.#status.state !== "off";
  }

  /** Turn on: sync now, then every interval. */
  start(): Promise<void> {
    if (!this.on) this.#set({ state: "idle" });
    return this.now();
  }

  /** Turn off: no more syncing; nothing local changes. */
  stop(): void {
    if (this.#timer !== undefined) this.#schedule.clear(this.#timer);
    this.#timer = undefined;
    this.#set({ state: "off" });
  }

  /** Sync now (joined to a run already going), unless off. */
  now(): Promise<void> {
    if (!this.on) return Promise.resolve();
    this.#running ??= (async () => {
      if (this.#timer !== undefined) this.#schedule.clear(this.#timer);
      this.#timer = undefined;
      this.#set({ state: "syncing" });
      try {
        await this.#beforeRun();
        const last = await this.#run();
        if (this.on) this.#set({ state: "idle", at: this.#schedule.now(), last });
      } catch (e) {
        if (this.on) this.#set(classify(e, this.#schedule.now()));
      } finally {
        this.#running = undefined;
        if (this.on) this.#timer = this.#schedule.set(() => void this.now(), this.#intervalMs);
      }
    })();
    return this.#running;
  }

  #set(s: SyncStatus): void {
    this.#status = s;
    this.#onStatus(s);
  }
}
