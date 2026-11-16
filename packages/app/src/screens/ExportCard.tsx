import { useState } from "react";
import { catalogueEntry, exportAll, type Vault } from "@bm/engine";
import { exportDir, hostPorts } from "../host.ts";
import { Button, Card } from "../ui/components.tsx";

/** More › Export (#30): every record as plain YAML plus sets.csv, in a folder the person can open. */
export function ExportCard({ vault, units }: { vault: Vault | null; units: "kg" | "lb" }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const [text, setText] = useState("Everything you've logged, decrypted: plain YAML files and a spreadsheet of sets.");
  const run = async () => {
    if (!vault) return;
    setState("busy");
    try {
      const dest = await exportDir();
      const r = await exportAll(vault, hostPorts().files, dest, units, (id) => catalogueEntry(id)?.name ?? id);
      setText(`Exported ${r.records} records and ${r.rows} sets to ${dest}. It isn't encrypted: keep it somewhere safe.`);
      setState("done");
    } catch (e) {
      setText(`The export failed: ${e instanceof Error ? e.message : String(e)}`);
      setState("failed");
    }
  };
  return (
    <Card>
      <span className="label">Export</span>
      <span className="muted" style={{ wordBreak: "break-word" }}>{text}</span>
      <Button disabled={!vault || state === "busy"} onClick={() => void run()}>{state === "busy" ? "Exporting…" : "Export your records"}</Button>
    </Card>
  );
}
