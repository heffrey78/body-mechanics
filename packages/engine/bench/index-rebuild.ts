import { indexBenchmark, memoryFilesPort } from "../src/index.ts";
const n = Number(process.argv[2] ?? 5000);
const r = await indexBenchmark(memoryFilesPort(), "/bench", n);
console.log(`${r.sessions} sessions: cold ${r.coldMs} ms, warm ${r.warmMs} ms (writing them took ${r.writeMs} ms)`);
