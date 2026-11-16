import { useState } from "react";
import { EQUIPMENT, KINDS, REGIONS, type Equipment, type Kind, type Measure, type Region } from "@bm/engine";
import { Button, Chip, Segmented } from "../ui/components.tsx";
import { EQUIPMENT_LABEL, KIND_LABEL, MEASURE_LABEL, REGION_LABEL, SWEAT_LABEL } from "../ui/labels.ts";

export interface NewMovementFields {
  name: string;
  measure: Measure;
  sided: boolean;
  works: Region[];
  strains: Region[];
  kinds: Kind[];
  equipment: Equipment[];
  sweat: 0 | 1 | 2;
}

const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

/**
 * A movement the catalogue doesn't have (#2, #15). It can be logged with just a name; it's only
 * suggested once it says which regions it works.
 */
export function NewMovement({ initialName, onSave, onCancel }: { initialName: string; onSave: (f: NewMovementFields) => void; onCancel: () => void }) {
  const [f, setF] = useState<NewMovementFields>({ name: initialName, measure: "reps", sided: false, works: [], strains: [], kinds: [], equipment: [], sweat: 0 });
  const set = <K extends keyof NewMovementFields>(k: K, v: NewMovementFields[K]) => setF((x) => ({ ...x, [k]: v }));
  const name = f.name.trim();
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onCancel}>‹ Back</Button></div>
      <h1 className="title">New movement</h1>
      <input className="field" aria-label="Name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="What is it called?" />

      <span className="label">Logged as</span>
      <Segmented label="Logged as" value={f.measure} onChange={(m) => set("measure", m)} options={(["reps", "time", "distance"] as const).map((id) => ({ id, label: MEASURE_LABEL[id] }))} />
      <div className="chips"><Chip on={f.sided} onClick={() => set("sided", !f.sided)}>Each side separately</Chip></div>

      <span className="label">Works</span>
      <div className="chips">{REGIONS.map((r) => <Chip key={r} on={f.works.includes(r)} onClick={() => set("works", toggle(f.works, r))}>{REGION_LABEL[r]}</Chip>)}</div>
      {f.works.length === 0 ? <span className="muted">Without the regions it works, you can log it but it won't be suggested.</span> : null}

      <span className="label">Puts load on</span>
      <div className="chips">{REGIONS.map((r) => <Chip key={r} on={f.strains.includes(r)} onClick={() => set("strains", toggle(f.strains, r))}>{REGION_LABEL[r]}</Chip>)}</div>

      <span className="label">Kind</span>
      <div className="chips">{KINDS.map((k) => <Chip key={k} on={f.kinds.includes(k)} onClick={() => set("kinds", toggle(f.kinds, k))}>{KIND_LABEL[k]}</Chip>)}</div>

      <span className="label">Needs</span>
      <div className="chips">{EQUIPMENT.map((e) => <Chip key={e} on={f.equipment.includes(e)} onClick={() => set("equipment", toggle(f.equipment, e))}>{EQUIPMENT_LABEL[e]}</Chip>)}</div>

      <span className="label">Sweat</span>
      <Segmented label="Sweat" value={String(f.sweat) as "0" | "1" | "2"} onChange={(v) => set("sweat", Number(v) as 0 | 1 | 2)} options={(["0", "1", "2"] as const).map((id) => ({ id, label: SWEAT_LABEL[Number(id)]! }))} />

      <Button variant="primary" xl disabled={!name} onClick={() => onSave({ ...f, name })}>Save and start</Button>
    </div>
  );
}
