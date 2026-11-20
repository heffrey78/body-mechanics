/**
 * The 3D stage (#80, D5): a mannequin on the engine's skeleton, equipment models, a floor, and a camera
 * that turns around them. It draws what the engine solves and nothing more; three.js lives only here,
 * so it loads only when a demonstration is shown.
 */
import * as THREE from "three";
import {
  BONES, HEAD_CENTRE, HEAD_RADIUS, JOINTS, palm, solve, solvePose,
  type DemoClip, type DemoPose, type Joint, type Solved, type Vec3,
} from "@bm/engine";
import { HOLDABLE, type PropModel } from "./models.ts";
import { ON_ANDROID } from "./prefs.ts";
import type { DemoStage, StageColors } from "./types.ts";


const v3 = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);
const Y = new THREE.Vector3(0, 1, 0);


export class Stage implements DemoStage {
  readonly #renderer: THREE.WebGLRenderer;
  readonly #scene = new THREE.Scene();
  readonly #camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  readonly #mat: Record<"body" | "joint" | "gear" | "gearDark" | "select" | "floor" | "glass", THREE.MeshStandardMaterial>;
  readonly #grid: THREE.GridHelper;
  readonly #joints = {} as Record<Joint, THREE.Group>;
  readonly #knobs = {} as Record<Joint, THREE.Mesh>;
  readonly #props = new THREE.Group();
  #drawProps: ((s: Solved) => void)[] = [];
  #selected: Joint | null = null;
  #target = new THREE.Vector3(0, 0.9, 0);
  #radius = 1.2;
  #zoom = 1;
  /** Degrees round the body (0 is from the front, 90 from its left) and above the horizon. */
  #view = { around: 35, above: 12 };
  #light: THREE.DirectionalLight;

  readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, colors: StageColors) {
    this.canvas = canvas;
    this.#renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = THREE.PCFShadowMap;
    const m = (roughness: number, metalness = 0) => new THREE.MeshStandardMaterial({ roughness, metalness });
    this.#mat = { body: m(0.65), joint: m(0.5), gear: m(0.6, 0.1), gearDark: m(0.45, 0.3), select: m(0.4), floor: m(1), glass: m(0.8) };
    Object.assign(this.#mat.glass, { transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });

    this.#scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f98, 1.5));
    this.#light = new THREE.DirectionalLight(0xffffff, 2.2);
    this.#light.castShadow = true;
    this.#light.shadow.mapSize.set(1024, 1024);
    const sc = this.#light.shadow.camera;
    sc.left = -2.5; sc.right = 2.5; sc.top = 2.5; sc.bottom = -2.5; sc.near = 0.5; sc.far = 12;
    this.#light.shadow.bias = -0.0005;
    this.#scene.add(this.#light, this.#light.target);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), this.#mat.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.#grid = new THREE.GridHelper(12, 24);
    this.#grid.position.y = 0.002;
    (this.#grid.material as THREE.Material).transparent = true;
    (this.#grid.material as THREE.Material).opacity = 0.5;
    this.#scene.add(floor, this.#grid, this.#props);

    this.#buildBody();
    this.setColors(colors);
  }

  // ---------------------------------------------------------------- the body

  #add(joint: Joint, mesh: THREE.Mesh, at: Vec3 = [0, 0, 0], squash?: Vec3): THREE.Mesh {
    mesh.position.set(...at);
    if (squash) mesh.scale.set(...squash);
    mesh.castShadow = true;
    this.#joints[joint].add(mesh);
    return mesh;
  }

  /** A tapering segment hanging down from the joint, with rounded ends. */
  #limb(joint: Joint, length: number, top: number, bottom: number, dir: 1 | -1 = -1): void {
    this.#add(joint, new THREE.Mesh(new THREE.CylinderGeometry(dir === -1 ? top : bottom, dir === -1 ? bottom : top, length, 20), this.#mat.body), [0, (dir * length) / 2, 0]);
    this.#add(joint, new THREE.Mesh(new THREE.SphereGeometry(bottom, 20, 14), this.#mat.body), [0, dir * length, 0]);
  }

  #buildBody(): void {
    for (const j of JOINTS) {
      this.#joints[j] = new THREE.Group();
      this.#scene.add(this.#joints[j]);
    }
    const ball = (r: number) => new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), this.#mat.body);
    this.#add("pelvis", ball(1), [0, 0.01, 0], [0.165, 0.115, 0.115]);
    this.#add("spine", ball(1), [0, 0.07, 0], [0.14, 0.13, 0.1]);
    this.#add("chest", ball(1), [0, 0.1, 0], [0.19, 0.17, 0.115]);
    this.#limb("neck", 0.09, 0.048, 0.048, 1);
    this.#add("head", ball(HEAD_RADIUS), HEAD_CENTRE, [0.92, 1.12, 1]);
    // A nose, so it's plain which way the body faces.
    this.#add("head", new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), this.#mat.joint), [0, HEAD_CENTRE[1] - 0.01, HEAD_CENTRE[2] + HEAD_RADIUS]);
    for (const s of ["L", "R"] as const) {
      this.#limb(`shoulder${s}`, 0.29, 0.05, 0.042);
      this.#limb(`elbow${s}`, 0.26, 0.042, 0.032);
      this.#add(`wrist${s}`, ball(1), [0, -0.085, 0], [0.024, 0.075, 0.045]);
      this.#limb(`hip${s}`, 0.43, 0.082, 0.055);
      this.#limb(`knee${s}`, 0.42, 0.055, 0.04);
      this.#add(`ankle${s}`, ball(1), [0, -0.04, 0.05], [0.045, 0.032, 0.11]);
    }
    // A knob at every joint: it shows the joint, and it's what a tap picks (#83).
    const size: Partial<Record<string, number>> = { pelvis: 0.07, spine: 0.05, chest: 0.05, neck: 0.05, head: 0.045, shoulder: 0.058, elbow: 0.047, wrist: 0.038, hip: 0.086, knee: 0.06, ankle: 0.046 };
    for (const j of JOINTS) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(size[j.replace(/[LR]$/, "")] ?? 0.05, 20, 14), this.#mat.joint);
      knob.castShadow = true;
      knob.userData["joint"] = j;
      // The trunk's knobs sit on the front, where they can be seen and tapped.
      if (BONES[j].side === 0) knob.position.set(0, j === "head" ? 0.02 : 0, j === "pelvis" ? 0.09 : j === "head" ? -0.06 : 0.085);
      if (BONES[j].side === 0) knob.scale.setScalar(0.6);
      this.#joints[j].add(knob);
      this.#knobs[j] = knob;
    }
  }

  // ---------------------------------------------------------------- equipment

  #gear(g: THREE.BufferGeometry, at: Vec3, dark = false): THREE.Mesh {
    const mesh = new THREE.Mesh(g, dark ? this.#mat.gearDark : this.#mat.gear);
    mesh.position.set(...at);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  #box(w: number, h: number, d: number, at: Vec3, dark = false) { return this.#gear(new THREE.BoxGeometry(w, h, d), at, dark); }
  /** A rod along x. */
  #rod(r: number, length: number, at: Vec3, dark = false) {
    const mesh = this.#gear(new THREE.CylinderGeometry(r, r, length, 16), at, dark);
    mesh.rotation.z = Math.PI / 2;
    return mesh;
  }
  #legs(w: number, d: number, h: number, t = 0.035): THREE.Mesh[] {
    return [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([x, z]) => this.#box(t, h, t, [(x! * (w - t)) / 2, h / 2, (z! * (d - t)) / 2], true));
  }

  /** A model standing on the floor at the origin (or, for held things, with its grip at the origin). */
  #model(kind: PropModel, held: boolean): THREE.Object3D {
    const g = new THREE.Group();
    switch (kind) {
      case "wall": {
        // See-through, so a wall between the viewer and the body doesn't hide it.
        const wall = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 0.08), this.#mat.glass);
        wall.position.set(0, 1.2, 0);
        g.add(wall);
        break;
      }
      case "chair": g.add(this.#box(0.44, 0.04, 0.44, [0, 0.4, 0]), this.#box(0.44, 0.46, 0.035, [0, 0.65, -0.2]), ...this.#legs(0.44, 0.44, 0.38)); break;
      case "desk": g.add(this.#box(1.3, 0.04, 0.65, [0, 0.74, 0]), ...this.#legs(1.24, 0.6, 0.72, 0.05)); break;
      case "step": g.add(this.#box(0.7, 0.2, 0.36, [0, 0.1, 0])); break;
      case "bench": g.add(this.#box(0.3, 0.07, 1.25, [0, 0.385, 0]), ...this.#legs(0.3, 1.1, 0.35, 0.045)); break;
      case "mat": g.add(this.#box(0.65, 0.012, 1.85, [0, 0.006, 0])); break;
      case "foam-roller": g.add(this.#rod(0.075, 0.45, [0, 0.075, 0])); break;
      case "pullup-bar": g.add(this.#rod(0.016, 1.3, [0, 0, 0], true), this.#box(0.05, 2.3, 0.05, [0.65, -1.125, 0], true), this.#box(0.05, 2.3, 0.05, [-0.65, -1.125, 0], true)); break;
      case "cable": g.add(this.#box(0.12, 2.1, 0.12, [0, 1.05, 0], true), this.#box(0.3, 0.6, 0.2, [0, 0.3, -0.16]), this.#box(0.5, 0.05, 0.5, [0, 0.025, -0.05], true)); break;
      case "machine": g.add(this.#box(0.5, 0.08, 0.5, [0, 0.45, 0]), this.#box(0.5, 0.6, 0.08, [0, 0.8, -0.25]), this.#box(0.12, 1.7, 0.12, [0, 0.85, -0.36], true), this.#box(0.7, 0.05, 0.9, [0, 0.025, -0.1], true), this.#box(0.1, 0.42, 0.1, [0, 0.21, 0], true)); break;
      case "dumbbells": {
        // The handle runs front to back in a hanging hand.
        const one = (x: number, y: number) => {
          const d = new THREE.Group();
          const bar = this.#gear(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 12), [0, 0, 0], true);
          bar.rotation.x = Math.PI / 2;
          const end = (z: number) => { const e = this.#gear(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 6), [0, 0, z]); e.rotation.x = Math.PI / 2; return e; };
          d.add(bar, end(0.09), end(-0.09));
          d.position.set(x, y, 0);
          return d;
        };
        if (held) g.add(one(0, 0)); else g.add(one(-0.12, 0.05), one(0.12, 0.05));
        break;
      }
      case "kettlebell": {
        const y = held ? -0.13 : 0.1;
        const handle = this.#gear(new THREE.TorusGeometry(0.055, 0.013, 10, 20), [0, y + 0.115, 0], true);
        handle.rotation.y = Math.PI / 2;
        g.add(this.#gear(new THREE.SphereGeometry(0.1, 20, 14), [0, y, 0]), handle);
        break;
      }
      case "barbell": {
        const y = held ? 0 : 0.225;
        g.add(this.#rod(0.014, 2.0, [0, y, 0], true), ...[0.8, -0.8].map((x) => this.#rod(0.225, 0.05, [x, y, 0])), ...[0.86, -0.86].map((x) => this.#rod(0.16, 0.04, [x, y, 0])));
        break;
      }
      case "band": {
        const loop = this.#gear(new THREE.TorusGeometry(0.16, 0.012, 8, 32), [0, 0.012, 0]);
        loop.rotation.x = Math.PI / 2;
        g.add(loop);
        break;
      }
      case "floor": break;
      default: g.add(this.#box(0.4, 0.4, 0.4, [0, 0.2, 0]));
    }
    return g;
  }

  /** A thin line of band or cable from `a` to `b`, moved each frame. */
  #strand(dark: boolean): { mesh: THREE.Mesh; set: (a: THREE.Vector3, b: THREE.Vector3) => void } {
    const mesh = this.#gear(new THREE.CylinderGeometry(dark ? 0.006 : 0.011, dark ? 0.006 : 0.011, 1, 8), [0, 0, 0], dark);
    return {
      mesh,
      set: (a, b) => {
        const d = b.clone().sub(a);
        mesh.position.copy(a).addScaledVector(d, 0.5);
        mesh.scale.set(1, Math.max(d.length(), 0.001), 1);
        mesh.quaternion.setFromUnitVectors(Y, d.normalize());
      },
    };
  }

  /** Rebuild the equipment for a demonstration. `modelOf` turns a custom item into what it stands in for. */
  setProps(props: DemoClip["props"], modelOf: (kind: string) => PropModel): void {
    this.#clearProps();
    for (const p of props) {
      const kind = modelOf(p.kind);
      const sides = p.hold === "both" ? (["L", "R"] as const) : p.hold === "left" ? (["L"] as const) : p.hold === "right" ? (["R"] as const) : [];
      const place = (o: THREE.Object3D) => { o.position.set(...p.at); o.rotation.y = (p.turn * Math.PI) / 180; this.#props.add(o); };
      if (!sides.length || !HOLDABLE.includes(kind)) { place(this.#model(kind, false)); continue; }
      if (kind === "band" || kind === "cable") {
        // A cable runs from its column to each hand; a band between the hands, or from where it's tied to one hand.
        const from = v3(p.at);
        if (kind === "cable") { place(this.#model("cable", false)); from.y = Math.max(from.y, 0.15); }
        const strands = (kind === "band" && sides.length === 2 ? [0] : sides.map((_, i) => i)).map(() => this.#strand(kind === "cable"));
        strands.forEach((s) => this.#props.add(s.mesh));
        this.#drawProps.push((s) => {
          if (kind === "band" && sides.length === 2) strands[0]!.set(v3(palm(s, "L")), v3(palm(s, "R")));
          else sides.forEach((side, i) => strands[i]!.set(from, v3(palm(s, side))));
        });
      } else if (kind === "barbell" && sides.length === 2) {
        const bar = this.#model("barbell", true);
        this.#props.add(bar);
        this.#drawProps.push((s) => {
          const l = v3(palm(s, "L")), r = v3(palm(s, "R"));
          bar.position.copy(l).add(r).multiplyScalar(0.5);
          bar.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), l.sub(r).normalize());
        });
      } else {
        for (const side of sides) {
          const o = this.#model(kind, true);
          this.#props.add(o);
          this.#drawProps.push((s) => {
            o.position.set(...palm(s, side));
            o.quaternion.set(...s[`wrist${side}`].rot);
          });
        }
      }
    }
  }

  #clearProps(): void {
    this.#props.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    this.#props.clear();
    this.#drawProps = [];
  }

  // ---------------------------------------------------------------- drawing

  setColors(c: StageColors): void {
    this.#scene.background = new THREE.Color(c.bg);
    this.#mat.floor.color.set(c.floor);
    this.#mat.body.color.set(c.body);
    this.#mat.joint.color.set(c.joint);
    this.#mat.gear.color.set(c.gear);
    this.#mat.glass.color.set(c.gear);
    this.#mat.gearDark.color.set(c.gearDark);
    this.#mat.select.color.set(c.select);
    this.#mat.select.emissive.set(c.select).multiplyScalar(0.35);
    (this.#grid.material as THREE.LineBasicMaterial).color.set(c.grid);
    (this.#grid.material as THREE.LineBasicMaterial).vertexColors = false;
    (this.#grid.material as THREE.Material).needsUpdate = true;
  }

  /** Point the camera at everything the demonstration covers, from the current angle. */
  frame(clip: DemoClip): void {
    const box = new THREE.Box3();
    const take = (s: Solved) => { for (const j of JOINTS) box.expandByPoint(v3(s[j].pos)); };
    for (let i = 0; i < 8; i++) take(solve(clip, i / 8));
    box.expandByScalar(0.2);
    for (const p of clip.props) if (p.hold === "none") box.expandByPoint(new THREE.Vector3(p.at[0], Math.max(p.at[1], 0.3), p.at[2]));
    box.min.y = Math.min(box.min.y, 0);
    box.getCenter(this.#target);
    const size = box.getSize(new THREE.Vector3());
    // Tall and narrow (standing) or long and low (lying): whichever needs more room.
    this.#radius = Math.max(size.y / 2, Math.hypot(size.x, size.z) / 2) * 1.08;
  }

  setView(around: number, above = this.#view.above): void { this.#view = { around, above: Math.max(-5, Math.min(80, above)) }; }
  turnView(dAround: number, dAbove: number): void { this.setView(this.#view.around + dAround, this.#view.above + dAbove); }
  zoomBy(k: number): void { this.#zoom = Math.max(0.4, Math.min(2.5, this.#zoom * k)); }
  get view() { return this.#view; }
  resetView(): void { this.#view = { around: 35, above: 12 }; this.#zoom = 1; this.select(null); }

  select(joint: Joint | null): void {
    if (this.#selected) this.#knobs[this.#selected].material = this.#mat.joint;
    this.#selected = joint;
    if (joint) this.#knobs[joint].material = this.#mat.select;
  }

  /** The joint under a point of the canvas, if any. */
  pick(clientX: number, clientY: number): Joint | null {
    const r = this.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.#camera);
    // Fingers are blunt: the nearest knob to the ray within a few centimetres, not only a direct hit.
    let best: Joint | null = null, bestD = 0.09;
    const p = new THREE.Vector3();
    for (const j of JOINTS) {
      const d = ray.ray.distanceToPoint(this.#knobs[j].getWorldPosition(p));
      if (d < bestD) { bestD = d; best = j; }
    }
    return best;
  }

  drawPhase(clip: DemoClip, phase: number): void { this.#draw(solve(clip, phase)); }
  drawPose(clip: DemoClip, pose: DemoPose): void { this.#draw(solvePose(clip, pose)); }

  #draw(s: Solved): void {
    for (const j of JOINTS) {
      this.#joints[j].position.set(...s[j].pos);
      this.#joints[j].quaternion.set(...s[j].rot);
    }
    for (const d of this.#drawProps) d(s);
    this.render();
  }

  render(): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    const size = this.#renderer.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h) {
      this.#renderer.setSize(w, h, false);
      this.#camera.aspect = w / h;
    }
    const half = (this.#camera.fov * Math.PI) / 360;
    const fit = this.#radius / Math.sin(Math.atan(Math.tan(half) * Math.min(1, this.#camera.aspect)));
    const dist = fit * this.#zoom;
    const a = (this.#view.around * Math.PI) / 180, e = (this.#view.above * Math.PI) / 180;
    this.#camera.position.set(this.#target.x + dist * Math.sin(a) * Math.cos(e), this.#target.y + dist * Math.sin(e), this.#target.z + dist * Math.cos(a) * Math.cos(e));
    this.#camera.lookAt(this.#target);
    this.#camera.updateProjectionMatrix();
    // The light comes over the viewer's shoulder, so the side being looked at is lit.
    this.#light.target.position.copy(this.#target);
    this.#light.position.set(this.#target.x + 3 * Math.sin(a + 0.7), this.#target.y + 4.5, this.#target.z + 3 * Math.cos(a + 0.7));
    this.#renderer.render(this.#scene, this.#camera);
  }

  /** Set while the app is in the background and the stage has handed its own context back. */
  parked = false;

  /**
   * The app is going to the background: hand the 3D context back, leaving a picture of the last frame
   * in its place. On this phone, coming back to the app resets the graphics driver; a live context is
   * lost in that reset, the WebView blames the page and refuses it another until the app restarts. A
   * context already given back isn't there to be reset.
   */
  park(): void {
    if (this.parked || this.lost) return;
    const holder = this.canvas.parentElement;
    if (holder) {
      this.render();
      holder.style.backgroundImage = `url(${this.canvas.toDataURL("image/jpeg", 0.85)})`;
      holder.style.backgroundSize = "100% 100%";
    }
    this.canvas.style.visibility = "hidden";
    this.parked = true;
    this.#renderer.forceContextLoss();
  }

  /** The app is back: ask for the context again. The picture stays until it has come. */
  unpark(): void {
    if (!this.parked) return;
    this.canvas.addEventListener("webglcontextrestored", () => {
      this.canvas.style.visibility = "";
      const holder = this.canvas.parentElement;
      if (holder) holder.style.backgroundImage = "";
      this.render();
    }, { once: true });
    this.parked = false;
    this.#renderer.forceContextRestore();
  }

  /** The phone took the 3D context away (and hasn't given it back). */
  get lost(): boolean { return this.#renderer.getContext().isContextLost(); }

  dispose(): void {
    this.#clearProps();
    this.#scene.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    for (const m of Object.values(this.#mat)) m.dispose();
    this.#renderer.dispose();
    // Give the 3D context back now: a WebView allows only a few, and waiting for the collector runs out of them.
    if (!this.lost) this.#renderer.forceContextLoss();
  }
}

let shared: Stage | null = null;
let watching = false;

/**
 * The app's one 3D stage, made on first use and kept: every demonstration is drawn on it, its canvas
 * moved to wherever one is showing. Making and dropping a 3D context each time a demonstration was
 * shown crashed the phone's WebView after enough of them. `fresh` replaces it (after its context was
 * lost and didn't come back).
 */
export function sharedStage(colors: StageColors, fresh = false): Stage {
  if (fresh && shared) {
    shared.dispose();
    shared = null;
  }
  if (!watching) {
    watching = true;
    // Out of the 3D context while the app is in the background; back in it a moment after returning,
    // once the phone has finished whatever it does to the graphics on the way back.
    if (ON_ANDROID) document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") shared?.park();
      else setTimeout(() => { if (document.visibilityState === "visible") shared?.unpark(); }, 1500);
    });
  }
  if (!shared) shared = new Stage(document.createElement("canvas"), colors);
  else shared.setColors(colors);
  return shared;
}
