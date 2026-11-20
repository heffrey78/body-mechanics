import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DemoClip } from "@bm/engine";
import { Chip } from "../ui/components.tsx";
import type { PropModel } from "./models.ts";
import type { Stage, StageColors } from "./stage.ts";

/**
 * The stage's colours, from the theme's tokens as they stand where the canvas sits: the session's
 * current-exercise card is a light island in dark modes (#73), and the stage follows it.
 */
function stageColors(at: Element): StageColors {
  const css = getComputedStyle(at);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    bg: v("--surface-2", "#E4EBEE"), floor: v("--surface-2", "#E4EBEE"), grid: v("--line-strong", "#B9C6CC"), body: v("--muted", "#4F5E68"),
    joint: v("--accent", "#0B6B76"), gear: v("--line-strong", "#B9C6CC"), gearDark: v("--ink", "#12202A"), select: v("--warn-ink", "#B4430E"),
  };
}

/**
 * The canvas a demonstration is drawn on (#80). The 3D code loads when this first appears. Dragging
 * turns the view; `full` lets a drag tilt it too (the builder), otherwise up-and-down drags scroll the page.
 */
export function StageView({ height, full = false, onStage, onTap }: {
  height: number; full?: boolean; onStage: (s: Stage | null) => void; onTap?: (x: number, y: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<Stage | null>(null);
  const [failed, setFailed] = useState(false);
  const drag = useRef<{ x: number; y: number; moved: number; pinch?: number } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  /** A fresh canvas each time the 3D context is lost: the phone takes it away in the background, or the graphics driver resets. */
  const [life, setLife] = useState(0);
  const losses = useRef<number[]>([]);

  useEffect(() => {
    let gone = false;
    const el = canvas.current;
    const lost = (e: Event) => {
      e.preventDefault();
      console.warn("3D context lost; starting the stage again");
      const now = Date.now();
      losses.current = [...losses.current.filter((t) => now - t < 20_000), now];
      // Lost again and again: stop trying, and say so.
      if (losses.current.length > 3) { setFailed(true); return; }
      const again = () => { if (!gone) setLife((n) => n + 1); };
      if (document.visibilityState === "visible") setTimeout(again, 250);
      else document.addEventListener("visibilitychange", again, { once: true });
    };
    void import("./stage.ts").then(({ Stage }) => {
      if (gone || !el) return;
      try {
        stage.current = new Stage(el, stageColors(el));
        el.addEventListener("webglcontextlost", lost);
        onStage(stage.current);
      } catch {
        setFailed(true);
      }
    }, () => setFailed(true));
    // The theme changed: the stage follows.
    const seen = new MutationObserver(() => { if (canvas.current) stage.current?.setColors(stageColors(canvas.current)); stage.current?.render(); });
    seen.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-mode"] });
    const resized = new ResizeObserver(() => stage.current?.render());
    if (el) resized.observe(el);
    return () => {
      gone = true;
      seen.disconnect();
      resized.disconnect();
      // Our own clean-up gives the context back, which is not a loss to recover from.
      el?.removeEventListener("webglcontextlost", lost);
      onStage(null);
      stage.current?.dispose();
      stage.current = null;
    };
  }, [life]);

  const down = (e: ReactPointerEvent) => {
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current = { x: e.clientX, y: e.clientY, moved: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current, s = stage.current;
    if (!d || !s || !touches.current.has(e.pointerId)) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2) {
      // Two fingers: pinch to zoom.
      const [a, b] = [...touches.current.values()];
      const gap = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (d.pinch) s.zoomBy(d.pinch / gap);
      d.pinch = gap;
      d.moved = 99;
    } else {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.moved += Math.abs(dx) + Math.abs(dy);
      s.turnView(-dx * 0.6, full ? dy * 0.4 : 0);
      d.x = e.clientX;
      d.y = e.clientY;
    }
    s.render();
  };
  const up = (e: ReactPointerEvent) => {
    touches.current.delete(e.pointerId);
    const d = drag.current;
    if (d && d.moved < 8 && e.type === "pointerup") onTap?.(e.clientX, e.clientY);
    if (!touches.current.size) drag.current = null;
    else if (d) delete d.pinch;
  };

  if (failed) {
    return (
      <div className="muted" style={{ padding: 16, textAlign: "center", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        <span>The 3D view isn't working on this device right now.</span>
        <button type="button" className="btn ghost" onClick={() => { losses.current = []; setFailed(false); setLife((n) => n + 1); }}>Try again</button>
      </div>
    );
  }
  return (
    <canvas key={life} ref={canvas} role="img" aria-label="3D demonstration. Drag to turn the view."
      style={{ width: "100%", height, display: "block", borderRadius: "var(--r-btn)", touchAction: full ? "none" : "pan-y", cursor: "grab" }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onWheel={full ? (e) => { stage.current?.zoomBy(e.deltaY > 0 ? 1.08 : 0.93); stage.current?.render(); } : undefined} />
  );
}

const VIEWS = [{ label: "Front", around: 0 }, { label: "Side", around: 90 }, { label: "Back", around: 180 }] as const;

/** A demonstration playing in a loop (#76): drag to turn it, pause it, slow it down. */
export function DemoPlayer({ clip, modelOf, height = 280 }: { clip: DemoClip; modelOf: (kind: string) => PropModel; height?: number }) {
  const [stage, setStage] = useState<Stage | null>(null);
  const [playing, setPlaying] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [slow, setSlow] = useState(false);
  const phase = useRef(0);

  useEffect(() => {
    if (!stage) return;
    stage.setProps(clip.props, modelOf);
    stage.frame(clip);
    stage.drawPhase(clip, phase.current);
  }, [stage, clip, modelOf]);

  useEffect(() => {
    if (!stage || !playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      // A long gap (the app was in the background) doesn't jump the loop.
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      phase.current = (phase.current + (dt / clip.seconds) * (slow ? 0.4 : 1)) % 1;
      stage.drawPhase(clip, phase.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, playing, slow, clip]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <StageView height={height} onStage={setStage} />
      <div className="chips">
        <Chip on={!playing} onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</Chip>
        <Chip on={slow} onClick={() => setSlow(!slow)}>Slow</Chip>
        {VIEWS.map((v) => <Chip key={v.label} onClick={() => { stage?.setView(v.around); stage?.render(); }}>{v.label}</Chip>)}
      </div>
    </div>
  );
}
