import { useEffect, useMemo, useRef, useState } from "react";
import { EFFORTS, describeSet, nextSet, search, showLoad, toKg, FIELD, type Effort, type Entry, type LibraryItem, type LoggedSet, type RecordIndex, type Session, type SessionLog } from "@bm/engine";
import { elapsedSeconds, pageCue, startTimer, stopTimer, type RunningTimer } from "../timer.ts";
import { Button, Chip, Segmented, Stepper, Timer } from "../ui/components.tsx";

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
 * Logging a session (#32): the current exercise's card (steppers, or a hold that runs until Stop;
 * one-sided sets left then right), the rest timer after each set (+30 s, Skip), effort once per
 * exercise, every set tappable to correct or delete, and Type next / recent chips for what's next.
 */
export function SessionScreen({ log, session, library, recent, index, units, pending, onPending, onChanged, onFinished, onHome }: {
  log: SessionLog;
  session: Session;
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
  const [currentId, setCurrentId] = useState(pending?.entryId ?? entries.at(-1)?.id ?? "");
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

  // The steppers: the draft if it's for this exercise, else the next set's defaults.
  const defaults = (e: Entry | undefined): Pending | null => {
    if (!e) return null;
    const m = byId.get(e.exercise)?.measure ?? "reps";
    const n = nextSet(m, e, index?.lastTime(e.exercise, session.startedAt)?.entry.sets);
    return { entryId: e.id, amount: n.amount, ...(n.loadKg !== undefined ? { loadKg: n.loadKg } : {}) };
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
    try { await fn(); onChanged(log.session ?? session); } finally { setBusy(false); }
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
    await startRest();
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

  return (
    <div className="pad">
      <div className="hrow">
        <Button variant="ghost" onClick={onHome}>‹ Home</Button>
        <span className="muted num">{minutes} min</span>
        <Button variant="secondary" disabled={busy || !!hold} onClick={() => void run(async () => { if (rest) { setRest(null); await stopTimer(); } onPending(null); onFinished(await log.finish()); })}>Finish</Button>
      </div>

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
          <h2 className="title" style={{ fontSize: 22 }}>{item?.name ?? current.exercise}</h2>
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
              <Timer seconds={elapsedSeconds(hold, now)} label="Hold" />
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
                <Button variant="primary" xl disabled={busy} onClick={() => void startHold()}>{item?.sided ? `Start ${p.left === undefined ? "left" : "right"} hold` : "Start hold"}</Button>
              ) : (
                <Button variant="primary" xl disabled={busy} onClick={() => void done(p.amount)}>{item?.sided ? `Log ${p.left === undefined ? "left" : "right"}` : "Log set"}</Button>
              )}
            </>
          )}
          <span className="label">Effort</span>
          <Segmented label="Effort" value={current.effort ?? ("" as Effort)} onChange={(e) => void run(() => log.setEffort(current.id, e))}
            options={EFFORTS.map((id) => ({ id, label: EFFORT_LABEL[id] }))} />
        </div>
      ) : null}

      {entries.length > 1 ? (
        <>
          <span className="label">This session</span>
          <div className="card" style={{ padding: 0, gap: 0 }}>
            {entries.map((e) => (
              <button key={e.id} type="button" className="result" aria-current={e.id === current?.id} onClick={() => { setEditing(null); setCurrentId(e.id); }}>
                <span className={e.id === current?.id ? "strong" : ""}>{byId.get(e.exercise)?.name ?? e.exercise}</span>
                <span className="muted num">{((n) => `${n} ${n === 1 ? "set" : "sets"}`)(e.sets.filter((s) => !s.deleted).length)}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}

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
