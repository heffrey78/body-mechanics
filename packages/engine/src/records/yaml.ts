/**
 * Reading and writing records as YAML (D2, #16), in a strict subset: YAML 1.2's core schema, no
 * anchors or aliases, no tags, no duplicate keys, one document per file. Errors name the field.
 */
import { Document, isAlias, isNode, parseDocument, visit } from "yaml";
import type { z } from "zod";
import { Format, RECORD_SCHEMAS, type AnyRecord, type RecordType } from "./schemas.ts";

export interface Problem {
  /** Where in the record, e.g. `entries[0].sets[2].reps`; empty for the whole file. */
  path: string;
  message: string;
}

export class RecordError extends Error {
  readonly problems: Problem[];
  constructor(problems: Problem[]) {
    super(problems.map((p) => (p.path ? `${p.path}: ${p.message}` : p.message)).join("; "));
    this.problems = problems;
    this.name = "RecordError";
  }
}

function pathOf(path: readonly PropertyKey[]): string {
  let out = "";
  for (const key of path) out += typeof key === "number" ? `[${key}]` : `${out ? "." : ""}${String(key)}`;
  return out;
}

/** Parse YAML text in the strict subset, before any schema. */
export function parseStrictYaml(text: string): unknown {
  const doc = parseDocument(text, { version: "1.2", schema: "core", uniqueKeys: true, merge: false, prettyErrors: false, strict: true });
  const problems: Problem[] = doc.errors.map((e) => ({ path: "", message: e.message }));
  visit(doc, {
    Alias: () => { problems.push({ path: "", message: "aliases aren't allowed" }); },
    Node: (_k, node) => {
      if (isNode(node) && node.tag && !node.tag.startsWith("tag:yaml.org,2002:")) problems.push({ path: "", message: `tags aren't allowed (${node.tag})` });
      if (isNode(node) && !isAlias(node) && node.anchor) problems.push({ path: "", message: "anchors aren't allowed" });
    },
  });
  if (problems.length) throw new RecordError(problems);
  return doc.toJS({ maxAliasCount: 0 });
}

function validate<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new RecordError(result.error.issues.map((i) => ({ path: pathOf(i.path), message: i.message })));
  return result.data;
}

/** A record from its file's text, checked against the schema its `type` names. */
export function parseRecord(text: string): AnyRecord {
  const value = parseStrictYaml(text);
  const type = (value as { type?: unknown } | null)?.type;
  if (typeof type !== "string" || !(type in RECORD_SCHEMAS)) {
    throw new RecordError([{ path: "type", message: `one of ${Object.keys(RECORD_SCHEMAS).join(", ")}` }]);
  }
  return validate(RECORD_SCHEMAS[type as RecordType], value) as AnyRecord;
}

/** A record as its file's text: checked first, keys in the schema's order, defaults written out. */
export function serializeRecord(record: AnyRecord): string {
  const checked = validate(RECORD_SCHEMAS[record.type], record);
  return new Document(checked, { version: "1.2" }).toString({ lineWidth: 0 });
}

export function parseFormat(text: string): Format {
  return validate(Format, parseStrictYaml(text));
}

export function serializeFormat(format: Format): string {
  return new Document(validate(Format, format), { version: "1.2" }).toString({ lineWidth: 0 });
}
