import { useEffect, useState } from "react";
import { ENGINE_VERSION } from "@bm/engine";
import { hostPlatform, smokeReport } from "./host.ts";

/** A placeholder home (#20): proves the webview, the engine package and the Rust bridge are wired up. */
export function App() {
  const [platform, setPlatform] = useState("…");
  useEffect(() => {
    hostPlatform().then(
      (p) => {
        setPlatform(p);
        void smokeReport(`platform=${p} engine=${ENGINE_VERSION}`);
      },
      (e: unknown) => setPlatform(`error: ${String(e)}`),
    );
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
      </dl>
    </main>
  );
}
