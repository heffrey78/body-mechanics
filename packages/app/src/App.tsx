import { useEffect, useState } from "react";
import { ENGINE_VERSION, NotSetUp, Vault, indexBenchmark, portsRoundTrip } from "@bm/engine";
import { dataDir, hostPlatform, hostPorts, smokeReport, smokeStorage } from "./host.ts";
import { useTheme } from "./theme/theme.ts";
import { ThemeScreen } from "./screens/ThemeScreen.tsx";
import { TimerCheck } from "./screens/TimerCheck.tsx";
import { SetupScreen } from "./screens/SetupScreen.tsx";
import { StorageCheck } from "./screens/StorageCheck.tsx";
import { ExportCard } from "./screens/ExportCard.tsx";
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
  const [sub, setSub] = useState<"theme" | null>(null);
  const [platform, setPlatform] = useState("…");
  const [ports, setPorts] = useState("…");
  // The encrypted records (#25): "unknown" until checked, "setup" on first run, "ready" once open.
  const [records, setRecords] = useState<"unknown" | "setup" | "ready" | "browser">("unknown");
  const [vault, setVault] = useState<Vault | null>(null);

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
          setVault(await Vault.open(hostPorts(), await recordsRoot()));
          setRecords("ready");
        } catch (e) {
          if (e instanceof NotSetUp) setRecords("setup");
          else throw e;
        }
      } else {
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
            const { vault, recoveryKey } = await Vault.create(hostPorts(), await recordsRoot(), passphrase);
            setVault(vault);
            return recoveryKey;
          }}
          onDone={() => setRecords("ready")}
        />
      </div>
    );
  }
  if (tab === "more" && sub === "theme") {
    body = <ThemeScreen choice={theme} onChange={setTheme} onBack={() => setSub(null)} />;
  } else if (tab === "more") {
    body = (
      <div className="pad">
        <h1 className="title">More</h1>
        <div className="card" style={{ padding: 0, gap: 0 }}>
          <Button variant="ghost" onClick={() => setSub("theme")}>Theme ›</Button>
        </div>
        <ExportCard vault={vault} units="kg" />
        <span className="muted">Units and credits come with the profile (#27).</span>
      </div>
    );
  } else if (tab === "home") {
    body = (
      <div className="pad">
        <h1 className="title">Body Mechanics</h1>
        <p className="muted" style={{ margin: 0 }}>Foundation build. Logging comes with the next tasks of Build 1.</p>
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
