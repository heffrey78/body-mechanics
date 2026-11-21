import { useState } from "react";
import { currentState, isActive, type Body, type BodyLink, type Condition, type Mark, type Region, type Side } from "@bm/engine";
import { Button, Chip } from "../ui/components.tsx";
import { KIND_WORD, markTitle, placeLabel, type NewMarkFields } from "../screens/BodyScreen.tsx";
import { BodyFigure, type AreaState } from "./BodyFigure.tsx";

const covers = (side: Side, slotSide: Side) => side === slotSide || side === "both" || slotSide === "none";
const letterOf = (x: Mark | Condition) => (x.type === "mark" ? x.kind[0]!.toUpperCase() : "C");

/** A mark's or condition's name with its letter, as the body map shows it: "P · Left knee · pain". */
export function bodyLinkName(link: BodyLink, body: Body): string {
  const x = link.type === "mark" ? body.marks.find((m) => m.id === link.id) : body.conditions.find((c) => c.id === link.id);
  if (!x) return link.type === "mark" ? "A mark since deleted" : "A condition since deleted";
  return `${letterOf(x)} · ${x.type === "mark" ? markTitle(x) : x.name}`;
}

/**
 * What an exercise bothered (#99): asked when its effort was hard or painful. The active marks and
 * conditions as chips to tick, and Body to pick an area on the figure, which links what's marked there.
 * An unmarked area is only picked: it becomes a pain mark when Done is pressed, and tapping it again
 * or leaving the prompt drops it, so a stray tap makes nothing.
 */
export function BodyLinks({ title, body, links, onChange, onNewMark, onDone }: {
  title: string; body: Body; links: BodyLink[];
  onChange: (links: BodyLink[]) => void;
  /** Make and save a mark; returns its id. */
  onNewMark: (f: NewMarkFields) => string;
  onDone: () => void;
}) {
  const [figure, setFigure] = useState(false);
  /** Unmarked areas picked on the figure: marks to make on Done. */
  const [fresh, setFresh] = useState<{ region: Region; side: Side }[]>([]);
  const isFresh = (region: Region, side: Side) => fresh.some((f) => f.region === region && f.side === side);
  const drop = (region: Region, side: Side) => setFresh(fresh.filter((f) => !(f.region === region && f.side === side)));
  const now = new Date();
  const has = (id: string) => links.some((l) => l.id === id);
  const marks = body.marks.filter((m) => isActive(m, now) || has(m.id));
  const conditions = body.conditions.filter((c) => isActive(c, now) || has(c.id));
  const toggle = (x: Mark | Condition) => onChange(has(x.id) ? links.filter((l) => l.id !== x.id) : [...links, { type: x.type, id: x.id }]);

  const markAt = (region: Region, side: Side) => marks.filter((m) => m.region === region && covers(m.side, side))
    .sort((a, b) => (currentState(b)?.severity ?? 0) - (currentState(a)?.severity ?? 0))[0];
  const conditionAt = (region: Region, side: Side) => conditions.find((c) => c.regions.some((r) => r.region === region && covers(r.side, side)));
  const stateAt = (region: Region, side: Side): AreaState => {
    const top = markAt(region, side), cond = top ? undefined : conditionAt(region, side);
    const x = top ?? cond;
    if (!x && isFresh(region, side)) return { kind: "k-pain", letter: "+", label: `${placeLabel(region, side)}: new pain mark, picked` };
    const what = top ? KIND_WORD[top.kind].toLowerCase() : cond ? cond.name : "nothing marked";
    return { kind: top ? `k-${top.kind}` : cond ? "k-condition" : "", letter: x ? (has(x.id) ? "✓" : letterOf(x)) : "", label: `${placeLabel(region, side)}: ${what}${x && has(x.id) ? ", linked" : ""}` };
  };
  const pick = (region: Region, side: Side) => {
    const x = markAt(region, side) ?? conditionAt(region, side);
    if (x) return toggle(x);
    // Nothing marked there yet: picked for now, and tapped again to unpick. Done makes the mark.
    if (isFresh(region, side)) drop(region, side);
    else setFresh([...fresh, { region, side }]);
  };
  const done = () => {
    // The picked areas become pain marks from today, to be filled in on the Body tab.
    const made = fresh.map((f): BodyLink => ({ type: "mark", id: onNewMark({ ...f, kind: "pain", onset: now.toISOString().slice(0, 10), severity: 2 }) }));
    if (made.length) onChange([...links, ...made]);
    setFresh([]);
    onDone();
  };

  return (
    <div className="card" aria-label={title}>
      <span className="strong">{title}</span>
      {marks.length || conditions.length || fresh.length ? (
        <div className="chips">
          {[...marks, ...conditions].map((x) => <Chip key={x.id} on={has(x.id)} onClick={() => toggle(x)}>{letterOf(x)} · {x.type === "mark" ? markTitle(x) : x.name}</Chip>)}
          {fresh.map((f) => <Chip key={`${f.region}-${f.side}`} on onClick={() => drop(f.region, f.side)}>New · {placeLabel(f.region, f.side)} · pain</Chip>)}
        </div>
      ) : <span className="muted">Nothing is marked on your body yet. Body lets you pick where.</span>}
      {figure ? (
        <>
          <div className="figures">
            <figure><BodyFigure face="front" stateAt={stateAt} onPick={pick} /><figcaption><span>Right</span><span className="strong">Front</span><span>Left</span></figcaption></figure>
            <figure><BodyFigure face="back" stateAt={stateAt} onPick={pick} /><figcaption><span>Left</span><span className="strong">Back</span><span>Right</span></figcaption></figure>
          </div>
          <span className="muted" style={{ fontSize: 13 }}>Tap an area to pick it, and again to unpick it. What's marked there is linked. An unmarked area becomes a new pain mark only when you press {fresh.length ? `"${fresh.length === 1 ? "Add mark and finish" : "Add marks and finish"}"` : "the button below"}.</span>
        </>
      ) : null}
      <div className="pair">
        <Button onClick={() => setFigure(!figure)}>{figure ? "Hide the body" : "Body"}</Button>
        <Button variant={links.length || fresh.length ? "primary" : "secondary"} onClick={done}>{fresh.length ? (fresh.length === 1 ? "Add mark and finish" : "Add marks and finish") : links.length ? "Done" : "Skip"}</Button>
      </div>
    </div>
  );
}
