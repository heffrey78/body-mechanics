import { useMemo, useState, type ReactNode } from "react";
import {
  BOTHERS, MARK_KINDS, RED_FLAGS, SIDED_REGIONS, alreadyModified, assess, concerns, currentState, helpersFor, history, isActive, isDue, offersCondition, redFlags, reviewRoutine,
  type LibraryItem, type Routine, type RoutineFlag,
  type Body, type Bother, type CheckIn, type CheckInFields, type Condition, type Mark, type MarkKind, type RedFlag, type Region, type Severity, type Side,
} from "@bm/engine";
import { Button, Chip, MarkBadge } from "../ui/components.tsx";
import { REGION_LABEL } from "../ui/labels.ts";
import { REGIONS } from "@bm/engine";
import { ConditionEditor } from "./ConditionsScreen.tsx";
import { BodyFigure, type AreaState } from "../body/BodyFigure.tsx";

export const KIND_WORD: Record<MarkKind, string> = { pain: "Pain", stiffness: "Stiffness", weakness: "Weakness", injury: "Injury" };
const SEVERITY_WORD: Record<Severity, string> = { 1: "Mild", 2: "Moderate", 3: "Severe" };
export const BOTHER_LABEL: Record<Bother, string> = {
  mornings: "Mornings", sitting: "After sitting", standing: "Standing", walking: "Walking", bending: "Bending",
  overhead: "Overhead", "under-load": "Under load", "after-exercise": "After exercise", "at-night": "At night", "all-the-time": "All the time",
};
export const RED_FLAG_LABEL: Record<RedFlag, string> = {
  numbness: "Numbness or tingling", swelling: "Swelling or heat", "after-fall": "After a fall or impact", "night-pain": "Wakes me at night", "getting-weaker": "Getting weaker",
};
export const RED_FLAG_ADVICE = "Get this checked by a physio or doctor. Until you do, suggestions for this area stay gentle.";
const ONSETS = [["Today", 0], ["This week", 4], ["This month", 15], ["Longer", 60]] as const;

/** "Right shoulder", "Lower back", "Knees, both sides". */
export function placeLabel(region: Region, side: Side): string {
  const name = REGION_LABEL[region];
  if (side === "left" || side === "right") return `${side === "left" ? "Left" : "Right"} ${name.toLowerCase()}`;
  if (side === "both") return `${name}, both sides`;
  return name;
}
export const markTitle = (m: Mark) => `${placeLabel(m.region, m.side)} · ${KIND_WORD[m.kind].toLowerCase()}`;

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/** Whether a region has a left and a right. */
const sidedHere = (r: Region) => (SIDED_REGIONS as readonly Region[]).includes(r);
const covers = (side: Side, slotSide: Side) => side === slotSide || side === "both" || slotSide === "none";

type View =
  | { v: "map" }
  | { v: "new"; region: Region; side: Side }
  | { v: "mark"; id: string }
  | { v: "checkin"; id: string }
  | { v: "condition"; id: string }
  | { v: "editmark"; id: string }
  | { v: "editcondition"; id: string };

/**
 * The Body tab (#48): a front and back figure to mark how a region feels, a list of what's marked with
 * check-ins due, each mark's history, check-ins and resolving. Conditions show here too (#49).
 */
export function BodyScreen({ body, library, routines, open, onNewMark, onCheckIn, onResolve, onReopen, onBecomeCondition, onUseModified, onSaveMark, onSaveCondition }: {
  body: Body;
  library: LibraryItem[];
  routines: Routine[];
  /** Save an edited or deleted mark or condition (#54). */
  onSaveMark: (m: Mark) => void;
  onSaveCondition: (c: Condition) => void;
  /** Change a routine item as a flag says (#50). */
  onUseModified: (r: Routine, f: RoutineFlag) => void;
  /** Open this mark or condition straight away (from Home's check-in card). */
  open?: string | null;
  /** Make and save a mark; returns its id. */
  onNewMark: (f: NewMarkFields) => string;
  onCheckIn: (s: Mark | Condition, f: CheckInFields) => void;
  onResolve: (m: Mark) => void;
  onReopen: (m: Mark) => void;
  /** Turn a long-lasting mark into a condition (#49); returns the condition's id. */
  onBecomeCondition: (m: Mark) => string;
}) {
  const [view, setView] = useState<View>(() =>
    !open ? { v: "map" } : body.conditions.some((c) => c.id === open) ? { v: "condition", id: open } : { v: "mark", id: open });
  const now = new Date();
  const active = body.marks.filter((m) => isActive(m, now));
  const resolved = body.marks.filter((m) => !isActive(m, now)).reverse();
  const conditions = body.conditions.filter((c) => isActive(c, now));

  if (view.v === "new") {
    return <MarkSheet title={placeLabel(view.region, view.side)} isNew onCancel={() => setView({ v: "map" })}
      onSave={(f) => setView({ v: "mark", id: onNewMark({ ...f, kind: f.kind!, onset: f.onset!, region: view.region, side: view.side }) })} />;
  }
  if (view.v === "editmark") {
    const m = body.marks.find((x) => x.id === view.id);
    if (m) {
      return <MarkEditor mark={m} onCancel={() => setView({ v: "mark", id: m.id })}
        onSave={(next) => { onSaveMark(next); setView(next.deleted ? { v: "map" } : { v: "mark", id: m.id }); }} />;
    }
  }
  if (view.v === "editcondition") {
    const c = body.conditions.find((x) => x.id === view.id);
    if (c) {
      return <ConditionEditor initial={c} onBack={() => setView({ v: "condition", id: c.id })}
        onSave={(next) => { onSaveCondition(next); setView(next.deleted ? { v: "map" } : { v: "condition", id: c.id }); }} />;
    }
  }
  const mark = view.v === "mark" || view.v === "checkin" ? body.marks.find((m) => m.id === view.id) : undefined;
  if (view.v === "checkin" && mark) {
    return <MarkSheet title={markTitle(mark)} last={currentState(mark)} onCancel={() => setView({ v: "mark", id: mark.id })}
      onSave={(f) => { onCheckIn(mark, f); setView({ v: "mark", id: mark.id }); }} />;
  }
  if (view.v === "mark" && mark) {
    return <MarkDetail mark={mark} onBack={() => setView({ v: "map" })} onCheckIn={() => setView({ v: "checkin", id: mark.id })}
      onResolve={() => onResolve(mark)} onReopen={() => onReopen(mark)}
      onBecomeCondition={() => setView({ v: "condition", id: onBecomeCondition(mark) })} onEdit={() => setView({ v: "editmark", id: mark.id })}>
      <Advice subject={mark} body={body} library={library} routines={routines} onUseModified={onUseModified} />
    </MarkDetail>;
  }
  const condition = view.v === "condition" ? body.conditions.find((c) => c.id === view.id) : undefined;
  if (condition) {
    return <ConditionDetail condition={condition} onBack={() => setView({ v: "map" })} onCheckIn={(f) => onCheckIn(condition, f)} onEdit={() => setView({ v: "editcondition", id: condition.id })}>
      <Advice subject={condition} body={body} library={library} routines={routines} onUseModified={onUseModified} />
    </ConditionDetail>;
  }

  const marksAt = (region: Region, side: Side) => active.filter((m) => m.region === region && covers(m.side, side))
    .sort((a, b) => (currentState(b)?.severity ?? 0) - (currentState(a)?.severity ?? 0));
  const conditionAt = (region: Region, side: Side) => conditions.find((c) => c.regions.some((r) => r.region === region && covers(r.side, side)));
  const due = [...active, ...conditions].filter((x) => isDue(x, now));
  const stateAt = (region: Region, side: Side): AreaState => {
    const top = marksAt(region, side)[0];
    const cond = top ? undefined : conditionAt(region, side);
    const what = top ? `${KIND_WORD[top.kind].toLowerCase()}, ${SEVERITY_WORD[currentState(top)?.severity ?? 1].toLowerCase()}` : cond ? cond.name : "nothing marked";
    return { kind: top ? `k-${top.kind}` : cond ? "k-condition" : "", letter: top ? top.kind[0]!.toUpperCase() : cond ? "C" : "", label: `${placeLabel(region, side)}: ${what}` };
  };
  const pick = (region: Region, side: Side) => {
    const top = marksAt(region, side)[0];
    const cond = conditionAt(region, side);
    if (top) setView({ v: "mark", id: top.id });
    else if (cond) setView({ v: "condition", id: cond.id });
    else setView({ v: "new", region, side });
  };

  return (
    <div className="pad">
      <h1 className="title">Body</h1>
      <span className="muted">Tap where it hurts, feels stiff or weak. Suggestions work around what you mark.</span>
      <div className="figures">
        <figure>
          <BodyFigure face="front" stateAt={stateAt} onPick={pick} />
          <figcaption><span>Right</span><span className="strong">Front</span><span>Left</span></figcaption>
        </figure>
        <figure>
          <BodyFigure face="back" stateAt={stateAt} onPick={pick} />
          <figcaption><span>Left</span><span className="strong">Back</span><span>Right</span></figcaption>
        </figure>
      </div>
      <div className="chips" aria-label="Key" style={{ fontSize: 13 }}>
        {[...MARK_KINDS, "condition" as const].map((k) => (
          <span key={k} className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><MarkBadge kind={k} />{k === "condition" ? "Condition" : KIND_WORD[k]}</span>
        ))}
      </div>

      {due.length ? <span className="due-note">{due.length === 1 ? "A check-in is due." : `${due.length} check-ins are due.`}</span> : null}
      <div className="card" style={{ padding: 0, gap: 0 }}>
        {active.map((m) => {
          const s = currentState(m);
          return (
            <button key={m.id} type="button" className="result" onClick={() => setView({ v: "mark", id: m.id })}>
              <MarkBadge kind={m.kind} />
              <span style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1 }}>
                <span className="strong">{markTitle(m)}</span>
                <span className="muted" style={{ fontSize: 13 }}>{SEVERITY_WORD[s?.severity ?? 1]} · since {day(`${m.onset}T12:00:00Z`)}{redFlags(m).length ? " · see a professional" : ""}</span>
              </span>
              {isDue(m, now) ? <span className="due-note">Check in</span> : <span aria-hidden="true" className="muted">›</span>}
            </button>
          );
        })}
        {conditions.map((c) => (
          <button key={c.id} type="button" className="result" onClick={() => setView({ v: "condition", id: c.id })}>
            <MarkBadge kind="condition" />
            <span style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1 }}>
              <span className="strong">{c.name}</span>
              <span className="muted" style={{ fontSize: 13 }}>{c.regions.length ? c.regions.map((r) => placeLabel(r.region, r.side)).join(", ") : "Whole body"} · since {c.since}</span>
            </span>
            {isDue(c, now) ? <span className="due-note">Check in</span> : <span aria-hidden="true" className="muted">›</span>}
          </button>
        ))}
        {!active.length && !conditions.length ? <span className="muted" style={{ padding: 16 }}>Nothing marked. Tap an area that hurts, feels stiff or weak.</span> : null}
      </div>
      {resolved.length ? (
        <details>
          <summary className="muted">Resolved ({resolved.length})</summary>
          <div className="card" style={{ padding: 0, gap: 0, marginTop: 8 }}>
            {resolved.map((m) => (
              <button key={m.id} type="button" className="result" onClick={() => setView({ v: "mark", id: m.id })}>
                <span className="muted">{markTitle(m)}</span>
                <span className="muted num">{m.resolvedAt ? day(m.resolvedAt) : ""}</span>
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export type NewMarkFields = { region: Region; side: Side; kind: MarkKind; onset: string } & CheckInFields;
type SheetFields = CheckInFields & { kind?: MarkKind; onset?: string };

/** Marking a region, or checking in: how it feels, how bad, since when, when it bothers you, red flags, notes. */
function MarkSheet({ title, isNew = false, last, onSave, onCancel }: {
  title: string; isNew?: boolean; last?: CheckIn | undefined;
  onSave: (f: SheetFields) => void; onCancel: () => void;
}) {
  const [kind, setKind] = useState<MarkKind | null>(null);
  const [severity, setSeverity] = useState<Severity>(last?.severity ?? 1);
  const [onset, setOnset] = useState<number>(0);
  const [bothers, setBothers] = useState<Bother[]>(last?.bothers ?? []);
  const [flags, setFlags] = useState<RedFlag[]>(last?.redFlags ?? []);
  const [note, setNote] = useState("");
  const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  const save = () => {
    if (isNew && !kind) return;
    onSave({ severity, bothers, redFlags: flags, ...(note.trim() ? { note: note.trim() } : {}), ...(isNew ? { kind: kind!, onset: daysAgo(onset) } : {}) });
  };
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onCancel}>‹ Cancel</Button><span className="muted">{isNew ? "New mark" : "Check in"}</span></div>
      <h1 className="title">{title}</h1>
      {isNew ? (
        <>
          <span className="label">How does it feel?</span>
          <div className="chips">{MARK_KINDS.map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{KIND_WORD[k]}</Chip>)}</div>
        </>
      ) : null}
      <span className="label">How bad?</span>
      <div className="chips">{([1, 2, 3] as const).map((s) => <Chip key={s} on={severity === s} onClick={() => setSeverity(s)}>{SEVERITY_WORD[s]}</Chip>)}</div>
      {isNew ? (
        <>
          <span className="label">Since when?</span>
          <div className="chips">{ONSETS.map(([label, n]) => <Chip key={label} on={onset === n} onClick={() => setOnset(n)}>{label}</Chip>)}</div>
        </>
      ) : null}
      <span className="label">When does it bother you?</span>
      <div className="chips">{BOTHERS.map((b) => <Chip key={b} on={bothers.includes(b)} onClick={() => setBothers(toggle(bothers, b))}>{BOTHER_LABEL[b]}</Chip>)}</div>
      <span className="label">Any of these?</span>
      <div className="chips">{RED_FLAGS.map((f) => <Chip key={f} on={flags.includes(f)} onClick={() => setFlags(toggle(flags, f))}>{RED_FLAG_LABEL[f]}</Chip>)}</div>
      {flags.length ? <span className="warn-text" role="alert">{RED_FLAG_ADVICE}</span> : null}
      <label className="label" htmlFor="mark-note">Notes</label>
      <input id="mark-note" className="field" placeholder="e.g. worse after long drives" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button variant="primary" xl disabled={isNew && !kind} onClick={save}>{isNew ? "Save mark" : "Save check-in"}</Button>
    </div>
  );
}

/** Severity over time, newest first, as short bars. */
function History({ items }: { items: { at: string; severity: Severity }[] }) {
  return (
    <div className="card" aria-label="Check-ins">
      <span className="label">Check-ins</span>
      {[...items].reverse().map((h) => (
        <div key={h.at} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="num" style={{ width: 56, fontSize: 13 }}>{day(h.at)}</span>
          <span className="track" aria-hidden="true"><span className={`fill sev-${h.severity}`} style={{ width: `${(h.severity / 3) * 100}%` }} /></span>
          <span style={{ width: 76, fontSize: 13 }}>{SEVERITY_WORD[h.severity]}</span>
        </div>
      ))}
    </div>
  );
}

function MarkDetail({ mark, onBack, onCheckIn, onResolve, onReopen, onBecomeCondition, onEdit, children }: { mark: Mark; onBack: () => void; onCheckIn: () => void; onResolve: () => void; onReopen: () => void; onBecomeCondition: () => void; onEdit: () => void; children?: ReactNode }) {
  const [confirm, setConfirm] = useState(false);
  const s = currentState(mark);
  const now = new Date();
  const flags = redFlags(mark);
  const next = s ? new Date(Date.parse(s.at) + 7 * 86_400_000) : null;
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onBack}>‹ Body</Button><Button variant="ghost" onClick={onEdit}>Edit</Button></div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}><MarkBadge kind={mark.kind} /><h1 className="title">{markTitle(mark)}</h1></div>
      <span className="muted">{SEVERITY_WORD[s?.severity ?? 1]} · since {day(`${mark.onset}T12:00:00Z`)}{s?.bothers.length ? ` · ${s.bothers.map((b) => BOTHER_LABEL[b].toLowerCase()).join(", ")}` : ""}</span>
      {mark.resolvedAt ? <span className="muted">Resolved {day(mark.resolvedAt)}.</span>
        : isDue(mark, now) ? <span className="due-note">A check-in is due.</span>
        : next ? <span className="muted">Next check-in {day(next.toISOString())}.</span> : null}
      {s?.note ? <span>“{s.note}”</span> : null}
      {flags.length ? <span className="warn-text">You noted: {flags.map((f) => RED_FLAG_LABEL[f].toLowerCase()).join(", ")}. {RED_FLAG_ADVICE}</span> : null}
      {!flags.length && (mark.kind === "pain" || mark.kind === "injury") && !mark.resolvedAt ? <span className="muted">Stay in a pain-free range, and stop if it sharpens.</span> : null}
      {offersCondition(mark, now) ? (
        <div className="card">
          <span>This has lasted about three months. If it's part of life now, make it a condition: it stays on the body map and in suggestions, and this mark is closed into it.</span>
          <Button onClick={onBecomeCondition}>Make it a condition</Button>
        </div>
      ) : null}
      {mark.becameCondition ? <span className="muted">This became a condition.</span> : null}
      <History items={history(mark)} />
      {mark.resolvedAt ? null : children}
      {mark.resolvedAt ? (
        <Button onClick={onReopen}>It's back</Button>
      ) : confirm ? (
        <div className="card">
          <span>Mark it resolved? Its history stays.</span>
          <div className="pair"><Button variant="primary" onClick={() => { setConfirm(false); onResolve(); }}>Resolved</Button><Button onClick={() => setConfirm(false)}>Not yet</Button></div>
        </div>
      ) : (
        <div className="pair">
          <Button variant="primary" onClick={onCheckIn}>Check in</Button>
          <Button onClick={() => setConfirm(true)}>Mark resolved</Button>
        </div>
      )}
    </div>
  );
}

function ConditionDetail({ condition, onBack, onCheckIn, onEdit, children }: { condition: Condition; onBack: () => void; onCheckIn: (f: CheckInFields) => void; onEdit: () => void; children?: ReactNode }) {
  const [checking, setChecking] = useState(false);
  if (checking) {
    return <MarkSheet title={condition.name} last={currentState(condition)} onCancel={() => setChecking(false)} onSave={(f) => { onCheckIn(f); setChecking(false); }} />;
  }
  const flags = redFlags(condition);
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onBack}>‹ Body</Button><Button variant="ghost" onClick={onEdit}>Edit</Button></div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}><MarkBadge kind="condition" /><h1 className="title">{condition.name}</h1></div>
      <span className="muted">{condition.regions.length ? condition.regions.map((r) => placeLabel(r.region, r.side)).join(", ") : "Whole body"} · since {condition.since}{condition.until ? ` until ${condition.until}` : ""}</span>
      {condition.note ? <span>“{condition.note}”</span> : null}
      {flags.length ? <span className="warn-text">You noted: {flags.map((f) => RED_FLAG_LABEL[f].toLowerCase()).join(", ")}. {RED_FLAG_ADVICE}</span> : null}
      {condition.checkins.length ? <History items={history(condition)} /> : <span className="muted">No check-ins yet. Check in when it's bothering you, and the app will ask weekly after that.</span>}
      {children}
      <Button variant="primary" onClick={() => setChecking(true)}>Check in</Button>
    </div>
  );
}

/**
 * What a mark or condition means for training (#50): what helps it (minus anything the body rules out),
 * and the person's routine items it changes, with Use modified.
 */
function Advice({ subject, body, library, routines, onUseModified }: {
  subject: Mark | Condition; body: Body; library: LibraryItem[]; routines: Routine[]; onUseModified: (r: Routine, f: RoutineFlag) => void;
}) {
  const byId = useMemo(() => new Map(library.map((x) => [x.id, x])), [library]);
  const all = useMemo(() => concerns(body), [body]);
  const mine = all.filter((c) => c.id === subject.id);
  const helps = [...new Set(mine.flatMap((c) => helpersFor(c)))]
    .map((id) => byId.get(id)).filter((x): x is LibraryItem => !!x && assess(x, all).action !== "avoid").slice(0, 5);
  const flags = routines.flatMap((r) => reviewRoutine(r.items, library, mine).map((f) => ({ r, f, done: alreadyModified(r.items.find((i) => i.id === f.itemId)!, f.assessment) })));
  if (!mine.length) return null;
  return (
    <>
      {helps.length ? (
        <div className="card" aria-label="Helps">
          <span className="label">Helps</span>
          {helps.map((x) => <span key={x.id}>{x.name} <span className="muted" style={{ fontSize: 13 }}>· {x.kinds.join(", ")}</span></span>)}
          <span className="muted" style={{ fontSize: 13 }}>Suggest next and planned sessions lead with these.</span>
        </div>
      ) : null}
      {flags.length ? (
        <div className="card" aria-label="In your routines">
          <span className="label">In your routines</span>
          {flags.map(({ r, f, done }) => {
            const a = f.assessment;
            const name = (id: string) => byId.get(id)?.name ?? id;
            const what = done ? "done gently ✓" : a.action === "avoid" ? "left out for now" : a.action === "modify" ? (a.swap ? `gentler: ${name(a.swap)}` : "do it more gently") : "keep it light";
            return (
              <div key={r.id + f.itemId} className="hrow" style={{ minHeight: 0, alignItems: "center" }}>
                <span><span className="strong">{name(f.exercise)}</span> <span className="muted" style={{ fontSize: 13 }}>in {r.name}: {what}</span></span>
                {a.action === "modify" && !done ? <Button variant="ghost" onClick={() => onUseModified(r, f)}>Use modified</Button> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

/** Edit a mark (#54): move it (region and side), change its kind, when it started, its note; or delete it. */
function MarkEditor({ mark, onSave, onCancel }: { mark: Mark; onSave: (m: Mark) => void; onCancel: () => void }) {
  const [region, setRegion] = useState<Region>(mark.region);
  const [side, setSide] = useState<Side>(mark.side);
  const [kind, setKind] = useState<MarkKind>(mark.kind);
  const [onset, setOnset] = useState(mark.onset);
  const [note, setNote] = useState(mark.note ?? "");
  const [confirm, setConfirm] = useState(false);
  const pickRegion = (r: Region) => {
    setRegion(r);
    // A sided region needs a side; any other region takes none.
    setSide(sidedHere(r) ? (side === "none" ? "left" : side) : "none");
  };
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(onset) && onset <= new Date().toISOString().slice(0, 10);
  const save = () => {
    const { note: _n, ...rest } = mark;
    onSave({ ...rest, region, side, kind, onset, ...(note.trim() ? { note: note.trim() } : {}) });
  };
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onCancel}>‹ Cancel</Button><span className="muted">Edit mark</span></div>
      <h1 className="title">{placeLabel(region, side)}</h1>
      <span className="label">Where</span>
      <div className="chips">{REGIONS.map((r) => <Chip key={r} on={region === r} onClick={() => pickRegion(r)}>{REGION_LABEL[r]}</Chip>)}</div>
      {sidedHere(region) ? (
        <>
          <span className="label">Side</span>
          <div className="chips">{(["left", "right", "both"] as const).map((s) => <Chip key={s} on={side === s} onClick={() => setSide(s)}>{s[0]!.toUpperCase() + s.slice(1)}</Chip>)}</div>
        </>
      ) : null}
      <span className="label">How does it feel?</span>
      <div className="chips">{MARK_KINDS.map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{KIND_WORD[k]}</Chip>)}</div>
      <label className="label" htmlFor="mark-onset">Since</label>
      <input id="mark-onset" className="field" type="date" value={onset} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setOnset(e.target.value)} />
      <label className="label" htmlFor="mark-edit-note">Notes</label>
      <input id="mark-edit-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} />
      <span className="muted">How bad it is changes with a check-in, so its history stays.</span>
      <Button variant="primary" xl disabled={!valid} onClick={save}>Save</Button>
      {confirm ? (
        <div className="card">
          <span>Delete this mark and its check-ins? To keep its history, mark it resolved instead.</span>
          <div className="pair"><Button variant="stop" onClick={() => onSave({ ...mark, deleted: true })}>Delete</Button><Button onClick={() => setConfirm(false)}>Keep</Button></div>
        </div>
      ) : <Button variant="ghost" onClick={() => setConfirm(true)}>Delete mark</Button>}
    </div>
  );
}

