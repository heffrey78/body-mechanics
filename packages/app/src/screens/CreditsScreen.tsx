import { catalogue } from "@bm/engine";
import { Button } from "../ui/components.tsx";

/** More › Credits (#26, #27): every catalogue exercise's source, licence and authors (D3). */
export function CreditsScreen({ onBack }: { onBack: () => void }) {
  const entries = [...catalogue().entries].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onBack}>‹ More</Button></div>
      <h1 className="title">Credits</h1>
      <p className="muted" style={{ margin: 0 }}>
        The exercise catalogue is published under CC-BY-SA 4.0. Exercises from wger (wger.de) keep their own licences and authors, listed here.
      </p>
      <div className="card" style={{ padding: 0, gap: 0 }}>
        {entries.map((e) => (
          <div key={e.id} className="set-row" style={{ padding: "10px 16px", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
            <span className="strong">{e.name}</span>
            <span className="muted" style={{ fontSize: 13 }}>
              {e.source.kind === "wger" ? `wger ${e.source.id} · ${e.source.url}` : "Body Mechanics"} · {e.licence.name} · {e.authors.join(", ")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
