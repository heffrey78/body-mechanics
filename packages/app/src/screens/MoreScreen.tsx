import type { Vault } from "@bm/engine";
import { Button, Chip } from "../ui/components.tsx";
import { ExportCard } from "./ExportCard.tsx";

/** More (#27): units, theme, credits and export. */
export function MoreScreen({ vault, units, onUnits, onOpen }: { vault: Vault | null; units: "kg" | "lb"; onUnits: (u: "kg" | "lb") => void; onOpen: (screen: "theme" | "credits" | "checks") => void }) {
  return (
    <div className="pad">
      <h1 className="title">More</h1>
      <span className="label">Units for loads</span>
      <div className="chips">
        <Chip on={units === "kg"} onClick={() => onUnits("kg")}>Kilograms</Chip>
        <Chip on={units === "lb"} onClick={() => onUnits("lb")}>Pounds</Chip>
      </div>
      <span className="muted">Loads are stored in kilograms and shown in your units.</span>
      <div className="card" style={{ padding: 0, gap: 0 }}>
        <Button variant="ghost" onClick={() => onOpen("theme")}>Theme ›</Button>
        <Button variant="ghost" onClick={() => onOpen("credits")}>Credits ›</Button>
        <Button variant="ghost" onClick={() => onOpen("checks")}>Device checks ›</Button>
      </div>
      <ExportCard vault={vault} units={units} />
    </div>
  );
}
