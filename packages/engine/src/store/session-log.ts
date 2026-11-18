/**
 * Logging a session (#31, #32): every change is written to the session's record at once (encrypted,
 * atomically), put in the index, and handed to the committer, which commits once things are quiet and
 * at once when the session finishes. Edits carry edit stamps from this device's clock, and deletions
 * are tombstones, so the record merge (#29) can combine two devices' changes.
 */
import { Clock } from "../records/hlc.ts";
import { newId } from "../records/ids.ts";
import type { Effort, Equipment, Kind, Measure, Region } from "../records/vocab.ts";
import type { Entry, Exercise, LoggedSet, Modifier, Session } from "../records/schemas.ts";
import { catalogue, type CatalogueEntry } from "../catalogue/index.ts";
import { mentioned, needsFromLegacy } from "../records/equipment.ts";
import type { Vault } from "../vault/vault.ts";
import type { Committer } from "./committer.ts";
import type { RecordIndex } from "./index.ts";

/** This device's clock for edit stamps, its id kept in .local/ (never synced). */
export async function deviceClock(vault: Vault): Promise<Clock> {
  let device = (await vault.readLocal<{ id: string }>("device.json"))?.id;
  if (!device) {
    device = newId();
    await vault.writeLocal("device.json", { id: device });
  }
  return new Clock(device);
}

/** The amount of a set: one of reps, seconds, metres, or left and right for a one-sided set. */
export type Amount = Pick<LoggedSet, "reps" | "seconds" | "metres" | "left" | "right" | "loadKg">;

export class SessionLog {
  readonly #vault: Vault;
  readonly #index: RecordIndex | undefined;
  readonly #committer: Committer | undefined;
  readonly #clock: Clock;
  readonly #now: () => Date;
  #session: Session | null = null;

  constructor(vault: Vault, clock: Clock, options: { index?: RecordIndex; committer?: Committer; now?: () => Date } = {}) {
    this.#vault = vault;
    this.#clock = clock;
    this.#index = options.index;
    this.#committer = options.committer;
    this.#now = options.now ?? (() => new Date());
  }

  get session(): Session | null {
    return this.#session;
  }

  /** Continue a session that's still open (after a restart). */
  resume(session: Session): void {
    this.#session = JSON.parse(JSON.stringify(session)) as Session;
  }

  /** A new session, its first exercise already in it (#2: start by typing what you're doing). */
  async start(exercise: string, options: { location?: string; routine?: string; modifiers?: Modifier[] } = {}): Promise<Session> {
    this.#session = {
      type: "session", v: 1, id: newId(), startedAt: this.#now().toISOString(),
      ...(options.location ? { location: options.location } : {}),
      ...(options.routine ? { routine: options.routine } : {}),
      entries: [],
    };
    await this.addEntry(exercise, options.modifiers);
    return this.#session;
  }

  /** The Suggest next answers for this session (#43): where, how long, how much sweat, the focus. */
  async setAnswers(answers: { location?: string; minutes?: number; sweat: 0 | 1 | 2; area: Region[]; kinds: Kind[] }): Promise<void> {
    const s = this.#need();
    const stamp = this.#clock.tick();
    const before = JSON.stringify([s.location, s.answers, s.focus]);
    if (answers.location) s.location = answers.location;
    else delete s.location;
    s.answers = { sweat: answers.sweat, ...(answers.minutes ? { minutes: answers.minutes } : {}) };
    s.focus = { area: answers.area, kinds: answers.kinds };
    if (JSON.stringify([s.location, s.answers, s.focus]) === before) return;
    s.edits = { ...(s.edits ?? {}), location: stamp, answers: stamp, focus: stamp };
    await this.#save();
  }

  async addEntry(exercise: string, modifiers: Modifier[] = []): Promise<Entry> {
    const s = this.#need();
    const entry: Entry = { id: newId(), exercise, modifiers, sets: [] };
    s.entries.push(entry);
    await this.#save(`Session ${s.startedAt.slice(0, 10)}`);
    return entry;
  }

  async logSet(entryId: string, amount: Amount, note?: string): Promise<LoggedSet> {
    const set: LoggedSet = { id: newId(), at: this.#now().toISOString(), ...amount, ...(note ? { note } : {}) };
    this.#entry(entryId).sets.push(set);
    await this.#save();
    return set;
  }

  /** Change a logged set: each changed field is stamped. */
  async editSet(entryId: string, setId: string, patch: { [K in keyof Amount]?: Amount[K] | undefined } & { note?: string | undefined }): Promise<void> {
    const set = this.#set(entryId, setId);
    const stamp = this.#clock.tick();
    const edits = { ...(set.edits ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete (set as Record<string, unknown>)[k];
      else (set as Record<string, unknown>)[k] = v;
      edits[k] = stamp;
    }
    set.edits = edits;
    await this.#save();
  }

  /** Delete a set: a tombstone, so another device's edit of it isn't lost (#29). */
  async deleteSet(entryId: string, setId: string): Promise<void> {
    const set = this.#set(entryId, setId);
    set.deleted = true;
    set.edits = { ...(set.edits ?? {}), deleted: this.#clock.tick() };
    await this.#save();
  }

  /** Take an exercise out of the session (#53): a tombstone, so another device's copy doesn't bring it back. */
  async deleteEntry(entryId: string): Promise<void> {
    const e = this.#entry(entryId);
    e.deleted = true;
    e.edits = { ...(e.edits ?? {}), deleted: this.#clock.tick() };
    await this.#save();
  }

  /** Throw the session away (#53): a false start. It's deleted, and the log has no session after. */
  async discard(): Promise<void> {
    const s = this.#need();
    s.deleted = true;
    s.edits = { ...(s.edits ?? {}), deleted: this.#clock.tick() };
    await this.#save(`Deleted session ${s.startedAt.slice(0, 10)}`);
    this.#session = null;
  }

  /** How an exercise is being done (#51): its sets count as modified in history and progress. */
  async setModifiers(entryId: string, modifiers: Modifier[]): Promise<void> {
    const e = this.#entry(entryId);
    e.modifiers = modifiers;
    e.edits = { ...(e.edits ?? {}), modifiers: this.#clock.tick() };
    await this.#save();
  }

  async setEffort(entryId: string, effort: Effort): Promise<void> {
    const e = this.#entry(entryId);
    e.effort = effort;
    e.edits = { ...(e.edits ?? {}), effort: this.#clock.tick() };
    await this.#save();
  }

  /** Finish: the session gets its end, and is committed now. */
  async finish(): Promise<Session> {
    const s = this.#need();
    // A session reopened from history to correct keeps its own end.
    if (!s.finishedAt) {
      s.finishedAt = this.#now().toISOString();
      s.edits = { ...(s.edits ?? {}), finishedAt: this.#clock.tick() };
    }
    const sets = s.entries.reduce((n, e) => n + e.sets.filter((x) => !x.deleted).length, 0);
    await this.#save();
    await this.#committer?.now(`Session ${s.startedAt.slice(0, 10)}: ${s.entries.length} exercises, ${sets} sets`);
    this.#session = null;
    return s;
  }

  #need(): Session {
    if (!this.#session) throw new Error("No session is open.");
    return this.#session;
  }

  #entry(id: string): Entry {
    const e = this.#need().entries.find((x) => x.id === id);
    if (!e) throw new Error(`No entry ${id} in this session.`);
    return e;
  }

  #set(entryId: string, setId: string): LoggedSet {
    const set = this.#entry(entryId).sets.find((x) => x.id === setId);
    if (!set) throw new Error(`No set ${setId}.`);
    return set;
  }

  async #save(message?: string): Promise<void> {
    const s = this.#need();
    const path = await this.#vault.write(s);
    this.#index?.put(path, s);
    this.#committer?.changed(message);
  }
}

// ---------------------------------------------------------------- the library: catalogue + your own

/** One exercise as the app lists it: the catalogue's, or one of the person's own (#15). */
export interface LibraryItem {
  id: string;
  name: string;
  aliases: string[];
  works: Region[];
  strains: Region[];
  kinds: Kind[];
  measure: Measure;
  sided: boolean;
  /** Every item it mentions, for display and filters (D4: `needs` and `optional` decide). */
  equipment: Equipment[];
  /** Required alternatives (D4). */
  needs: Equipment[][];
  /** Never required (D4). */
  optional: Equipment[];
  sweat: 0 | 1 | 2;
  own: boolean;
  instructions?: string;
}

/** D4's needs and optional, from the new fields or the old flat list. */
function equipmentOf(e: { equipment: Equipment[]; needs?: Equipment[][] | undefined; optional?: Equipment[] | undefined }): Pick<LibraryItem, "equipment" | "needs" | "optional"> {
  const needs = e.needs ?? (needsFromLegacy(e.equipment) as Equipment[][]);
  const optional = e.optional ?? [];
  return { needs, optional, equipment: mentioned({ needs, optional }) as Equipment[] };
}

/** A catalogue entry as the library lists it. */
export const fromCatalogue = (e: CatalogueEntry): LibraryItem => ({
  id: e.id, name: e.name, aliases: e.aliases, works: e.works, strains: e.strains, kinds: e.kinds, measure: e.measure,
  sided: e.sided, ...equipmentOf(e), sweat: e.sweat, own: false, instructions: e.instructions,
});

const fromOwn = (e: Exercise): LibraryItem => ({
  id: e.id, name: e.name, aliases: e.aliases, works: e.works, strains: e.strains, kinds: e.kinds, measure: e.measure,
  sided: e.sided, ...equipmentOf(e), sweat: e.sweat, own: true,
});

/** The catalogue and the person's own exercises (merged ones left out: they count as their catalogue entry). */
export async function loadLibrary(vault: Vault): Promise<LibraryItem[]> {
  const own: LibraryItem[] = [];
  const paths = await vault.list("exercises");
  const { records } = await vault.readMany(paths);
  for (const r of records.values()) if (r.type === "exercise" && !r.mergedInto) own.push(fromOwn(r));
  return [...catalogue().entries.map(fromCatalogue), ...own];
}

/** A new movement of the person's own (#2, #15), saved as a record. */
export async function createExercise(vault: Vault, fields: Omit<Exercise, "type" | "v" | "id">, committer?: Committer): Promise<LibraryItem> {
  const record: Exercise = { type: "exercise", v: 1, id: newId(), ...fields };
  await vault.write(record);
  committer?.changed(`New exercise: ${record.name}`);
  return fromOwn(record);
}

/** A finished session deleted from History (#53): its tombstone, stamped for the merge. */
export function deletedSession(s: Session, clock: Clock): Session {
  return { ...s, deleted: true, edits: { ...(s.edits ?? {}), deleted: clock.tick() } };
}
