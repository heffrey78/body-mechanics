import { useEffect, useState } from "react";
import { ENGINE_VERSION, portsRoundTrip } from "@bm/engine";
import { dataDir, hostPlatform, hostPorts, smokeReport } from "./host.ts";

/** A placeholder home (#20): proves the webview, the engine package and the Rust bridge are wired up. */
export function App() {
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
  return (
    <main className="home">
      <h1>Body Mechanics</h1>
      <p className="muted">Foundation build. Logging comes with the next tasks of Build 1.</p>
      <dl>
        <dt>Running on</dt>
        <dd data-testid="platform">{platform}</dd>
        <dt>Engine</dt>
        <dd>{ENGINE_VERSION}</dd>
        <dt>Ports</dt>
        <dd data-testid="ports">{ports}</dd>
      </dl>
    </main>
  );
}
