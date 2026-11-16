import { useEffect, useRef, useState } from "react";
import type { AccountStatus, DeviceCode, GitHub, SyncStatus } from "@bm/engine";
import { Button, Card } from "../ui/components.tsx";

/**
 * More › Sync (#38): sign in to GitHub with a code, then create the private repository your records
 * sync through (or see which one they do). The records are encrypted before they leave the device.
 */
export function SyncScreen({ github, remote, available, onCreate, onSyncNow, syncText, status: sync, onSyncOn, onBack }: {
  github: GitHub;
  /** The records' remote, once there is one. */
  remote: string | null;
  /** False in a plain browser: GitHub is only reachable from the app. */
  available: boolean;
  onCreate: (name: string) => Promise<void>;
  onSyncNow: () => Promise<void>;
  syncText: string | null;
  status: SyncStatus;
  onSyncOn: (on: boolean) => Promise<void>;
  onBack: () => void;
}) {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [code, setCode] = useState<DeviceCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("body-mechanics-records");
  const [copied, setCopied] = useState(false);
  const polling = useRef(false);

  useEffect(() => {
    if (available) void github.status().then(setStatus).catch((e: unknown) => setError(String(e)));
  }, [github, available]);

  // Ask GitHub every few seconds whether the code has been entered.
  useEffect(() => {
    if (!code || polling.current) return;
    polling.current = true;
    let stop = false;
    let wait = code.interval;
    const tick = async () => {
      while (!stop) {
        await new Promise((r) => setTimeout(r, wait * 1000));
        if (stop) break;
        try {
          const r = await github.pollDevice();
          if (r.status === "pending") { wait = r.interval; continue; }
          if (r.status === "done") setStatus({ signedIn: true, account: r.account });
          else setError(r.status === "denied" ? "The sign-in was turned down on GitHub." : "The code expired. Try again.");
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
        break;
      }
      setCode(null);
      polling.current = false;
    };
    void tick();
    return () => { stop = true; polling.current = false; };
  }, [code, github]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  let body;
  if (!available) {
    body = <span className="muted">Sync works in the app, not in a browser preview.</span>;
  } else if (!status) {
    body = <span className="muted">Checking…</span>;
  } else if (!status.signedIn) {
    body = code ? (
      <Card>
        <span className="label">Enter this code on GitHub</span>
        <span className="timer" style={{ fontSize: 40, letterSpacing: "0.08em" }} aria-label="Code">{code.userCode}</span>
        <Button onClick={() => void navigator.clipboard?.writeText(code.userCode).then(() => setCopied(true))}>{copied ? "Copied" : "Copy the code"}</Button>
        <span className="muted">Go to <span className="strong" style={{ wordBreak: "break-all" }}>{code.verificationUri}</span> on any device, sign in, and enter the code. This page carries on by itself.</span>
      </Card>
    ) : (
      <>
        {status.expired ? <span className="warn-text">GitHub no longer accepted the last sign-in. Sign in again.</span> : null}
        <span className="muted">Your records sync through a private GitHub repository. They're encrypted on this device first, so GitHub only ever holds files it can't read.</span>
        <Button variant="primary" xl disabled={busy} onClick={() => void run(async () => { setCopied(false); setCode(await github.startDevice()); })}>Sign in with GitHub</Button>
      </>
    );
  } else {
    body = (
      <>
        <span>Signed in as <span className="strong">{status.account?.login ?? "you"}</span>{status.offline ? " (GitHub can't be reached right now)" : ""}.</span>
        {remote ? (
          <Card>
            <span className="label">Your records sync with</span>
            <span className="strong" style={{ wordBreak: "break-all" }}>{remote.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "")}</span>
            <span className={sync.state === "failed" || sync.state === "needs-sign-in" ? "warn-text" : "muted"} role="status">{syncText ?? describe(sync)}</span>
            <Button variant="primary" disabled={busy || sync.state === "syncing"} onClick={() => void run(onSyncNow)}>{sync.state === "syncing" ? "Syncing…" : "Sync now"}</Button>
            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="checkbox" checked={sync.state !== "off"} style={{ width: 22, height: 22 }} onChange={(e) => void run(() => onSyncOn(e.target.checked))} />
              <span>Sync automatically, every few minutes and after each session</span>
            </label>
            {sync.state === "off" ? <span className="muted">Sync is off on this device. Everything stays here; turning it on again catches up.</span> : null}
          </Card>
        ) : (
          <Card>
            <span className="label">Create a private repository for your records</span>
            <input className="field" aria-label="Repository name" value={name} onChange={(e) => setName(e.target.value)} />
            <Button variant="primary" disabled={busy || !/^[A-Za-z0-9._-]+$/.test(name)} onClick={() => void run(() => onCreate(name))}>{busy ? "Creating…" : "Create and sync"}</Button>
          </Card>
        )}
        <Button variant="ghost" disabled={busy} onClick={() => void run(async () => { await github.signOut(); setStatus({ signedIn: false }); })}>Sign out of GitHub</Button>
      </>
    );
  }
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onBack}>‹ More</Button></div>
      <h1 className="title">Sync</h1>
      {body}
      {error ? <span className="warn-text" role="alert">{error}</span> : null}
    </div>
  );
}

const time = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** The sync status in words (#39). */
export function describe(s: SyncStatus): string {
  switch (s.state) {
    case "off": return "Sync is off.";
    case "syncing": return "Syncing…";
    case "offline": return `GitHub couldn't be reached at ${time(s.at)}. It'll try again.`;
    case "needs-sign-in": return "GitHub no longer accepts this device's sign-in. Sign out and in again.";
    case "failed": return `Sync failed at ${time(s.at)}: ${s.reason}`;
    case "idle": {
      if (!s.at || !s.last || s.last.status !== "synced") return "Waiting to sync.";
      const l = s.last;
      const what = l.merged ? "Merged with another device's changes" : l.pulled ? "Brought in another device's changes" : l.pushed ? "Sent this device's changes" : "Up to date";
      return `${what} at ${time(s.at)}.`;
    }
  }
}
