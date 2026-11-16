import { useEffect, useState } from "react";
import { ENGINE_VERSION, portsRoundTrip } from "@bm/engine";
import { dataDir, hostPlatform, hostPorts, smokeReport } from "./host.ts";
import { useTheme } from "./theme/theme.ts";
import { ThemeScreen } from "./screens/ThemeScreen.tsx";
import { TimerCheck } from "./screens/TimerCheck.tsx";
import { BottomTabs, Button, type TabId } from "./ui/components.tsx";

/** Build 1's shell: tabs, a placeholder home with the host checks (#20, #21), and More › Theme (#23). */
export function App() {
  const [theme, setTheme] = useTheme();
  const [tab, setTab] = useState<TabId>("home");
  const [sub, setSub] = useState<"theme" | null>(null);
  const [platform, setPlatform] = useState("…");
  const [ports, setPorts] = useState("…");

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
      await smokeReport(`platform=${p} engine=${ENGINE_VERSION} ports=${check.replaceAll(" ", "_")}`);
    })();
  }, []);

  let body;
  if (tab === "more" && sub === "theme") {
    body = <ThemeScreen choice={theme} onChange={setTheme} onBack={() => setSub(null)} />;
  } else if (tab === "more") {
    body = (
      <div className="pad">
        <h1 className="title">More</h1>
        <div className="card" style={{ padding: 0, gap: 0 }}>
          <Button variant="ghost" onClick={() => setSub("theme")}>Theme ›</Button>
        </div>
        <span className="muted">Units, credits and export come later in Build 1.</span>
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
        </dl>
        <TimerCheck />
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
