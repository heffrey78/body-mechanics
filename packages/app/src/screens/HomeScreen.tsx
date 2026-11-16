import { useMemo, useState } from "react";
import { search, type LibraryItem } from "@bm/engine";
import { Button, Chip, Tag } from "../ui/components.tsx";
import { REGION_LABEL } from "../ui/labels.ts";

/**
 * Home (#2, #31): type what you're doing. Results come from the catalogue and your own movements;
 * Enter starts the top one only when every word matched, otherwise it opens the new-movement form.
 * Recent exercises sit below as chips.
 */
export function HomeScreen({ library, recent, sessionOpen, onStart, onNew, onResume }: {
  library: LibraryItem[];
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
      {recent.length ? (
        <>
          <span className="label">Recent</span>
          <div className="chips">{recent.map((r) => <Chip key={r.id} onClick={() => onStart(r)}>{r.name}</Chip>)}</div>
        </>
      ) : null}
    </div>
  );
}
