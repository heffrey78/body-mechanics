import { describe, expect, it } from "vitest";
import { Vault, catalogue, fits, fromCatalogue, loadEquipment, memoryFilesPort, memorySecretsPort, standsInOf, type EquipmentItem, mentioned, needsFromLegacy, starterLocations, suggest, type Context, type LibraryItem } from "../src/index.ts";

const library: LibraryItem[] = catalogue().entries.map(fromCatalogue);
const now = new Date("2026-11-17T08:00:00.000Z");
const ctx = (lib: LibraryItem[]): Context => ({ library: lib, done: [], refused: new Set(), history: [], lastTime: () => undefined, units: "kg", now });

describe("equipment as alternatives and optional items (D4, #58)", () => {
  it("needs one alternative of every group; optional items never stop it", () => {
    expect(fits([["chair", "bench", "step"]], new Set(["bench"]))).toBe(true);
    expect(fits([["barbell", "dumbbells"], ["bench"]], new Set(["dumbbells"]))).toBe(false);
    expect(fits([], new Set())).toBe(true);
    expect(mentioned({ needs: [["chair", "bench"]], optional: ["mat"] })).toEqual(["chair", "bench", "mat"]);
  });

  it("reads an old flat list with the old stand-in groups", () => {
    expect(needsFromLegacy(["dumbbells", "kettlebell"])).toEqual([["dumbbells", "kettlebell"]]);
    expect(needsFromLegacy(["barbell", "bench"])).toEqual([["barbell"], ["bench"]]);
    expect(needsFromLegacy(["floor", "mat", "band"])).toEqual([["floor", "mat"], ["band"]]);
  });

  it("lets an item stand in for others (a plyo box for a step, bench or chair)", () => {
    expect(fits([["chair"]], new Set(["plyo-box"]), new Map([["plyo-box", ["step", "bench", "chair"]]]))).toBe(true);
    expect(fits([["chair"]], new Set(["plyo-box"]))).toBe(false);
  });

  it("suggests a box squat at a gym with only a bench once it says chair, bench or step", () => {
    const gym = starterLocations().find((l) => l.name === "Gym")!;
    const answers = { location: gym, sweat: 2 as const, area: ["quads" as const], kinds: ["strength" as const] };
    // The catalogue says chair, bench or step now (#59); read the old way (a chair only), the gym misses it.
    expect(library.find((x) => x.id === "bm:box-squat")!.needs).toEqual([["chair", "bench", "step"]]);
    expect(suggest(answers, ctx(library)).some((s) => s.item.id === "bm:box-squat")).toBe(true);
    const old = library.map((x) => (x.id === "bm:box-squat" ? { ...x, needs: needsFromLegacy(["chair"]) as LibraryItem["needs"] } : x));
    expect(suggest(answers, ctx(old)).some((s) => s.item.id === "bm:box-squat")).toBe(false);
    // A mat as optional: suggested at the office, which has none.
    const office = starterLocations().find((l) => l.name === "Office")!;
    const withMat = library.map((x) => (x.id === "bm:chin-tuck" ? { ...x, needs: [], optional: ["mat" as const] } : x));
    expect(suggest({ location: office, sweat: 0, area: ["neck"], kinds: [] }, ctx(withMat)).some((s) => s.item.id === "bm:chin-tuck")).toBe(true);
  });

  it("custom equipment (#60): a TRX only where it's listed; a plyo box standing in for a bench", async () => {
    const files = memoryFilesPort();
    const { vault } = await Vault.create({ files, secrets: memorySecretsPort() }, "/r", "correct horse battery", { scryptLogN: 10 });
    const trx: EquipmentItem = { type: "equipment", v: 1, id: "tttttttttttttttt", name: "TRX", standsIn: [] };
    const plyo: EquipmentItem = { type: "equipment", v: 1, id: "pppppppppppppppp", name: "Plyo box", standsIn: ["step", "bench", "chair"] };
    expect(await vault.write(trx)).toBe("equipment/tttttttttttttttt.yaml.age");
    await vault.write(plyo);
    await vault.write({ ...plyo, id: "dddddddddddddddd", name: "Gone", deleted: true });
    const items = await loadEquipment(vault);
    expect(items.map((x) => x.name)).toEqual(["Plyo box", "TRX"]);
    const row: LibraryItem = { id: "rrrrrrrrrrrrrrrr", name: "TRX row", aliases: [], works: ["upperback"], strains: [], kinds: ["strength"], tags: [], measure: "reps", sided: false, equipment: [trx.id], needs: [[trx.id]], optional: [], sweat: 1, own: true };
    const home = starterLocations().find((l) => l.name === "Home")!;
    const answers = (equipment: string[]) => ({ location: { ...home, equipment }, sweat: 2 as const, area: [], kinds: [] });
    const lib = [...library, row];
    const standsIn = standsInOf(items);
    expect(suggest(answers(home.equipment), { ...ctx(lib), standsIn }).some((s) => s.item.id === row.id)).toBe(false);
    expect(suggest(answers([...home.equipment, trx.id]), { ...ctx(lib), standsIn }).some((s) => s.item.id === row.id)).toBe(true);
    // Bulgarian split squats need a bench, chair or step: a plyo box alone will do.
    expect(suggest(answers(["floor", plyo.id]), { ...ctx(lib), standsIn }).some((s) => s.item.id === "bm:bulgarian-split-squat")).toBe(true);
    expect(suggest(answers(["floor"]), { ...ctx(lib), standsIn }).some((s) => s.item.id === "bm:bulgarian-split-squat")).toBe(false);
  });
});
