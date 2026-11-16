/**
 * Routines and locations (#34): few, small records, read whole when the records open (the session
 * index is for the thousands of sessions). Deleted ones are tombstones until the merge has seen both
 * sides (#29), so they're left out here.
 */
import { newId } from "../records/ids.ts";
import type { Location, Routine } from "../records/schemas.ts";
import type { Vault } from "../vault/vault.ts";

async function load<T extends Routine | Location>(vault: Vault, dir: string, type: T["type"]): Promise<T[]> {
  const { records } = await vault.readMany(await vault.list(dir));
  return [...records.values()].filter((r): r is T => r.type === type && !(r as T).deleted).sort((a, b) => (a as T).name.localeCompare((b as T).name));
}

export const loadRoutines = (vault: Vault) => load<Routine>(vault, "routines", "routine");
export const loadLocations = (vault: Vault) => load<Location>(vault, "locations", "location");

/** The starter locations (#41), made the first time locations are opened. */
export function starterLocations(): Location[] {
  const loc = (name: string, equipment: Location["equipment"], sweat: Location["sweat"]): Location => ({ type: "location", v: 1, id: newId(), name, equipment, sweat });
  return [
    loc("Home", ["floor", "wall", "chair", "step", "mat"], 1),
    loc("Office", ["wall", "chair", "desk"], 0),
    loc("Gym", ["floor", "wall", "bench", "mat", "band", "dumbbells", "kettlebell", "barbell", "pullup-bar", "cable", "foam-roller", "machine", "step"], 2),
    loc("Hotel", ["floor", "wall", "chair", "desk"], 1),
  ];
}
