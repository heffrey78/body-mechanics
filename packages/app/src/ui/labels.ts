import type { Equipment, ExerciseTag, Kind, Measure, Position, Region } from "@bm/engine";

export const REGION_LABEL: Record<Region, string> = {
  neck: "Neck", shoulder: "Shoulder", chest: "Chest", upperback: "Upper back", upperarm: "Upper arm", forearm: "Forearm & wrist",
  core: "Core", lowerback: "Lower back", hips: "Hips", glutes: "Glutes", quads: "Quads", hamstrings: "Hamstrings",
  knee: "Knee", shin: "Shin", calf: "Calf", ankle: "Ankle & foot",
};

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  floor: "Floor", wall: "Wall", chair: "Chair", desk: "Desk", step: "Step", bench: "Bench", mat: "Mat", band: "Band",
  dumbbells: "Dumbbells", kettlebell: "Kettlebell", barbell: "Barbell", "pullup-bar": "Pull-up bar", cable: "Cable",
  "foam-roller": "Foam roller", machine: "Machine",
};

export const MEASURE_LABEL: Record<Measure, string> = { reps: "Reps", time: "Time", distance: "Distance" };
export const KIND_LABEL: Record<Kind, string> = { mobility: "Mobility", strength: "Strength", endurance: "Endurance", balance: "Balance" };
/** Exercise tags and positions (#109). */
export const TAG_LABEL: Record<ExerciseTag, string> = { stretch: "Stretch", yoga: "Yoga pose", breathing: "Breathing", calming: "Calming" };
export const POSITION_LABEL: Record<Position, string> = { standing: "Standing", kneeling: "Kneeling", seated: "Seated", lying: "Lying down" };
export const SWEAT_LABEL = ["No sweat", "Some", "Lots"] as const;

/** A built-in item's label, or a custom item's name (#60); an unknown id (deleted, or not synced yet) as "Other". */
export function equipmentLabel(id: string, custom: ReadonlyMap<string, { name: string }>): string {
  return (EQUIPMENT_LABEL as Record<string, string>)[id] ?? custom.get(id)?.name ?? "Other";
}
