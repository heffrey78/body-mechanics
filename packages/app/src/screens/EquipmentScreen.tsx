import { useState } from "react";
import { EQUIPMENT, newId, type EquipmentItem } from "@bm/engine";
import { Button, Chip } from "../ui/components.tsx";
import { EQUIPMENT_LABEL } from "../ui/labels.ts";

/**
 * More › Equipment (#60): your own equipment, beyond the built-in list. Each can stand in for built-in
 * items (a plyo box for a step, a bench or a chair), so exercises that need those can use it.
 */
export function EquipmentScreen({ items, onSave, onBack }: { items: EquipmentItem[]; onSave: (e: EquipmentItem) => void; onBack: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState("");
  const item = items.find((x) => x.id === open);
  if (item) return <EquipmentEditor key={item.id} item={item} onSave={onSave} onBack={() => setOpen(null)} />;
  const add = () => {
    const n = name.trim();
    if (!n) return;
    const e: EquipmentItem = { type: "equipment", v: 1, id: newId(), name: n, standsIn: [] };
    onSave(e);
    setName("");
    setOpen(e.id);
  };
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onBack}>‹ More</Button></div>
      <h1 className="title">Equipment</h1>
      <span className="muted">Built in: {EQUIPMENT.map((e) => EQUIPMENT_LABEL[e]).join(", ")}. Add your own below, then put it at your locations.</span>
      <div className="pair">
        <input className="field" aria-label="New equipment" placeholder="e.g. TRX, sandbag, plyo box" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <Button variant="primary" disabled={!name.trim()} onClick={add}>Add</Button>
      </div>
      {items.length ? (
        <div className="card" style={{ padding: 0, gap: 0 }}>
          {items.map((x) => (
            <button key={x.id} type="button" className="result" onClick={() => setOpen(x.id)}>
              <span className="strong">{x.name}</span>
              <span className="muted" style={{ fontSize: 13 }}>{x.standsIn.length ? `Does for: ${x.standsIn.map((e) => EQUIPMENT_LABEL[e].toLowerCase()).join(", ")}` : ""}</span>
            </button>
          ))}
        </div>
      ) : <span className="muted">None of your own yet.</span>}
    </div>
  );
}

function EquipmentEditor({ item, onSave, onBack }: { item: EquipmentItem; onSave: (e: EquipmentItem) => void; onBack: () => void }) {
  const [name, setName] = useState(item.name);
  const [confirm, setConfirm] = useState(false);
  const toggle = (e: EquipmentItem["standsIn"][number]) =>
    onSave({ ...item, standsIn: item.standsIn.includes(e) ? item.standsIn.filter((x) => x !== e) : EQUIPMENT.filter((x) => x === e || item.standsIn.includes(x)) });
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onBack}>‹ Equipment</Button></div>
      <input className="field" aria-label="Equipment name" value={name} onChange={(e) => setName(e.target.value)}
        onBlur={() => { const n = name.trim(); if (n && n !== item.name) onSave({ ...item, name: n }); else setName(item.name); }} />
      <span className="label">Can stand in for</span>
      <span className="muted">Exercises that need any of these can use it instead.</span>
      <div className="chips">{EQUIPMENT.map((e) => <Chip key={e} on={item.standsIn.includes(e)} onClick={() => toggle(e)}>{EQUIPMENT_LABEL[e]}</Chip>)}</div>
      {confirm ? (
        <div className="card">
          <span>Delete “{item.name}”? Locations and exercises that list it stop counting it.</span>
          <div className="pair"><Button variant="stop" onClick={() => { onSave({ ...item, deleted: true }); onBack(); }}>Delete</Button><Button onClick={() => setConfirm(false)}>Keep</Button></div>
        </div>
      ) : <Button variant="ghost" onClick={() => setConfirm(true)}>Delete equipment</Button>}
    </div>
  );
}
