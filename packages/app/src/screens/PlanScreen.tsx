import { useMemo, useState } from "react";
import {
  FIELD, buildPlan, concerns, describeConcern, modifiersOf, newId, type Body, type LibraryItem, type Location, type RecordIndex, type RoutineItem, type Suggestion,
} from "@bm/engine";
import { Button, Tag } from "../ui/components.tsx";
import { modifierText } from "../ui/ModifierPicker.tsx";
import { Questions, describeDose, type SuggestAnswers } from "./SuggestPanel.tsx";

/** A suggestion as a planned item: its dose and modifiers become the targets (#36). */
export function planItem(s: Suggestion): RoutineItem {
  return {
    id: newId(), exercise: s.item.id, sets: s.sets, [FIELD[s.item.measure]]: s.amount,
    ...(s.loadKg !== undefined ? { loadKg: s.loadKg } : {}),
    ...(s.modifiers.length ? { modifiers: modifiersOf(s.modifiers) } : {}),
  } as RoutineItem;
}

/**
 * Plan a session (#50): the focus questions, then a plan built around the body: sections by kind, each
 * exercise with why, how to do it gently, Swap; what the plan leaves alone; Start runs it as a plan.
 */
export function PlanScreen({ defaultLocation, locations, library, index, body, units, onStart, onBack }: {
  defaultLocation: string | null;
  locations: Location[];
  library: LibraryItem[];
  index: RecordIndex | null;
  body: Body;
  units: "kg" | "lb";
  onStart: (items: RoutineItem[]) => void;
  onBack: () => void;
}) {
  const [answers, setAnswers] = useState<SuggestAnswers | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [seed] = useState(() => new Date().toISOString());
  const plan = useMemo(() => {
    if (!answers) return null;
    const location = locations.find((l) => l.id === answers.location);
    const fortnight = Date.now() - 14 * 86_400_000;
    return buildPlan(
      { ...(location ? { location } : {}), ...(answers.minutes ? { minutesLeft: answers.minutes } : {}), sweat: answers.sweat, area: answers.area, kinds: answers.kinds },
      {
        library, done: [], refused: new Set(), units, now: new Date(), seed, body: concerns(body),
        history: (index?.sessions() ?? []).filter((s) => Date.parse(s.startedAt) >= fortnight),
        lastTime: (x) => index?.lastTime(x)?.entry,
      },
      skip,
    );
  }, [answers, locations, library, index, body, units, seed, skip]);

  if (!answers || !plan) {
    return (
      <div className="pad">
        <div className="hrow"><Button variant="ghost" onClick={onBack}>‹ Home</Button></div>
        <h1 className="title">Start a session</h1>
        <span className="muted">Pick a focus. The plan works around what's marked on your body; swap anything, and in the session Suggest next gives one more idea at a time.</span>
        <Questions initial={null} defaultLocation={defaultLocation} locations={locations} onDone={(a) => { setSkip(new Set()); setAnswers(a); }} onClose={onBack} submit="Build my plan" />
      </div>
    );
  }
  const items = plan.sections.flatMap((s) => s.items);
  return (
    <div className="pad">
      <div className="hrow">
        <Button variant="ghost" onClick={() => setAnswers(null)}>‹ Change focus</Button>
        <span className="muted num">{items.reduce((a, s) => a + s.minutes, 0)} min</span>
      </div>
      <h1 className="title">Your plan</h1>
      {plan.sections.map((sec) => (
        <div key={sec.label} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label">{sec.label}</span>
          <div className="card" style={{ padding: 0, gap: 0 }}>
            {sec.items.map((s) => (
              <div key={s.item.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
                <div className="hrow" style={{ minHeight: 0 }}>
                  <span className="strong">{s.item.name}</span>
                  <button type="button" className="btn ghost" style={{ minHeight: 40 }} onClick={() => setSkip(new Set(skip).add(s.item.id))}>Swap</button>
                </div>
                <span className="muted num" style={{ fontSize: 14 }}>{describeDose(s, units)}</span>
                {s.modifiers.length ? <div className="chips"><Tag warn>{modifierText(s.modifiers.map((id) => ({ id })))}</Tag></div> : null}
                {s.reasons.slice(0, 2).map((r) => <span key={r} className="muted" style={{ fontSize: 13 }}>{r}</span>)}
                {s.caution ? <span className="warn-text" style={{ fontSize: 13 }}>{s.caution}</span> : null}
              </div>
            ))}
          </div>
        </div>
      ))}
      {!items.length ? <span className="muted">Nothing fits that focus here. Try more time, more sweat or another focus.</span> : null}
      {plan.notAffected.length ? <span className="muted">Not affected by this plan: {plan.notAffected.map(describeConcern).join(", ")}.</span> : null}
      <Button variant="primary" xl disabled={!items.length} onClick={() => onStart(items.map(planItem))}>Start</Button>
    </div>
  );
}
