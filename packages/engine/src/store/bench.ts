/**
 * The index benchmark (#28, D2's validation): writes `n` sessions of six exercises × three sets into a
 * fresh vault under `root`, then times a cold index build (no cache) and a warm one (cache valid).
 * The app runs it on the phone from Home's storage check; tests and bench/ run it with memory ports.
 */
import type { FilesPort } from "../ports/files-port.ts";
import { memorySecretsPort } from "../ports/secrets-port.ts";
import type { Session } from "../records/schemas.ts";
import { Vault, type DecryptPool } from "../vault/vault.ts";
import { RecordIndex } from "./index.ts";

const letters = (n: number, len: number) => {
  let out = "";
  for (let v = n; out.length < len; v = Math.floor(v / 26)) out = "abcdefghijklmnopqrstuvwxyz"[v % 26] + out;
  return out;
};

export async function indexBenchmark(files: FilesPort, root: string, n: number, onProgress?: (written: number) => void, pool?: DecryptPool): Promise<{ sessions: number; coldMs: number; warmMs: number; writeMs: number; coldPhases: Record<string, number> }> {
  await files.removeTree(root);
  const { vault } = await Vault.create({ files, secrets: memorySecretsPort() }, root, "benchmark passphrase", { scryptLogN: 10 });
  if (pool) vault.setDecryptPool(pool);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const day = new Date(Date.UTC(2014, 0, 1) + i * 86400000 * 0.8).toISOString().slice(0, 10);
    const s: Session = {
      type: "session", v: 1, id: "s" + letters(i, 15), startedAt: `${day}T07:00:00.000Z`,
      entries: Array.from({ length: 6 }, (_, e) => ({
        id: "e" + letters(i * 6 + e, 15), exercise: ["bm:goblet-squat", "bm:push-up", "bm:plank", "bm:split-squat", "bm:cat-cow", "bm:farmer-carry"][e]!, modifiers: [],
        sets: Array.from({ length: 3 }, (_, k) => ({ id: "x" + letters((i * 6 + e) * 3 + k, 15), at: `${day}T07:0${k}:00.000Z`, reps: 10, loadKg: 16 })),
      })),
    };
    await vault.write(s);
    if (onProgress && i % 250 === 0) onProgress(i);
  }
  const writeMs = performance.now() - t0;
  const cold = await RecordIndex.build(vault, files);
  await cold.saved;
  const warm = await RecordIndex.build(vault, files);
  await files.removeTree(root);
  return { sessions: cold.stats.files, coldMs: Math.round(cold.stats.ms), warmMs: Math.round(warm.stats.ms), writeMs: Math.round(writeMs), coldPhases: cold.stats.phases };
}
