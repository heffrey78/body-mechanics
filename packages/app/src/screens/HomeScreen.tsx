import { useMemo, useState, type ReactNode } from "react";
import { search, type LibraryItem, type Location } from "@bm/engine";
import { Button, Chip, Tag } from "../ui/components.tsx";
import { REGION_LABEL } from "../ui/labels.ts";

/**
 * Home (#2, #31): type what you're doing. Results come from the catalogue and your own movements;
 * Enter starts the top one only when every word matched, otherwise it opens the new-movement form.
 * Recent exercises sit below as chips.
 */
export function HomeScreen({ onPlan, library, recent, sessionOpen, locations, location, onLocation, onStart, onNew, onResume }: {
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
      <h1 className="title">Body Mechanics</h1>
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
      {recent.length ? (
        <>
          <span className="label">Recent</span>
          <div className="chips">{recent.map((r) => <Chip key={r.id} onClick={() => onStart(r)}>{r.name}</Chip>)}</div>
        </>
      ) : null}
    </div>
  );
}
