/** Which model a piece of equipment is drawn with (#76). Kept apart from the stage so it needs no 3D code. */
import { EQUIPMENT, type Equipment, type EquipmentItem } from "@bm/engine";

/** A built-in equipment item, or a plain box for anything else. */
export type PropModel = Equipment | "box";

/** Equipment that can sit in the hands; the rest is placed in the scene. */
export const HOLDABLE: readonly PropModel[] = ["dumbbells", "kettlebell", "barbell", "band", "cable"];

/** A built-in item is its own model; one of the person's own uses what it stands in for, or a box. */
export function propModels(custom: readonly EquipmentItem[]): (kind: string) => PropModel {
  return (kind) => ((EQUIPMENT as readonly string[]).includes(kind) ? (kind as Equipment) : custom.find((c) => c.id === kind)?.standsIn[0] ?? "box");
}
