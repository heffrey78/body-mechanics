import type { Equipment, Kind, Measure, Region } from "@bm/engine";

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
export const SWEAT_LABEL = ["No sweat", "Some", "Lots"] as const;
