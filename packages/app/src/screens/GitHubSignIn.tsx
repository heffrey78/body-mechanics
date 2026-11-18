import { useEffect, useRef, useState } from "react";
import { GitHubError, type AccountStatus, type DeviceCode, type GitHub } from "@bm/engine";
import { Button, Card } from "../ui/components.tsx";

/** GitHub sign-in by device code (#38, #40): the status, and the code while it's being entered. */
export function useGitHubSignIn(github: GitHub, available: boolean) {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [code, setCode] = useState<DeviceCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const polling = useRef(false);

  useEffect(() => {
    if (available) void github.status().then(setStatus).catch((e: unknown) => setError(String(e)));
  }, [github, available]);

  // Ask GitHub every few seconds whether the code has been entered. The code is usually entered in a
  // browser on this same phone, and Android cuts a backgrounded app off the network, so polling waits
  // while the app is hidden, asks straight away when it's back, and takes "can't reach GitHub" as a
  // reason to ask again, not a failure. The code's own expiry ends it.
  useEffect(() => {
    if (!code || polling.current) return;
    polling.current = true;
    let stop = false;
    let wait = code.interval;
    let wake: (() => void) | null = null;
    const hidden = () => document.visibilityState === "hidden";
    const onVisible = () => { if (!hidden()) wake?.(); };
    document.addEventListener("visibilitychange", onVisible);
    const pause = (ms: number) => new Promise<void>((r) => {
      const t = setTimeout(() => { wake = null; r(); }, ms);
      wake = () => { clearTimeout(t); wake = null; r(); };
    });
    const tick = async () => {
      while (!stop) {
        await pause(wait * 1000);
        while (!stop && hidden()) await pause(60_000);
        if (stop) break;
        try {
          const r = await github.pollDevice();
          if (r.status === "pending") { wait = r.interval; continue; }
          if (r.status === "done") setStatus({ signedIn: true, account: r.account });
          else setError(r.status === "denied" ? "The sign-in was turned down on GitHub." : "The code expired. Try again.");
        } catch (e) {
          if (e instanceof GitHubError && e.code === "OFFLINE") continue;
          setError(e instanceof Error ? e.message : String(e));
        }
        break;
      }
      setCode(null);
      polling.current = false;
    };
    void tick();
    return () => { stop = true; wake?.(); polling.current = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [code, github]);

  const start = async () => {
    setError(null);
    try { setCode(await github.startDevice()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return { status, setStatus, code, start, error, setError };
}

/** The signed-out view: a Sign in button, or the code to enter on GitHub. */
export function SignInPrompt({ code, expired, intro, onStart }: { code: DeviceCode | null; expired?: boolean; intro: string; onStart: () => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  if (code) {
    return (
      <Card>
        <span className="label">Enter this code on GitHub</span>
        <span className="timer" style={{ fontSize: 40, letterSpacing: "0.08em" }} aria-label="Code">{code.userCode}</span>
        <Button onClick={() => void navigator.clipboard?.writeText(code.userCode).then(() => setCopied(true))}>{copied ? "Copied" : "Copy the code"}</Button>
        <span className="muted">Go to <span className="strong" style={{ wordBreak: "break-all" }}>{code.verificationUri}</span> on any device, sign in, and enter the code. This page carries on by itself.</span>
      </Card>
    );
  }
  return (
    <>
      {expired ? <span className="warn-text">GitHub no longer accepted the last sign-in. Sign in again.</span> : null}
      <span className="muted">{intro}</span>
      <Button variant="primary" xl disabled={busy} onClick={() => { setBusy(true); setCopied(false); void onStart().finally(() => setBusy(false)); }}>Sign in with GitHub</Button>
    </>
  );
}
