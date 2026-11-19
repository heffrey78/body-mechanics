import { describe, expect, it } from "vitest";
import {
  BUILT_IN_DEMOS, Demo, PRESETS, STANDING, Vault, ball, catalogue, copySide, demoFor, demoPose, floorHeight, loadDemos, memoryFilesPort, memorySecretsPort,
  mergeRecords, mirrorPose, newDemo, palm, recordPath, solve, solvePose, stampChanges, type DemoClip, type Vec3,
} from "../src/index.ts";

const near = (a: Vec3, b: Vec3, eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]!) < eps);
const standing = PRESETS[0].pose;
const clip = (over: Partial<DemoClip>): DemoClip => ({ seconds: 2, loop: "there-and-back", anchor: "free", props: [], frames: [{ id: "a", t: 0, pose: standing }], ...over });

describe("the body model's pose maths (#79)", () => {
  it("stands 1.75 m tall with its soles on the floor, the person's left at +x", () => {
    const s = solve(clip({}), 0);
    expect(s.head.pos[1] + 0.205).toBeCloseTo(1.755, 3);
    expect(s.ankleL.pos[1]).toBeCloseTo(0.07, 3);
    expect(s.shoulderL.pos[0]).toBeGreaterThan(0);
    expect(floorHeight(standing)).toBeCloseTo(STANDING, 2);
  });

  it("reads angles as forward, to the side and twist, the same on both sides", () => {
    const s = solve(clip({ frames: [{ id: "a", t: 0, pose: demoPose([0, STANDING, 0], [0, 0, 0], { shoulderL: [90, 0, 0], shoulderR: [0, 90, 0], hipL: [0, 0, 90], kneeL: [-90, 0, 0] }) }] }), 0);
    // Left arm straight forward, right arm straight out to the right.
    expect(near(s.elbowL.pos, [s.shoulderL.pos[0], s.shoulderL.pos[1], 0.29])).toBe(true);
    expect(near(s.elbowR.pos, [s.shoulderR.pos[0] - 0.29, s.shoulderR.pos[1], 0])).toBe(true);
    // Left leg turned out a quarter turn, then the knee bent: the shin points to the right, behind the turned thigh.
    expect(near(s.ankleL.pos, [s.kneeL.pos[0] - 0.42, s.kneeL.pos[1], 0])).toBe(true);
    // The trunk: bent forward moves the head forward; leaned left moves it left.
    const bent = solve(clip({ frames: [{ id: "a", t: 0, pose: demoPose([0, STANDING, 0], [0, 0, 0], { spine: [30, 20, 0] }) }] }), 0);
    expect(bent.head.pos[2]).toBeGreaterThan(0.1);
    expect(bent.head.pos[0]).toBeGreaterThan(0.05);
  });

  it("blends key poses: there and back, or round again", () => {
    const up = demoPose([0, STANDING, 0], [0, 0, 0], { shoulderL: [180, 0, 0] });
    const frames = [{ id: "a", t: 0, pose: standing }, { id: "b", t: 1, pose: up }];
    const back = clip({ frames });
    expect(solve(back, 0).wristL.pos[1]).toBeLessThan(1);
    expect(solve(back, 0.5).wristL.pos[1]).toBeGreaterThan(1.9);
    // Halfway out and halfway back are the same pose: the arm straight forward.
    expect(near(solve(back, 0.25).wristL.pos, solve(back, 0.75).wristL.pos)).toBe(true);
    expect(solve(back, 0.25).wristL.pos[2]).toBeCloseTo(0.55, 2);
    expect(near(solve(back, 1).wristL.pos, solve(back, 0).wristL.pos)).toBe(true);
    const round = clip({ loop: "round", frames: [{ id: "a", t: 0, pose: standing }, { id: "b", t: 0.5, pose: up }] });
    expect(solve(round, 0.5).wristL.pos[1]).toBeGreaterThan(1.9);
    expect(solve(round, 0.75).wristL.pos[2]).toBeCloseTo(0.55, 2);
    expect(near(solve(round, 0.999999).wristL.pos, solve(round, 0).wristL.pos, 1e-3)).toBe(true);
  });

  it("keeps the feet planted through a squat, and the body on the floor", () => {
    const squat = BUILT_IN_DEMOS["bm:bodyweight-squat"]!;
    const top = solve(squat, 0), bottom = solve(squat, 0.5), part = solve(squat, 0.2);
    expect(near(ball(top, "L"), ball(bottom, "L"), 1e-6)).toBe(false);
    for (const s of [bottom, part]) {
      const a = ball(top, "L"), b = ball(top, "R"), c = ball(s, "L"), d = ball(s, "R");
      expect(near([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2, (c[2] + d[2]) / 2])).toBe(true);
    }
    expect(bottom.pelvis.pos[1]).toBeLessThan(0.65);
    expect(bottom.ankleL.pos[1]).toBeCloseTo(top.ankleL.pos[1], 1);
    // On the floor: a pose authored in mid-air comes down to it.
    const lying = solvePose(clip({ anchor: "floor" }), { ...PRESETS[2].pose, at: [0, 1.5, 0] });
    expect(lying.pelvis.pos[1]).toBeLessThan(0.15);
  });

  it("keeps the hands where they were put through a pull-up", () => {
    const hang = PRESETS[6].pose;
    const pulled = demoPose(hang.at, [0, 0, 0], { shoulderL: [60, 60, 0], shoulderR: [60, 60, 0], elbowL: [140, 0, 0], elbowR: [140, 0, 0] });
    const c = clip({ anchor: "hands", frames: [{ id: "a", t: 0, pose: hang }, { id: "b", t: 1, pose: pulled }] });
    const a = solve(c, 0), b = solve(c, 0.5);
    const hands = (s: typeof a) => [(palm(s, "L")[1] + palm(s, "R")[1]) / 2, (palm(s, "L")[2] + palm(s, "R")[2]) / 2];
    expect(hands(a)[0]).toBeCloseTo(2.25, 2);
    expect(hands(b)[0]).toBeCloseTo(hands(a)[0]!, 6);
    expect(hands(b)[1]).toBeCloseTo(hands(a)[1]!, 6);
    expect(b.pelvis.pos[1]).toBeGreaterThan(a.pelvis.pos[1] + 0.2);
  });

  it("mirrors a pose and copies a side", () => {
    const p = demoPose([0.2, 1, 0], [10, 20, 30], { shoulderL: [90, 10, 5], spine: [5, 10, 15], kneeR: [-40, 0, 0] });
    const m = mirrorPose(p);
    expect(m.joints.shoulderR).toEqual([90, 10, 5]);
    expect(m.joints.kneeL).toEqual([-40, 0, 0]);
    expect(m.joints.spine).toEqual([5, -10, -15]);
    expect(m.turn).toEqual([10, -20, -30]);
    expect(mirrorPose(m)).toEqual(p);
    // The mirrored body is the mirror image in space.
    const a = solvePose(clip({}), p), b = solvePose(clip({}), m);
    expect(near(a.wristL.pos, [-b.wristR.pos[0], b.wristR.pos[1], b.wristR.pos[2]])).toBe(true);
    const c = copySide(p, "L");
    expect(c.joints.shoulderR).toEqual([90, 10, 5]);
    expect(c.joints.kneeR).toBeUndefined();
  });
});

describe("demonstrations as records (#81, #82)", () => {
  it("every built-in demonstration is valid and belongs to a catalogue exercise", () => {
    const ids = new Set(catalogue().entries.map((e) => e.id));
    for (const [exercise, c] of Object.entries(BUILT_IN_DEMOS)) {
      expect(ids.has(exercise), exercise).toBe(true);
      const d = Demo.safeParse(newDemo(exercise, c));
      expect(d.success, `${exercise}: ${d.success ? "" : d.error.message}`).toBe(true);
      // Nothing sinks through the floor or flies off at any point of the loop.
      for (let i = 0; i < 20; i++) {
        const s = solve(c, i / 20);
        for (const j of Object.values(s)) expect(j.pos.every(Number.isFinite), exercise).toBe(true);
        expect(Math.min(...Object.values(s).map((j) => j.pos[1])), exercise).toBeGreaterThan(-0.02);
      }
    }
  });

  it("the person's own replaces the built-in one; deleting it brings the built-in back", async () => {
    const files = memoryFilesPort();
    const { vault } = await Vault.create({ files, secrets: memorySecretsPort() }, "/r", "correct horse battery", { scryptLogN: 10 });
    const squat = "bm:bodyweight-squat";
    expect(demoFor(squat, [])?.own).toBeUndefined();
    expect(demoFor("bm:no-such", [])).toBeUndefined();
    const mine = newDemo(squat, BUILT_IN_DEMOS[squat]);
    expect(recordPath(mine)).toBe(`demos/${mine.id}.yaml.age`);
    await vault.write(mine);
    const own = newDemo("aaaaaaaaaaaaaaaa");
    await vault.write(own);
    const loaded = await loadDemos(vault);
    expect(loaded).toHaveLength(2);
    expect(demoFor(squat, loaded)?.own?.id).toBe(mine.id);
    expect(demoFor("aaaaaaaaaaaaaaaa", loaded)?.clip.frames).toHaveLength(2);
    await vault.write({ ...mine, deleted: true });
    expect(demoFor(squat, await loadDemos(vault))?.own).toBeUndefined();
    expect(JSON.stringify(mine).length).toBeLessThan(10_000);
  });

  it("merges two devices' edits: different key poses both kept, the same one by the later edit", () => {
    const base = newDemo("bm:plank");
    const [f1, f2] = base.frames as [typeof base.frames[0], typeof base.frames[0]];
    const edit = (d: typeof base, frame: string, forward: number, stamp: string, extra: Partial<typeof base> = {}) =>
      stampChanges(base as never, { ...d, ...extra, frames: d.frames.map((f) => (f.id === frame ? { ...f, pose: { ...f.pose, joints: { ...f.pose.joints, hipL: [forward, 0, 0] } } } : f)) } as never, stamp) as typeof base;
    const ours = edit(base, f1.id, 30, "2026-11-19T10:00:00.000Z~0000~aaaaaaaaaaaaaaaa", { seconds: 5 });
    const theirs = edit(base, f2.id, 60, "2026-11-19T10:00:01.000Z~0000~bbbbbbbbbbbbbbbb");
    const m = mergeRecords(base, ours, theirs).record as typeof base;
    expect(m.seconds).toBe(5);
    expect(m.frames.find((f) => f.id === f1.id)!.pose.joints.hipL).toEqual([30, 0, 0]);
    expect(m.frames.find((f) => f.id === f2.id)!.pose.joints.hipL).toEqual([60, 0, 0]);
    const clash = edit(base, f1.id, 90, "2026-11-19T10:00:02.000Z~0000~bbbbbbbbbbbbbbbb");
    for (const [a, b] of [[ours, clash], [clash, ours]] as const) {
      expect((mergeRecords(base, a, b).record as typeof base).frames.find((f) => f.id === f1.id)!.pose.joints.hipL).toEqual([90, 0, 0]);
    }
    expect(Demo.safeParse(m).success).toBe(true);
  });
});
