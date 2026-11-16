import { useState } from "react";
import { EQUIPMENT, newId, type Location } from "@bm/engine";
import { Button, Chip, Segmented } from "../ui/components.tsx";
import { EQUIPMENT_LABEL } from "../ui/labels.ts";

export const SWEAT_WORDS = ["No", "A little", "Bring it"] as const;

/**
 * More › Locations (#41): where you exercise, what's there, and how much sweat is fine by default.
 * Every change is saved as it's made.
 */
export function LocationsScreen({ locations, onSave, onAddStarters, onBack }: {
  locations: Location[];
  onSave: (l: Location) => void;
  onAddStarters: () => void;
  onBack: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const loc = locations.find((l) => l.id === open);
  if (loc) return <LocationEditor key={loc.id} location={loc} onSave={onSave} onBack={() => setOpen(null)} />;
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
                <span className="muted" style={{ fontSize: 13 }}>{l.equipment.map((e) => EQUIPMENT_LABEL[e]).join(", ") || "Nothing"}</span>
              </span>
              <span className="muted" style={{ whiteSpace: "nowrap" }}>Sweat: {SWEAT_WORDS[l.sweat]}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LocationEditor({ location, onSave, onBack }: { location: Location; onSave: (l: Location) => void; onBack: () => void }) {
  const [name, setName] = useState(location.name);
  const [confirm, setConfirm] = useState(false);
  const toggle = (e: Location["equipment"][number]) =>
    onSave({ ...location, equipment: location.equipment.includes(e) ? location.equipment.filter((x) => x !== e) : EQUIPMENT.filter((x) => x === e || location.equipment.includes(x)) });
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onBack}>‹ Locations</Button></div>
      <input className="field" aria-label="Location name" value={name} onChange={(e) => setName(e.target.value)}
        onBlur={() => { const n = name.trim(); if (n && n !== location.name) onSave({ ...location, name: n }); else setName(location.name); }} />
      <span className="label">Sweat, by default</span>
      <Segmented label="Sweat" value={String(location.sweat) as "0" | "1" | "2"} onChange={(v) => onSave({ ...location, sweat: Number(v) as 0 | 1 | 2 })}
        options={(["0", "1", "2"] as const).map((id) => ({ id, label: SWEAT_WORDS[Number(id)]! }))} />
      <span className="muted">You can change it for a session without changing the location.</span>
      <span className="label">What's here</span>
      <div className="chips">{EQUIPMENT.map((e) => <Chip key={e} on={location.equipment.includes(e)} onClick={() => toggle(e)}>{EQUIPMENT_LABEL[e]}</Chip>)}</div>
      {confirm ? (
        <div className="card">
          <span>Delete “{location.name}”? Sessions logged there keep their history.</span>
          <div className="pair"><Button variant="stop" onClick={() => { onSave({ ...location, deleted: true }); onBack(); }}>Delete</Button><Button onClick={() => setConfirm(false)}>Keep</Button></div>
        </div>
      ) : <Button variant="ghost" onClick={() => setConfirm(true)}>Delete location</Button>}
    </div>
  );
}
