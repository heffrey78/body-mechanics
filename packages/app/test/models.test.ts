import { describe, expect, it } from "vitest";
import type { EquipmentItem } from "@bm/engine";
import { carry, propModels } from "../src/demo/models.ts";

const own = (id: string, name: string, over: Partial<EquipmentItem> = {}): EquipmentItem => ({ type: "equipment", v: 1, id, name, standsIn: [], ...over });

/** What a piece of equipment is drawn as, and how it's carried (#95, #96). */
describe("equipment models", () => {
  const modelOf = propModels([
    own("a", "Ab roller"), own("b", "Sandbag", { looks: "ball" }), own("c", "Plyo box", { standsIn: ["step", "bench"] }),
    own("d", "Foam roller, short"), own("e", "Thing"), own("f", "Ab wheel", { standsIn: ["floor"] }),
  ]);

  it("uses the shape chosen, then what it stands in for, then its name, then a box", () => {
    expect(modelOf("kettlebell")).toBe("kettlebell");
    expect(modelOf("a")).toBe("wheel");
    expect(modelOf("b")).toBe("ball");
    expect(modelOf("c")).toBe("step");
    expect(modelOf("d")).toBe("foam-roller");
    expect(modelOf("e")).toBe("box");
    expect(modelOf("f")).toBe("wheel");
    expect(modelOf("gone")).toBe("box");
  });

  it("carries a pair one in each hand or both hands on one, and a wheel across the palms", () => {
    expect(carry("kettlebell", "both")).toEqual({ how: "each", sides: ["L", "R"] });
    expect(carry("kettlebell", "together")).toEqual({ how: "one", sides: ["L", "R"] });
    expect(carry("kettlebell", "left")).toEqual({ how: "each", sides: ["L"] });
    expect(carry("kettlebell", "none").how).toBe("placed");
    expect(carry("wheel", "together").how).toBe("across");
    expect(carry("barbell", "both").how).toBe("across");
    expect(carry("band", "both").how).toBe("strand");
    expect(carry("chair", "both").how).toBe("placed");
  });
});
