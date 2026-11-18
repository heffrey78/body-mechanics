/**
 * Where each record lives in the person's repository (D2, #16). Names are opaque ids, so they reveal
 * nothing; a session's folder shows only its year and month. Record files are encrypted: `.yaml.age`.
 */
import type { AnyRecord } from "./schemas.ts";

export const FORMAT_FILE = "format.yaml";
export const IDENTITY_FILE = "keys/identity.age";

export function recordPath(record: AnyRecord): string {
  switch (record.type) {
    case "profile":
      return "profile.yaml.age";
    case "exercise":
      return `exercises/${record.id}.yaml.age`;
    case "routine":
      return `routines/${record.id}.yaml.age`;
    case "location":
      return `locations/${record.id}.yaml.age`;
    case "mark":
      return `marks/${record.id}.yaml.age`;
    case "condition":
      return `conditions/${record.id}.yaml.age`;
    case "equipment":
      return `equipment/${record.id}.yaml.age`;
    case "override":
      return `overrides/${record.id}.yaml.age`;
    case "session": {
      const [year, month] = record.startedAt.split("-");
      return `sessions/${year}/${month}/${record.id}.yaml.age`;
    }
  }
}
