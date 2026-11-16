import { useEffect, useState } from "react";
import {
  COMMIT_EMAIL, COMMIT_NAME, Committer, ENGINE_VERSION, NotSetUp, RecordIndex, SessionLog, Vault, clearDraft, createExercise, deviceClock,
  indexBenchmark, loadDraft, loadLibrary, loadProfile, memoryFilesPort, memorySecretsPort, portsRoundTrip, saveDraft,
  type LibraryItem, type Profile, type Session,
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
  const [sub, setSub] = useState<"theme" | "credits" | "checks" | null>(null);
  const [home, setHome] = useState<{ screen: "start" } | { screen: "new"; name: string } | { screen: "session" }>({ screen: "start" });
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [index, setIndex] = useState<RecordIndex | null>(null);
  const [log, setLog] = useState<SessionLog | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
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
    const [lib, built, clock] = await Promise.all([loadLibrary(v), RecordIndex.build(v, files), deviceClock(v)]);
    setLibrary(lib);
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
      setHome({ screen: "session" });
    }
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
  const changed = (s: Session, p: Pending | null = pending) => {
    setSession({ ...s });
    if (vault) void saveDraft(vault, { sessionId: s.id, state: { pending: p }, savedAt: new Date().toISOString() });
  };
  const startWith = async (x: LibraryItem) => {
    if (!log) return;
    setSummary(null);
    if (log.session) {
      await log.addEntry(x.id);
      setPending(null);
      changed(log.session);
    } else {
      changed(await log.start(x.id), null);
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
        await opened((await Vault.create({ files, secrets: memorySecretsPort() }, "/records", "browser preview", { scryptLogN: 1 })).vault, files, false);
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
  } else if (tab === "history") {
    body = (
      <HistoryScreen
        vault={vault} index={index} library={library} units={profile?.units ?? "kg"} canEdit={!session}
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
        log={log} session={session} library={library} recent={recent} index={index} units={profile?.units ?? "kg"}
        pending={pending}
        onPending={(p) => { setPending(p); changed(log.session ?? session, p); }}
        onChanged={(s) => changed(s)}
        onFinished={(s) => {
          setSession(null);
          setPending(null);
          if (vault) void clearDraft(vault);
          const sets = s.entries.reduce((n, e) => n + e.sets.filter((x) => !x.deleted).length, 0);
          setSummary(`Saved: ${s.entries.length} ${s.entries.length === 1 ? "exercise" : "exercises"}, ${sets} ${sets === 1 ? "set" : "sets"}.`);
          setHome({ screen: "start" });
        }}
        onHome={() => setHome({ screen: "start" })}
      />
    );
  } else if (tab === "home") {
    body = (
      <>
        {summary ? <div className="pad" style={{ paddingBottom: 0, flexGrow: 0 }}><div className="card" role="status">{summary}</div></div> : null}
        <HomeScreen
          library={library} recent={recent} sessionOpen={!!session}
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
