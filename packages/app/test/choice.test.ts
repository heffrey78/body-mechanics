import { describe, expect, it } from "vitest";
import { THEMES, normaliseTheme } from "../src/theme/choice.ts";

/** A choice stored on the device before Build 4 (#72) opens as Field Notes, keeping its mode. */
describe("stored theme choices", () => {
  it("offers the five themes, Field Notes first", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["fieldnotes", "slate", "turquoise", "riso", "handheld"]);
  });

  for (const old of ["clinic", "studio", "utility"]) {
    it(`${old} becomes fieldnotes with the same mode`, () => {
      expect(normaliseTheme({ name: old, mode: "dark" })).toEqual({ name: "fieldnotes", mode: "dark" });
    });
  }

  it("keeps a current choice as it is", () => {
    expect(normaliseTheme({ name: "riso", mode: "light" })).toEqual({ name: "riso", mode: "light" });
  });

  it("nothing stored, or nonsense, is the default", () => {
    expect(normaliseTheme(null)).toEqual({ name: "fieldnotes", mode: "system" });
    expect(normaliseTheme({ name: "x", mode: "y" })).toEqual({ name: "fieldnotes", mode: "system" });
  });
});
