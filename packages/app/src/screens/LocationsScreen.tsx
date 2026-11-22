import { useState } from "react";
import { EQUIPMENT, MODES, MODE_SPECS, newId, type EquipmentItem, type Location, type Mode } from "@bm/engine";
import { Button, Chip, Segmented } from "../ui/components.tsx";
import { EQUIPMENT_LABEL, equipmentLabel } from "../ui/labels.ts";

export const SWEAT_WORDS = ["No", "A little", "Bring it"] as const;

/**
 * More › Locations (#41): where you exercise, what's there, and how much sweat is fine by default.
 * Every change is saved as it's made.
 */
export function LocationsScreen({ locations, custom, onSave, onAddStarters, onBack }: {
  locations: Location[];
  /** Your own equipment (#60), offered alongside the built-in. */
  custom: EquipmentItem[];
  onSave: (l: Location) => void;
  onAddStarters: () => void;
  onBack: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const loc = locations.find((l) => l.id === open);
  const names = new Map(custom.map((c) => [c.id, c]));
  if (loc) return <LocationEditor key={loc.id} location={loc} custom={custom} onSave={onSave} onBack={() => setOpen(null)} />;
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onBack}>‹ More</Button></div>
      <div className="hrow">
        <h1 className="title">Locations</h1>
        <Button variant="primary" onClick={() => {
          const l: Location = { type: "location", v: 1, id: newId(), name: "New location", equipment: ["floor"], sweat: 1 };
          onSave(l);
          setOpen(l.id);
        }}>New location</Button>
      </div>
      <span className="muted">Suggestions only use what's at the location, and start from its sweat level.</span>
      {locations.length === 0 ? <Button onClick={onAddStarters}>Add Home, Office, Gym and Hotel</Button> : null}
      {locations.length ? (
        <div className="card" style={{ padding: 0, gap: 0 }}>
          {locations.map((l) => (
            <button key={l.id} type="button" className="result" onClick={() => setOpen(l.id)}>
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span className="strong">{l.name}</span>
                <span className="muted" style={{ fontSize: 13 }}>{l.equipment.filter((e) => (EQUIPMENT as readonly string[]).includes(e) || names.has(e)).map((e) => equipmentLabel(e, names)).join(", ") || "Nothing"}</span>
              </span>
              <span className="muted" style={{ whiteSpace: "nowrap" }}>{l.mode ? MODE_SPECS[l.mode].label : `Sweat: ${SWEAT_WORDS[l.sweat]}`}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A location's usual mode; Workout is the default, so it isn't stored (older builds read it as before). */
const withMode = (l: Location, m: Mode): Location => {
  const { mode: _, ...rest } = l;
  return m === "workout" ? rest : { ...rest, mode: m };
};

function LocationEditor({ location, custom, onSave, onBack }: { location: Location; custom: EquipmentItem[]; onSave: (l: Location) => void; onBack: () => void }) {
  const [name, setName] = useState(location.name);
  const [confirm, setConfirm] = useState(false);
  // Built-in items in their usual order, then your own in theirs.
  const order: string[] = [...EQUIPMENT, ...custom.map((c) => c.id)];
  const toggle = (e: string) =>
    onSave({ ...location, equipment: location.equipment.includes(e) ? location.equipment.filter((x) => x !== e) : order.filter((x) => x === e || location.equipment.includes(x)) });
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onBack}>‹ Locations</Button></div>
      <input className="field" aria-label="Location name" value={name} onChange={(e) => setName(e.target.value)}
        onBlur={() => { const n = name.trim(); if (n && n !== location.name) onSave({ ...location, name: n }); else setName(location.name); }} />
      <span className="label">Sweat, by default</span>
      <Segmented label="Sweat" value={String(location.sweat) as "0" | "1" | "2"} onChange={(v) => onSave({ ...location, sweat: Number(v) as 0 | 1 | 2 })}
        options={(["0", "1", "2"] as const).map((id) => ({ id, label: SWEAT_WORDS[Number(id)]! }))} />
      <span className="muted">You can change it for a session without changing the location.</span>
      <span className="label">Usually for</span>
      <div className="chips" role="group" aria-label="Usually for">
        {MODES.map((m) => <Chip key={m} on={(location.mode ?? "workout") === m} onClick={() => onSave(withMode(location, m))}>{MODE_SPECS[m].label}</Chip>)}
      </div>
      <span className="muted">Start a session and Suggest next begin with it here. A session can still pick another.</span>
      <span className="label">What's here</span>
      <div className="chips">
        {EQUIPMENT.map((e) => <Chip key={e} on={location.equipment.includes(e)} onClick={() => toggle(e)}>{EQUIPMENT_LABEL[e]}</Chip>)}
        {custom.map((c) => <Chip key={c.id} on={location.equipment.includes(c.id)} onClick={() => toggle(c.id)}>{c.name}</Chip>)}
      </div>
      {custom.length ? null : <span className="muted">Something else here? Add it in More › Equipment.</span>}
      {confirm ? (
        <div className="card">
          <span>Delete “{location.name}”? Sessions logged there keep their history.</span>
          <div className="pair"><Button variant="stop" onClick={() => { onSave({ ...location, deleted: true }); onBack(); }}>Delete</Button><Button onClick={() => setConfirm(false)}>Keep</Button></div>
        </div>
      ) : <Button variant="ghost" onClick={() => setConfirm(true)}>Delete location</Button>}
    </div>
  );
}
