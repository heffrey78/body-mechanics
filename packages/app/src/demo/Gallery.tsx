import { useEffect, useRef, useState } from "react";
import { BUILT_IN_DEMOS } from "@bm/engine";
import { propModels } from "./models.ts";

/**
 * Every built-in demonstration at the start and the far end of its loop, side by side: a development
 * page (open the dev server at #demos) for checking them by eye (#81). `#demos` with `?only=squat` narrows it.
 */
export function Gallery() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const w = Number(new URLSearchParams(location.search).get("w") ?? 108);
  const [shots, setShots] = useState<{ id: string; images: string[] }[]>([]);
  useEffect(() => {
    void import("./stage.ts").then(({ Stage }) => {
      const css = getComputedStyle(document.documentElement);
      const v = (n: string) => css.getPropertyValue(n).trim();
      const stage = new Stage(canvas.current!, { bg: v("--surface-2"), floor: v("--surface-2"), grid: v("--line-strong"), body: v("--part-bd"), joint: v("--accent"), gear: v("--line-strong"), gearDark: v("--muted"), select: v("--pain-bd") });
      const only = new URLSearchParams(location.search).get("only");
      const around = Number(new URLSearchParams(location.search).get("around") ?? 65);
      const out: typeof shots = [];
      for (const [id, clip] of Object.entries(BUILT_IN_DEMOS)) {
        if (only && !only.split(",").some((o) => id.includes(o))) continue;
        stage.setProps(clip.props, propModels([]));
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
