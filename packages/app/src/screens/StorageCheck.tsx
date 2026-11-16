import { useState } from "react";
import { indexBenchmark } from "@bm/engine";
import { dataDir, hostPorts } from "../host.ts";
import { Button, Card } from "../ui/components.tsx";
import { workerPool } from "../workers/pool.ts";

/**
 * A check for #28 on the phone: 5,000 throwaway sessions written to a scratch folder, the index built
 * cold and then warm, the times shown, the folder removed. Targets: under 3 s cold, 300 ms warm.
 */
export function StorageCheck() {
  const [state, setState] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [text, setText] = useState("Writes 5,000 sample sessions (a minute or two), then times the index.");
  const run = async () => {
    setState("running");
    try {
      const root = `${(await dataDir()).replace(/\/$/, "")}/storage-check`;
      const r = await indexBenchmark(hostPorts().files, root, 5000, (n) => setText(`Writing sample sessions… ${n.toLocaleString()} of 5,000`), workerPool);
      setText(`${r.sessions.toLocaleString()} sessions · cold ${r.coldMs} ms (target 3000) · warm ${r.warmMs} ms (target 300) · ${navigator.hardwareConcurrency} cores · ${Object.entries(r.coldPhases).map(([k, v]) => `${k} ${v}`).join(", ")}`);
      setState("done");
    } catch (e) {
      setText(`Failed: ${e instanceof Error ? e.message : String(e)}`);
      setState("failed");
    }
  };
  return (
    <Card>
      <span className="label">Storage check (#28)</span>
      <span className="muted" data-testid="storage-check">{text}</span>
      <Button disabled={state === "running"} onClick={() => void run()}>{state === "running" ? "Running…" : state === "idle" ? "Run the 5,000-session check" : "Run it again"}</Button>
    </Card>
  );
}
