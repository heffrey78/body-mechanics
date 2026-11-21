import { describe, expect, it } from "vitest";
import { REGIONS, SIDED_REGIONS } from "@bm/engine";
import { AREAS, MUSCLES, SCREEN_RIGHT } from "../src/body/figure.ts";

describe("the body map's figure (#89)", () => {
  it("shows every region on the front or the back", () => {
    const shown = new Set([...AREAS.front, ...AREAS.back].map((a) => a.region));
    expect([...shown].sort()).toEqual([...REGIONS].sort());
  });

  it("shows no region twice on one face", () => {
    for (const face of ["front", "back"] as const) {
      const regions = AREAS[face].map((a) => a.region);
      expect(new Set(regions).size).toBe(regions.length);
    }
  });

  it("draws only regions without sides across the midline", () => {
    for (const a of [...AREAS.front, ...AREAS.back]) {
      if (a.whole) expect(SIDED_REGIONS).not.toContain(a.region);
    }
  });

  it("draws each half-shape right of the midline, with its letter inside the box", () => {
    for (const a of [...AREAS.front, ...AREAS.back]) {
      const xs = [...a.d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
      expect(xs.length).toBeGreaterThan(3);
      if (!a.whole) expect(Math.min(...xs)).toBeGreaterThanOrEqual(100);
      expect(Math.max(...xs)).toBeLessThanOrEqual(170);
      expect(a.at[0]).toBeGreaterThanOrEqual(100);
    }
  });

  it("mirrors the front: the person's left is on the right of the screen, and the reverse from behind", () => {
    expect(SCREEN_RIGHT).toEqual({ front: "left", back: "right" });
  });

  it("has muscle lines on both faces", () => {
    expect(MUSCLES.front.length).toBeGreaterThan(10);
    expect(MUSCLES.back.length).toBeGreaterThan(10);
  });
});
