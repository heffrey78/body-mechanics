/**
 * A fast reader for the index (#28): js-yaml's core schema plus the record schema, about 9× quicker
 * than the strict reader (records/yaml.ts) on a session. Only the index reads this way; anything that
 * writes or merges a record reads it strictly. Records are the person's own, encrypted to their key.
 */
import { CORE_SCHEMA, load } from "js-yaml";
import { RecordError } from "../records/yaml.ts";
import { RECORD_SCHEMAS, type AnyRecord, type RecordType } from "../records/schemas.ts";

export function readRecordFast(text: string): AnyRecord {
  const value = load(text, { schema: CORE_SCHEMA }) as { type?: unknown } | null;
  const type = value?.type;
  if (typeof type !== "string" || !(type in RECORD_SCHEMAS)) throw new RecordError([{ path: "type", message: "not a record" }]);
  const result = RECORD_SCHEMAS[type as RecordType].safeParse(value);
  if (!result.success) throw new RecordError(result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  return result.data as AnyRecord;
}
