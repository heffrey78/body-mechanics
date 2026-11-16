import { useEffect, useState } from "react";
import {
  COMMIT_EMAIL, COMMIT_NAME, Committer, ENGINE_VERSION, NotSetUp, RecordIndex, SessionLog, Vault, clearDraft, createExercise, deviceClock,
  applyUpdates, editRoutine, indexBenchmark, loadLocations, stampChanges, starterLocations, targetUpdates, loadDraft, loadLibrary, loadProfile, loadRoutines, memoryFilesPort, memorySecretsPort, newRoutine,
  portsRoundTrip, routineFromSession, saveDraft,
  type Clock, type Location, type TargetUpdate, type LibraryItem, type Profile, type Routine, type RoutineItem, type Session,
} from "@bm/engine";
import { dataDir, hostPlatform, hostPorts, smokeReport, smokeStorage } from "./host.ts";
import { useTheme } from "./theme/theme.ts";
import { ThemeScreen } from "./screens/ThemeScreen.tsx";
import { TimerCheck } from "./screens/TimerCheck.tsx";
import { SetupScreen } from "./screens/SetupScreen.tsx";
import { StorageCheck } from "./screens/StorageCheck.tsx";
import { MoreScreen } from "./screens/MoreScreen.tsx";
import { CreditsScreen } from "./screens/CreditsScreen.tsx";
import { HomeScreen } from "./screens/HomeScreen.tsx";
import { NewMovement } from "./screens/NewMovement.tsx";
import { SessionScreen, type Pending } from "./screens/SessionScreen.tsx";
import { HistoryScreen } from "./screens/HistoryScreen.tsx";
import { RoutinesScreen, describeItem } from "./screens/RoutinesScreen.tsx";
import { LocationsScreen } from "./screens/LocationsScreen.tsx";
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
  const [sub, setSub] = useState<"theme" | "credits" | "checks" | "locations" | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [location, setLocation] = useState<string | null>(null);
  const [home, setHome] = useState<{ screen: "start" } | { screen: "new"; name: string } | { screen: "session" }>({ screen: "start" });
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
    const { profile: p, created } = await loadProfile(v, { theme });
    setProfile(p);
    setTheme(p.theme);
    if (created) c?.changed("Profile");
    const [lib, built, clock, rs, ls] = await Promise.all([loadLibrary(v), RecordIndex.build(v, files), deviceClock(v), loadRoutines(v), loadLocations(v)]);
    setLibrary(lib);
    setRoutines(rs);
    setLocations(ls);
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
    changed(await log.start(live[0]!.exercise, { ...(routine ? { routine } : {}), ...(location ? { location } : {}) }), null, live);
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
          else throw e;
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
  } else if (tab === "more" && sub === "locations") {
    body = <LocationsScreen locations={locations} onSave={saveLocation} onAddStarters={() => starterLocations().forEach((l) => saveLocation(l))} onBack={() => setSub(null)} />;
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
        routines={routines} library={library} index={index} units={profile?.units ?? "kg"} sessionOpen={!!session}
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
  } else if (tab === "home" && home.screen === "new") {
    body = (
      <NewMovement
        initialName={home.name}
        onCancel={() => setHome({ screen: "start" })}
        onSave={(f) => void (async () => {
          if (!vault) return;
          const x = await createExercise(vault, { ...f, aliases: [] }, committer ?? undefined);
          setLibrary((lib) => [...lib, x]);
          await startWith(x);
        })()}
      />
    );
  } else if (tab === "home" && home.screen === "session" && log && session) {
    body = (
      <SessionScreen
        log={log} session={session} plan={plan} library={library} recent={recent} index={index} units={profile?.units ?? "kg"}
        pending={pending}
        onPending={(p) => { setPending(p); changed(log.session ?? session, p); }}
        onChanged={(s) => changed(s)}
        onFinished={(s) => {
          setSession(null);
          setPending(null);
          setPlan(null);
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
        <HomeScreen
          library={library} recent={recent} sessionOpen={!!session}
          locations={locations} location={location} onLocation={setLocation}
          onStart={(x) => void startWith(x)}
          onNew={(name) => setHome({ screen: "new", name })}
          onResume={() => setHome({ screen: "session" })}
        />
      </>
    );
  } else {
    body = <div className="pad"><h1 className="title">{tab[0]!.toUpperCase() + tab.slice(1)}</h1><span className="muted">Comes in a later milestone.</span></div>;
  }

  return (
    <div className="screen">
      <main style={{ flexGrow: 1 }}>{body}</main>
      <BottomTabs current={tab} onChange={(t) => { setTab(t); setSub(null); }} />
    </div>
  );
}
