import { useState } from "react";
import { REGIONS, SIDED_REGIONS, bodyRules, isActive, newCondition, type Condition, type ConditionRegion, type Region, type Side } from "@bm/engine";
import { Button, Chip, MarkBadge } from "../ui/components.tsx";
import { REGION_LABEL } from "../ui/labels.ts";
import { placeLabel } from "./BodyScreen.tsx";

const sided = (r: Region) => (SIDED_REGIONS as readonly Region[]).includes(r);
/** A year, a month or a day, as the record takes it. */
const ROUGH = /^\d{4}(-\d{2}(-\d{2})?)?$/;

/**
 * More › Conditions (#49): long-lived facts kept on the profile (an old surgery, hypermobility). Each
 * has its regions and sides, or the whole body, a start and an optional end. They show on the body map
 * and shape suggestions by their type's rules (#46, #47).
 */
export function ConditionsScreen({ conditions, onSave, onBack }: { conditions: Condition[]; onSave: (c: Condition) => void; onBack: () => void }) {
  const [open, setOpen] = useState<Condition | "new" | null>(null);
  if (open) {
    return <ConditionEditor initial={open === "new" ? null : open} onSave={(c) => { onSave(c); setOpen(null); }} onBack={() => setOpen(null)} />;
  }
  const now = new Date();
  const current = conditions.filter((c) => isActive(c, now));
  const past = conditions.filter((c) => !isActive(c, now));
  const row = (c: Condition) => (
    <button key={c.id} type="button" className="result" onClick={() => setOpen(c)}>
      <MarkBadge kind="condition" />
      <span style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1 }}>
        <span className="strong">{c.name}</span>
        <span className="muted" style={{ fontSize: 13 }}>{c.regions.length ? c.regions.map((r) => placeLabel(r.region, r.side)).join(", ") : "Whole body"} · since {c.since}{c.until ? ` until ${c.until}` : ""}</span>
      </span>
      <span aria-hidden="true" className="muted">›</span>
    </button>
  );
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onBack}>‹ More</Button></div>
      <div className="hrow"><h1 className="title">Conditions</h1><Button variant="primary" onClick={() => setOpen("new")}>Add</Button></div>
      <span className="muted">Things that are part of your body now, like an old surgery or hypermobility. They show on the body map, and suggestions work around them.</span>
      <div className="card" style={{ padding: 0, gap: 0 }}>
        {current.map(row)}
        {!current.length ? <span className="muted" style={{ padding: 16 }}>None yet.</span> : null}
      </div>
      {past.length ? (
        <>
          <span className="label">Ended</span>
          <div className="card" style={{ padding: 0, gap: 0 }}>{past.map(row)}</div>
        </>
      ) : null}
    </div>
  );
}

export function ConditionEditor({ initial, onSave, onBack }: { initial: Condition | null; onSave: (c: Condition) => void; onBack: () => void }) {
  const types = bodyRules().conditions;
  const [kind, setKind] = useState<string | undefined>(initial?.kind);
  const [name, setName] = useState(initial?.name ?? "");
  const [regions, setRegions] = useState<ConditionRegion[]>(initial?.regions ?? []);
  const [since, setSince] = useState(initial?.since ?? String(new Date().getFullYear()));
  const [until, setUntil] = useState(initial?.until ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const has = (r: Region) => regions.find((x) => x.region === r);
  const pickType = (k: string) => {
    const t = types.find((x) => x.kind === k)!;
    setKind(k);
    setName(t.name);
    // Its regions, with a side to choose where the region has one.
    setRegions(t.regions.map((r) => ({ region: r, side: sided(r) ? (has(r)?.side ?? "left") : "none" })));
  };
  const toggleRegion = (r: Region) => setRegions(has(r) ? regions.filter((x) => x.region !== r) : [...regions, { region: r, side: sided(r) ? "left" : "none" }]);
  const setSide = (r: Region, side: Side) => setRegions(regions.map((x) => (x.region === r ? { ...x, side } : x)));
  const valid = name.trim() && ROUGH.test(since) && (!until || (ROUGH.test(until) && until >= since));
  const save = () => {
    if (!valid) return;
    const fields = { name: name.trim(), regions, since, ...(kind ? { kind } : {}), ...(until ? { until } : {}), ...(note.trim() ? { note: note.trim() } : {}) };
    if (!initial) return onSave(newCondition(fields));
    const { kind: _k, until: _u, note: _n, ...rest } = initial;
    onSave({ ...rest, ...fields });
  };
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onBack}>‹ Conditions</Button></div>
      <h1 className="title">{initial ? initial.name : "Add a condition"}</h1>
      <span className="label">Common ones</span>
      <div className="chips">{types.map((t) => <Chip key={t.kind} on={kind === t.kind} onClick={() => pickType(t.kind)}>{t.name}</Chip>)}</div>
      <label className="label" htmlFor="cond-name">Name</label>
      <input id="cond-name" className="field" value={name} placeholder="e.g. Tennis elbow" onChange={(e) => { setName(e.target.value); if (kind && e.target.value !== types.find((t) => t.kind === kind)?.name) setKind(undefined); }} />
      {kind ? null : <span className="muted">Your own name works too; suggestions then go easy on the regions you pick.</span>}
      <span className="label">Where</span>
      <div className="chips">
        <Chip on={!regions.length} onClick={() => setRegions([])}>Whole body</Chip>
        {REGIONS.map((r) => <Chip key={r} on={!!has(r)} onClick={() => toggleRegion(r)}>{REGION_LABEL[r]}</Chip>)}
      </div>
      {regions.filter((x) => sided(x.region)).map((x) => (
        <div key={x.region} className="hrow" style={{ minHeight: 0 }}>
          <span>{REGION_LABEL[x.region]}</span>
          <div className="chips">{(["left", "right", "both"] as const).map((s) => <Chip key={s} on={x.side === s} onClick={() => setSide(x.region, s)}>{s[0]!.toUpperCase() + s.slice(1)}</Chip>)}</div>
        </div>
      ))}
      <label className="label" htmlFor="cond-since">Since</label>
      <input id="cond-since" className="field" inputMode="numeric" value={since} placeholder="2019, or 2019-06" onChange={(e) => setSince(e.target.value.trim())} />
      <label className="label" htmlFor="cond-until">Until (if it ends)</label>
      <input id="cond-until" className="field" inputMode="numeric" value={until} placeholder="Leave empty if ongoing" onChange={(e) => setUntil(e.target.value.trim())} />
      {!valid && name.trim() ? <span className="warn-text">Dates are a year, a month or a day: 2019, 2019-06 or 2019-06-14; an end comes after the start.</span> : null}
      <label className="label" htmlFor="cond-note">Notes</label>
      <input id="cond-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button variant="primary" xl disabled={!valid} onClick={save}>Save</Button>
      {initial ? (
        <>
          {!initial.until ? <Button onClick={() => onSave({ ...initial, until: new Date().toISOString().slice(0, 10) })}>It has ended</Button> : null}
          {confirmDelete ? (
            <div className="card">
              <span>Delete “{initial.name}”? Its check-ins go with it.</span>
              <div className="pair"><Button variant="stop" onClick={() => onSave({ ...initial, deleted: true })}>Delete</Button><Button onClick={() => setConfirmDelete(false)}>Keep</Button></div>
            </div>
          ) : <Button variant="ghost" onClick={() => setConfirmDelete(true)}>Delete condition</Button>}
        </>
      ) : null}
    </div>
  );
}
