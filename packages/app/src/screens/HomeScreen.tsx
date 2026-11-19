import { useMemo, useState, type ReactNode } from "react";
import { search, type LibraryItem, type Location, type Minding, type Routine, type WeekStrip } from "@bm/engine";
import { Button, Chip, Tag } from "../ui/components.tsx";
import { REGION_LABEL } from "../ui/labels.ts";

/**
 * Home (#2, #31, #73): the day and a greeting; where you are and Start a session; a Minding card per
 * active mark, saying what it changes; type what you're doing (results from the catalogue and your
 * own movements; Enter starts the top one only when every word matched, otherwise it opens the
 * new-movement form); your routines as cards; this week's sessions; recent exercises as chips.
 */
export function HomeScreen({ onPlan, library, recent, sessionOpen, locations, location, onLocation, onStart, onNew, onResume, minding, onCheckIn, routines, onRoutine, week, now = new Date() }: {
  /** The active marks and what they change (#73). */
  minding: Minding[];
  /** Open a mark on the Body tab to check in on it. */
  onCheckIn: (id: string) => void;
  /** Routines as cards (#73): the routine and its "35 min · 7 moves". */
  routines: { routine: Routine; meta: string }[];
  onRoutine: (r: Routine) => void;
  week: WeekStrip;
  now?: Date;
  /** Start a session: the focus, then a plan around the body (#50, #52). */
  onPlan: () => void;
  library: LibraryItem[];
  locations: Location[];
  /** Where the next session is (#41): the last one used, until changed. */
  location: string | null;
  onLocation: (id: string | null) => void;
  recent: LibraryItem[];
  sessionOpen: boolean;
  onStart: (item: LibraryItem) => void;
  onNew: (name: string) => void;
  onResume: () => void;
}) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => search(q, library), [q, library]);
  const enter = () => {
    const top = hits[0];
    if (top?.full) onStart(top.item);
    else if (q.trim()) onNew(q.trim());
  };
  return (
    <div className="pad">
      <span className="brand">Body Mechanics</span>
      <div>
        <p className="kicker">{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="title hello">{sessionOpen ? "Mid-session." : "Ready when you are."}</h1>
      </div>
      {sessionOpen ? <Button variant="primary" xl onClick={onResume}>Back to your session</Button> : null}
      {!sessionOpen && locations.length ? (
        <div className="chips" role="group" aria-label="Where are you?">
          {locations.map((l) => <Chip key={l.id} on={l.id === location} onClick={() => onLocation(l.id === location ? null : l.id)}>{l.name}</Chip>)}
        </div>
      ) : null}
      <input
        className="field" type="search" aria-label="What are you doing?" placeholder="What are you doing?" autoComplete="off"
        value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") enter(); }}
      />
      {q.trim() ? (
        <div className="card" style={{ padding: 0, gap: 0 }} role="list" aria-label="Matches">
          {hits.map((h) => (
            <button key={h.item.id} type="button" role="listitem" className="result" onClick={() => onStart(h.item)}>
              <span className="strong">{h.item.name}</span>
              <span className="chips" style={{ gap: 6 }}>
                {h.item.works[0] ? <Tag>{REGION_LABEL[h.item.works[0]]}</Tag> : null}
                {h.item.own ? <Tag>Yours</Tag> : null}
              </span>
            </button>
          ))}
          <button type="button" className="result" onClick={() => onNew(q.trim())}>
            <span>+ New movement: <span className="strong">{q.trim()}</span></span>
          </button>
        </div>
      ) : null}
      {/* One way to get started (#52): a plan around the body; Suggest next lives in the session. */}
      {!sessionOpen && !q.trim() ? <Button variant="primary" xl onClick={onPlan}>Start a session</Button> : null}
      {!q.trim() ? minding.map((m) => (
        <section key={m.id} className="card minding" aria-label={m.title}>
          <span className="label"><span className="dot" aria-hidden="true" />Minding</span>
          <span className="place">{m.title}</span>
          <span>{m.line}</span>
          <Button variant="ghost" onClick={() => onCheckIn(m.id)}>{m.due ? "Time to check in" : "Check in on it"}</Button>
        </section>
      )) : null}
      {!q.trim() && routines.length ? (
        <section aria-label="Routines" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="label">Routines</span>
          <div className="rgrid">
            {routines.map(({ routine, meta }) => (
              <button key={routine.id} type="button" className="rcard" disabled={sessionOpen} onClick={() => onRoutine(routine)}>
                <span className="name">{routine.name}</span>
                <span className="meta">{meta}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {!q.trim() ? (
        <section className="week" aria-label={`${week.count} ${week.count === 1 ? "session" : "sessions"} this week`}>
          <div className="days" aria-hidden="true">
            {week.days.map((d, i) => <span key={i} className={`day${d.done ? " done" : ""}${d.today ? " today" : ""}`}>{d.label}</span>)}
          </div>
          <span className="strong">{week.count} {week.count === 1 ? "session" : "sessions"} this week</span>
        </section>
      ) : null}
      {recent.length ? (
        <>
          <span className="label">Recent</span>
          <div className="chips">{recent.map((r) => <Chip key={r.id} onClick={() => onStart(r)}>{r.name}</Chip>)}</div>
        </>
      ) : null}
    </div>
  );
}
