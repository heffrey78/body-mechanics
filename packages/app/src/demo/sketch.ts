/**
 * The demonstration drawn flat, on a 2D canvas (#80): the same skeleton and the same view angles as the
 * 3D stage, as thick rounded lines. It needs no graphics context, so it's what shows when the phone
 * won't give the app a 3D one (after sleep, the WebView can refuse until the app restarts).
 */
import {
  BONES, HEAD_CENTRE, HEAD_RADIUS, JOINTS, PALM, palm, solve, solvePose,
  type DemoClip, type DemoPose, type Joint, type Quat, type Solved, type Vec3,
} from "@bm/engine";
import { HOLDABLE, type PropModel } from "./models.ts";
import type { DemoStage, StageColors } from "./types.ts";

const rot = (q: Quat, v: Vec3): Vec3 => {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
};
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** How thick each joint's segment (from its parent to it) is drawn, in metres. */
const WIDTH: Record<string, number> = { spine: 0.27, chest: 0.3, neck: 0.1, head: 0.1, shoulder: 0.12, elbow: 0.095, wrist: 0.075, hip: 0.17, knee: 0.15, ankle: 0.1 };
/** Placed equipment as a box: width, height, depth, and how high its middle sits. */
const BOX: Partial<Record<PropModel, [number, number, number, number]>> = {
  chair: [0.44, 0.42, 0.44, 0.21], desk: [1.3, 0.76, 0.65, 0.38], step: [0.7, 0.2, 0.36, 0.1], bench: [0.3, 0.42, 1.25, 0.21], mat: [0.65, 0.012, 1.85, 0.006],
  wall: [2.6, 2.4, 0.08, 1.2], "foam-roller": [0.45, 0.15, 0.15, 0.075], cable: [0.12, 2.1, 0.12, 1.05], machine: [0.7, 1.7, 0.9, 0.85], box: [0.4, 0.4, 0.4, 0.2],
  "pullup-bar": [1.3, 0.03, 0.03, 0], kettlebell: [0.2, 0.25, 0.2, 0.12], dumbbells: [0.4, 0.1, 0.2, 0.05], barbell: [2, 0.45, 0.45, 0.225], band: [0.32, 0.02, 0.32, 0.01],
};

interface Stroke { depth: number; draw: () => void }

export class Sketch implements DemoStage {
  readonly canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  #colors: StageColors;
  #props: { kind: PropModel; hold: string; at: Vec3; turn: number }[] = [];
  #selected: Joint | null = null;
  #target: Vec3 = [0, 0.9, 0];
  #radius = 1.2;
  #zoom = 1;
  #view = { around: 35, above: 12 };
  #last: Solved | null = null;
  #where = new Map<Joint, [number, number]>();

  constructor(canvas: HTMLCanvasElement, colors: StageColors) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D canvas");
    this.#ctx = ctx;
    this.#colors = colors;
  }

  setColors(c: StageColors): void { this.#colors = c; }
  setProps(props: DemoClip["props"], modelOf: (kind: string) => PropModel): void {
    this.#props = props.map((p) => ({ kind: modelOf(p.kind), hold: p.hold, at: p.at, turn: p.turn }));
  }

  frame(clip: DemoClip): void {
    const lo: Vec3 = [Infinity, 0, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
    const take = (p: Vec3) => { for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i]!, p[i]!); hi[i] = Math.max(hi[i]!, p[i]!); } };
    for (let i = 0; i < 8; i++) { const s = solve(clip, i / 8); for (const j of JOINTS) take(s[j].pos); }
    for (const p of clip.props) if (p.hold === "none") take([p.at[0], Math.max(p.at[1], 0.3), p.at[2]]);
    for (let i = 0; i < 3; i++) { lo[i]! -= 0.2; hi[i]! += 0.2; }
    lo[1] = Math.min(lo[1], 0);
    this.#target = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    this.#radius = Math.max((hi[1] - lo[1]) / 2, Math.hypot(hi[0] - lo[0], hi[2] - lo[2]) / 2) * 1.08;
  }

  setView(around: number, above = this.#view.above): void { this.#view = { around, above: Math.max(-5, Math.min(80, above)) }; }
  turnView(dAround: number, dAbove: number): void { this.setView(this.#view.around + dAround, this.#view.above + dAbove); }
  zoomBy(k: number): void { this.#zoom = Math.max(0.4, Math.min(2.5, this.#zoom * k)); }
  get view() { return this.#view; }
  resetView(): void { this.#view = { around: 35, above: 12 }; this.#zoom = 1; this.#selected = null; }
  select(joint: Joint | null): void { this.#selected = joint; }

  pick(clientX: number, clientY: number): Joint | null {
    const r = this.canvas.getBoundingClientRect();
    let best: Joint | null = null, bestD = 30;
    for (const [j, [x, y]] of this.#where) {
      const d = Math.hypot(x - (clientX - r.left), y - (clientY - r.top));
      if (d < bestD) { bestD = d; best = j; }
    }
    return best;
  }

  drawPhase(clip: DemoClip, phase: number): void { this.#last = solve(clip, phase); this.render(); }
  drawPose(clip: DemoClip, pose: DemoPose): void { this.#last = solvePose(clip, pose); this.render(); }

  render(): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    const ratio = Math.min(window.devicePixelRatio, 2);
    if (this.canvas.width !== Math.round(w * ratio) || this.canvas.height !== Math.round(h * ratio)) {
      this.canvas.width = Math.round(w * ratio);
      this.canvas.height = Math.round(h * ratio);
    }
    const ctx = this.#ctx, c = this.#colors;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const a = (this.#view.around * Math.PI) / 180, e = (this.#view.above * Math.PI) / 180;
    const right: Vec3 = [Math.cos(a), 0, -Math.sin(a)];
    const up: Vec3 = [-Math.sin(a) * Math.sin(e), Math.cos(e), -Math.cos(a) * Math.sin(e)];
    const toward: Vec3 = [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
    const scale = Math.min(w, h) / (2 * this.#radius * this.#zoom);
    const dot = (p: Vec3, v: Vec3) => (p[0] - this.#target[0]) * v[0] + (p[1] - this.#target[1]) * v[1] + (p[2] - this.#target[2]) * v[2];
    const at = (p: Vec3): [number, number, number] => [w / 2 + dot(p, right) * scale, h / 2 - dot(p, up) * scale, dot(p, toward)];
    const line = (p: Vec3, q: Vec3, width: number, colour: string) => {
      const [x1, y1] = at(p), [x2, y2] = at(q);
      ctx.strokeStyle = colour;
      ctx.lineWidth = Math.max(1, width * scale);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    const disc = (p: Vec3, r: number, colour: string) => {
      const [x, y] = at(p);
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, r * scale), 0, Math.PI * 2);
      ctx.fill();
    };

    // The floor: a grid, fading with nothing drawn below it.
    ctx.globalAlpha = 0.5;
    for (let i = -6; i <= 6; i++) {
      line([i / 2, 0, -3], [i / 2, 0, 3], 0, c.grid);
      line([-3, 0, i / 2], [3, 0, i / 2], 0, c.grid);
    }
    ctx.globalAlpha = 1;

    const s = this.#last;
    if (!s) return;
    const strokes: Stroke[] = [];
    // A soft shadow on the floor under every part of the body: it shows what is touching down and what is in the air.
    ctx.fillStyle = c.gearDark;
    for (const j of JOINTS) {
      const parent = BONES[j].parent;
      for (const k of parent ? [0.5, 1] : [1]) {
        const a0 = parent ? s[parent].pos : s[j].pos, b0 = s[j].pos;
        const p: Vec3 = [a0[0] + (b0[0] - a0[0]) * k, 0, a0[2] + (b0[2] - a0[2]) * k];
        const height = a0[1] + (b0[1] - a0[1]) * k;
        const [x, y] = at(p);
        // Fainter and wider the higher the part is off the floor.
        ctx.globalAlpha = Math.max(0.02, 0.1 - height * 0.045);
        const r = (0.09 + height * 0.05) * scale;
        ctx.beginPath();
        ctx.ellipse(x, y, r, Math.max(1, r * Math.abs(Math.sin(e))), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // A segment with an edge in the background colour, so limbs in front of the body read as separate.
    // Farther parts are drawn fainter, which is most of what tells near from far here.
    const fade = (depth: number) => Math.max(0, Math.min(0.38, 0.19 - (depth / this.#radius) * 0.3));
    const limb = (p: Vec3, q: Vec3, width: number, colour = c.body) => {
      const depth = (at(p)[2] + at(q)[2]) / 2;
      strokes.push({ depth, draw: () => {
        line(p, q, width + 0.025, c.bg);
        line(p, q, width, colour);
        ctx.globalAlpha = fade(depth);
        line(p, q, width, c.bg);
        ctx.globalAlpha = 1;
      } });
    };

    // Equipment: boxes where it's placed, and what the hands hold.
    for (const p of this.#props) {
      const sides = p.hold === "both" ? (["L", "R"] as const) : p.hold === "left" ? (["L"] as const) : p.hold === "right" ? (["R"] as const) : [];
      const held = sides.length > 0 && HOLDABLE.includes(p.kind);
      if (!held || p.kind === "cable") {
        const box = BOX[p.kind];
        if (box) {
          const [bw, bh, bd, cy] = box, t = (p.turn * Math.PI) / 180;
          const corner = (x: number, y: number, z: number): Vec3 => [p.at[0] + x * Math.cos(t) + z * Math.sin(t), p.at[1] + cy + y, p.at[2] - x * Math.sin(t) + z * Math.cos(t)];
          const k = [-1, 1];
          const edges: [Vec3, Vec3][] = [];
          for (const i of k) for (const j of k) {
            edges.push([corner((-bw) / 2, (i * bh) / 2, (j * bd) / 2), corner(bw / 2, (i * bh) / 2, (j * bd) / 2)]);
            edges.push([corner((i * bw) / 2, -bh / 2, (j * bd) / 2), corner((i * bw) / 2, bh / 2, (j * bd) / 2)]);
            edges.push([corner((i * bw) / 2, (j * bh) / 2, -bd / 2), corner((i * bw) / 2, (j * bh) / 2, bd / 2)]);
          }
          const mid = at(corner(0, 0, 0))[2];
          strokes.push({ depth: mid - 10, draw: () => { for (const [x, y] of edges) line(x, y, 0.012, c.gearDark); } });
          // A pull-up bar's posts down to the floor.
          if (p.kind === "pullup-bar") for (const i of k) limb(corner((i * bw) / 2, 0, 0), [corner((i * bw) / 2, 0, 0)[0], 0, corner((i * bw) / 2, 0, 0)[2]], 0.04, c.gearDark);
        }
      }
      if (!held) continue;
      const hands = sides.map((side) => ({ at: palm(s, side), rot: s[`wrist${side}`].rot }));
      if (p.kind === "barbell" && hands.length === 2) {
        const [l, r] = [hands[0]!.at, hands[1]!.at];
        const d: Vec3 = [l[0] - r[0], l[1] - r[1], l[2] - r[2]];
        const n = Math.hypot(...d) || 1, m: Vec3 = [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2];
        const along = (k: number): Vec3 => [m[0] + (d[0] / n) * k, m[1] + (d[1] / n) * k, m[2] + (d[2] / n) * k];
        limb(along(-1), along(1), 0.03, c.gearDark);
        for (const side of [-1, 1]) limb(along(side * 0.78), along(side * 0.84), 0.42, c.gear);
      } else if (p.kind === "band" && hands.length === 2) limb(hands[0]!.at, hands[1]!.at, 0.02, c.gearDark);
      else if (p.kind === "band" || p.kind === "cable") for (const hnd of hands) limb([p.at[0], Math.max(p.at[1], p.kind === "cable" ? 0.15 : 0), p.at[2]], hnd.at, 0.015, c.gearDark);
      else if (p.kind === "kettlebell") for (const hnd of hands) limb(add(hnd.at, rot(hnd.rot, [0, -0.13, 0])), add(hnd.at, rot(hnd.rot, [0, -0.131, 0])), 0.2, c.gear);
      else for (const hnd of hands) limb(add(hnd.at, rot(hnd.rot, [0, 0, -0.1])), add(hnd.at, rot(hnd.rot, [0, 0, 0.1])), 0.09, c.gear);
    }

    // The body: a segment from each joint's parent to it, the hands, feet and head.
    for (const j of JOINTS) {
      const parent = BONES[j].parent;
      if (parent) limb(s[parent].pos, s[j].pos, WIDTH[j.replace(/[LR]$/, "")] ?? 0.1);
    }
    for (const side of ["L", "R"] as const) {
      const wrist = s[`wrist${side}`], ankle = s[`ankle${side}`];
      limb(wrist.pos, add(wrist.pos, rot(wrist.rot, [PALM[0], PALM[1] * 1.7, PALM[2]])), 0.06);
      limb(add(ankle.pos, rot(ankle.rot, [0, -0.04, -0.03])), add(ankle.pos, rot(ankle.rot, [0, -0.04, 0.15])), 0.075);
    }
    const head = add(s.head.pos, rot(s.head.rot, HEAD_CENTRE));
    const nose = add(s.head.pos, rot(s.head.rot, [0, HEAD_CENTRE[1] - 0.01, HEAD_CENTRE[2] + HEAD_RADIUS]));
    strokes.push({ depth: at(head)[2], draw: () => {
      disc(head, HEAD_RADIUS + 0.02, c.bg);
      disc(head, HEAD_RADIUS + 0.008, c.body);
      ctx.globalAlpha = fade(at(head)[2]);
      disc(head, HEAD_RADIUS + 0.008, c.bg);
      ctx.globalAlpha = 1;
    } });
    strokes.push({ depth: at(nose)[2] + (at(nose)[2] > at(head)[2] ? 0.2 : -0.2), draw: () => disc(nose, 0.024, c.joint) });
    // A dot at every joint: it shows the joint, and it's what a tap picks (#83).
    this.#where.clear();
    for (const j of JOINTS) {
      const p = s[j].pos, [x, y, depth] = at(p);
      this.#where.set(j, [x, y]);
      if (BONES[j].side === 0 && j !== this.#selected) continue;
      strokes.push({ depth: depth + 0.06, draw: () => disc(p, j === this.#selected ? 0.055 : 0.03, j === this.#selected ? c.select : c.joint) });
    }
    strokes.sort((x, y) => x.depth - y.depth);
    for (const st of strokes) st.draw();
  }

  dispose(): void { this.#last = null; }
}
