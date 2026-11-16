import { describe, expect, it } from "vitest";
import { GitFailure, GitHubError, Syncer, classify, type Schedule, type SyncOutcome, type SyncStatus } from "../src/index.ts";

function fakeSchedule() {
  let now = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let next = 0;
  const schedule: Schedule = {
    set: (fn, ms) => { timers.set(++next, { at: now + ms, fn }); return next; },
    clear: (h) => void timers.delete(h as number),
    now: () => now,
  };
  const advance = async (ms: number) => {
    now += ms;
    for (const [k, t] of [...timers]) if (t.at <= now) { timers.delete(k); t.fn(); }
    await new Promise((r) => setTimeout(r, 0));
  };
  return { schedule, advance, pending: () => timers.size };
}

const synced: SyncOutcome = { status: "synced", pulled: false, pushed: true, merged: false, flags: [] };

describe("the background syncer (#39)", () => {
  it("syncs on start, then every interval, and stops when turned off", async () => {
    const { schedule, advance, pending } = fakeSchedule();
    let runs = 0;
    const seen: SyncStatus["state"][] = [];
    const s = new Syncer(async () => { runs++; return synced; }, { schedule, intervalMs: 60_000, onStatus: (x) => seen.push(x.state) });
    await s.start();
    expect(runs).toBe(1);
    await advance(59_000);
    expect(runs).toBe(1);
    await advance(2_000);
    await new Promise((r) => setTimeout(r, 10));
    expect(runs).toBe(2);
    s.stop();
    expect(pending()).toBe(0);
    await advance(120_000);
    await s.now(); // off: does nothing
    expect(runs).toBe(2);
    expect(seen).toEqual(["idle", "syncing", "idle", "syncing", "idle", "off"]);
  });

  it("runs one sync at a time, after the committer", async () => {
    const order: string[] = [];
    let release!: () => void;
    const committing = new Promise<void>((r) => { release = r; });
    const s = new Syncer(async () => { order.push("sync"); return synced; }, { beforeRun: async () => { order.push("wait"); await committing; }, schedule: fakeSchedule().schedule });
    const a = s.start();
    const b = s.now();
    expect(order).toEqual(["wait"]);
    release();
    await Promise.all([a, b]);
    expect(order).toEqual(["wait", "sync"]);
  });

  it("says offline, signed out or failed by what went wrong", () => {
    expect(classify(new GitHubError("OFFLINE", "x"), 5)).toEqual({ state: "offline", at: 5 });
    expect(classify(new GitFailure("NETWORK", "unreachable"), 5)).toEqual({ state: "offline", at: 5 });
    expect(classify(new GitFailure("AUTH", "401"), 5)).toEqual({ state: "needs-sign-in" });
    expect(classify(new GitHubError("NO_SIGN_IN", "x"), 5)).toEqual({ state: "needs-sign-in" });
    expect(classify(new Error("disk full"), 5)).toEqual({ state: "failed", at: 5, reason: "disk full" });
  });

  it("keeps going after a failure", async () => {
    const { schedule, advance } = fakeSchedule();
    let fail = true;
    const s = new Syncer(async () => { if (fail) throw new GitFailure("NETWORK", "down"); return synced; }, { schedule, intervalMs: 1000 });
    await s.start();
    expect(s.status.state).toBe("offline");
    fail = false;
    await advance(1000);
    await s.now();
    expect(s.status).toMatchObject({ state: "idle", last: synced });
  });
});
