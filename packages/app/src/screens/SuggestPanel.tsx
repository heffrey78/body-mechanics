import { useMemo, useState } from "react";
import { AREAS, KINDS, MODES, MODE_SPECS, concerns, modifierInfo, showLoad, suggest, type Body, type Kind, type LibraryItem, type Location, type Mode, type RecordIndex, type Region, type Suggestion } from "@bm/engine";
import { Button, Chip, Segmented, Tag } from "../ui/components.tsx";
import { KIND_LABEL } from "../ui/labels.ts";
import { SWEAT_WORDS } from "./LocationsScreen.tsx";

/** The Suggest next answers (#3, #43): kept with the session, so later suggestions are one tap. */
export interface SuggestAnswers {
  location?: string;
  minutes?: number;
  sweat: 0 | 1 | 2;
  area: Region[];
  kinds: Kind[];
  /** What the session is for (#100, #113); absent: a workout. */
  mode?: Mode;
}

/** The engine's answers from the form's, with the minutes left. */
export const engineAnswers = (a: SuggestAnswers, location: Location | undefined, minutesLeft: number | undefined) => ({
  ...(location ? { location } : {}), ...(minutesLeft !== undefined ? { minutesLeft } : {}), sweat: a.sweat, area: a.area, kinds: a.kinds,
  ...(a.mode ? { mode: a.mode } : {}),
});

type AreaChoice = "whole" | "upper" | "lower" | "core";
const AREA_LABEL: Record<AreaChoice, string> = { whole: "Whole body", upper: "Upper body", lower: "Lower body", core: "Core" };
const areaOf = (area: Region[]): AreaChoice =>
  (["upper", "lower", "core"] as const).find((k) => AREAS[k].length === area.length && AREAS[k].every((r) => area.includes(r))) ?? "whole";
const MINUTES = [10, 20, 30, 45, 60] as const;

/** The doses in words: "2 × 10 reps · 16 kg", "2 × 30 s each side". */
export function describeDose(s: Suggestion, units: "kg" | "lb"): string {
  const unit = s.item.measure === "reps" ? " reps" : s.item.measure === "time" ? " s" : " m";
  return `${s.sets} × ${s.amount}${unit}${s.item.sided ? " each side" : ""}${s.loadKg ? ` · ${showLoad(s.loadKg, units)}` : ""}`;
}

/**
 * Suggest next (#43): the questions the first time (location preselected, sweat from it, time,
 * focus), then straight to a suggestion with the same answers. Start takes it; Another idea moves
 * down the ranks; Not this turns it down for the session; Change answers goes back to the questions.
 */
export function SuggestPanel({ answers, defaultLocation, locations, library, index, body, standsIn, done, startedAt, seed, refused, units, onAnswers, onRefuse, onAccept, onClose }: {
  /** This session's answers, or null when they haven't been given yet. */
  answers: SuggestAnswers | null;
  /** Where Home says you are, for the first question. */
  defaultLocation: string | null;
  locations: Location[];
  library: LibraryItem[];
  index: RecordIndex | null;
  /** Marks and conditions (#47). */
  body: Body;
  /** Your own equipment → the built-in items it stands in for (#60). */
  standsIn: ReadonlyMap<string, readonly string[]>;
  done: string[];
  /** When the session started (for time left); undefined before one has. */
  startedAt?: string;
  seed: string;
  refused: ReadonlySet<string>;
  units: "kg" | "lb";
  onAnswers: (a: SuggestAnswers) => void;
  onRefuse: (exercise: string) => void;
  onAccept: (s: Suggestion) => void;
  onClose: () => void;
}) {
  const [asking, setAsking] = useState(answers === null);
  const [rank, setRank] = useState(0);
  const ranked = useMemo(() => {
    if (!answers) return [];
    const location = locations.find((l) => l.id === answers.location);
    const elapsed = startedAt ? (Date.now() - Date.parse(startedAt)) / 60_000 : 0;
    const minutesLeft = answers.minutes !== undefined ? Math.max(0, Math.floor(answers.minutes - elapsed)) : undefined;
    const fortnight = Date.now() - 14 * 86_400_000;
    return suggest(
      engineAnswers(answers, location, minutesLeft),
      {
        library, done, refused, units, now: new Date(), seed, body: concerns(body), standsIn,
        history: (index?.sessions() ?? []).filter((s) => Date.parse(s.startedAt) >= fortnight && (!startedAt || s.startedAt !== startedAt)),
        lastTime: (x) => index?.lastTime(x, startedAt)?.entry,
      },
    );
  }, [answers, locations, library, index, body, done, refused, units, seed, startedAt, standsIn]);

  if (asking || !answers) {
    return <Questions initial={answers} defaultLocation={defaultLocation} locations={locations} onDone={(a) => { onAnswers(a); setRank(0); setAsking(false); }} onClose={onClose} />;
  }
  const s = ranked.length ? ranked[rank % ranked.length] : undefined;
  return (
    <div className="card" aria-label="Suggestion">
      <div className="hrow" style={{ minHeight: 0 }}>
        <span className="label">Suggest next</span>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
      {s ? (
        <>
          <h2 className="title" style={{ fontSize: 22 }}>{s.item.name}</h2>
          <span className="strong num">{describeDose(s, units)}</span>
          {s.modifiers.length ? <span className="tag" style={{ alignSelf: "flex-start" }}>{s.modifiers.map((m) => modifierInfo(m)?.label ?? m).join(" · ")}</span> : null}
          {s.caution ? <span className="warn-text">{s.caution}</span> : null}
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }} aria-label="Why this">
            {s.reasons.map((r) => <li key={r} className="muted">{r}</li>)}
          </ul>
          {s.item.own ? <Tag>Yours</Tag> : null}
          <Button variant="primary" xl onClick={() => onAccept(s)}>Start</Button>
          <div className="pair">
            <Button onClick={() => setRank((r) => r + 1)}>Another idea</Button>
            <Button onClick={() => { onRefuse(s.item.id); }}>Not this</Button>
          </div>
        </>
      ) : <span className="muted">Nothing fits those answers. Try more time, more sweat or a wider focus.</span>}
      <Button variant="ghost" onClick={() => setAsking(true)}>Change answers</Button>
    </div>
  );
}

export function Questions({ initial, defaultLocation, locations, onDone, onClose, title = "Suggest next", submit = "Suggest" }: {
  initial: SuggestAnswers | null; defaultLocation: string | null; locations: Location[]; onDone: (a: SuggestAnswers) => void; onClose: () => void; title?: string; submit?: string;
}) {
  const [location, setLocation] = useState<string | undefined>(initial ? initial.location : defaultLocation ?? undefined);
  const loc = locations.find((l) => l.id === location);
  // The mode (#113): the session's, else the location's usual one, else a workout.
  const [mode, setMode] = useState<Mode>(initial ? initial.mode ?? "workout" : loc?.mode ?? "workout");
  // A mode other than Workout starts from its own sweat; a workout from the location's.
  const sweatFor = (m: Mode, l: Location | undefined) => (m === "workout" ? l?.sweat ?? 1 : MODE_SPECS[m].sweat);
  const [sweat, setSweat] = useState<0 | 1 | 2>(initial?.sweat ?? sweatFor(mode, loc));
  const [minutes, setMinutes] = useState<number | undefined>(initial?.minutes);
  const [area, setArea] = useState<AreaChoice>(areaOf(initial?.area ?? []));
  const [kinds, setKinds] = useState<Kind[]>(initial?.kinds ?? []);
  return (
    <div className="card" aria-label={`${title} questions`}>
      <div className="hrow" style={{ minHeight: 0 }}>
        <span className="label">{title}</span>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
      <span className="label">For</span>
      <div className="chips" role="group" aria-label="What is this session for?">
        {MODES.map((m) => <Chip key={m} on={mode === m} onClick={() => { setMode(m); setSweat(sweatFor(m, loc)); }}>{MODE_SPECS[m].label}</Chip>)}
      </div>
      {locations.length ? (
        <>
          <span className="label">Where</span>
          <div className="chips">
            {locations.map((l) => (
              <Chip key={l.id} on={l.id === location} onClick={() => {
                // The location's sweat is the starting answer; changing it here is for this session only.
                const next = l.id === location ? undefined : l.id;
                setLocation(next);
                const nl = locations.find((x) => x.id === next);
                // A place with a usual mode (#113) starts from it; otherwise the mode stays as picked.
                const nm = nl?.mode ?? mode;
                if (nl?.mode) setMode(nl.mode);
                if (nl) setSweat(sweatFor(nm, nl));
              }}>{l.name}</Chip>
            ))}
          </div>
        </>
      ) : null}
      <span className="label">Time</span>
      <div className="chips">
        {MINUTES.map((m) => <Chip key={m} on={minutes === m} onClick={() => setMinutes(minutes === m ? undefined : m)}>{m} min</Chip>)}
        <Chip on={minutes === undefined} onClick={() => setMinutes(undefined)}>No limit</Chip>
      </div>
      <span className="label">Sweat</span>
      <Segmented label="Sweat" value={String(sweat) as "0" | "1" | "2"} onChange={(v) => setSweat(Number(v) as 0 | 1 | 2)}
        options={(["0", "1", "2"] as const).map((id) => ({ id, label: SWEAT_WORDS[Number(id)]! }))} />
      <span className="label">Focus</span>
      <div className="chips">{(Object.keys(AREA_LABEL) as AreaChoice[]).map((a) => <Chip key={a} on={area === a} onClick={() => setArea(a)}>{AREA_LABEL[a]}</Chip>)}</div>
      {/* The kinds shape a workout; the other modes pick their own (#113). */}
      {mode === "workout" ? (
        <>
          <div className="chips">
            {KINDS.map((k) => <Chip key={k} on={kinds.includes(k)} onClick={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])}>{KIND_LABEL[k]}</Chip>)}
          </div>
          <span className="muted">No kind chosen: a balanced mix.</span>
        </>
      ) : null}
      <Button variant="primary" xl onClick={() => onDone({
        ...(location ? { location } : {}), ...(minutes ? { minutes } : {}), sweat, area: area === "whole" ? [] : AREAS[area],
        kinds: mode === "workout" ? kinds : [], ...(mode !== "workout" ? { mode } : {}),
      })}>{submit}</Button>
    </div>
  );
}
