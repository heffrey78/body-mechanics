import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DemoClip } from "@bm/engine";
import { Chip } from "../ui/components.tsx";
import type { PropModel } from "./models.ts";
import type { DemoStage, StageColors } from "./types.ts";

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
 * Where a demonstration is drawn (#80). The 3D code loads when this first appears, and the app keeps one
 * 3D stage for good: its canvas is put here while this is on the page. Dragging turns the view; `full`
 * lets a drag tilt it too (the builder), otherwise up-and-down drags scroll the page.
 *
 * A phone takes the 3D context away when the app sleeps, and its WebView can then refuse a new one until
 * the app restarts. So: wait for the WebView to hand the same context back; failing that, replace the
 * stage twice, slowly (asking again and again is what gets an app refused); failing that, draw the
 * demonstration flat, which needs no 3D at all.
 */
export function StageView({ height, full = false, onStage, onTap }: {
  height: number; full?: boolean; onStage: (s: DemoStage | null) => void; onTap?: (x: number, y: number) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const stage = useRef<DemoStage | null>(null);
  const drag = useRef<{ x: number; y: number; moved: number; pinch?: number } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  /** 3D, or the flat sketch; `life` moves on for each new try at 3D. */
  const [flat, setFlat] = useState(false);
  const [life, setLife] = useState(0);
  const tries = useRef(0);
  const fresh = useRef(false);

  useEffect(() => {
    let gone = false;
    const el = holder.current;
    if (!el) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, fn: () => void) => { timers.push(setTimeout(() => { if (!gone) fn(); }, ms)); };
    const whenVisible = (fn: () => void) => {
      if (document.visibilityState === "visible") return fn();
      const seen = () => { if (document.visibilityState !== "visible") return; document.removeEventListener("visibilitychange", seen); if (!gone) fn(); };
      document.addEventListener("visibilitychange", seen);
      timers.push(setTimeout(() => document.removeEventListener("visibilitychange", seen), 3_600_000));
    };
    const giveUp = (why: string) => { console.warn(`3D view: ${why}; drawing the demonstration flat`); setFlat(true); };
    let made: DemoStage | null = null;
    let isLost: () => boolean = () => false;
    /** The context is gone: once the app is in view again, give it a moment; then a new stage, and after two of those the flat drawing. */
    const recover = () => whenVisible(() => later(2500 + tries.current * 4000, () => {
      if (!isLost()) return;
      if (tries.current >= 2) return giveUp("the context didn't come back");
      tries.current += 1;
      fresh.current = true;
      console.warn(`3D view: starting again with a new stage (try ${tries.current})`);
      setLife((n) => n + 1);
    }));
    const lost = (e: Event) => { e.preventDefault(); console.warn("3D view: context lost"); recover(); };
    const back = () => { console.warn("3D view: context restored"); made?.render(); };
    const show = (s: DemoStage) => {
      made = s;
      stage.current = s;
      Object.assign(s.canvas.style, { width: "100%", height: "100%", display: "block", borderRadius: "var(--r-btn)" });
      s.resetView();
      el.replaceChildren(s.canvas);
      onStage(s);
    };

    if (flat) {
      void import("./sketch.ts").then(({ Sketch }) => { if (!gone) show(new Sketch(document.createElement("canvas"), stageColors(el))); });
    } else {
      void import("./stage.ts").then(({ sharedStage }) => {
        if (gone) return;
        try {
          const s = sharedStage(stageColors(el), fresh.current);
          fresh.current = false;
          isLost = () => s.lost;
          s.canvas.addEventListener("webglcontextlost", lost);
          s.canvas.addEventListener("webglcontextrestored", back);
          show(s);
          // Lost while it was off the page (the phone slept on another screen): the same recovery.
          if (s.lost) recover();
          // It has held for a while: the next loss starts counting afresh.
          later(30_000, () => { if (!s.lost) tries.current = 0; });
        } catch (e) {
          giveUp(`no 3D context (${e instanceof Error ? e.message : String(e)})`);
        }
      }, () => giveUp("the 3D code didn't load"));
    }
    // The theme changed: the stage follows.
    const seen = new MutationObserver(() => { stage.current?.setColors(stageColors(el)); stage.current?.render(); });
    seen.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-mode"] });
    const resized = new ResizeObserver(() => stage.current?.render());
    resized.observe(el);
    return () => {
      gone = true;
      timers.forEach(clearTimeout);
      seen.disconnect();
      resized.disconnect();
      made?.canvas.removeEventListener("webglcontextlost", lost);
      made?.canvas.removeEventListener("webglcontextrestored", back);
      onStage(null);
      // The 3D stage is kept for the next demonstration: only its canvas leaves the page. The sketch is dropped.
      made?.canvas.remove();
      if (flat) made?.dispose();
      stage.current = null;
    };
  }, [life, flat]);

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

  return (
    <>
      <div ref={holder} role="img" aria-label="Demonstration. Drag to turn the view."
        style={{ width: "100%", height, borderRadius: "var(--r-btn)", background: "var(--surface-2)", touchAction: full ? "none" : "pan-y", cursor: "grab" }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onWheel={full ? (e) => { stage.current?.zoomBy(e.deltaY > 0 ? 1.08 : 0.93); stage.current?.render(); } : undefined} />
      {flat ? (
        <div className="hrow" style={{ minHeight: 0 }}>
          <span className="muted" style={{ fontSize: 13 }}>Simple view: this device isn't giving the app 3D right now. Restarting the app brings it back.</span>
          <button type="button" className="btn ghost" style={{ flexShrink: 0 }} onClick={() => { tries.current = 2; fresh.current = true; setFlat(false); setLife((n) => n + 1); }}>Try 3D</button>
        </div>
      ) : null}
    </>
  );
}

const VIEWS = [{ label: "Front", around: 0 }, { label: "Side", around: 90 }, { label: "Back", around: 180 }] as const;

/** A demonstration playing in a loop (#76): drag to turn it, pause it, slow it down. */
export function DemoPlayer({ clip, modelOf, height = 280 }: { clip: DemoClip; modelOf: (kind: string) => PropModel; height?: number }) {
  const [stage, setStage] = useState<DemoStage | null>(null);
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
