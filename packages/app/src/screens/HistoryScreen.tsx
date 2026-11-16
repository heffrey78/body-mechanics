import { useEffect, useState } from "react";
import { describeSet, showLoad, type LibraryItem, type LoggedSet, type ProgressPoint, type RecordIndex, type Session, type Vault } from "@bm/engine";
import { Button, Tag } from "../ui/components.tsx";

const EFFORT_LABEL: Record<string, string> = { easy: "Easy", right: "About right", hard: "Hard", pain: "Painful" };

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
function weekOf(iso: string): string {
  const d = new Date(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `Week of ${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

type View = { screen: "weeks" } | { screen: "session"; path: string } | { screen: "progress"; exercise: string; from?: string };

/**
 * History (#33): sessions by week with totals, a session's detail (reopen it to edit), and an
 * exercise's progress: the best set per session, modified sessions marked, left/right for one-sided.
 */
export function HistoryScreen({ vault, index, library, units, canEdit, onEdit }: {
  vault: Vault | null;
  index: RecordIndex | null;
  library: LibraryItem[];
  units: "kg" | "lb";
  canEdit: boolean;
  onEdit: (s: Session) => void;
}) {
  const [view, setView] = useState<View>({ screen: "weeks" });
  const byId = new Map(library.map((x) => [x.id, x]));
  const name = (id: string) => byId.get(id)?.name ?? id;

  if (view.screen === "session") {
    return <SessionDetail vault={vault} path={view.path} name={name} byId={byId} units={units} canEdit={canEdit} onEdit={onEdit}
      onBack={() => setView({ screen: "weeks" })} onProgress={(exercise) => setView({ screen: "progress", exercise, from: view.path })} />;
  }
  if (view.screen === "progress") {
    return <Progress points={index?.progress(view.exercise) ?? []} item={byId.get(view.exercise)} title={name(view.exercise)} units={units}
      onBack={() => setView(view.from ? { screen: "session", path: view.from } : { screen: "weeks" })} onSession={(path) => setView({ screen: "session", path })} />;
  }

  const weeks = index?.weeks() ?? [];
  return (
    <div className="pad">
      <h1 className="title">History</h1>
      {weeks.length === 0 ? <span className="muted">Nothing logged yet. Sessions appear here as soon as you start one.</span> : null}
      {weeks.map((w) => {
        const sets = w.sessions.reduce((n, s) => n + s.entries.reduce((m, e) => m + e.sets.length, 0), 0);
        return (
          <section key={w.week} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="hrow" style={{ minHeight: 0 }}>
              <span className="label">{weekOf(w.sessions[0]!.startedAt)}</span>
              <span className="muted num">{w.sessions.length} {w.sessions.length === 1 ? "session" : "sessions"} · {sets} {sets === 1 ? "set" : "sets"}</span>
            </div>
            <div className="card" style={{ padding: 0, gap: 0 }}>
              {w.sessions.map((s) => (
                <button key={s.id} type="button" className="result" onClick={() => setView({ screen: "session", path: s.path })}>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span className="strong">{day(s.startedAt)} <span className="muted">{time(s.startedAt)}</span></span>
                    <span className="muted" style={{ fontSize: 13 }}>{s.entries.map((e) => name(e.exercise)).join(", ") || "No exercises"}</span>
                  </span>
                  {s.finishedAt ? null : <Tag>Open</Tag>}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SessionDetail({ vault, path, name, byId, units, canEdit, onEdit, onBack, onProgress }: {
  vault: Vault | null; path: string; name: (id: string) => string; byId: Map<string, LibraryItem>; units: "kg" | "lb"; canEdit: boolean;
  onEdit: (s: Session) => void; onBack: () => void; onProgress: (exercise: string) => void;
}) {
  const [s, setS] = useState<Session | null>(null);
  useEffect(() => {
    void vault?.read(path).then((r) => { if (r?.type === "session") setS(r); });
  }, [vault, path]);
  const load = (kg: number) => showLoad(kg, units);
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onBack}>‹ History</Button></div>
      {s ? (
        <>
          <h1 className="title">{day(s.startedAt)}</h1>
          <span className="muted">{time(s.startedAt)}{s.finishedAt ? ` – ${time(s.finishedAt)}` : " · still open"}{s.location ? ` · ${s.location}` : ""}</span>
          {s.entries.filter((e) => !e.deleted).map((e) => (
            <div key={e.id} className="card" style={{ gap: 6 }}>
              <button type="button" className="result" style={{ padding: 0, minHeight: 36, borderBottom: 0 }} onClick={() => onProgress(e.exercise)}>
                <span className="strong">{name(e.exercise)}</span><span className="muted">Progress ›</span>
              </button>
              <div className="chips" style={{ gap: 6 }}>
                {e.effort ? <Tag>{EFFORT_LABEL[e.effort]}</Tag> : null}
                {e.modifiers.map((m) => <Tag key={m.id} warn>{m.value ? `${m.id} ${m.value}` : m.id}</Tag>)}
              </div>
              {e.sets.filter((x) => !x.deleted).map((x: LoggedSet, i) => (
                <div key={x.id} className="set-row"><span className="muted">Set {i + 1}</span><span className="strong num">{describeSet(x, byId.get(e.exercise)?.measure ?? "reps", load)}</span></div>
              ))}
            </div>
          ))}
          {canEdit ? <Button variant="primary" onClick={() => onEdit(s)}>Edit this session</Button> : <span className="muted">Finish the open session to edit this one.</span>}
        </>
      ) : <span className="muted">Opening…</span>}
    </div>
  );
}

function Progress({ points, item, title, units, onBack, onSession }: {
  points: ProgressPoint[]; item: LibraryItem | undefined; title: string; units: "kg" | "lb"; onBack: () => void; onSession: (path: string) => void;
}) {
  const measure = item?.measure ?? "reps";
  const top = Math.max(1, ...points.map((p) => p.best));
  const sided = points.some((p) => p.left !== undefined);
  const unit = (n: number) => (measure === "time" ? `${n} s` : measure === "distance" ? `${n} m` : `${n}`);
  const recent = [...points].reverse();
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onBack}>‹ Back</Button></div>
      <h1 className="title">{title}</h1>
      <span className="muted">The best set of each session{measure === "reps" ? " (load × reps where there's load)" : ""}. <span className="strong">Modified</span> sessions aren't like for like.</span>
      {points.length === 0 ? <span className="muted">Not logged yet.</span> : null}
      {recent.length ? (
        <div className="card" style={{ padding: 0, gap: 0 }}>
          {recent.map((p) => (
            <button key={p.sessionPath + p.startedAt} type="button" className="result" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }} onClick={() => onSession(p.sessionPath)}>
              <span className="hrow" style={{ minHeight: 0 }}>
                <span>{day(p.startedAt)} {p.modified ? <Tag warn>Modified</Tag> : null}</span>
                <span className="strong num">{describeSet({ id: "x", ...p.set } as LoggedSet, measure, (kg) => showLoad(kg, units))}</span>
              </span>
              <span aria-hidden="true" style={{ height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${(p.best / top) * 100}%`, background: p.modified ? "var(--line-strong)" : "var(--accent)" }} />
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {sided ? (
        <>
          <span className="label">Left and right</span>
          <div className="card" style={{ gap: 0 }}>
            <div className="set-row"><span className="muted">Session</span><span className="muted num" style={{ display: "flex", gap: 24 }}><span>Left</span><span>Right</span></span></div>
            {recent.filter((p) => p.left !== undefined).map((p) => {
              const gap = Math.abs((p.left ?? 0) - (p.right ?? 0)) / Math.max(1, p.left ?? 0, p.right ?? 0);
              return (
                <div key={p.sessionPath} className="set-row">
                  <span>{day(p.startedAt)}{gap >= 0.2 ? <> <Tag warn>Uneven</Tag></> : null}</span>
                  <span className="strong num" style={{ display: "flex", gap: 24 }}><span>{unit(p.left ?? 0)}</span><span>{unit(p.right ?? 0)}</span></span>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
