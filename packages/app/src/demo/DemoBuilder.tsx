import { useEffect, useMemo, useRef, useState } from "react";
import {
  BONES, DEMO_ANCHORS, DEMO_HOLDS, EQUIPMENT, PRESETS, copySide, demoFor, floorHeight, mirrorPose, newDemo, newId, otherSide, phaseOf,
  type Demo, type DemoAnchor, type DemoFrame, type DemoHold, type DemoPose, type DemoProp, type EquipmentItem, type Joint, type Vec3,
} from "@bm/engine";
import { Button, Chip, Segmented, Stepper } from "../ui/components.tsx";
import { equipmentLabel } from "../ui/labels.ts";
import { StageView } from "./DemoPlayer.tsx";
import { HOLDABLE, propModels } from "./models.ts";
import type { DemoStage } from "./types.ts";

const JOINT_LABEL: Record<Joint, string> = {
  pelvis: "Whole body", spine: "Waist", chest: "Chest", neck: "Neck", head: "Head",
  shoulderL: "Left shoulder", elbowL: "Left elbow", wristL: "Left wrist", shoulderR: "Right shoulder", elbowR: "Right elbow", wristR: "Right wrist",
  hipL: "Left hip", kneeL: "Left knee", ankleL: "Left ankle", hipR: "Right hip", kneeR: "Right knee", ankleR: "Right ankle",
};
/** The joints as the picker lists them: the trunk, then each limb's joints, left beside right. */
const PICKER: Joint[][] = [
  ["head", "neck", "chest", "spine"],
  ["shoulderL", "elbowL", "wristL"], ["shoulderR", "elbowR", "wristR"],
  ["hipL", "kneeL", "ankleL"], ["hipR", "kneeR", "ankleR"],
];

/** One slider of a joint: which of [forward, side, twist] it moves, how far, and what the ends mean. */
interface Axis { label: string; i: 0 | 1 | 2; min: number; max: number; flip?: true }
const TRUNK: Axis[] = [
  { label: "Bend back ↔ forward", i: 0, min: -60, max: 90 }, { label: "Lean right ↔ left", i: 1, min: -45, max: 45 }, { label: "Turn right ↔ left", i: 2, min: -80, max: 80 },
];
const AXES: Record<string, Axis[]> = {
  spine: TRUNK, chest: TRUNK, neck: TRUNK, head: TRUNK,
  shoulder: [{ label: "Back ↔ forward and up", i: 0, min: -60, max: 180 }, { label: "Out to the side", i: 1, min: -30, max: 180 }, { label: "Twist in ↔ out", i: 2, min: -90, max: 90 }],
  elbow: [{ label: "Bend", i: 0, min: 0, max: 150 }, { label: "Turn the forearm in ↔ out", i: 2, min: -90, max: 90 }],
  wrist: [{ label: "Bend back ↔ forward", i: 0, min: -80, max: 80 }, { label: "Tilt", i: 1, min: -40, max: 40 }],
  hip: [{ label: "Back ↔ forward and up", i: 0, min: -40, max: 140 }, { label: "Out to the side", i: 1, min: -30, max: 90 }, { label: "Twist in ↔ out", i: 2, min: -60, max: 60 }],
  knee: [{ label: "Bend", i: 0, min: 0, max: 150, flip: true }],
  ankle: [{ label: "Toes down ↔ up", i: 0, min: -60, max: 40 }, { label: "Turn in ↔ out", i: 2, min: -40, max: 40 }],
};
const BODY_TURN: Axis[] = [
  { label: "Tip back ↔ forward", i: 0, min: -180, max: 180 }, { label: "Lean right ↔ left", i: 1, min: -90, max: 90 }, { label: "Turn right ↔ left", i: 2, min: -180, max: 180 },
];
const ANCHOR_LABEL: Record<DemoAnchor, string> = { floor: "On the floor", feet: "Both feet", "left-foot": "Left foot", "right-foot": "Right foot", hands: "Hands", free: "Nothing" };
const ANCHOR_HELP: Record<DemoAnchor, string> = {
  floor: "The body always rests on the floor, whatever its lowest point is. Height is set for you.",
  feet: "The feet stay where the first key pose puts them; the body moves over them.",
  "left-foot": "The left foot stays where the first key pose puts it.",
  "right-foot": "The right foot stays where the first key pose puts it.",
  hands: "The hands stay where the first key pose puts them (on a bar, a bench, the floor).",
  free: "Nothing is held in place: every key pose's position is used as it is.",
};
const HOLD_LABEL: Record<DemoHold, string> = { none: "Placed", left: "Left", right: "Right", both: "Both" };

/** A labelled slider with nudge buttons, for angles and distances. */
function Slider({ label, value, min, max, step = 1, unit = "°", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.round(Math.max(min, Math.min(max, v)) / step) * step;
  const shown = step < 1 ? value.toFixed(2) : String(Math.round(value));
  const nudge = step < 1 ? step * 5 : 5;
  return (
    <label className="slider">
      <span className="slider-head"><span>{label}</span><span className="num strong">{shown}{unit}</span></span>
      <span className="slider-row">
        <button type="button" className="mini" aria-label={`Less: ${label}`} onClick={() => onChange(clamp(value - nudge))}>−</button>
        <input type="range" min={min} max={max} step={step} value={Math.max(min, Math.min(max, value))} onChange={(e) => onChange(clamp(Number(e.target.value)))} />
        <button type="button" className="mini" aria-label={`More: ${label}`} onClick={() => onChange(clamp(value + nudge))}>+</button>
      </span>
    </label>
  );
}

const DEFAULT_AT: Partial<Record<string, Vec3>> = { wall: [0, 0, -0.5], "pullup-bar": [0, 2.25, 0], cable: [0, 0, -1], dumbbells: [0.5, 0, 0.2], kettlebell: [0.5, 0, 0.2], "foam-roller": [0.6, 0, 0], band: [0.5, 0, 0.2] };

/**
 * The demonstration builder (#83): key poses on a timeline, each posed joint by joint with sliders,
 * with equipment placed or held, and the loop's timing. Nothing is saved until Save.
 */
export function DemoBuilder({ name, exercise, current, custom, needs, onSave, onCancel }: {
  name: string; exercise: string; current: ReturnType<typeof demoFor>; custom: EquipmentItem[];
  /** The equipment the exercise mentions: offered first. */
  needs: string[];
  onSave: (d: Demo) => void; onCancel: () => void;
}) {
  const [demo, setDemo] = useState<Demo>(() => current?.own ?? newDemo(exercise, current?.clip));
  const frames = useMemo(() => [...demo.frames].sort((a, b) => a.t - b.t), [demo.frames]);
  const [frameId, setFrameId] = useState(frames[0]!.id);
  const frame = frames.find((f) => f.id === frameId) ?? frames[0]!;
  const [joint, setJoint] = useState<Joint | null>(null);
  const [tab, setTab] = useState<"pose" | "body" | "gear" | "timing">("body");
  const [bothSides, setBothSides] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [stage, setStage] = useState<DemoStage | null>(null);
  const modelOf = useMemo(() => propModels(custom), [custom]);
  const names = useMemo(() => new Map(custom.map((c) => [c.id, c])), [custom]);

  // ---------------------------------------------------------------- drawing
  const framed = useRef(false);
  useEffect(() => { stage?.setProps(demo.props, modelOf); }, [stage, demo.props, modelOf]);
  useEffect(() => {
    if (!stage) return;
    if (!framed.current) { stage.frame(demo); framed.current = true; }
    stage.select(playing ? null : tab === "body" ? "pelvis" : tab === "pose" ? joint : null);
    if (!playing) { stage.drawPose(demo, frame.pose); return; }
    let raf = 0, last = performance.now(), phase = phaseOf(demo, frame.t);
    const tick = (now: number) => {
      phase = (phase + Math.min(0.1, (now - last) / 1000) / demo.seconds) % 1;
      last = now;
      stage.drawPhase(demo, phase);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, demo, frame, joint, tab, playing]);
  const recentre = () => { stage?.frame(demo); stage?.render(); };

  // ---------------------------------------------------------------- editing
  const setFrame = (patch: Partial<DemoFrame>) => setDemo((d) => ({ ...d, frames: d.frames.map((f) => (f.id === frame.id ? { ...f, ...patch } : f)) }));
  const setPose = (pose: DemoPose) => setFrame({ pose });
  const setAngle = (j: Joint, a: Axis, shown: number) => {
    const v = a.flip ? -shown : shown;
    if (j === "pelvis") { const turn = [...frame.pose.turn] as Vec3; turn[a.i] = v; return setPose({ ...frame.pose, turn }); }
    const next = [...(frame.pose.joints[j] ?? [0, 0, 0])] as Vec3;
    next[a.i] = v;
    const joints = { ...frame.pose.joints, [j]: next };
    if (bothSides && BONES[j].side !== 0) {
      const other = [...(frame.pose.joints[otherSide(j)] ?? [0, 0, 0])] as Vec3;
      other[a.i] = v;
      joints[otherSide(j)] = other;
    }
    setPose({ ...frame.pose, joints });
  };
  const angle = (j: Joint, a: Axis) => { const v = (j === "pelvis" ? frame.pose.turn : frame.pose.joints[j] ?? [0, 0, 0])[a.i]; return a.flip ? -v : v; };
  const setAt = (i: 0 | 1 | 2, v: number) => { const at = [...frame.pose.at] as Vec3; at[i] = v; setPose({ ...frame.pose, at }); };

  const addFrame = () => {
    const i = frames.indexOf(frame), after = frames[i + 1];
    const id = newId();
    const copy = (t: number): DemoFrame => ({ id, t, pose: JSON.parse(JSON.stringify(frame.pose)) as DemoPose });
    setDemo((d) => {
      if (after) return { ...d, frames: [...d.frames, copy(Math.round(((frame.t + after.t) / 2) * 100) / 100)] };
      // After the last one: the new pose ends the loop, and the old last moves back to make room.
      const before = frames[i - 1];
      const moved = frame.t >= 0.99 ? Math.round((((before?.t ?? 0) + 1) / 2) * 100) / 100 : frame.t;
      return { ...d, frames: [...d.frames.map((f) => (f.id === frame.id ? { ...f, t: moved } : f)), copy(1)] };
    });
    setFrameId(id);
  };
  const removeFrame = () => {
    const i = frames.indexOf(frame);
    setDemo((d) => ({ ...d, frames: d.frames.filter((f) => f.id !== frame.id) }));
    setFrameId((frames[i - 1] ?? frames[i + 1])!.id);
  };

  const setProp = (id: string, patch: Partial<DemoProp>) => setDemo((d) => ({ ...d, props: d.props.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const addProp = (kind: string) => {
    const model = modelOf(kind);
    const hold: DemoHold = model === "dumbbells" || model === "barbell" || model === "band" ? "both" : "none";
    setDemo((d) => ({ ...d, props: [...d.props, { id: newId(), kind: kind as DemoProp["kind"], hold, at: DEFAULT_AT[model] ?? [0, 0, 0], turn: 0 }] }));
  };
  const gear = [...new Set([...needs, ...EQUIPMENT.filter((e) => e !== "floor"), ...custom.map((c) => c.id)])].filter((e) => e !== "floor");

  const group = joint && joint !== "pelvis" ? joint.replace(/[LR]$/, "") : null;
  const sided = !!joint && BONES[joint].side !== 0;

  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onCancel}>‹ Cancel</Button><Button variant="primary" onClick={() => onSave(demo)}>Save</Button></div>
      <span className="muted">Demonstration · {name}</span>

      {/* The model stays in view while the controls below it scroll. */}
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--bg)", paddingBottom: 6 }}>
      <StageView height={280} full onStage={setStage} onTap={(x, y) => {
          const j = stage?.pick(x, y);
          if (!j) return;
          setPlaying(false);
          if (j === "pelvis") setTab("body"); else { setJoint(j); setTab("pose"); }
        }} />
      </div>
      <span className="muted" style={{ fontSize: 13 }}>Drag to look around, pinch to zoom. Tap a joint to pose it.</span>

      <div className="chips" role="group" aria-label="Key poses">
        {frames.map((f, i) => <Chip key={f.id} on={!playing && f.id === frame.id} onClick={() => { setPlaying(false); setFrameId(f.id); }}>Pose {i + 1}</Chip>)}
        <Chip onClick={addFrame}>+ Add</Chip>
        <Chip on={playing} onClick={() => setPlaying(!playing)}>{playing ? "Stop" : "Play"}</Chip>
        <Chip onClick={recentre}>Recentre</Chip>
      </div>

      <Segmented label="What to change" value={tab} onChange={(t) => { setPlaying(false); setTab(t); }}
        options={[{ id: "body", label: "Body" }, { id: "pose", label: "Joints" }, { id: "gear", label: "Equipment" }, { id: "timing", label: "Timing" }]} />

      {tab === "body" ? (
        <>
          <span className="label">Start this pose from</span>
          <div className="chips">
            {PRESETS.map((p) => <Chip key={p.id} onClick={() => {
              // The first key pose's starting position also sets what stays put, which suits it.
              setDemo((d) => ({ ...d, ...(frame.id === frames[0]!.id ? { anchor: p.anchor } : {}), frames: d.frames.map((f) => (f.id === frame.id ? { ...f, pose: JSON.parse(JSON.stringify(p.pose)) as DemoPose } : f)) }));
              framed.current = false;
            }}>{p.name}</Chip>)}
          </div>
          <span className="label">Whole body</span>
          {BODY_TURN.map((a) => <Slider key={a.label} label={a.label} min={a.min} max={a.max} value={angle("pelvis", a)} onChange={(v) => setAngle("pelvis", a, v)} />)}
          <Slider label="Right ↔ left" unit=" m" step={0.01} min={-1.5} max={1.5} value={frame.pose.at[0]} onChange={(v) => setAt(0, v)} />
          <Slider label="Back ↔ forward" unit=" m" step={0.01} min={-1.5} max={1.5} value={frame.pose.at[2]} onChange={(v) => setAt(2, v)} />
          {demo.anchor === "floor" ? null : <Slider label="Height of the hips" unit=" m" step={0.01} min={0} max={2.5} value={frame.pose.at[1]} onChange={(v) => setAt(1, v)} />}
          {demo.anchor === "floor" ? null : <Button variant="ghost" onClick={() => setAt(1, Math.round(floorHeight(frame.pose) * 100) / 100)}>Put this pose on the floor</Button>}
          <span className="label">What stays put</span>
          <div className="chips">{DEMO_ANCHORS.map((a) => <Chip key={a} on={demo.anchor === a} onClick={() => setDemo((d) => ({ ...d, anchor: a }))}>{ANCHOR_LABEL[a]}</Chip>)}</div>
          <span className="muted" style={{ fontSize: 13 }}>{ANCHOR_HELP[demo.anchor]}</span>
          <span className="label">Sides</span>
          <div className="chips">
            <Chip onClick={() => setPose(mirrorPose(frame.pose))}>Swap left and right</Chip>
            <Chip onClick={() => setPose(copySide(frame.pose, "L"))}>Copy left to right</Chip>
            <Chip onClick={() => setPose(copySide(frame.pose, "R"))}>Copy right to left</Chip>
          </div>
        </>
      ) : null}

      {tab === "pose" ? (
        <>
          {PICKER.map((row, i) => (
            <div key={i} className="chips">{row.map((j) => <Chip key={j} on={joint === j} onClick={() => setJoint(j)}>{JOINT_LABEL[j]}</Chip>)}</div>
          ))}
          {joint && group ? (
            <>
              <span className="label">{bothSides && sided ? JOINT_LABEL[joint].replace(/^(Left|Right) (.)/, (_m, _s, c: string) => `Both ${c}`) + "s" : JOINT_LABEL[joint]}</span>
              {AXES[group]!.map((a) => <Slider key={a.label} label={a.label} min={a.min} max={a.max} value={angle(joint, a)} onChange={(v) => setAngle(joint, a, v)} />)}
              {sided ? <div className="chips"><Chip on={bothSides} onClick={() => setBothSides(!bothSides)}>Move both sides together</Chip></div> : null}
            </>
          ) : <span className="muted">Pick a joint here, or tap one on the model.</span>}
        </>
      ) : null}

      {tab === "gear" ? (
        <>
          {demo.props.map((p) => {
            const model = modelOf(p.kind), canHold = HOLDABLE.includes(model);
            const placed = p.hold === "none" || model === "cable" || (model === "band" && p.hold !== "both");
            return (
              <div key={p.id} className="card" aria-label={equipmentLabel(p.kind, names)}>
                <div className="hrow" style={{ minHeight: 0 }}>
                  <span className="strong">{equipmentLabel(p.kind, names)}</span>
                  <button type="button" className="btn ghost" style={{ minHeight: 36 }} onClick={() => setDemo((d) => ({ ...d, props: d.props.filter((x) => x.id !== p.id) }))}>Remove</button>
                </div>
                {canHold ? <Segmented label="Placed, or in which hand" value={p.hold} onChange={(hold) => setProp(p.id, { hold })} options={DEMO_HOLDS.map((id) => ({ id, label: HOLD_LABEL[id] }))} /> : null}
                {placed ? (
                  <>
                    {model === "band" && p.hold !== "none" ? <span className="muted" style={{ fontSize: 13 }}>Where the other end is tied:</span> : null}
                    <Slider label="Right ↔ left" unit=" m" step={0.01} min={-2} max={2} value={p.at[0]} onChange={(v) => setProp(p.id, { at: [v, p.at[1], p.at[2]] })} />
                    <Slider label="Back ↔ forward" unit=" m" step={0.01} min={-2} max={2} value={p.at[2]} onChange={(v) => setProp(p.id, { at: [p.at[0], p.at[1], v] })} />
                    <Slider label="Height" unit=" m" step={0.01} min={0} max={2.6} value={p.at[1]} onChange={(v) => setProp(p.id, { at: [p.at[0], v, p.at[2]] })} />
                    <Slider label="Turn" min={-180} max={180} value={p.turn} onChange={(v) => setProp(p.id, { turn: v })} />
                  </>
                ) : null}
              </div>
            );
          })}
          <span className="label">Add equipment</span>
          <div className="chips">{gear.map((e) => <Chip key={e} onClick={() => addProp(e)}>{equipmentLabel(e, names)}</Chip>)}</div>
        </>
      ) : null}

      {tab === "timing" ? (
        <>
          <Stepper label="Loop" value={`${demo.seconds.toFixed(1)} s`} onLess={() => setDemo((d) => ({ ...d, seconds: Math.max(0.5, Math.round((d.seconds - 0.5) * 10) / 10) }))} onMore={() => setDemo((d) => ({ ...d, seconds: Math.min(60, Math.round((d.seconds + 0.5) * 10) / 10) }))} />
          <Segmented label="How it loops" value={demo.loop} onChange={(loop) => setDemo((d) => ({ ...d, loop }))} options={[{ id: "there-and-back", label: "There and back" }, { id: "round", label: "Round again" }]} />
          <span className="muted" style={{ fontSize: 13 }}>{demo.loop === "there-and-back" ? "Plays through the key poses, then back through them to the start." : "Plays through the key poses, then moves from the last straight to the first."}</span>
          <span className="label">Pose {frames.indexOf(frame) + 1} of {frames.length}</span>
          <Slider label="When in the movement" unit="%" min={0} max={100} value={Math.round(frame.t * 100)} onChange={(v) => setFrame({ t: v / 100 })} />
          <div className="pair">
            <Button onClick={addFrame}>Copy this pose</Button>
            <Button variant="stop" disabled={frames.length < 2} onClick={removeFrame}>Delete this pose</Button>
          </div>
          {current?.own ? (confirm ? (
            <div className="card">
              <span>Delete your demonstration of {name}?{demoFor(exercise, []) ? " The built-in one comes back." : ""}</span>
              <div className="pair"><Button variant="stop" onClick={() => onSave({ ...current.own!, deleted: true })}>Delete</Button><Button onClick={() => setConfirm(false)}>Keep</Button></div>
            </div>
          ) : <Button variant="ghost" onClick={() => setConfirm(true)}>Delete this demonstration</Button>) : null}
        </>
      ) : null}
    </div>
  );
}
