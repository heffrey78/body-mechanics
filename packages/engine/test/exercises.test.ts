import { describe, expect, it } from "vitest";
import { Vault, catalogue, createExercise, loadLibrary, memoryFilesPort, memorySecretsPort, search, starterLocations, suggest, type ExerciseOverride } from "../src/index.ts";

const now = new Date("2026-11-17T08:00:00.000Z");

describe("your exercises and your versions of catalogue ones (#61)", () => {
  it("lays an override over the catalogue entry, and Reset (deleting it) brings the catalogue's back", async () => {
    const files = memoryFilesPort();
    const { vault } = await Vault.create({ files, secrets: memorySecretsPort() }, "/r", "correct horse battery", { scryptLogN: 10 });
    const o: ExerciseOverride = { type: "override", v: 1, id: "oooooooooooooooo", of: "bm:hip-thrust", needs: [["bench", "chair", "floor"]], sweat: 1 };
    expect(await vault.write(o)).toBe("overrides/oooooooooooooooo.yaml.age");
    let lib = await loadLibrary(vault);
    const ht = lib.find((x) => x.id === "bm:hip-thrust")!;
    expect(ht).toMatchObject({ overridden: true, needs: [["bench", "chair", "floor"]], sweat: 1 });
    // What wasn't overridden still comes from the catalogue.
    const cat = catalogue().entries.find((e) => e.id === "bm:hip-thrust")!;
    expect(ht.optional).toEqual(cat.optional);
    expect(ht.works).toEqual(cat.works);
    await vault.write({ ...o, deleted: true });
    lib = await loadLibrary(vault);
    expect(lib.find((x) => x.id === "bm:hip-thrust")).toMatchObject({ sweat: cat.sweat, needs: cat.needs });
    expect(lib.find((x) => x.id === "bm:hip-thrust")!.overridden).toBeUndefined();
  });

  it("keeps a deleted exercise of your own for history's names, out of search and suggestions", async () => {
    const files = memoryFilesPort();
    const { vault } = await Vault.create({ files, secrets: memorySecretsPort() }, "/r", "correct horse battery", { scryptLogN: 10 });
    const mine = await createExercise(vault, { name: "Couch sit to stand", aliases: [], measure: "reps", sided: false, works: ["quads"], strains: [], kinds: ["strength"], equipment: [], sweat: 0, instructions: "From the couch, stand." });
    let lib = await loadLibrary(vault);
    expect(lib.find((x) => x.id === mine.id)?.instructions).toBe("From the couch, stand.");
    expect(search("couch sit", lib)[0]?.item.id).toBe(mine.id);
    const [record] = [...(await vault.readMany(await vault.list("exercises"))).records.values()];
    await vault.write({ ...record!, deleted: true } as never);
    lib = await loadLibrary(vault);
    expect(lib.find((x) => x.id === mine.id)).toMatchObject({ name: "Couch sit to stand", deleted: true });
    expect(search("couch sit", lib).some((h) => h.item.id === mine.id)).toBe(false);
    const ctx = { library: lib, done: [], refused: new Set<string>(), history: [], lastTime: () => undefined, units: "kg" as const, now };
    expect(suggest({ location: starterLocations()[0]!, sweat: 2, area: ["quads"], kinds: ["strength"] }, ctx).some((s) => s.item.id === mine.id)).toBe(false);
  });
});
