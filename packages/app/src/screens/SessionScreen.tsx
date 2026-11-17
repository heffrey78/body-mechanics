import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EFFORTS, describeSet, nextSet, nextStep, planStatus, progression, search, showLoad, toKg, FIELD, type Effort, type Entry, type LibraryItem, type LoggedSet, type RecordIndex, type RoutineItem, type Session, type SessionLog } from "@bm/engine";
import { elapsedSeconds, pageCue, startTimer, stopTimer, type RunningTimer } from "../timer.ts";
import { Button, Chip, Segmented, Stepper, Tag, Timer } from "../ui/components.tsx";
import { ModifierPicker, modifierText } from "../ui/ModifierPicker.tsx";

const REST_SECONDS = 60;
const EFFORT_LABEL: Record<Effort, string> = { easy: "Easy", right: "About right", hard: "Hard", pain: "Painful" };

/** What's on the steppers, and how far through a one-sided set: kept as the draft (#28). */
export interface Pending {
  entryId: string;
  amount: number;
  loadKg?: number;
  /** A one-sided set: the left side's amount once it's done. */
  left?: number;
}

/**
 * Logging a session (#32): the current exercise's card (steppers, or a timer that runs until Stop;
 * one-sided sets left then right), the rest timer after each set (+30 s, Skip), effort once per
 * exercise, every set tappable to correct or delete, and Type next / recent chips for what's next.
 * The card sits in the middle (#44): what's done above it, what's still to do below.
 */
export function SessionScreen({ suggestPanel, onSuggest, log, session, plan, library, recent, index, units, pending, onPending, onChanged, onFinished, onHome }: {
  /** Suggest next (#43), shown in place when open. */
  suggestPanel: ReactNode;
  onSuggest: () => void;
  log: SessionLog;
  session: Session;
  /** A routine run or a repeat (#36): the planned exercises and their targets. */
  plan: RoutineItem[] | null;
  library: LibraryItem[];
  recent: LibraryItem[];
  index: RecordIndex | null;
  units: "kg" | "lb";
  pending: Pending | null;
  onPending: (p: Pending | null) => void;
  onChanged: (s: Session) => void;
  onFinished: (s: Session) => void;
  onHome: () => void;
}) {
  const byId = useMemo(() => new Map(library.map((x) => [x.id, x])), [library]);
  const entries = session.entries.filter((e) => !e.deleted);
  const steps = plan ? planStatus(plan, session) : [];
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const stepOf = (e: Entry | undefined) => (e ? steps.find((x) => x.entryId === e.id) : undefined);
  const [currentId, setCurrentId] = useState(pending?.entryId ?? entries.at(-1)?.id ?? "");
  // An exercise added from outside (a suggestion taken) becomes the current one.
  useEffect(() => { if (pending?.entryId) setCurrentId(pending.entryId); }, [pending?.entryId]);
  const current = entries.find((e) => e.id === currentId) ?? entries.at(-1);
  const item = current ? byId.get(current.exercise) : undefined;
  const measure = item?.measure ?? "reps";
  const load = (kg: number) => showLoad(kg, units);

  const [now, setNow] = useState(Date.now());
  const [hold, setHold] = useState<RunningTimer | null>(null);
  const [rest, setRest] = useState<RunningTimer | null>(null);
  const cued = useRef(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [modifying, setModifying] = useState(false);
  useEffect(() => setModifying(false), [currentId]);
  // The current exercise in the middle of the screen whenever it changes (#44).
  const middle = useRef<HTMLDivElement>(null);
  useEffect(() => { middle.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [current?.id]);

  // The steppers: the draft if it's for this exercise, else the next set's defaults.
  const defaults = (e: Entry | undefined): Pending | null => {
    if (!e) return null;
    const m = byId.get(e.exercise)?.measure ?? "reps";
    const n = nextSet(m, e, index?.lastTime(e.exercise, session.startedAt)?.entry.sets);
    // A routine's targets come first (#36), moved on by how last time felt (#37).
    const target = stepOf(e)?.item;
    const prog = target ? progression(target, m, index?.lastTime(e.exercise, session.startedAt)?.entry, units) : undefined;
    const amount = prog?.amount ?? target?.[FIELD[m]] ?? n.amount;
    const loadKg = prog ? prog.loadKg : target ? target.loadKg : n.loadKg;
    return { entryId: e.id, amount, ...(loadKg !== undefined ? { loadKg } : {}) };
  };
  const p = pending && pending.entryId === current?.id ? pending : defaults(current);
  const update = (patch: Partial<Pending>) => { if (p) onPending({ ...p, ...patch }); };

  useEffect(() => {
    if (!hold && !rest) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [hold, rest]);

  // The page cues where no service does (#22); a rest that's run out moves on by itself.
  useEffect(() => {
    if (hold && !hold.native && !cued.current && elapsedSeconds(hold, now) >= hold.spec.targetSeconds) { cued.current = true; pageCue(); }
    if (rest && elapsedSeconds(rest, now) >= rest.spec.targetSeconds) {
      if (!rest.native) pageCue();
      setRest(null);
      void stopTimer();
    }
  }, [now, hold, rest]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      // Finishing closes the session: nothing left to report as changed.
      if (log.session) onChanged(log.session);
    } finally { setBusy(false); }
  };

  const startRest = async (seconds = REST_SECONDS, already = 0) => {
    setRest(await startTimer({ kind: "rest", label: "Rest", targetSeconds: seconds }, already));
  };

  /** One side or a whole set done, with `amount`. */
  const done = (amount: number) => run(async () => {
    if (!current || !p) return;
    const f = FIELD[measure];
    const loadKg = p.loadKg !== undefined && p.loadKg > 0 ? { loadKg: p.loadKg } : {};
    if (item?.sided && p.left === undefined) {
      onPending({ ...p, left: amount });
      return;
    }
    if (item?.sided) await log.logSet(current.id, { left: { [f]: p.left }, right: { [f]: amount }, ...loadKg });
    else await log.logSet(current.id, { [f]: amount, ...loadKg });
    onPending({ entryId: current.id, amount: p.amount, ...(p.loadKg !== undefined ? { loadKg: p.loadKg } : {}) });
    const step = stepOf(current);
    await startRest(step?.item.restSeconds ?? REST_SECONDS);
    // The planned sets are done: on to the next planned exercise (#36).
    if (step && step.done + 1 >= step.item.sets) await advance(step.item.id);
  });

  /** Make the next planned exercise current, adding its entry if it hasn't one yet. */
  const advance = async (fromItem?: string, skip?: Set<string>) => {
    const fresh = planStatus(plan ?? [], log.session ?? session);
    const n = nextStep(fresh, skip ?? skipped, fromItem);
    if (!n) return;
    setEditing(null);
    if (n.entryId) { setCurrentId(n.entryId); return; }
    const e = await log.addEntry(n.item.exercise, n.item.modifiers ?? []);
    setCurrentId(e.id);
  };
  const openStep = (itemId: string) => run(async () => {
    const st = steps.find((x) => x.item.id === itemId);
    if (!st) return;
    setEditing(null);
    if (st.entryId) setCurrentId(st.entryId);
    else setCurrentId((await log.addEntry(st.item.exercise, st.item.modifiers ?? [])).id);
  });

  const startHold = async () => {
    if (!p) return;
    if (rest) { setRest(null); await stopTimer(); }
    cued.current = false;
    const side = item?.sided ? (p.left === undefined ? "left" : "right") : undefined;
    setHold(await startTimer({ kind: "hold", label: `${item?.name ?? "Hold"}${side ? ` (${side})` : ""}`, targetSeconds: p.amount }));
  };
  const stopHold = async () => {
    if (!hold) return;
    const secs = elapsedSeconds(hold);
    setHold(null);
    await stopTimer();
    await done(secs);
  };

  const addNext = (x: LibraryItem) => run(async () => {
    const e = await log.addEntry(x.id);
    setCurrentId(e.id);
    setNext("");
  });
  const hits = useMemo(() => search(next, library, 4), [next, library]);

  const loadStep = units === "kg" ? 1 : 2.5;
  const shownLoad = p?.loadKg !== undefined ? (units === "kg" ? p.loadKg : Math.round(p.loadKg * 2.2046226218 * 2) / 2) : 0;
  const stepLoad = (d: number) => {
    const v = Math.max(0, shownLoad + d * loadStep);
    update({ loadKg: v === 0 ? 0 : toKg(v, units) });
  };
  const amountStep = measure === "reps" ? 1 : measure === "time" ? 5 : 10;
  const amountText = (n: number) => (measure === "reps" ? `${n}` : measure === "time" ? `${n} s` : `${n} m`);
  const minutes = Math.floor((now - Date.parse(session.startedAt)) / 60_000);

  // Done above the card, still to do below (#44). Planned exercises go by their plan status; anything
  // else is done once it has a set.
  const setCount = (e: Entry) => e.sets.filter((x) => !x.deleted).length;
  const setsWord = (n: number) => `${n} ${n === 1 ? "set" : "sets"}`;
  const nameOf = (exercise: string) => byId.get(exercise)?.name ?? exercise;
  const open = (id: string) => { setEditing(null); setCurrentId(id); };
  const doneRows: Row[] = [];
  const nextRows: Row[] = [];
  for (const e of entries) {
    if (e.id === current?.id) continue;
    const st = steps.find((x) => x.entryId === e.id);
    if (st) {
      const off = skipped.has(st.item.id) && !st.complete;
      if (st.complete || off) doneRows.push({ key: e.id, name: nameOf(e.exercise), detail: `${st.complete ? "✓ " : ""}${st.done}/${st.item.sets}${off ? " · skipped" : ""}`, onOpen: () => open(e.id) });
    } else if (setCount(e)) {
      doneRows.push({ key: e.id, name: nameOf(e.exercise), detail: `✓ ${setsWord(setCount(e))}`, onOpen: () => open(e.id) });
    } else {
      nextRows.push({ key: e.id, name: nameOf(e.exercise), detail: "added", onOpen: () => open(e.id) });
    }
  }
  for (const st of steps) {
    if (st.entryId === current?.id) continue;
    const off = skipped.has(st.item.id);
    if (!st.entryId && off) doneRows.push({ key: st.item.id, name: nameOf(st.item.exercise), detail: "skipped", muted: true, onOpen: () => void openStep(st.item.id) });
    if (!st.complete && !off) {
      nextRows.push({
        key: st.item.id, name: nameOf(st.item.exercise), detail: `${st.done}/${st.item.sets}`, onOpen: () => void openStep(st.item.id),
        onSkip: () => setSkipped(new Set(skipped).add(st.item.id)),
      });
    }
  }
  const currentStep = stepOf(current);
  const skipCurrent = currentStep && !currentStep.complete && !skipped.has(currentStep.item.id) ? () => {
    const next = new Set(skipped).add(currentStep.item.id);
    setSkipped(next);
    void run(() => advance(currentStep.item.id, next));
  } : undefined;

  return (
    <div className="pad">
      <div className="hrow">
        <Button variant="ghost" onClick={onHome}>‹ Home</Button>
        <span className="muted num">{minutes} min</span>
        <Button variant="secondary" disabled={busy || !!hold} onClick={() => void run(async () => { if (rest) { setRest(null); await stopTimer(); } onPending(null); onFinished(await log.finish()); })}>Finish</Button>
      </div>

      {doneRows.length ? <RowList label="Done" rows={doneRows} /> : null}

      <div ref={middle} style={{ display: "flex", flexDirection: "column", gap: "inherit", scrollMarginTop: 16, scrollMarginBottom: 16 }}>
      {rest ? (
        <div className="card" aria-label="Rest">
          <span className="label">Rest</span>
          <Timer seconds={Math.max(0, rest.spec.targetSeconds - elapsedSeconds(rest, now))} />
          <div className="pair">
            <Button onClick={() => void startRest(rest.spec.targetSeconds + 30, elapsedSeconds(rest, now))}>+30 s</Button>
            <Button onClick={() => { setRest(null); void stopTimer(); }}>Skip rest</Button>
          </div>
        </div>
      ) : null}

      {current && p ? (
        <div className="card" aria-label="Current exercise">
          <div className="hrow" style={{ minHeight: 0, alignItems: "flex-start" }}>
            <h2 className="title" style={{ fontSize: 22 }}>{item?.name ?? current.exercise}</h2>
            {currentStep ? <span className="muted num" style={{ whiteSpace: "nowrap", paddingTop: 4 }}>Set {Math.min(currentStep.done + 1, currentStep.item.sets)} of {currentStep.item.sets}</span> : null}
          </div>
          {(() => {
            const target = stepOf(current)?.item;
            const prog = target ? progression(target, measure, index?.lastTime(current.exercise, session.startedAt)?.entry, units) : undefined;
            if (!prog || prog.direction === "hold") return null;
            const what = prog.loadKg !== undefined && prog.loadKg !== target!.loadKg ? load(prog.loadKg) : `${prog.amount}${measure === "reps" ? " reps" : measure === "time" ? " s" : " m"}`;
            return <span className="tag" style={{ alignSelf: "flex-start" }}>{prog.direction === "up" ? "↑" : "↓"} {what}: {prog.reason.toLowerCase()}</span>;
          })()}
          {(() => {
            const last = index?.lastTime(current.exercise, session.startedAt);
            if (!last) return null;
            const sets = last.entry.sets.map((x) => describeSet({ id: "x", ...x } as LoggedSet, measure, load)).join(", ");
            return <span className="muted">Last time ({new Date(last.session.startedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}): {sets}</span>;
          })()}
          {current.sets.filter((s) => !s.deleted).map((s, i) => (
            <SetLine key={s.id} n={i + 1} set={s} text={describeSet(s, measure, load)} open={editing === s.id} measure={measure} units={units}
              onOpen={() => setEditing(editing === s.id ? null : s.id)}
              onSave={(patch) => void run(async () => { await log.editSet(current.id, s.id, patch); setEditing(null); })}
              onDelete={() => void run(async () => { await log.deleteSet(current.id, s.id); setEditing(null); })}
            />
          ))}
          {item?.sided ? <span className="label">{p.left === undefined ? "Left side" : `Right side · left was ${amountText(p.left)}`}</span> : null}
          {hold ? (
            <>
              <Timer seconds={elapsedSeconds(hold, now)} label="Time" />
              <span className="muted" style={{ textAlign: "center" }}>Target {amountText(hold.spec.targetSeconds)}</span>
              <Button variant="stop" xl onClick={() => void stopHold()}>Stop</Button>
            </>
          ) : (
            <>
              <Stepper label={measure === "time" ? "Target" : measure === "reps" ? "Reps" : "Metres"} value={amountText(p.amount)}
                onLess={() => update({ amount: Math.max(amountStep === 1 ? 1 : amountStep, p.amount - amountStep) })} onMore={() => update({ amount: p.amount + amountStep })} />
              {measure !== "time" || p.loadKg ? (
                <Stepper label="Load" value={shownLoad ? `${shownLoad} ${units}` : "None"} onLess={() => stepLoad(-1)} onMore={() => stepLoad(1)} />
              ) : null}
              {measure === "time" ? (
                <Button variant="primary" xl disabled={busy} onClick={() => void startHold()}>{item?.sided ? `Start ${p.left === undefined ? "left" : "right"} side` : "Start exercise"}</Button>
              ) : (
                <Button variant="primary" xl disabled={busy} onClick={() => void done(p.amount)}>{item?.sided ? `Log ${p.left === undefined ? "left" : "right"}` : "Log set"}</Button>
              )}
            </>
          )}
          {current.modifiers.length || modifying ? <span className="label">How you're doing it</span> : null}
          {current.modifiers.length && !modifying ? <div className="chips"><Tag warn>{modifierText(current.modifiers)}</Tag></div> : null}
          {modifying ? (
            <>
              <ModifierPicker value={current.modifiers} onChange={(m) => void run(() => log.setModifiers(current.id, m))} />
              <Button onClick={() => setModifying(false)}>Done</Button>
            </>
          ) : !hold ? <Button variant="ghost" onClick={() => setModifying(true)}>{current.modifiers.length ? "Change how you're doing it" : "Doing it differently? Add a modifier"}</Button> : null}
          <span className="label">Effort</span>
          <Segmented label="Effort" value={current.effort ?? ("" as Effort)} onChange={(e) => void run(() => log.setEffort(current.id, e))}
            options={EFFORTS.map((id) => ({ id, label: EFFORT_LABEL[id] }))} />
          {skipCurrent && !hold ? <Button variant="ghost" onClick={skipCurrent}>Skip this exercise</Button> : null}
        </div>
      ) : null}
      </div>

      {nextRows.length ? <RowList label="Up next" rows={nextRows} /> : null}

      {suggestPanel ?? <Button xl onClick={onSuggest}>Suggest next</Button>}
      <input className="field" type="search" aria-label="Type next" placeholder="Type next" autoComplete="off" value={next}
        onChange={(e) => setNext(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && hits[0]?.full) void addNext(hits[0].item); }} />
      {next.trim() ? (
        <div className="card" style={{ padding: 0, gap: 0 }}>
          {hits.map((h) => <button key={h.item.id} type="button" className="result" onClick={() => void addNext(h.item)}>{h.item.name}</button>)}
          {hits.length === 0 ? <span className="muted" style={{ padding: 16 }}>No match. New movements start from Home for now.</span> : null}
        </div>
      ) : recent.length ? (
        <div className="chips">{recent.filter((r) => !entries.some((e) => e.exercise === r.id)).slice(0, 6).map((r) => <Chip key={r.id} onClick={() => void addNext(r)}>{r.name}</Chip>)}</div>
      ) : null}
    </div>
  );
}

interface Row { key: string; name: string; detail: string; muted?: boolean; onOpen: () => void; onSkip?: () => void }

/** Exercises around the current one (#44): tap to make one current; ones still to do can be skipped. */
function RowList({ label, rows }: { label: string; rows: Row[] }) {
  return (
    <>
      <span className="label">{label}</span>
      <div className="card" style={{ padding: 0, gap: 0 }} aria-label={label}>
        {rows.map((r) => (
          <div key={r.key} className="hrow" style={{ borderBottom: "1px solid var(--line)", minHeight: 52 }}>
            <button type="button" className="result" style={{ borderBottom: 0, flexGrow: 1 }} onClick={r.onOpen}>
              <span className={r.muted ? "muted" : ""}>{r.name}</span>
              <span className="muted num">{r.detail}</span>
            </button>
            {r.onSkip ? <button type="button" className="btn ghost" style={{ minHeight: 44, marginRight: 8 }} onClick={r.onSkip}>Skip</button> : null}
          </div>
        ))}
      </div>
    </>
  );
}

/** A logged set: tap to correct it or delete it. */
function SetLine({ n, set, text, open, measure, units, onOpen, onSave, onDelete }: {
  n: number; set: LoggedSet; text: string; open: boolean; measure: LibraryItem["measure"]; units: "kg" | "lb";
  onOpen: () => void; onSave: (patch: Partial<LoggedSet>) => void; onDelete: () => void;
}) {
  const f = FIELD[measure];
  const sided = !!(set.left || set.right);
  const [l, setL] = useState(set.left?.[f] ?? 0);
  const [r, setR] = useState(set.right?.[f] ?? 0);
  const [a, setA] = useState(set[f] ?? 0);
  const [kg, setKg] = useState(set.loadKg ?? 0);
  const step = measure === "reps" ? 1 : measure === "time" ? 5 : 10;
  const loadStep = units === "kg" ? 1 : toKg(2.5, "lb");
  return (
    <>
      <button type="button" className="result" style={{ padding: "8px 0" }} aria-expanded={open} onClick={onOpen}>
        <span className="muted">Set {n}</span><span className="strong num">{text}</span>
      </button>
      {open ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sided ? (
            <>
              <Stepper label="Left" value={String(l)} onLess={() => setL(Math.max(0, l - step))} onMore={() => setL(l + step)} />
              <Stepper label="Right" value={String(r)} onLess={() => setR(Math.max(0, r - step))} onMore={() => setR(r + step)} />
            </>
          ) : (
            <Stepper label={f === "reps" ? "Reps" : f === "seconds" ? "Seconds" : "Metres"} value={String(a)} onLess={() => setA(Math.max(0, a - step))} onMore={() => setA(a + step)} />
          )}
          <Stepper label="Load" value={kg ? showLoad(kg, units) : "None"} onLess={() => setKg(Math.max(0, Math.round((kg - loadStep) * 1000) / 1000))} onMore={() => setKg(Math.round((kg + loadStep) * 1000) / 1000)} />
          <div className="pair">
            <Button variant="primary" onClick={() => onSave({ ...(sided ? { left: { [f]: l }, right: { [f]: r } } : { [f]: a }), loadKg: kg > 0 ? kg : undefined })}>Save</Button>
            <Button variant="stop" onClick={onDelete}>Delete set</Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
