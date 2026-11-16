import { parse } from "yaml";
import { Session, parseStrictYaml, serializeRecord } from "../src/index.ts";
const text = serializeRecord({ type: "session", v: 1, id: "s".repeat(15) + "a", startedAt: "2026-11-16T07:42:00.000Z",
  entries: Array.from({ length: 6 }, () => ({ id: "a".repeat(15) + "b", exercise: "bm:goblet-squat", modifiers: [],
    sets: Array.from({ length: 3 }, () => ({ id: "c".repeat(16), at: "2026-11-16T07:45:00.000Z", reps: 10, loadKg: 16 })) })) });
const N = 2000;
const time = (f: () => unknown) => { for (let i = 0; i < 200; i++) f(); const t = performance.now(); for (let i = 0; i < N; i++) f(); return ((performance.now() - t) / N).toFixed(3); };
const obj = parseStrictYaml(text);
console.log(`strict parse ${time(() => parseStrictYaml(text))} ms · yaml.parse ${time(() => parse(text))} ms · zod ${time(() => Session.parse(obj))} ms · JSON.parse ${time(() => JSON.parse(JSON.stringify(obj)))} ms`);
const jsyaml = await import("js-yaml");
console.log(`js-yaml load ${time(() => jsyaml.load(text, { schema: jsyaml.CORE_SCHEMA }))} ms, and + zod ${time(() => Session.parse(jsyaml.load(text, { schema: jsyaml.CORE_SCHEMA })))} ms`);
