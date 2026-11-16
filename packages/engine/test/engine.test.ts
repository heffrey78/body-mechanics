import { describe, expect, it } from "vitest";
import { ENGINE_VERSION } from "../src/index.ts";

describe("engine", () => {
  it("has a version", () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
