import { Decrypter, Encrypter, generateX25519Identity, identityToRecipient } from "age-encryption";
import { parseRecord, serializeRecord } from "../src/index.ts";
const id = await generateX25519Identity(); const rcp = await identityToRecipient(id);
const text = serializeRecord({ type: "session", v: 1, id: "s".repeat(15) + "a", startedAt: "2026-11-16T07:42:00.000Z",
  entries: Array.from({ length: 6 }, () => ({ id: "a".repeat(15) + "b", exercise: "bm:goblet-squat", modifiers: [],
    sets: Array.from({ length: 3 }, () => ({ id: "c".repeat(16), at: "2026-11-16T07:45:00.000Z", reps: 10, loadKg: 16 })) })) });
const N = 400, files: Uint8Array[] = [];
for (let i = 0; i < N; i++) { const e = new Encrypter(); e.addRecipient(rcp); files.push(await e.encrypt(text)); }
const d = new Decrypter(); d.addIdentity(id);
let t = performance.now(); for (const f of files) await d.decrypt(f); const dec = (performance.now() - t) / N;
t = performance.now(); for (let i = 0; i < N; i++) parseRecord(text); const parse = (performance.now() - t) / N;
console.log(`decrypt ${dec.toFixed(2)} ms, parse+validate ${parse.toFixed(2)} ms`);
console.log("WebCrypto X25519 available:", await crypto.subtle.generateKey({ name: "X25519" }, false, ["deriveBits"]).then(() => true, () => false));
