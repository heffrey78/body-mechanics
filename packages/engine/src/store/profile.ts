import { newId } from "../records/ids.ts";
import type { Profile } from "../records/schemas.ts";
import type { Vault } from "../vault/vault.ts";

/** The profile (#27): one per repository, at profile.yaml.age, made with defaults the first time. */
export async function loadProfile(vault: Vault, defaults: Partial<Pick<Profile, "units" | "theme">> = {}): Promise<{ profile: Profile; created: boolean }> {
  const existing = await vault.read("profile.yaml.age");
  if (existing?.type === "profile") return { profile: existing, created: false };
  const profile: Profile = {
    type: "profile", v: 1, id: newId(),
    units: defaults.units ?? "kg",
    theme: defaults.theme ?? { name: "clinic", mode: "system" },
  };
  await vault.write(profile);
  return { profile, created: true };
}

/** Rounds a load for showing in the profile's units (#27): kilograms stored, pounds to the nearest 0.5. */
export function showLoad(kg: number, units: "kg" | "lb"): string {
  if (units === "kg") return `${Math.round(kg * 10) / 10} kg`;
  return `${Math.round(kg * 2.2046226218 * 2) / 2} lb`;
}

/** A load typed in the profile's units, as kilograms to store. */
export function toKg(value: number, units: "kg" | "lb"): number {
  return units === "kg" ? value : Math.round((value / 2.2046226218) * 1000) / 1000;
}
