/**
 * What an exercise needs (D4, #58): groups of alternatives, one of each required, plus optional items
 * that never stop it. Ids are built-in equipment names (or, from #60, custom equipment record ids).
 */

/** Today's stand-ins for exercises still saved with a flat equipment list (D1): either-or within a group. */
const LEGACY_GROUPS: readonly (readonly string[])[] = [["dumbbells", "kettlebell", "barbell"], ["band", "cable"], ["step", "bench", "chair"], ["floor", "mat"]];

export interface Needs {
  /** Each inner list: alternatives, one of which is required. */
  needs: string[][];
  /** Nice to have; never required. */
  optional: string[];
}

/**
 * A flat list read the old way: items in the same stand-in group are alternatives (among those listed),
 * everything else is required on its own. So [dumbbells, kettlebell] is one choice, [barbell, bench] two.
 */
export function needsFromLegacy(equipment: readonly string[]): string[][] {
  const byGroup = new Map<number | string, string[]>();
  for (const e of equipment) {
    const g = LEGACY_GROUPS.findIndex((x) => x.includes(e));
    const key = g >= 0 ? g : e;
    byGroup.set(key, [...(byGroup.get(key) ?? []), e]);
  }
  return [...byGroup.values()];
}

/** Every item an exercise mentions, required alternatives and optional, for display and filters. */
export const mentioned = (n: Needs): string[] => [...new Set([...n.needs.flat(), ...n.optional])];

/**
 * Can it be done with what's here? One alternative of every required group. `standsIn` maps an item
 * here (a custom plyo box) to the built-in items it can stand in for.
 */
export function fits(needs: readonly (readonly string[])[], have: ReadonlySet<string>, standsIn: ReadonlyMap<string, readonly string[]> = new Map()): boolean {
  const present = new Set(have);
  for (const h of have) for (const s of standsIn.get(h) ?? []) present.add(s);
  return needs.every((alts) => alts.some((e) => present.has(e)));
}
