/**
 * Logging a session (#31, #32): every change is written to the session's record at once (encrypted,
 * atomically), put in the index, and handed to the committer, which commits once things are quiet and
 * at once when the session finishes. Edits carry edit stamps from this device's clock, and deletions
 * are tombstones, so the record merge (#29) can combine two devices' changes.
 */
import { Clock } from "../records/hlc.ts";
import { newId } from "../records/ids.ts";
import type { Effort, Equipment, Kind, Measure, Region } from "../records/vocab.ts";
import type { Entry, Exercise, LoggedSet, Session } from "../records/schemas.ts";
import { catalogue, type CatalogueEntry } from "../catalogue/index.ts";
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
  async start(exercise: string, options: { location?: string } = {}): Promise<Session> {
    this.#session = {
      type: "session", v: 1, id: newId(), startedAt: this.#now().toISOString(),
      ...(options.location ? { location: options.location } : {}),
      entries: [],
    };
    await this.addEntry(exercise);
    return this.#session;
  }

  async addEntry(exercise: string): Promise<Entry> {
    const s = this.#need();
    const entry: Entry = { id: newId(), exercise, modifiers: [], sets: [] };
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
  async editSet(entryId: string, setId: string, patch: Partial<Amount> & { note?: string }): Promise<void> {
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

  async setEffort(entryId: string, effort: Effort): Promise<void> {
    const e = this.#entry(entryId);
    e.effort = effort;
    e.edits = { ...(e.edits ?? {}), effort: this.#clock.tick() };
    await this.#save();
  }

  /** Finish: the session gets its end, and is committed now. */
  async finish(): Promise<Session> {
    const s = this.#need();
    s.finishedAt = this.#now().toISOString();
    s.edits = { ...(s.edits ?? {}), finishedAt: this.#clock.tick() };
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
  equipment: Equipment[];
  sweat: 0 | 1 | 2;
  own: boolean;
  instructions?: string;
}

const fromCatalogue = (e: CatalogueEntry): LibraryItem => ({
  id: e.id, name: e.name, aliases: e.aliases, works: e.works, strains: e.strains, kinds: e.kinds, measure: e.measure,
  sided: e.sided, equipment: e.equipment, sweat: e.sweat, own: false, instructions: e.instructions,
});

const fromOwn = (e: Exercise): LibraryItem => ({
  id: e.id, name: e.name, aliases: e.aliases, works: e.works, strains: e.strains, kinds: e.kinds, measure: e.measure,
  sided: e.sided, equipment: e.equipment, sweat: e.sweat, own: true,
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
