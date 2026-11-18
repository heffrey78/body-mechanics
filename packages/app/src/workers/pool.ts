import { decryptRecords, type AnyRecord, type DecryptPool } from "@bm/engine";

/**
 * Decrypting the index's records on several cores (#28): one worker fewer than the device has cores,
 * each given an equal share, its file bytes transferred rather than copied. If a worker can't start,
 * fails, or hasn't answered within a minute, the workers are stopped and the records are decrypted
 * here on the main thread instead: slower, but never stuck.
 */
let workers: Worker[] | undefined;
let next = 0;

function start(): Worker[] {
  const n = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
  return Array.from({ length: n }, () => new Worker(new URL("./decrypt-worker.ts", import.meta.url), { type: "module" }));
}

function ask(worker: Worker, identity: string, items: { path: string; bytes: Uint8Array }[]) {
  const id = ++next;
  return new Promise<{ records: [string, AnyRecord][]; failed: [string, string][] }>((resolve, reject) => {
    const done = (e: MessageEvent) => {
      if (e.data?.id !== id) return;
      worker.removeEventListener("message", done);
      resolve(e.data);
    };
    worker.addEventListener("message", done);
    worker.addEventListener("error", (e) => reject(e.error ?? new Error(e.message)), { once: true });
    worker.postMessage({ id, identity, items }, items.map((i) => i.bytes.buffer as ArrayBuffer));
  });
}

const TIMEOUT_MS = 60_000;

export const workerPool: DecryptPool = async (identity, items) => {
  try {
    workers ??= start();
    const shares = workers.map((): { path: string; bytes: Uint8Array }[] => []);
    items.forEach((item, i) => shares[i % shares.length]!.push({ path: item.path, bytes: item.bytes.slice() }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("decrypt workers timed out")), TIMEOUT_MS); });
    const answers = await Promise.race([Promise.all(workers.map((w, i) => ask(w, identity, shares[i]!))), timeout]).finally(() => clearTimeout(timer));
    return {
      records: new Map(answers.flatMap((a) => a.records)),
      failed: new Map(answers.flatMap((a) => a.failed)),
    };
  } catch (e) {
    console.warn("Decrypting on the main thread instead:", e);
    workers?.forEach((w) => w.terminate());
    workers = undefined;
    return decryptRecords(identity, items);
  }
};
