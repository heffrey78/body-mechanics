import { useState } from "react";
import type { Region, Side } from "@bm/engine";
import { BodyFigure, type AreaState } from "./BodyFigure.tsx";

const SAMPLE: Record<string, [string, string]> = {
  "shoulder/right": ["k-pain", "P"], "knee/left": ["k-injury", "I"], "lowerback/none": ["k-stiffness", "S"],
  "calf/right": ["k-condition", "C"], "core/none": ["k-weakness", "W"], "forearm/left": ["k-pain", "P"],
};

/** A development page (open the dev server at #body): the figure with a few sample marks (#89). */
export function BodySample() {
  const [last, setLast] = useState("Tap an area");
  const stateAt = (region: Region, side: Side): AreaState => {
    const s = SAMPLE[`${region}/${side}`];
    return { kind: s?.[0] ?? "", letter: s?.[1] ?? "", label: `${region} ${side}` };
  };
  const pick = (region: Region, side: Side) => setLast(`${region} / ${side}`);
  return (
    <div className="pad" style={{ maxWidth: 480, margin: "0 auto" }}>
      <h1 className="title">Body</h1>
      <span className="muted" id="picked">{last}</span>
      <div className="figures">
        <figure><BodyFigure face="front" stateAt={stateAt} onPick={pick} /><figcaption><span>Right</span><span className="strong">Front</span><span>Left</span></figcaption></figure>
        <figure><BodyFigure face="back" stateAt={stateAt} onPick={pick} /><figcaption><span>Left</span><span className="strong">Back</span><span>Right</span></figcaption></figure>
      </div>
    </div>
  );
}
