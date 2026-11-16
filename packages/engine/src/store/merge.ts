/**
 * The record merge (D2 item 5, #29), in place of writer's paragraph merge3: three versions of one
 * record (the common base, ours, theirs), decrypted, merged by structure.
 * - A field one side changed takes that change; a field both changed takes the later edit stamp
 *   (`edits[field]`, a hybrid logical clock), and git's history keeps the other.
 * - Entries and sets are matched by id: one side's additions are kept with the other's.
 * - Something deleted on one side (a tombstone, `deleted: true`) but edited on the other keeps the edit,
 *   and is flagged so the person can see it.
 * A record only one side has (created on one device) is simply that side's.
 */
import type { AnyRecord } from "../records/schemas.ts";

type Json = unknown;
type Obj = Record<string, Json>;

export interface MergeResult {
  record: AnyRecord | undefined;
  /** What the person may want to look at: edits kept over deletions. */
  flags: string[];
}

const same = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (v: Json): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const isIdList = (v: Json): v is Obj[] => Array.isArray(v) && v.length > 0 && v.every((x) => isObj(x) && typeof x["id"] === "string");

/** Did `side` change anything but its tombstone, compared with `base`? */
function edited(base: Obj | undefined, side: Obj): boolean {
  if (!base) return true;
  const strip = (o: Obj) => { const { deleted: _d, edits: _e, ...rest } = o; return rest; };
  return !same(strip(base), strip(side));
}

function mergeValue(base: Json, ours: Json, theirs: Json, oursStamp: string | undefined, theirsStamp: string | undefined, path: string, flags: string[]): Json {
  if (same(ours, theirs)) return ours;
  if (same(ours, base)) return theirs;
  if (same(theirs, base)) return ours;
  if ((isIdList(ours) || isIdList(theirs) || isIdList(base)) && Array.isArray(ours) && Array.isArray(theirs)) {
    return mergeList((Array.isArray(base) ? base : []) as Obj[], ours as Obj[], theirs as Obj[], path, flags);
  }
  if (isObj(ours) && isObj(theirs) && !("id" in ours) && (oursStamp === undefined && theirsStamp === undefined)) {
    // A plain nested object (answers, focus, left/right): field by field, as far as it goes.
    return mergeObject(isObj(base) ? base : undefined, ours, theirs, path, flags);
  }
  // Both changed it: the later edit wins (no stamp loses to a stamp; a tie keeps ours).
  return (theirsStamp ?? "") > (oursStamp ?? "") ? theirs : ours;
}

function mergeObject(base: Obj | undefined, ours: Obj, theirs: Obj, path: string, flags: string[]): Obj {
  const oe = (ours["edits"] ?? {}) as Record<string, string>;
  const te = (theirs["edits"] ?? {}) as Record<string, string>;
  const keys = [...new Set([...Object.keys(ours), ...Object.keys(theirs), ...Object.keys(base ?? {})])].filter((k) => k !== "edits");
  const out: Obj = {};
  for (const k of keys) {
    const v = mergeValue(base?.[k], ours[k], theirs[k], oe[k], te[k], path ? `${path}.${k}` : k, flags);
    if (v !== undefined) out[k] = v;
  }
  // A deletion on one side against an edit on the other: the edit stays.
  if (out["deleted"] === true) {
    const keptBy = ours["deleted"] !== true && edited(base, ours) ? "this device" : theirs["deleted"] !== true && edited(base, theirs) ? "the other device" : undefined;
    if (keptBy) {
      delete out["deleted"];
      flags.push(`${path || "record"}: deleted on one device but edited on ${keptBy}; kept the edit`);
    }
  }
  const stamps: Record<string, string> = { ...oe };
  for (const [k, s] of Object.entries(te)) if (!stamps[k] || s > stamps[k]!) stamps[k] = s;
  if (Object.keys(stamps).length) out["edits"] = stamps;
  return out;
}

function mergeList(base: Obj[], ours: Obj[], theirs: Obj[], path: string, flags: string[]): Obj[] {
  const byId = (list: Obj[]) => new Map(list.map((x) => [x["id"] as string, x]));
  const [b, o, t] = [byId(base), byId(ours), byId(theirs)];
  // Our order, then what only they have, in theirs.
  const ids = [...o.keys(), ...[...t.keys()].filter((id) => !o.has(id))];
  const out: Obj[] = [];
  ids.forEach((id) => {
    const [bo, oo, to] = [b.get(id), o.get(id), t.get(id)];
    const here = `${path}[${id}]`;
    if (oo && to) out.push(mergeObject(bo, oo, to, here, flags));
    else if (oo) {
      // Gone on their side without a tombstone (shouldn't happen: the app deletes with tombstones).
      if (!bo || edited(bo, oo)) out.push(oo);
    } else if (to) {
      if (!bo || edited(bo, to)) out.push(to);
    }
  });
  return out;
}

export function mergeRecords(base: AnyRecord | undefined, ours: AnyRecord | undefined, theirs: AnyRecord | undefined): MergeResult {
  const flags: string[] = [];
  if (!ours && !theirs) return { record: undefined, flags };
  if (!theirs) {
    // Removed on their side (records aren't removed by the app, but a person might in git): keep ours if we changed it.
    return { record: base && same(base, ours) ? undefined : ours, flags };
  }
  if (!ours) return { record: base && same(base, theirs) ? undefined : theirs, flags };
  if (ours.type !== theirs.type || ours.id !== theirs.id) throw new Error(`Can't merge ${ours.type} ${ours.id} with ${theirs.type} ${theirs.id}.`);
  const merged = mergeObject(base as unknown as Obj | undefined, ours as unknown as Obj, theirs as unknown as Obj, "", flags);
  return { record: merged as unknown as AnyRecord, flags };
}
