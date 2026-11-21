import { useEffect, useRef, useState } from "react";
import { BUILT_IN_DEMOS, PRESETS, demoPose, type DemoClip, type DemoHold, type EquipmentItem, type Vec3 } from "@bm/engine";
import { propModels } from "./models.ts";
import { Sketch } from "./sketch.ts";

/** Equipment laid out and held, for checking its drawings (#95, #96): shown with `?gear=1`. */
const OWN: EquipmentItem[] = [{ type: "equipment", v: 1, id: "abroller", name: "Ab roller", standsIn: [] }, { type: "equipment", v: 1, id: "medball", name: "Medicine ball", standsIn: [] }];
const still = (pose: DemoClip["frames"][number]["pose"], anchor: DemoClip["anchor"], props: { kind: string; hold: DemoHold; at?: Vec3 }[]): DemoClip => ({
  seconds: 3, loop: "there-and-back", anchor, frames: [{ id: "a", t: 0, pose }],
  props: props.map((p, i) => ({ id: `p${i}`, kind: p.kind as never, hold: p.hold, at: p.at ?? [0, 0, 0], turn: 0 })),
});
const swing = demoPose([0, 0.9, 0], [0, 0, 0], { spine: [35, 0, 0], hipL: [50, 12, 0], hipR: [50, 12, 0], kneeL: [-40, 0, 0], kneeR: [-40, 0, 0], shoulderL: [-5, -12, 0], shoulderR: [-5, -12, 0] });
const GEAR: Record<string, DemoClip> = {
  "bm:placed": still(PRESETS[0].pose, "feet", [
    { kind: "kettlebell", hold: "none", at: [0.5, 0, 0.2] }, { kind: "foam-roller", hold: "none", at: [-0.6, 0, 0.3] }, { kind: "abroller", hold: "none", at: [0.6, 0, -0.4] },
    { kind: "dumbbells", hold: "none", at: [-0.6, 0, -0.3] }, { kind: "band", hold: "none", at: [0, 0, 0.6] }, { kind: "medball", hold: "none", at: [1, 0, 0.3] }, { kind: "mat", hold: "none" },
  ]),
  "bm:swing-both-on-one": still(swing, "feet", [{ kind: "kettlebell", hold: "together" }]),
  "bm:kettlebell-each": still(PRESETS[0].pose, "feet", [{ kind: "kettlebell", hold: "both" }]),
  "bm:ab-roller": still(PRESETS[4].pose, "floor", [{ kind: "abroller", hold: "together" }]),
  "bm:ball-held": still(demoPose(PRESETS[0].pose.at as Vec3, [0, 0, 0], { shoulderL: [60, -10, 0], shoulderR: [60, -10, 0], elbowL: [40, 0, 0], elbowR: [40, 0, 0] }), "feet", [{ kind: "medball", hold: "together" }, { kind: "barbell", hold: "none", at: [0, 0, 0.6] }]),
};

/**
 * Every built-in demonstration at the start and the far end of its loop, side by side: a development
 * page (open the dev server at #demos) for checking them by eye (#81). `#demos` with `?only=squat` narrows it.
 */
export function Gallery() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const w = Number(new URLSearchParams(location.search).get("w") ?? 108);
  const [shots, setShots] = useState<{ id: string; images: string[] }[]>([]);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    void import("./stage.ts").then(({ Stage }) => {
      const css = getComputedStyle(document.documentElement);
      const v = (n: string) => css.getPropertyValue(n).trim();
      const stage = new (q.get("flat") ? Sketch : Stage)(canvas.current!, { bg: v("--surface-2"), floor: v("--surface-2"), grid: v("--line-strong"), body: v("--muted"), joint: v("--accent"), gear: v("--line-strong"), gearDark: v("--ink"), select: v("--warn-ink") });
      const only = new URLSearchParams(location.search).get("only");
      const around = Number(new URLSearchParams(location.search).get("around") ?? 65);
      const out: typeof shots = [];
      for (const [id, clip] of Object.entries(q.get("gear") ? GEAR : BUILT_IN_DEMOS)) {
        if (only && !only.split(",").some((o) => id.includes(o))) continue;
        stage.setProps(clip.props, propModels(OWN));
        stage.frame(clip);
        stage.setView(around, 10);
        out.push({ id, images: (clip.frames.length > 1 ? [0, 0.25, 0.5] : [0]).map((p) => { stage.drawPhase(clip, p); return canvas.current!.toDataURL("image/jpeg", 0.8); }) });
      }
      setShots(out);
      stage.dispose();
    });
  }, []);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${w * 3 + 6}px, 1fr))`, gap: 6, padding: 6 }}>
      <canvas ref={canvas} style={{ position: "fixed", left: -400, width: 300, height: 300 }} />
      {shots.map((s) => (
        <div key={s.id} style={{ fontSize: 12 }}>
          {s.id.slice(3)}<br />
          {s.images.map((src, i) => <img key={i} src={src} width={w} height={w} alt="" />)}
        </div>
      ))}
    </div>
  );
}
