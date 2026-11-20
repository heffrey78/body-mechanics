import { useEffect, useMemo, useState } from "react";
import {
  COMMIT_EMAIL, COMMIT_NAME, Committer, ENGINE_VERSION, NotSetUp, RecordIndex, SessionLog, Vault, clearDraft, createExercise, deviceClock,
  GitHub, Syncer, applyUpdates, editRoutine, sync, indexBenchmark, loadLocations, loadEquipment, loadDemos, type Demo, loadExerciseRecords, libraryFrom, type Exercise, type ExerciseOverride, standsInOf, type EquipmentItem, loadBody, newMark, newCondition, editBody, modifiersOf, applyModified, deletedSession, checkIn, resolveMark, reopenMark, isDue, isActive, type Body, type Mark, type Condition, type CheckInFields, stampChanges, starterLocations, targetUpdates, loadDraft, loadLibrary, loadProfile, loadRoutines, memoryFilesPort, memorySecretsPort, newRoutine,
  portsRoundTrip, routineFromSession, saveDraft,
  type Clock, type Location, type Suggestion, type SyncStatus, type TargetUpdate, type LibraryItem, type Profile, type Routine, type RoutineItem, type Session,
  minding, routineCard, weekStrip,
} from "@bm/engine";
import { isTauri } from "@tauri-apps/api/core";
import { dataDir, hostPlatform, hostPorts, httpPort, smokeReport, smokeStorage } from "./host.ts";
import { SyncScreen } from "./screens/SyncScreen.tsx";
import { JoinScreen } from "./screens/JoinScreen.tsx";
import { useTheme } from "./theme/theme.ts";
import { ThemeScreen } from "./screens/ThemeScreen.tsx";
import { TimerCheck } from "./screens/TimerCheck.tsx";
import { GraphicsCheck } from "./demo/GraphicsCheck.tsx";
import { SetupScreen } from "./screens/SetupScreen.tsx";
import { StorageCheck } from "./screens/StorageCheck.tsx";
import { MoreScreen } from "./screens/MoreScreen.tsx";
import { CreditsScreen } from "./screens/CreditsScreen.tsx";
import { HomeScreen } from "./screens/HomeScreen.tsx";
import { BodyScreen, markTitle, type NewMarkFields } from "./screens/BodyScreen.tsx";
import { ConditionsScreen } from "./screens/ConditionsScreen.tsx";
import { EquipmentScreen } from "./screens/EquipmentScreen.tsx";
import { ExercisesScreen } from "./screens/ExercisesScreen.tsx";
import { PlanScreen } from "./screens/PlanScreen.tsx";
import { NewMovement } from "./screens/NewMovement.tsx";
import { SessionScreen, type Pending } from "./screens/SessionScreen.tsx";
import { HistoryScreen } from "./screens/HistoryScreen.tsx";
import { RoutinesScreen, describeItem } from "./screens/RoutinesScreen.tsx";
import { LocationsScreen } from "./screens/LocationsScreen.tsx";
import { SuggestPanel, type SuggestAnswers } from "./screens/SuggestPanel.tsx";
import { workerPool } from "./workers/pool.ts";
import { BottomTabs, Button, type TabId } from "./ui/components.tsx";

/** Where the person's records repository lives: the app's folder (D2). */
async function recordsRoot(): Promise<string> {
  return `${(await dataDir()).replace(/\/$/, "")}/records`;
}

/** Build 1's shell: tabs, a placeholder home with the host checks (#20, #21), and More › Theme (#23). */
export function App() {
  const [theme, setTheme] = useTheme();
  const [tab, setTab] = useState<TabId>("home");
  const [sub, setSub] = useState<"theme" | "credits" | "checks" | "locations" | "sync" | "conditions" | "equipment" | "exercises" | null>(null);
  // GitHub sync (#38): the connection, the records' remote, and what the last sync did.
  // In a plain browser there are no host ports: sign-in is off there (`available`), and its secrets live in memory.
  const github = useMemo(() => new GitHub(httpPort, isTauri() ? hostPorts().secrets : memorySecretsPort()), []);
  const [remote, setRemote] = useState<string | null>(null);
  const [syncText, setSyncText] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: "off" });
  const [syncer, setSyncer] = useState<Syncer | null>(null);
  const [joining, setJoining] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  /** Your own exercises and your overrides of catalogue ones (#61): the library is built from them. */
  const [exerciseRecords, setExerciseRecords] = useState<{ own: Exercise[]; overrides: ExerciseOverride[] }>({ own: [], overrides: [] });
  const keepExercises = (r: { own: Exercise[]; overrides: ExerciseOverride[] }) => { setExerciseRecords(r); setLibrary(libraryFrom(r)); };
  /** Your own equipment (#60). */
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  /** The demonstrations you built (#77): they replace the built-in ones. */
  const [demos, setDemos] = useState<Demo[]>([]);
  /** Marks and conditions (#45): Suggest next and plans work around them (#47). */
  const [bodyRecords, setBodyRecords] = useState<Body>({ marks: [], conditions: [] });
  /** A mark or condition to open on the Body tab (from Home's check-in card). */
  const [bodyOpen, setBodyOpen] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  // Suggest next (#43): open or not, the answers before a session starts, what's been turned down.
  const [suggesting, setSuggesting] = useState(false);
  const [homeAnswers, setHomeAnswers] = useState<SuggestAnswers | null>(null);
  const [refused, setRefused] = useState<Set<string>>(new Set());
  const [home, setHome] = useState<{ screen: "start" } | { screen: "new"; name: string } | { screen: "session" } | { screen: "plan" }>({ screen: "start" });
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [index, setIndex] = useState<RecordIndex | null>(null);
  const [log, setLog] = useState<SessionLog | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [clock, setClock] = useState<Clock | null>(null);
  /** The open session's plan: a routine's items, or a repeated session's (#36). */
  const [plan, setPlan] = useState<RoutineItem[] | null>(null);
  /** After a routine run: the targets it could update (#37). */
  const [updates, setUpdates] = useState<{ routine: Routine; list: TargetUpdate[]; chosen: Set<string> } | null>(null);
  const [platform, setPlatform] = useState("…");
  const [ports, setPorts] = useState("…");
  // The encrypted records (#25): "unknown" until checked, "setup" on first run, "ready" once open.
  const [records, setRecords] = useState<"unknown" | "setup" | "ready" | "browser">("unknown");
  const [vault, setVault] = useState<Vault | null>(null);
  /** Why the records didn't open, when they didn't. */
  const [openError, setOpenError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [committer, setCommitter] = useState<Committer | null>(null);

  /** The records are open (#25, #27): load the profile, apply its theme, and commit in the background (#28). */
  const opened = async (v: Vault, files = hostPorts().files, withGit = true) => {
    setVault(v);
    v.setDecryptPool(workerPool);
    let c: Committer | undefined;
    if (withGit) {
      const { git } = hostPorts();
      // Records set up by an early test build have no repository yet: make one, committing as the app.
      if (!(await git.isRepo(v.root))) {
        await git.init(v.root, "main");
        await git.setConfig(v.root, "user.name", COMMIT_NAME);
        await git.setConfig(v.root, "user.email", COMMIT_EMAIL);
      }
      c = new Committer(git, v.root);
      setCommitter(c);
    }
    if (withGit) setRemote(await hostPorts().git.remoteUrl(v.root, "origin"));
    const { profile: p, created } = await loadProfile(v, { theme });
    setProfile(p);
    setTheme(p.theme);
    if (created) c?.changed("Profile");
    const [lib, built, clock, rs, ls, bd] = await Promise.all([loadExerciseRecords(v), RecordIndex.build(v, files), deviceClock(v), loadRoutines(v), loadLocations(v), loadBody(v)]);
    keepExercises(lib);
    setRoutines(rs);
    setLocations(ls);
    setBodyRecords(bd);
    void loadEquipment(v).then(setEquipment);
    void loadDemos(v).then(setDemos);
    // The last location used is where the next session starts (#41).
    const lastAt = built.index.sessions().find((x) => x.location)?.location;
    setLocation(lastAt && ls.some((l) => l.id === lastAt) ? lastAt : null);
    setClock(clock);
    setIndex(built.index);
    const l = new SessionLog(v, clock, { index: built.index, ...(c ? { committer: c } : {}) });
    setLog(l);
    // A session left open (the app was killed, #28): back where it was, the steppers too.
    const draft = await loadDraft(v);
    const open = draft && built.index.sessions().find((x) => x.id === draft.sessionId && !x.finishedAt);
    const s = open ? await v.read(open.path) : undefined;
    if (draft && s?.type === "session") {
      l.resume(s);
      setSession(s);
      setPending((draft.state["pending"] as Pending | undefined) ?? null);
      setPlan((draft.state["plan"] as RoutineItem[] | undefined) ?? null);
      setHome({ screen: "session" });
    }
  };

  /** A routine changed (#35): stamped against what was saved, written, committed once quiet. */
  const saveRoutine = (next: Routine) => {
    if (!vault || !clock) return;
    const before = routines.find((r) => r.id === next.id);
    const stamped = editRoutine(before, next, clock);
    setRoutines((rs) => {
      const others = rs.filter((r) => r.id !== next.id);
      return stamped.deleted ? others : [...others, stamped].sort((a, b) => a.name.localeCompare(b.name));
    });
    void vault.write(stamped).then(() => committer?.changed(`Routine: ${stamped.name}`));
  };

  /** A location changed (#41): stamped, written, committed once quiet. */
  const saveLocation = (next: Location) => {
    if (!vault || !clock) return;
    const before = locations.find((l) => l.id === next.id);
    const stamped = stampChanges(before as Record<string, unknown> | undefined, next as unknown as Record<string, unknown>, clock.tick()) as unknown as Location;
    setLocations((ls) => {
      const others = ls.filter((l) => l.id !== next.id);
      return stamped.deleted ? others : [...others, stamped].sort((a, b) => a.name.localeCompare(b.name));
    });
    if (stamped.deleted && location === stamped.id) setLocation(null);
    void vault.write(stamped).then(() => committer?.changed(`Location: ${stamped.name}`));
  };

  /** A demonstration built, changed or deleted (#82): stamped, written encrypted, committed once quiet. */
  const saveDemo = (next: Demo) => {
    if (!vault || !clock) return;
    const before = demos.find((d) => d.id === next.id);
    const stamped = stampChanges(before as Record<string, unknown> | undefined, next as unknown as Record<string, unknown>, clock.tick()) as unknown as Demo;
    setDemos((ds) => [...ds.filter((d) => d.id !== next.id), ...(stamped.deleted ? [] : [stamped])]);
    const name = library.find((x) => x.id === next.exercise)?.name ?? next.exercise;
    void vault.write(stamped).then(() => committer?.changed(`${stamped.deleted ? "Deleted demonstration" : "Demonstration"}: ${name}`));
  };

  /** Save a mark or condition (#48): kept in state, written encrypted, committed. */
  const saveBody = (next: Mark | Condition, message: string) => {
    if (!vault) return;
    setBodyRecords((b) => next.type === "mark"
      ? { ...b, marks: [...b.marks.filter((m) => m.id !== next.id), ...(next.deleted ? [] : [next])].sort((x, y) => x.onset.localeCompare(y.onset)) }
      : { ...b, conditions: [...b.conditions.filter((c) => c.id !== next.id), ...(next.deleted ? [] : [next])].sort((x, y) => x.name.localeCompare(y.name)) });
    void vault.write(next).then(() => committer?.changed(message));
  };
  const bodyName = (x: Mark | Condition) => (x.type === "mark" ? markTitle(x) : x.name);

  /** This session's Suggest next answers, from the record (so they survive a restart). */
  const sessionAnswers = (s: Session): SuggestAnswers | null => s.answers?.sweat === undefined ? null : {
    ...(s.location ? { location: s.location } : {}), ...(s.answers.minutes ? { minutes: s.answers.minutes } : {}),
    sweat: s.answers.sweat, area: s.focus?.area ?? [], kinds: s.focus?.kinds ?? [],
  };
  const takeSuggestion = async (x: Suggestion) => {
    if (!log) return;
    setSuggesting(false);
    setSummary(null);
    const dose = (entryId: string): Pending => ({ entryId, amount: x.amount, ...(x.loadKg !== undefined ? { loadKg: x.loadKg } : {}) });
    if (log.session) {
      const e = await log.addEntry(x.item.id, modifiersOf(x.modifiers));
      setPending(dose(e.id));
      changed(log.session, dose(e.id));
    } else {
      const a = homeAnswers;
      const where = a?.location ?? location;
      const s = await log.start(x.item.id, { ...(where ? { location: where } : {}), modifiers: modifiersOf(x.modifiers) });
      if (a) await log.setAnswers(a);
      setRefused(new Set());
      setPlan(null);
      setPending(dose(s.entries[0]!.id));
      changed(log.session ?? s, dose(s.entries[0]!.id), null);
      setHome({ screen: "session" });
    }
  };
  const suggestPanel = suggesting && log ? (
    <SuggestPanel
      answers={session ? sessionAnswers(session) : homeAnswers}
      defaultLocation={location} locations={locations} library={library} index={index} body={bodyRecords} standsIn={standsInOf(equipment)}
      done={session ? session.entries.filter((e) => !e.deleted).map((e) => e.exercise) : []}
      {...(session ? { startedAt: session.startedAt } : {})}
      seed={session?.id ?? new Date().toISOString().slice(0, 10)} refused={refused} units={profile?.units ?? "kg"}
      onAnswers={(a) => {
        if (a.location) setLocation(a.location);
        if (log.session) void log.setAnswers(a).then(() => changed(log.session!));
        else setHomeAnswers(a);
      }}
      onRefuse={(x) => setRefused((r) => new Set(r).add(x))}
      onAccept={(x) => void takeSuggestion(x)}
      onClose={() => setSuggesting(false)}
    />
  ) : null;

  /** After a sync brought in other devices' records: read the lists and the index again. */
  const reload = async (v: Vault) => {
    const [lib, built, rs, ls, prof, bd] = await Promise.all([loadExerciseRecords(v), RecordIndex.build(v, hostPorts().files), loadRoutines(v), loadLocations(v), loadProfile(v), loadBody(v)]);
    keepExercises(lib);
    setIndex(built.index);
    setRoutines(rs);
    setLocations(ls);
    setBodyRecords(bd);
    void loadEquipment(v).then(setEquipment);
    void loadDemos(v).then(setDemos);
    setProfile(prof.profile);
    setTheme(prof.profile.theme);
  };

  // The background syncer (#39): made once the records, the committer and a remote are there; on
  // unless this device turned it off (kept in .local/, so it's per device).
  useEffect(() => {
    if (!vault || !committer || !remote) return;
    const sy = new Syncer(async () => {
      const auth = await github.gitAuth(remote);
      const out = await sync(hostPorts().git, vault, committer, auth ? { auth } : {});
      if (out.status === "synced") {
        if (out.pulled) await reload(vault);
        if (out.flags.length) setSummary(`Synced: ${out.flags.length === 1 ? "one edit was" : `${out.flags.length} edits were`} kept over a deletion made on another device.`);
      }
      return out;
    }, { beforeRun: () => committer.idle(), onStatus: setSyncStatus });
    setSyncer(sy);
    void vault.readLocal<{ on: boolean }>("sync.json").then((pref) => { if (pref?.on !== false) void sy.start(); });
    return () => sy.stop();
  }, [vault, committer, remote, github]);

  // Android cuts a backgrounded app off the network, so a sync that ran while hidden reads as offline:
  // coming back to the app tries again straight away instead of waiting out the interval.
  useEffect(() => {
    if (!syncer) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && syncer.on && syncer.status.state === "offline") void syncer.now();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [syncer]);

  const syncNow = async () => {
    if (!syncer) return;
    setSyncText(null);
    if (!syncer.on) await syncer.start();
    else await syncer.now();
  };
  const setSyncOn = async (on: boolean) => {
    if (!vault || !syncer) return;
    await vault.writeLocal("sync.json", { on });
    if (on) void syncer.start();
    else syncer.stop();
  };

  /** Recent exercises: the last ten distinct ones logged. */
  const recent = (() => {
    const byId = new Map(library.map((x) => [x.id, x]));
    const seen: LibraryItem[] = [];
    for (const s of index?.sessions() ?? []) for (const e of s.entries) {
      const x = byId.get(e.exercise);
      if (x && !seen.includes(x)) seen.push(x);
      if (seen.length >= 10) break;
    }
    if (session) for (const e of session.entries) { const x = byId.get(e.exercise); if (x && !seen.includes(x)) seen.unshift(x); }
    return seen.slice(0, 10);
  })();

  /** The open session changed: keep it, and the draft that brings it back after a restart. */
  const changed = (s: Session, p: Pending | null = pending, pl: RoutineItem[] | null = plan) => {
    setSession({ ...s });
    if (vault) void saveDraft(vault, { sessionId: s.id, state: { pending: p, plan: pl }, savedAt: new Date().toISOString() });
  };

  /** Run a plan (#36): a routine (`routine` set) or a repeat of a past session. */
  const startPlan = async (items: RoutineItem[], routine?: string) => {
    const live = items.filter((i) => !i.deleted);
    if (!log || log.session || !live.length) return;
    setSummary(null);
    setPending(null);
    setPlan(live);
    changed(await log.start(live[0]!.exercise, { ...(routine ? { routine } : {}), ...(location ? { location } : {}), modifiers: live[0]!.modifiers ?? [] }), null, live);
    setHome({ screen: "session" });
    setTab("home");
  };
  const startRoutine = (r: Routine) => startPlan(r.items, r.id);
  const startWith = async (x: LibraryItem) => {
    if (!log) return;
    setSummary(null);
    if (log.session) {
      await log.addEntry(x.id);
      setPending(null);
      changed(log.session);
    } else {
      changed(await log.start(x.id, location ? { location } : {}), null);
      setPending(null);
    }
    setHome({ screen: "session" });
  };

  /** A change to the profile: written, encrypted, and committed once things are quiet. */
  const saveProfile = async (next: Profile) => {
    setProfile(next);
    if (!vault) return;
    await vault.write(next);
    committer?.changed("Profile");
  };

  useEffect(() => {
    void (async () => {
      const p = await hostPlatform().catch((e: unknown) => `error: ${String(e)}`);
      setPlatform(p);
      // A round trip through the ports (#21): init, an atomic write, a commit, the log.
      let check = "not in Tauri";
      if (p !== "browser") {
        const { git, files } = hostPorts();
        check = await portsRoundTrip(git, files, await dataDir()).catch((e: unknown) => `FAILED: ${String(e)}`);
      }
      setPorts(check);
      if (p !== "browser") {
        try {
          await opened(await Vault.open(hostPorts(), await recordsRoot()));
          setRecords("ready");
        } catch (e) {
          if (e instanceof NotSetUp) setRecords("setup");
          else {
            // Records this version can't read (written by a newer one, say): say so, instead of an app that looks empty.
            setOpenError(e instanceof Error ? e.message : String(e));
            return;
          }
        }
      } else {
        // In a plain browser (development, screenshots): records in memory, nothing kept.
        const files = memoryFilesPort();
        const preview = (await Vault.create({ files, secrets: memorySecretsPort() }, "/records", "browser preview", { scryptLogN: 1 })).vault;
        for (const l of starterLocations()) await preview.write(l);
        await opened(preview, files, false);
        setRecords("browser");
      }
      // The secrets port (#25): a throwaway secret set, read back and deleted.
      let secretsCheck = "skipped";
      if (p !== "browser") {
        const { secrets } = hostPorts();
        secretsCheck = await (async () => {
          await secrets.set("smoke-check", "kept");
          const back = await secrets.get("smoke-check");
          await secrets.delete("smoke-check");
          return back === "kept" && (await secrets.get("smoke-check")) === undefined ? "ok" : "mismatch";
        })().catch((e: unknown) => `unavailable(${String(e).slice(0, 60).replaceAll(" ", "_")})`);
      }
      let storage = "";
      const n = p !== "browser" ? await smokeStorage() : null;
      if (n) {
        const r = await indexBenchmark(hostPorts().files, `${(await dataDir()).replace(/\/$/, "")}/storage-check`, n, undefined, workerPool);
        storage = ` storage=${r.sessions}:cold=${r.coldMs}ms:warm=${r.warmMs}ms:write=${r.writeMs}ms:phases=${Object.entries(r.coldPhases).map(([k, v]) => `${k}${v}`).join(",")}`;
      }
      await smokeReport(`platform=${p} engine=${ENGINE_VERSION} ports=${check.replaceAll(" ", "_")} secrets=${secretsCheck}${storage}`);
    })();
  }, []);

  let body;
  if (openError) {
    return (
      <div className="screen">
        <div className="pad" role="alert">
          <h1 className="title">Your records couldn't be opened</h1>
          <p style={{ margin: 0, lineHeight: 1.5 }}>They are still on this device and nothing was changed. This usually means they were last saved by a newer version of the app: install that version, or a newer one, and they will be back.</p>
          <p className="muted" style={{ margin: 0, overflowWrap: "anywhere" }}>{openError.slice(0, 400)}</p>
        </div>
      </div>
    );
  }
  if (records === "setup" && joining) {
    return (
      <div className="screen">
        <JoinScreen
          github={github} available={platform !== "browser"} onBack={() => setJoining(false)}
          onJoin={async (repo, secret, progress) => {
            const root = await recordsRoot();
            const ports = hostPorts();
            // A clone from an earlier try is reused; otherwise clone, encrypted as it is on GitHub.
            if (!(await ports.git.isRepo(root))) {
              const auth = await github.gitAuth(repo.cloneUrl);
              progress("Copying your records from GitHub…");
              await ports.git.clone(repo.cloneUrl, root, { ...(auth ? { auth } : {}), onProgress: (p) => progress(`Copying your records from GitHub: ${p.stage}…`) });
            }
            progress("Unlocking…");
            const v = await Vault.join(ports, root, secret);
            await v.writeLocal("sync.json", { on: true });
            await opened(v);
            setRecords("ready");
            setJoining(false);
          }}
        />
      </div>
    );
  }
  if (records === "setup") {
    return (
      <div className="screen">
        <SetupScreen
          onCreate={async (passphrase) => {
            const { vault: v, recoveryKey } = await Vault.create(hostPorts(), await recordsRoot(), passphrase);
            // A new set of records starts with the usual locations (#41); a joined device gets them by sync.
            for (const l of starterLocations()) await v.write(l);
            await opened(v);
            return recoveryKey;
          }}
          onDone={() => setRecords("ready")}
          onJoin={() => setJoining(true)}
        />
      </div>
    );
  }
  if (tab === "more" && sub === "theme") {
    body = (
      <ThemeScreen
        choice={theme}
        onChange={(t) => {
          setTheme(t);
          if (profile) void saveProfile({ ...profile, theme: t });
        }}
        onBack={() => setSub(null)}
      />
    );
  } else if (tab === "more" && sub === "sync") {
    body = (
      <SyncScreen
        github={github} remote={remote} available={platform !== "browser"} syncText={syncText} status={syncStatus} onSyncOn={setSyncOn}
        onCreate={async (name) => {
          if (!vault) return;
          const repo = await github.createRepo(name);
          await hostPorts().git.addRemote(vault.root, "origin", repo.cloneUrl);
          setRemote(repo.cloneUrl);
          const auth = await github.gitAuth(repo.cloneUrl);
          if (committer) await sync(hostPorts().git, vault, committer, auth ? { auth } : {});
          await vault.writeLocal("sync.json", { on: true });
          setSyncText(`Your records are on GitHub at ${repo.fullName}, encrypted.`);
        }}
        onSyncNow={syncNow}
        onBack={() => setSub(null)}
      />
    );
  } else if (tab === "more" && sub === "locations") {
    body = <LocationsScreen locations={locations} custom={equipment} onSave={saveLocation} onAddStarters={() => starterLocations().forEach((l) => saveLocation(l))} onBack={() => setSub(null)} />;
  } else if (tab === "more" && sub === "exercises") {
    body = <ExercisesScreen library={library} custom={equipment} own={exerciseRecords.own} overrides={exerciseRecords.overrides} demos={demos} onSaveDemo={saveDemo} onBack={() => setSub(null)}
      onSaveOwn={(next) => {
        if (!vault || !clock) return;
        const before = exerciseRecords.own.find((x) => x.id === next.id);
        const stamped = stampChanges(before as Record<string, unknown> | undefined, next as unknown as Record<string, unknown>, clock.tick()) as unknown as Exercise;
        keepExercises({ ...exerciseRecords, own: [...exerciseRecords.own.filter((x) => x.id !== next.id), stamped] });
        void vault.write(stamped).then(() => committer?.changed(`${stamped.deleted ? "Deleted exercise" : "Exercise"}: ${stamped.name}`));
      }}
      onSaveOverride={(next) => {
        if (!vault || !clock) return;
        const before = exerciseRecords.overrides.find((x) => x.id === next.id);
        const stamped = stampChanges(before as Record<string, unknown> | undefined, next as unknown as Record<string, unknown>, clock.tick()) as unknown as ExerciseOverride;
        keepExercises({ ...exerciseRecords, overrides: [...exerciseRecords.overrides.filter((x) => x.id !== next.id), ...(stamped.deleted ? [] : [stamped])] });
        const name = library.find((x) => x.id === next.of)?.name ?? next.of;
        void vault.write(stamped).then(() => committer?.changed(`${stamped.deleted ? "Reset" : "Adjusted"}: ${name}`));
      }} />;
  } else if (tab === "more" && sub === "equipment") {
    body = <EquipmentScreen items={equipment} onBack={() => setSub(null)} onSave={(next) => {
      if (!vault || !clock) return;
      const before = equipment.find((x) => x.id === next.id);
      const stamped = stampChanges(before as Record<string, unknown> | undefined, next as unknown as Record<string, unknown>, clock.tick()) as unknown as EquipmentItem;
      setEquipment((xs) => [...xs.filter((x) => x.id !== next.id), ...(stamped.deleted ? [] : [stamped])].sort((a, b) => a.name.localeCompare(b.name)));
      void vault.write(stamped).then(() => committer?.changed(`${stamped.deleted ? "Deleted equipment" : "Equipment"}: ${stamped.name}`));
    }} />;
  } else if (tab === "more" && sub === "conditions") {
    body = <ConditionsScreen conditions={bodyRecords.conditions} onBack={() => setSub(null)}
      onSave={(c) => {
        if (!clock) return;
        const before = bodyRecords.conditions.find((x) => x.id === c.id);
        saveBody(editBody(before, c, clock), `${c.deleted ? "Deleted condition" : "Condition"}: ${c.name}`);
      }} />;
  } else if (tab === "more" && sub === "credits") {
    body = <CreditsScreen onBack={() => setSub(null)} />;
  } else if (tab === "more" && sub === "checks") {
    body = (
      <div className="pad">
        <div className="hrow"><Button variant="ghost" onClick={() => setSub(null)}>‹ More</Button></div>
        <h1 className="title">Device checks</h1>
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 16px", margin: 0 }}>
          <dt className="muted">Running on</dt><dd style={{ margin: 0 }} className="strong" data-testid="platform">{platform}</dd>
          <dt className="muted">Engine</dt><dd style={{ margin: 0 }} className="strong">{ENGINE_VERSION}</dd>
          <dt className="muted">Ports</dt><dd style={{ margin: 0 }} className="strong" data-testid="ports">{ports}</dd>
          <dt className="muted">Records</dt><dd style={{ margin: 0 }} className="strong">{records === "ready" ? "encrypted, ready" : records}</dd>
        </dl>
        <TimerCheck />
        <GraphicsCheck />
        {platform !== "browser" ? <StorageCheck /> : null}
      </div>
    );
  } else if (tab === "more") {
    body = (
      <MoreScreen
        vault={vault}
        units={profile?.units ?? "kg"}
        onUnits={(units) => { if (profile) void saveProfile({ ...profile, units }); }}
        onOpen={setSub}
      />
    );
  } else if (tab === "routines") {
    body = (
      <RoutinesScreen
        routines={routines} library={library} index={index} body={bodyRecords} units={profile?.units ?? "kg"} sessionOpen={!!session}
        onSave={saveRoutine}
        onDelete={(r) => saveRoutine({ ...r, deleted: true })}
        onNew={() => { const r = newRoutine("New routine"); saveRoutine(r); return r; }}
        onStart={(r) => void startRoutine(r)}
      />
    );
  } else if (tab === "history") {
    body = (
      <HistoryScreen
        vault={vault} index={index} library={library} units={profile?.units ?? "kg"} canEdit={!session}
        places={new Map(locations.map((l) => [l.id, l.name]))}
        onRepeat={(s) => {
          const byId = new Map(library.map((x) => [x.id, x]));
          void startPlan(routineFromSession(s, "Repeat", (x) => byId.get(x)?.measure ?? "reps").items);
        }}
        onDelete={(s) => {
          if (!vault || !clock) return;
          const gone = deletedSession(s, clock);
          void vault.write(gone).then((path) => { index?.put(path, gone); setIndex(index); committer?.changed(`Deleted session ${s.startedAt.slice(0, 10)}`); setSummary("Session deleted."); });
        }}
        onSaveAsRoutine={(s, name) => {
          const byId = new Map(library.map((x) => [x.id, x]));
          const r = routineFromSession(s, name, (x) => byId.get(x)?.measure ?? "reps");
          saveRoutine(r);
          return r.name;
        }}
        onEdit={(s) => {
          if (!log) return;
          log.resume(s);
          setSummary(null);
          changed(s, null);
          setPending(null);
          setHome({ screen: "session" });
          setTab("home");
        }}
      />
    );
  } else if (tab === "home" && home.screen === "plan") {
    body = <PlanScreen defaultLocation={location} locations={locations} library={library} index={index} body={bodyRecords} standsIn={standsInOf(equipment)} units={profile?.units ?? "kg"}
      onStart={(items) => void startPlan(items)} onBack={() => setHome({ screen: "start" })} />;
  } else if (tab === "home" && home.screen === "new") {
    body = (
      <NewMovement
        initialName={home.name}
        onCancel={() => setHome({ screen: "start" })}
        onSave={(f) => void (async () => {
          if (!vault) return;
          const x = await createExercise(vault, { ...f, aliases: [] }, committer ?? undefined);
          setLibrary((lib) => [...lib, x]);
          // The records too, so More › Exercises can edit it (#61).
          void loadExerciseRecords(vault).then(keepExercises);
          await startWith(x);
        })()}
      />
    );
  } else if (tab === "home" && home.screen === "session" && log && session) {
    body = (
      <SessionScreen
        suggestPanel={suggestPanel} onSuggest={() => setSuggesting(true)}
        log={log} session={session} plan={plan} demos={demos} custom={equipment} library={library} recent={recent} index={index} units={profile?.units ?? "kg"} body={bodyRecords}
        pending={pending}
        onPending={(p) => { setPending(p); changed(log.session ?? session, p); }}
        onChanged={(s) => changed(s)}
        onDiscard={() => void (async () => {
          await log.discard();
          setSession(null);
          setPending(null);
          setPlan(null);
          setRefused(new Set());
          setSuggesting(false);
          if (vault) void clearDraft(vault);
          setSummary("Session discarded.");
          setHome({ screen: "start" });
        })()}
        onFinished={(s) => {
          setSession(null);
          setPending(null);
          setPlan(null);
          setRefused(new Set());
          setHomeAnswers(null);
          setSuggesting(false);
          void syncer?.now();
          if (vault) void clearDraft(vault);
          const sets = s.entries.reduce((n, e) => n + e.sets.filter((x) => !x.deleted).length, 0);
          setSummary(`Saved: ${s.entries.length} ${s.entries.length === 1 ? "exercise" : "exercises"}, ${sets} ${sets === 1 ? "set" : "sets"}.`);
          const r = s.routine ? routines.find((x) => x.id === s.routine) : undefined;
          if (r) {
            const byId = new Map(library.map((x) => [x.id, x]));
            const list = targetUpdates(r, s, (x) => byId.get(x)?.measure ?? "reps");
            setUpdates(list.length ? { routine: r, list, chosen: new Set(list.map((u) => u.itemId)) } : null);
          }
          setHome({ screen: "start" });
        }}
        onHome={() => setHome({ screen: "start" })}
      />
    );
  } else if (tab === "home") {
    body = (
      <>
        {summary ? <div className="pad" style={{ paddingBottom: 0, flexGrow: 0 }}><div className="card" role="status">{summary}</div></div> : null}
        {updates ? (
          <div className="pad" style={{ paddingBottom: 0, flexGrow: 0 }}>
            <div className="card" aria-label="Update targets">
              <span className="label">Update “{updates.routine.name}”?</span>
              <span className="muted">Set its targets to what you just did:</span>
              {updates.list.map((u) => {
                const x = library.find((l) => l.id === u.exercise);
                const on = updates.chosen.has(u.itemId);
                return (
                  <label key={u.itemId} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <input type="checkbox" checked={on} style={{ width: 22, height: 22, marginTop: 2 }}
                      onChange={() => setUpdates({ ...updates, chosen: on ? new Set([...updates.chosen].filter((i) => i !== u.itemId)) : new Set([...updates.chosen, u.itemId]) })} />
                    <span><span className="strong">{x?.name ?? u.exercise}</span><br /><span className="muted num">{describeItem(u.from, x, profile?.units ?? "kg")} → {describeItem(u.to, x, profile?.units ?? "kg")}</span></span>
                  </label>
                );
              })}
              <div className="pair">
                <Button variant="primary" disabled={updates.chosen.size === 0} onClick={() => {
                  const current = routines.find((r) => r.id === updates.routine.id) ?? updates.routine;
                  saveRoutine(applyUpdates(current, updates.list.filter((u) => updates.chosen.has(u.itemId))));
                  setUpdates(null);
                  setSummary("Routine updated.");
                }}>Update routine</Button>
                <Button onClick={() => setUpdates(null)}>Not now</Button>
              </div>
            </div>
          </div>
        ) : null}
        {(() => {
          // Check-ins due (#48): on Home too, one tap to the mark.
          const now = new Date();
          // Marks have their own Minding cards (#73); due conditions are asked about here.
          const due = bodyRecords.conditions.filter((x) => isActive(x, now) && isDue(x, now));
          if (!due.length || session) return null;
          return (
            <div className="pad" style={{ paddingBottom: 0 }}>
              <div className="card" aria-label="Check-ins due">
                <span className="label">Check in</span>
                {due.map((x) => (
                  <button key={x.id} type="button" className="result" onClick={() => { setBodyOpen(x.id); setTab("body"); }}>
                    <span>How is your {bodyName(x).replace(" · ", " ").toLowerCase()}?</span><span aria-hidden="true" className="muted">›</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
        <HomeScreen
          onPlan={() => setHome({ screen: "plan" })}
          library={library} recent={recent} sessionOpen={!!session}
          locations={locations} location={location} onLocation={setLocation}
          onStart={(x) => void startWith(x)}
          onNew={(name) => setHome({ screen: "new", name })}
          onResume={() => setHome({ screen: "session" })}
          minding={minding(bodyRecords, library, [
            // What the marks are judged against: your routines' exercises and your last sessions'.
            ...routines.filter((r) => !r.deleted).flatMap((r) => r.items.filter((i) => !i.deleted).map((i) => i.exercise)),
            ...(index?.sessions() ?? []).slice(0, 10).flatMap((x) => x.entries.map((e) => e.exercise)),
          ])}
          onCheckIn={(id) => { setBodyOpen(id); setTab("body"); }}
          routines={routines.filter((r) => !r.deleted && r.items.some((i) => !i.deleted)).slice(0, 4).map((routine) => {
            const c = routineCard(routine, index?.runs(routine.id) ?? []);
            return { routine, meta: `${c.minutes ? `${c.minutes} min · ` : ""}${c.moves} ${c.moves === 1 ? "move" : "moves"}` };
          })}
          onRoutine={(r) => void startRoutine(r)}
          week={weekStrip(index?.sessions() ?? [])}
        />
      </>
    );
  } else if (tab === "body") {
    body = (
      <BodyScreen key={bodyOpen ?? "map"} body={bodyRecords} open={bodyOpen} library={library} routines={routines}
        onSaveMark={(m) => {
          if (!clock) return;
          const before = bodyRecords.marks.find((x) => x.id === m.id);
          saveBody(editBody(before, m, clock), `${m.deleted ? "Deleted mark" : "Mark"}: ${markTitle(m)}`);
        }}
        onSaveCondition={(c) => {
          if (!clock) return;
          const before = bodyRecords.conditions.find((x) => x.id === c.id);
          saveBody(editBody(before, c, clock), `${c.deleted ? "Deleted condition" : "Condition"}: ${c.name}`);
        }}
        onUseModified={(r, f) => {
          const byId = new Map(library.map((x) => [x.id, x]));
          saveRoutine({ ...r, items: r.items.map((i) => (i.id === f.itemId ? applyModified(i, f.assessment, (x) => byId.get(x)?.measure ?? "reps") : i)) });
        }}
        onNewMark={(f: NewMarkFields) => {
          const m = newMark(f);
          saveBody(m, `Mark: ${markTitle(m)}`);
          return m.id;
        }}
        onCheckIn={(x: Mark | Condition, f: CheckInFields) => { if (clock) saveBody(checkIn(x, f, clock), `Check-in: ${bodyName(x)}`); }}
        onResolve={(m: Mark) => { if (clock) saveBody(resolveMark(m, clock), `Resolved: ${markTitle(m)}`); }}
        onReopen={(m: Mark) => { if (clock) saveBody(reopenMark(m, clock), `Back again: ${markTitle(m)}`); }}
        onBecomeCondition={(m: Mark) => {
          // A mark that's lasted (#49): a condition from today on, and the mark resolved into it.
          if (!clock) return m.id;
          const c = newCondition({ name: markTitle(m).replace(" · ", " "), regions: [{ region: m.region, side: m.side }], since: m.onset.slice(0, 7) });
          const name = c.name[0]!.toUpperCase() + c.name.slice(1);
          saveBody({ ...c, name }, `Condition: ${name}`);
          saveBody(editBody(m, { ...m, becameCondition: c.id, resolvedAt: new Date().toISOString() }, clock), `Became a condition: ${markTitle(m)}`);
          return c.id;
        }}
      />
    );
  }

  return (
    <div className="screen">
      <main style={{ flexGrow: 1 }}>{body}</main>
      <BottomTabs current={tab} onChange={(t) => { setTab(t); setSub(null); setBodyOpen(null); }} />
    </div>
  );
}
