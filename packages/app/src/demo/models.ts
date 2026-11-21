/** Which model a piece of equipment is drawn with (#76, #96). Kept apart from the stage so it needs no 3D code. */
import { EQUIPMENT, type EquipmentItem, type Shape } from "@bm/engine";

/** A built-in item's own model, or a plain shape: a wheel with handles, a ball, a box. */
export type PropModel = Shape | "floor";

/** Equipment that can sit in the hands; the rest is placed in the scene. */
export const HOLDABLE: readonly PropModel[] = ["dumbbells", "kettlebell", "barbell", "band", "cable", "wheel", "ball", "foam-roller"];
/** What one of in each hand makes sense for: the rest is one item, however many hands are on it. */
export const PAIRED: readonly PropModel[] = ["dumbbells", "kettlebell"];

type Hand = "L" | "R";
/**
 * How a piece of equipment is carried (#95), from what it is and the hold chosen:
 * `placed` in the scene; `each` hand has its own; `one` item sits between the palms, turned with the
 * hands; `across` the palms like a bar (its length runs from hand to hand); a `strand` runs to the hands.
 */
export function carry(kind: PropModel, hold: string): { how: "placed" | "each" | "one" | "across" | "strand"; sides: readonly Hand[] } {
  const sides: readonly Hand[] = hold === "both" || hold === "together" ? ["L", "R"] : hold === "left" ? ["L"] : hold === "right" ? ["R"] : [];
  if (!sides.length || !HOLDABLE.includes(kind)) return { how: "placed", sides: [] };
  if (kind === "band" || kind === "cable") return { how: "strand", sides };
  if (kind === "wheel" || kind === "foam-roller") return { how: "across", sides: ["L", "R"] };
  if (kind === "ball") return { how: "one", sides: ["L", "R"] };
  if (kind === "barbell") return { how: sides.length === 2 ? "across" : "each", sides };
  return { how: hold === "together" ? "one" : "each", sides };
}

/** Own equipment with no shape chosen and nothing it stands in for: what its name suggests. */
const BY_NAME: readonly [RegExp, Shape][] = [
  [/\b(ab|abs|roll[- ]?out)\b.*\b(roller|wheel)\b|\bwheel\b/i, "wheel"],
  [/\bfoam\b|\broller\b/i, "foam-roller"],
  [/\bkettle/i, "kettlebell"],
  [/\bball\b|\bslam\b|\bbosu\b/i, "ball"],
  [/\bband\b|\bstrap\b|\btrx\b|\brope\b/i, "band"],
  [/\bbar\b/i, "barbell"],
  [/\bmat\b/i, "mat"],
];

/** A built-in item is its own model; one of the person's own uses the shape it was given, else what it stands in for, else a guess from its name, else a box. */
export function propModels(custom: readonly EquipmentItem[]): (kind: string) => PropModel {
  return (kind) => {
    if ((EQUIPMENT as readonly string[]).includes(kind)) return kind as PropModel;
    const own = custom.find((c) => c.id === kind);
    if (!own) return "box";
    if (own.looks) return own.looks;
    const stands = own.standsIn.find((e) => e !== "floor");
    return stands ?? BY_NAME.find(([re]) => re.test(own.name))?.[1] ?? "box";
  };
}
