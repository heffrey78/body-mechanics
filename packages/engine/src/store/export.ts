/**
 * Export (#30, #6): every record decrypted, as plain YAML in the repository's own layout, plus
 * sets.csv with one row per set (per side for one-sided sets), loads in the person's units. Readable
 * in a text editor and a spreadsheet without the app.
 */
import type { FilesPort } from "../ports/files-port.ts";
import type { Session } from "../records/schemas.ts";
import { serializeRecord } from "../records/yaml.ts";
import type { Vault } from "../vault/vault.ts";

const KG_TO_LB = 2.2046226218;

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** The sets of `sessions` as CSV rows (a header first). `names` turns exercise ids into names. */
export function setsCsv(sessions: Session[], units: "kg" | "lb", names: (exercise: string) => string = (x) => x): string {
  const load = (kg: number | undefined) => (kg === undefined ? "" : units === "lb" ? Math.round(kg * KG_TO_LB * 10) / 10 : kg);
  const rows: unknown[][] = [["date", "session", "exercise", "set", "side", "reps", "seconds", "metres", `load_${units}`, "effort", "modifiers", "note"]];
  for (const s of [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    for (const e of s.entries.filter((x) => !x.deleted)) {
      e.sets.filter((x) => !x.deleted).forEach((set, i) => {
        const common = [s.startedAt.slice(0, 10), s.id, names(e.exercise), i + 1];
        const tail = [load(set.loadKg), e.effort ?? "", e.modifiers.map((m) => m.value ? `${m.id}=${m.value}` : m.id).join(" "), set.note ?? ""];
        if (set.left || set.right) {
          for (const [side, a] of [["left", set.left], ["right", set.right]] as const) rows.push([...common, side, a?.reps ?? "", a?.seconds ?? "", a?.metres ?? "", ...tail]);
        } else {
          rows.push([...common, "", set.reps ?? "", set.seconds ?? "", set.metres ?? "", ...tail]);
        }
      });
    }
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

/** Writes the export under `dest` (made if missing); returns how many records and set rows it wrote. */
export async function exportAll(vault: Vault, files: FilesPort, dest: string, units: "kg" | "lb", names?: (exercise: string) => string): Promise<{ records: number; rows: number }> {
  const paths = await vault.list();
  const sessions: Session[] = [];
  await files.makeDir(dest);
  for (const path of paths) {
    const record = await vault.read(path);
    if (!record) continue;
    if (record.type === "session") sessions.push(record);
    await files.write(files.join(dest, ...path.replace(/\.age$/, "").split("/")), serializeRecord(record));
  }
  const csv = setsCsv(sessions, units, names);
  await files.write(files.join(dest, "sets.csv"), csv);
  await files.write(files.join(dest, "README.txt"), `Body Mechanics export\n\nEvery record as plain YAML, in the same folders as the repository, and sets.csv with one row per set\n(one per side for one-sided sets), loads in ${units}. Nothing here is encrypted: keep it somewhere safe.\n`);
  return { records: paths.length, rows: csv.trimEnd().split("\n").length - 1 };
}
