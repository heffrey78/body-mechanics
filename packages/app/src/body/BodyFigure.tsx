import { SIDED_REGIONS, type Region, type Side } from "@bm/engine";
import { AREAS, HAND, HEAD, MIDLINE, MUSCLES, SCREEN_RIGHT, type Area, type Face } from "./figure.ts";

/** What one area shows: a kind class (`k-pain`…) or none, the letter on it, and its spoken label. */
export type AreaState = { kind: string; letter: string; label: string };

const MIRROR = "matrix(-1 0 0 1 200 0)";
const sided = (r: Region) => (SIDED_REGIONS as readonly Region[]).includes(r);
const other = (s: "left" | "right") => (s === "left" ? "right" : "left");

/**
 * One view of the body (#89): each area is a button, left and right apart for the regions that have
 * sides, one button across the midline for those that don't.
 */
export function BodyFigure({ face, stateAt, onPick }: {
  face: Face;
  /** `side` is the person's own; "none" for a region without sides. */
  stateAt: (region: Region, side: Side) => AreaState;
  onPick: (region: Region, side: Side) => void;
}) {
  const right = SCREEN_RIGHT[face];
  const letters: { key: string; x: number; y: number; kind: string; letter: string }[] = [];
  const button = (key: string, area: Area, side: Side, halves: ("near" | "far")[]) => {
    const s = stateAt(area.region, side);
    // The letter sits on the half the button covers; across the midline when it covers both.
    const x = area.whole || halves.length === 2 ? 100 : halves[0] === "near" ? area.at[0] : 200 - area.at[0];
    if (s.letter) letters.push({ key, x, y: area.at[1], kind: s.kind, letter: s.letter });
    return (
      <g key={key} role="button" tabIndex={0} className={`area ${s.kind}`} aria-label={s.label}
        onClick={() => onPick(area.region, side)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(area.region, side); } }}>
        {area.whole ? <path d={area.d} /> : halves.map((h) => <path key={h} d={area.d} {...(h === "far" ? { transform: MIRROR } : {})} />)}
      </g>
    );
  };
  const detail = (
    <>
      <path d={HAND} className="fig-plain" />
      {MUSCLES[face].map((d) => <path key={d} d={d} className="fig-line" />)}
    </>
  );
  return (
    <svg className="figure" viewBox="30 2 140 456" role="group" aria-label={`Body, ${face}`}>
      <ellipse {...HEAD} className="fig-plain" />
      {AREAS[face].flatMap((a) =>
        a.whole || !sided(a.region)
          ? [button(a.region, a, "none", ["near", "far"])]
          : [button(`${a.region}-far`, a, other(right), ["far"]), button(`${a.region}-near`, a, right, ["near"])])}
      <g aria-hidden="true" className="fig-detail">
        {detail}
        <g transform={MIRROR}>{detail}</g>
        <path d={MIDLINE[face]} className="fig-line" />
        {letters.map((l) => (
          <g key={l.key} className={`area-letter ${l.kind}`}>
            <circle cx={l.x} cy={l.y} r="7.5" />
            <text x={l.x} y={l.y} textAnchor="middle" dominantBaseline="central">{l.letter}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
