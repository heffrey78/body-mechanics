import type { ReactNode } from "react";

/** The shared components (#23): markup and classes only; every colour and size comes from the theme. */

export function Button({ variant = "secondary", xl = false, disabled = false, onClick, children }: { variant?: "primary" | "secondary" | "stop" | "ghost"; xl?: boolean; disabled?: boolean; onClick?: () => void; children: ReactNode }) {
  return <button type="button" className={`btn ${variant}${xl ? " xl" : ""}`} disabled={disabled} onClick={onClick}>{children}</button>;
}

export function Chip({ on = false, onClick, children }: { on?: boolean; onClick?: () => void; children: ReactNode }) {
  return <button type="button" className="chip" aria-pressed={on} onClick={onClick}>{children}</button>;
}

export function Tag({ warn = false, children }: { warn?: boolean; children: ReactNode }) {
  return <span className={warn ? "tag warn" : "tag"}>{children}</span>;
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="card">{children}</div>;
}

export function SetRow({ label, value }: { label: string; value: string }) {
  return <div className="set-row"><span className="muted">{label}</span><span className="strong num">{value}</span></div>;
}

export function Timer({ seconds, label }: { seconds: number; label?: string }) {
  const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return <div className="timer" role="timer" aria-label={label ?? text}>{text}</div>;
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  );
}

export function Stepper({ label, value, onLess, onMore }: { label: string; value: string; onLess: () => void; onMore: () => void }) {
  return (
    <div className="stepper">
      <span className="muted" style={{ width: 64 }}>{label}</span>
      <button type="button" className="mini" aria-label={`Less ${label.toLowerCase()}`} onClick={onLess}>−</button>
      <span className="value" aria-live="polite">{value}</span>
      <button type="button" className="mini" aria-label={`More ${label.toLowerCase()}`} onClick={onMore}>+</button>
    </div>
  );
}

const MARK_LETTER = { pain: "P", stiffness: "S", weakness: "W", injury: "I", condition: "C" } as const;
export function MarkBadge({ kind }: { kind: keyof typeof MARK_LETTER }) {
  return <span className={`badge k-${kind}`} role="img" aria-label={kind}>{MARK_LETTER[kind]}</span>;
}

export type TabId = "home" | "routines" | "history" | "body" | "more";
const TABS: { id: TabId; label: string }[] = [
  { id: "home", label: "Home" }, { id: "routines", label: "Routines" }, { id: "history", label: "History" },
  { id: "body", label: "Body" }, { id: "more", label: "More" },
];
export function BottomTabs({ current, onChange }: { current: TabId; onChange: (t: TabId) => void }) {
  return (
    <nav className="tabs" aria-label="Main">
      {TABS.map((t) => <button key={t.id} type="button" className="tab" aria-current={t.id === current ? "page" : undefined} onClick={() => onChange(t.id)}>{t.label}</button>)}
    </nav>
  );
}
