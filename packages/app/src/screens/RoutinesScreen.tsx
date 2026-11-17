import { useEffect, useMemo, useState } from "react";
import { newItem, search, showLoad, toKg, FIELD, type LibraryItem, type RecordIndex, type Routine, type RoutineItem } from "@bm/engine";
import { ModifierPicker, modifierText } from "../ui/ModifierPicker.tsx";
import { Button, Stepper, Tag } from "../ui/components.tsx";

/** Wide enough for the desktop's table (#35). */
function useWide(): boolean {
  const query = "(min-width: 760px)";
  const [wide, setWide] = useState(() => typeof matchMedia !== "undefined" && matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

const amountUnit = (measure: LibraryItem["measure"]) => (measure === "reps" ? "reps" : measure === "time" ? "s" : "m");
const step = (measure: LibraryItem["measure"]) => (measure === "reps" ? 1 : measure === "time" ? 5 : 10);

/** "3 × 10 reps · 16 kg", "2 × 30 s each side". */
export function describeItem(item: RoutineItem, x: LibraryItem | undefined, units: "kg" | "lb"): string {
  const measure = x?.measure ?? "reps";
  const amount = item[FIELD[measure]];
  const parts = [`${item.sets} × ${amount ?? "–"} ${amountUnit(measure)}${x?.sided ? " each side" : ""}`];
  if (item.loadKg) parts.push(showLoad(item.loadKg, units));
  return parts.join(" · ");
}

/**
 * Routines (#35): the list, and the editor: cards that expand on the phone, a table on the desktop.
 * Every change is saved as it's made (`onSave`), stamped for the merge by the caller.
 */
export function RoutinesScreen({ routines, library, index, units, sessionOpen, onSave, onDelete, onNew, onStart }: {
  routines: Routine[];
  library: LibraryItem[];
  index: RecordIndex | null;
  units: "kg" | "lb";
  sessionOpen: boolean;
  onSave: (r: Routine) => void;
  onDelete: (r: Routine) => void;
  onNew: () => Routine;
  onStart: (r: Routine) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const routine = routines.find((r) => r.id === open);
  if (routine) {
    return <RoutineEditor routine={routine} library={library} units={units} sessionOpen={sessionOpen} onSave={onSave} onStart={() => onStart(routine)}
      onDelete={() => { onDelete(routine); setOpen(null); }} onBack={() => setOpen(null)} />;
  }
  const byId = new Map(library.map((x) => [x.id, x]));
  return (
    <div className="pad">
      <div className="hrow">
        <h1 className="title">Routines</h1>
        <Button variant="primary" onClick={() => setOpen(onNew().id)}>New routine</Button>
      </div>
      {routines.length === 0 ? <span className="muted">No routines yet. Make one here, or save a session as one from History.</span> : null}
      {routines.length ? (
        <div className="card" style={{ padding: 0, gap: 0 }}>
          {routines.map((r) => {
            const last = index?.runs(r.id)[0];
            const items = r.items.filter((i) => !i.deleted);
            return (
              <button key={r.id} type="button" className="result" onClick={() => setOpen(r.id)}>
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="strong">{r.name}</span>
                  <span className="muted" style={{ fontSize: 13 }}>{items.map((i) => byId.get(i.exercise)?.name ?? i.exercise).join(", ") || "No exercises yet"}</span>
                </span>
                <span className="muted num" style={{ fontSize: 13, whiteSpace: "nowrap" }}>{last ? new Date(last.startedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "Not run"}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function RoutineEditor({ routine, library, units, sessionOpen, onSave, onStart, onDelete, onBack }: {
  routine: Routine; library: LibraryItem[]; units: "kg" | "lb"; sessionOpen: boolean;
  onSave: (r: Routine) => void; onStart: () => void; onDelete: () => void; onBack: () => void;
}) {
  const wide = useWide();
  const byId = useMemo(() => new Map(library.map((x) => [x.id, x])), [library]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [name, setName] = useState(routine.name);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState(false);
  const hits = useMemo(() => search(q, library, 5), [q, library]);
  const items = routine.items.filter((i) => !i.deleted);

  const setItems = (next: RoutineItem[]) => {
    // Deleted items stay as tombstones, after the live ones.
    onSave({ ...routine, items: [...next, ...routine.items.filter((i) => i.deleted)] });
  };
  const patch = (id: string, p: Partial<RoutineItem>) => setItems(items.map((i) => {
    if (i.id !== id) return i;
    const out = { ...i, ...p } as Record<string, unknown>;
    for (const [k, v] of Object.entries(p)) if (v === undefined) delete out[k];
    return out as RoutineItem;
  }));
  const move = (id: string, d: -1 | 1) => {
    const i = items.findIndex((x) => x.id === id);
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setItems(next);
  };
  const remove = (id: string) => onSave({ ...routine, items: routine.items.map((i) => (i.id === id ? { ...i, deleted: true as const } : i)) });
  const add = (x: LibraryItem) => {
    const item = newItem(x.id, x.measure);
    setItems([...items, item]);
    setExpanded(item.id);
    setQ("");
  };
  const loadStep = units === "kg" ? 1 : toKg(2.5, "lb");
  const shown = (kg: number | undefined) => (kg ? showLoad(kg, units) : "None");
  const stepLoad = (i: RoutineItem, d: number) => {
    const v = Math.max(0, Math.round(((i.loadKg ?? 0) + d * loadStep) * 1000) / 1000);
    patch(i.id, { loadKg: v > 0 ? v : undefined });
  };

  return (
    <div className="pad">
      <div className="hrow">
        <Button variant="ghost" onClick={onBack}>‹ Routines</Button>
        <Button variant="primary" disabled={sessionOpen || items.length === 0} onClick={onStart}>Start</Button>
      </div>
      <input className="field" aria-label="Routine name" value={name} onChange={(e) => setName(e.target.value)}
        onBlur={() => { const n = name.trim(); if (n && n !== routine.name) onSave({ ...routine, name: n }); else setName(routine.name); }} />
      {sessionOpen ? <span className="muted">Finish the open session to start this routine.</span> : null}

      {wide ? (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="rtable">
            <thead><tr><th>Exercise</th><th>Sets</th><th>Target</th><th>Load ({units})</th><th>Rest (s)</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {items.map((i, n) => {
                const x = byId.get(i.exercise);
                const m = x?.measure ?? "reps";
                const f = FIELD[m];
                const shownLoad = i.loadKg ? (units === "kg" ? i.loadKg : Math.round(i.loadKg * 2.2046226218 * 2) / 2) : "";
                return (
                  <tr key={i.id}>
                    <td>
                      <span className="strong">{x?.name ?? i.exercise}</span>{x?.sided ? <> <Tag>each side</Tag></> : null}
                      <details>
                        <summary className="muted" style={{ fontSize: 13 }}>{i.modifiers?.length ? modifierText(i.modifiers) : "How it's done"}</summary>
                        <ModifierPicker value={i.modifiers ?? []} onChange={(mods) => patch(i.id, { modifiers: mods.length ? mods : undefined })} />
                      </details>
                    </td>
                    <td><input type="number" min={1} max={20} aria-label="Sets" value={i.sets} onChange={(e) => patch(i.id, { sets: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} /></td>
                    <td><input type="number" min={0} aria-label="Target" value={i[f] ?? ""} onChange={(e) => patch(i.id, { [f]: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })} /> {amountUnit(m)}</td>
                    <td><input type="number" min={0} step={units === "kg" ? 1 : 2.5} aria-label="Load" value={shownLoad} onChange={(e) => patch(i.id, { loadKg: Number(e.target.value) > 0 ? toKg(Number(e.target.value), units) : undefined })} /></td>
                    <td><input type="number" min={0} max={900} step={15} aria-label="Rest" value={i.restSeconds ?? ""} placeholder="60" onChange={(e) => patch(i.id, { restSeconds: e.target.value === "" ? undefined : Math.max(0, Math.min(900, Number(e.target.value))) })} /></td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button type="button" className="mini" aria-label="Move up" disabled={n === 0} onClick={() => move(i.id, -1)}>↑</button>{" "}
                      <button type="button" className="mini" aria-label="Move down" disabled={n === items.length - 1} onClick={() => move(i.id, 1)}>↓</button>{" "}
                      <button type="button" className="mini" aria-label="Remove" onClick={() => remove(i.id)}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        items.map((i, n) => {
          const x = byId.get(i.exercise);
          const m = x?.measure ?? "reps";
          const f = FIELD[m];
          const open = expanded === i.id;
          return (
            <div key={i.id} className="card" style={{ gap: 8 }}>
              <button type="button" className="result" style={{ padding: 0, minHeight: 40, borderBottom: 0 }} aria-expanded={open} onClick={() => setExpanded(open ? null : i.id)}>
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="strong">{x?.name ?? i.exercise}</span>
                  <span className="muted num" style={{ fontSize: 13 }}>{describeItem(i, x, units)}{i.restSeconds !== undefined ? ` · rest ${i.restSeconds} s` : ""}</span>
                  {i.modifiers?.length ? <span className="muted" style={{ fontSize: 13 }}>{modifierText(i.modifiers)}</span> : null}
                </span>
                <span className="muted">{open ? "▴" : "▾"}</span>
              </button>
              {open ? (
                <>
                  <Stepper label="Sets" value={String(i.sets)} onLess={() => patch(i.id, { sets: Math.max(1, i.sets - 1) })} onMore={() => patch(i.id, { sets: Math.min(20, i.sets + 1) })} />
                  <Stepper label={m === "reps" ? "Reps" : m === "time" ? "Hold" : "Metres"} value={`${i[f] ?? 0}${m === "reps" ? "" : ` ${amountUnit(m)}`}`}
                    onLess={() => patch(i.id, { [f]: Math.max(0, (i[f] ?? 0) - step(m)) })} onMore={() => patch(i.id, { [f]: (i[f] ?? 0) + step(m) })} />
                  <Stepper label="Load" value={shown(i.loadKg)} onLess={() => stepLoad(i, -1)} onMore={() => stepLoad(i, 1)} />
                  <Stepper label="Rest" value={`${i.restSeconds ?? 60} s`} onLess={() => patch(i.id, { restSeconds: Math.max(0, (i.restSeconds ?? 60) - 15) })} onMore={() => patch(i.id, { restSeconds: Math.min(900, (i.restSeconds ?? 60) + 15) })} />
                  <details>
                    <summary className="muted">{i.modifiers?.length ? `How it's done: ${modifierText(i.modifiers)}` : "How it's done"}</summary>
                    <ModifierPicker value={i.modifiers ?? []} onChange={(mods) => patch(i.id, { modifiers: mods.length ? mods : undefined })} />
                  </details>
                  <div className="chips" style={{ justifyContent: "space-between" }}>
                    <span className="chips">
                      <button type="button" className="mini" aria-label="Move up" disabled={n === 0} onClick={() => move(i.id, -1)}>↑</button>
                      <button type="button" className="mini" aria-label="Move down" disabled={n === items.length - 1} onClick={() => move(i.id, 1)}>↓</button>
                    </span>
                    <Button variant="ghost" onClick={() => remove(i.id)}>Remove</Button>
                  </div>
                </>
              ) : null}
            </div>
          );
        })
      )}

      <input className="field" type="search" aria-label="Add an exercise" placeholder="Add an exercise" autoComplete="off" value={q}
        onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && hits[0]?.full) add(hits[0].item); }} />
      {q.trim() ? (
        <div className="card" style={{ padding: 0, gap: 0 }}>
          {hits.map((h) => <button key={h.item.id} type="button" className="result" onClick={() => add(h.item)}>{h.item.name}</button>)}
          {hits.length === 0 ? <span className="muted" style={{ padding: 16 }}>No match. New movements are made from Home.</span> : null}
        </div>
      ) : null}

      {confirm ? (
        <div className="card">
          <span>Delete “{routine.name}”? Sessions you ran from it stay in History.</span>
          <div className="pair"><Button variant="stop" onClick={onDelete}>Delete</Button><Button onClick={() => setConfirm(false)}>Keep</Button></div>
        </div>
      ) : <Button variant="ghost" onClick={() => setConfirm(true)}>Delete routine</Button>}
    </div>
  );
}
