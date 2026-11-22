import { useMemo, useState } from "react";
import {
  EQUIPMENT, EXERCISE_TAGS, KINDS, POSITIONS, REGIONS, catalogue, demoFor, fromCatalogue, newId, search,
  type Demo, type EquipmentItem, type Exercise, type ExerciseOverride, type ExerciseTag, type Kind, type LibraryItem, type Measure, type Position, type Region,
} from "@bm/engine";
import { DemoBuilder } from "../demo/DemoBuilder.tsx";
import { DemoPlayer } from "../demo/DemoPlayer.tsx";
import { propModels } from "../demo/models.ts";
import { Button, Chip, Segmented, Tag } from "../ui/components.tsx";
import { KIND_LABEL, MEASURE_LABEL, POSITION_LABEL, TAG_LABEL, REGION_LABEL, SWEAT_LABEL, equipmentLabel } from "../ui/labels.ts";

const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

/** "Chair, bench or step + Dumbbells · optional: mat". */
export function describeNeeds(item: Pick<LibraryItem, "needs" | "optional">, names: ReadonlyMap<string, { name: string }>): string {
  const label = (e: string) => equipmentLabel(e, names);
  const or = (alts: string[]) => {
    const words = alts.map((e, i) => (i === 0 ? label(e) : label(e).toLowerCase()));
    return words.length === 1 ? words[0]! : `${words.slice(0, -1).join(", ")} or ${words.at(-1)}`;
  };
  const needs = item.needs.map(or).join(" + ");
  const opt = item.optional.length ? `optional: ${item.optional.map(label).join(", ").toLowerCase()}` : "";
  return [needs || "Nothing needed", opt].filter(Boolean).join(" · ");
}

type View = { v: "list" } | { v: "detail"; id: string } | { v: "edit"; id: string | null } | { v: "demo"; id: string };

/**
 * More › Exercises (#61): the catalogue and your own, searchable and filterable. Your own can be added,
 * edited and deleted; a catalogue exercise can be adjusted for you (an override, D4) and reset.
 */
export function ExercisesScreen({ library, custom, own, overrides, demos, onSaveOwn, onSaveOverride, onSaveDemo, onBack }: {
  library: LibraryItem[];
  custom: EquipmentItem[];
  own: Exercise[];
  overrides: ExerciseOverride[];
  onSaveOwn: (e: Exercise) => void;
  /** The demonstrations you built (#77). */
  demos: Demo[];
  onSaveOverride: (o: ExerciseOverride) => void;
  onSaveDemo: (d: Demo) => void;
  onBack: () => void;
}) {
  const [view, setView] = useState<View>({ v: "list" });
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind | null>(null);
  const [mine, setMine] = useState(false);
  const names = useMemo(() => new Map(custom.map((c) => [c.id, c])), [custom]);
  const live = library.filter((x) => !x.deleted);
  const modelOf = useMemo(() => propModels(custom), [custom]);

  if (view.v === "demo") {
    const item = library.find((x) => x.id === view.id);
    if (item) {
      const back = () => setView({ v: "detail", id: item.id });
      return <DemoBuilder name={item.name} exercise={item.id} current={demoFor(item.id, demos)} custom={custom} needs={[...item.needs.flat(), ...item.optional]}
        library={live} demos={demos} onCancel={back} onSave={(d) => { onSaveDemo(d); back(); }} />;
    }
  }

  if (view.v === "edit") {
    const item = view.id ? library.find((x) => x.id === view.id) : undefined;
    return <ExerciseEditor item={item} record={item?.own ? own.find((r) => r.id === item.id) : undefined}
      override={item && !item.own ? overrides.find((o) => o.of === item.id) : undefined} custom={custom}
      onCancel={() => setView(item ? { v: "detail", id: item.id } : { v: "list" })}
      onSaveOwn={(e) => { onSaveOwn(e); setView({ v: "detail", id: e.id }); }}
      onSaveOverride={(o) => { onSaveOverride(o); setView({ v: "detail", id: o.of }); }} />;
  }
  if (view.v === "detail") {
    const item = library.find((x) => x.id === view.id);
    if (item) {
      return <ExerciseDetail item={item} names={names} demo={demoFor(item.id, demos)} modelOf={modelOf} onDemo={() => setView({ v: "demo", id: item.id })} onBack={() => setView({ v: "list" })} onEdit={() => setView({ v: "edit", id: item.id })}
        onDelete={() => { const r = own.find((x) => x.id === item.id); if (r) onSaveOwn({ ...r, deleted: true }); setView({ v: "list" }); }}
        onReset={() => { const o = overrides.find((x) => x.of === item.id); if (o) onSaveOverride({ ...o, deleted: true }); }} />;
    }
  }

  const filtered = (q.trim() ? search(q, live, 40).map((h) => h.item) : [...live].sort((a, b) => a.name.localeCompare(b.name)))
    .filter((x) => (!kind || x.kinds.includes(kind)) && (!mine || x.own || x.overridden));
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onBack}>‹ More</Button></div>
      <div className="hrow"><h1 className="title">Exercises</h1><Button variant="primary" onClick={() => setView({ v: "edit", id: null })}>Add</Button></div>
      <input className="field" type="search" aria-label="Search exercises" placeholder="Search by name or body part" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        {KINDS.map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(kind === k ? null : k)}>{KIND_LABEL[k]}</Chip>)}
        <Chip on={mine} onClick={() => setMine(!mine)}>Yours</Chip>
      </div>
      <span className="muted" style={{ fontSize: 13 }}>{filtered.length} of {live.length}</span>
      <div className="card" style={{ padding: 0, gap: 0 }}>
        {filtered.map((x) => (
          <button key={x.id} type="button" className="result" onClick={() => setView({ v: "detail", id: x.id })}>
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="strong">{x.name}</span>
              <span className="muted" style={{ fontSize: 13 }}>{x.kinds.map((k) => KIND_LABEL[k]).join(", ")}{x.works.length ? ` · ${x.works.slice(0, 3).map((r) => REGION_LABEL[r].toLowerCase()).join(", ")}` : ""}</span>
            </span>
            {x.own ? <Tag>Yours</Tag> : x.overridden ? <Tag>Adjusted</Tag> : null}
          </button>
        ))}
        {!filtered.length ? <span className="muted" style={{ padding: 16 }}>Nothing matches.</span> : null}
      </div>
    </div>
  );
}

function ExerciseDetail({ item, names, demo, modelOf, onDemo, onBack, onEdit, onDelete, onReset }: {
  item: LibraryItem; names: ReadonlyMap<string, { name: string }>;
  demo: ReturnType<typeof demoFor>; modelOf: ReturnType<typeof propModels>; onDemo: () => void; onBack: () => void; onEdit: () => void; onDelete: () => void; onReset: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  /** The demonstration starts closed (the owner's preference): Show me how opens it. */
  const [showing, setShowing] = useState(false);
  const entry = item.own ? undefined : catalogue().entries.find((e) => e.id === item.id);
  const regions = (rs: Region[]) => rs.map((r) => REGION_LABEL[r]).join(", ") || "None";
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onBack}>‹ Exercises</Button>{item.deleted ? null : <Button variant="ghost" onClick={onEdit}>{item.own ? "Edit" : "Adjust for you"}</Button>}</div>
      <h1 className="title">{item.name}</h1>
      <div className="chips">{item.own ? <Tag>Yours</Tag> : null}{item.overridden ? <Tag>Adjusted for you</Tag> : null}{item.sided ? <Tag>Each side</Tag> : null}</div>
      {demo && showing ? <DemoPlayer clip={demo.clip} modelOf={modelOf} /> : null}
      {demo ? <Button variant="ghost" onClick={() => setShowing(!showing)}>{showing ? "Hide the demonstration" : "Show me how"}</Button> : null}
      {item.deleted ? null : <Button variant="ghost" onClick={onDemo}>{demo?.own ? "Edit your demonstration" : demo ? "Make your own demonstration" : "Build a demonstration"}</Button>}
      <div className="card">
        <span><span className="label">Works</span><br />{regions(item.works)}</span>
        <span><span className="label">Puts load on</span><br />{regions(item.strains)}</span>
        <span><span className="label">Kind</span><br />{item.kinds.map((k) => KIND_LABEL[k]).join(", ") || "None"} · {MEASURE_LABEL[item.measure].toLowerCase()} · {SWEAT_LABEL[item.sweat].toLowerCase()}{item.tags.length ? ` · ${item.tags.map((t) => TAG_LABEL[t].toLowerCase()).join(", ")}` : ""}{item.position ? ` · ${POSITION_LABEL[item.position].toLowerCase()}` : ""}</span>
        <span><span className="label">Equipment</span><br />{describeNeeds(item, names)}</span>
      </div>
      {item.instructions ? <p style={{ whiteSpace: "pre-line", margin: 0, lineHeight: 1.5 }}>{item.instructions}</p> : null}
      {entry ? <span className="muted" style={{ fontSize: 13 }}>{entry.source.kind === "wger" ? `From wger, ${entry.licence.name}, by ${entry.authors.join(", ")}.` : `Body Mechanics' own, ${entry.licence.name}.`}</span> : null}
      {item.overridden ? <Button variant="ghost" onClick={onReset}>Reset to the catalogue's</Button> : null}
      {item.own && !item.deleted ? (confirm ? (
        <div className="card">
          <span>Delete “{item.name}”? Sessions that used it keep its name; it leaves search and suggestions.</span>
          <div className="pair"><Button variant="stop" onClick={onDelete}>Delete</Button><Button onClick={() => setConfirm(false)}>Keep</Button></div>
        </div>
      ) : <Button variant="ghost" onClick={() => setConfirm(true)}>Delete exercise</Button>) : null}
    </div>
  );
}

interface Fields {
  name: string; measure: Measure; sided: boolean; works: Region[]; strains: Region[]; kinds: Kind[]; tags: ExerciseTag[]; position: Position | undefined;
  needs: string[][]; optional: string[]; sweat: 0 | 1 | 2; instructions: string;
}

/** Add or edit your own exercise, or adjust a catalogue one (only what changed is kept, as an override). */
function ExerciseEditor({ item, record, override, custom, onSaveOwn, onSaveOverride, onCancel }: {
  item: LibraryItem | undefined; record: Exercise | undefined; override: ExerciseOverride | undefined; custom: EquipmentItem[];
  onSaveOwn: (e: Exercise) => void; onSaveOverride: (o: ExerciseOverride) => void; onCancel: () => void;
}) {
  const catalogueOne = !!item && !item.own;
  const [f, setF] = useState<Fields>(() => ({
    name: item?.name ?? "", measure: item?.measure ?? "reps", sided: item?.sided ?? false, works: item?.works ?? [], strains: item?.strains ?? [],
    kinds: item?.kinds ?? [], tags: item?.tags ?? [], position: item?.position, needs: item?.needs.map((g) => [...g]) ?? [], optional: item?.optional ?? [], sweat: item?.sweat ?? 0, instructions: item?.instructions ?? "",
  }));
  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF((x) => ({ ...x, [k]: v }));
  const all: { id: string; label: string }[] = [...EQUIPMENT.map((e) => ({ id: e as string, label: equipmentLabel(e, new Map()) })), ...custom.map((c) => ({ id: c.id, label: c.name }))];
  const needs = f.needs.filter((g) => g.length);
  const save = () => {
    if (catalogueOne) {
      // Only the fields that differ from the catalogue's are kept, so its later fixes still come through.
      const base = fromCatalogue(catalogue().entries.find((e) => e.id === item!.id)!);
      const o: ExerciseOverride = { type: "override", v: 1, id: override?.id ?? newId(), of: item!.id, ...(override?.edits ? { edits: override.edits } : {}) };
      const mine = { ...f, needs };
      for (const k of ["measure", "sided", "works", "strains", "kinds", "tags", "position", "sweat", "needs", "optional"] as const) {
        if (JSON.stringify(mine[k]) !== JSON.stringify(base[k])) (o as unknown as Record<string, unknown>)[k] = mine[k];
      }
      return onSaveOverride(o);
    }
    const name = f.name.trim();
    if (!name) return;
    const { needs: _n, optional: _o, instructions: _i, tags: _t, position: _p, ...rest } = record ?? ({} as Partial<Exercise>);
    onSaveOwn({
      ...rest, type: "exercise", v: 1, id: record?.id ?? item?.id ?? newId(), name, aliases: record?.aliases ?? [], measure: f.measure, sided: f.sided,
      works: f.works, strains: f.strains, kinds: f.kinds, ...(f.tags.length ? { tags: f.tags } : {}), ...(f.position ? { position: f.position } : {}), equipment: [], needs, ...(f.optional.length ? { optional: f.optional } : {}), sweat: f.sweat,
      ...(f.instructions.trim() ? { instructions: f.instructions.trim() } : {}),
    } as Exercise);
  };
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onCancel}>‹ Cancel</Button><span className="muted">{catalogueOne ? "Adjust for you" : item ? "Edit" : "New exercise"}</span></div>
      {catalogueOne ? <h1 className="title">{item!.name}</h1> : <input className="field" aria-label="Name" value={f.name} placeholder="What is it called?" onChange={(e) => set("name", e.target.value)} />}
      {catalogueOne ? <span className="muted">Your changes apply on your devices; Reset brings back the catalogue's.</span> : null}

      <span className="label">Logged as</span>
      <Segmented label="Logged as" value={f.measure} onChange={(m) => set("measure", m)} options={(["reps", "time", "distance"] as const).map((id) => ({ id, label: MEASURE_LABEL[id] }))} />
      <div className="chips"><Chip on={f.sided} onClick={() => set("sided", !f.sided)}>Each side separately</Chip></div>

      <span className="label">Works</span>
      <div className="chips">{REGIONS.map((r) => <Chip key={r} on={f.works.includes(r)} onClick={() => set("works", toggle(f.works, r))}>{REGION_LABEL[r]}</Chip>)}</div>
      <span className="label">Puts load on</span>
      <div className="chips">{REGIONS.map((r) => <Chip key={r} on={f.strains.includes(r)} onClick={() => set("strains", toggle(f.strains, r))}>{REGION_LABEL[r]}</Chip>)}</div>
      <span className="label">Kind</span>
      <div className="chips">{KINDS.map((k) => <Chip key={k} on={f.kinds.includes(k)} onClick={() => set("kinds", toggle(f.kinds, k))}>{KIND_LABEL[k]}</Chip>)}</div>
      <span className="label">Good for</span>
      <div className="chips">{EXERCISE_TAGS.map((t) => <Chip key={t} on={f.tags.includes(t)} onClick={() => set("tags", toggle(f.tags, t))}>{TAG_LABEL[t]}</Chip>)}</div>
      <span className="label">Position</span>
      <div className="chips">{POSITIONS.map((p) => <Chip key={p} on={f.position === p} onClick={() => set("position", f.position === p ? undefined : p)}>{POSITION_LABEL[p]}</Chip>)}</div>

      <span className="label">Needs</span>
      <span className="muted" style={{ fontSize: 13 }}>Each line is one thing it needs; pick everything that will do for it.</span>
      {f.needs.map((g, i) => (
        <div key={i} className="card" style={{ gap: 6 }} aria-label={`Needs ${i + 1}`}>
          <div className="hrow" style={{ minHeight: 0 }}>
            <span className="muted" style={{ fontSize: 13 }}>One of</span>
            <button type="button" className="btn ghost" style={{ minHeight: 36 }} onClick={() => set("needs", f.needs.filter((_, j) => j !== i))}>Remove</button>
          </div>
          <div className="chips">{all.map((e) => <Chip key={e.id} on={g.includes(e.id)} onClick={() => set("needs", f.needs.map((x, j) => (j === i ? toggle(x, e.id) : x)))}>{e.label}</Chip>)}</div>
        </div>
      ))}
      <Button variant="ghost" onClick={() => set("needs", [...f.needs, []])}>+ It needs something</Button>
      <span className="label">Optional</span>
      <div className="chips">{all.map((e) => <Chip key={e.id} on={f.optional.includes(e.id)} onClick={() => set("optional", toggle(f.optional, e.id))}>{e.label}</Chip>)}</div>

      <span className="label">Sweat</span>
      <Segmented label="Sweat" value={String(f.sweat) as "0" | "1" | "2"} onChange={(v) => set("sweat", Number(v) as 0 | 1 | 2)} options={(["0", "1", "2"] as const).map((id) => ({ id, label: SWEAT_LABEL[Number(id)]! }))} />
      {catalogueOne ? null : (
        <>
          <label className="label" htmlFor="ex-instructions">How to do it</label>
          <textarea id="ex-instructions" className="field" style={{ minHeight: 96, padding: 12 }} value={f.instructions} onChange={(e) => set("instructions", e.target.value)} />
        </>
      )}
      <Button variant="primary" xl disabled={!catalogueOne && !f.name.trim()} onClick={save}>Save</Button>
    </div>
  );
}
