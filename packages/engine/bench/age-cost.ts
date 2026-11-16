import { Decrypter, Encrypter, generateX25519Identity, identityToRecipient } from "age-encryption";
import { serializeRecord, parseRecord } from "../src/index.ts";
const id = await generateX25519Identity(); const rcp = await identityToRecipient(id);
const session = (i: number) => serializeRecord({ type: "session", v: 1, id: "s".repeat(15) + "a", startedAt: "2026-11-16T07:42:00.000Z",
  entries: Array.from({ length: 6 }, (_, e) => ({ id: "a".repeat(15) + "b", exercise: "bm:goblet-squat", modifiers: [],
    sets: Array.from({ length: 3 }, () => ({ id: "c".repeat(16), at: "2026-11-16T07:45:00.000Z", reps: 10, loadKg: 16 })) })) });
const N = 500;
let t = performance.now(); const files: Uint8Array[] = [];
for (let i = 0; i < N; i++) { const e = new Encrypter(); e.addRecipient(rcp); files.push(await e.encrypt(session(i))); }
const enc = (performance.now() - t) / N;
const d = new Decrypter(); d.addIdentity(id);
t = performance.now(); for (const f of files) parseRecord(new TextDecoder().decode(await d.decrypt(f)));
const dec = (performance.now() - t) / N;
console.log(`per file: encrypt ${enc.toFixed(2)} ms, decrypt+parse ${dec.toFixed(2)} ms, size ${files[0]!.length} B; 5000 sessions cold ≈ ${(dec * 5000 / 1000).toFixed(1)} s on this machine`);
