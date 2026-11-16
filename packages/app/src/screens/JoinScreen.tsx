import { useEffect, useState } from "react";
import type { GitHub, RepoSummary } from "@bm/engine";
import { Button, Card } from "../ui/components.tsx";
import { SignInPrompt, useGitHubSignIn } from "./GitHubSignIn.tsx";

/**
 * Join from GitHub (#40): sign in, pick the repository your other device syncs with, and unlock it
 * with your passphrase (or the recovery key). The records are cloned encrypted; the key stays here.
 */
export function JoinScreen({ github, available, onJoin, onBack }: {
  github: GitHub;
  available: boolean;
  /** Clone (if not yet) and unlock; rejects with the reason (a wrong passphrase, say). */
  onJoin: (repo: RepoSummary, secret: string, progress: (text: string) => void) => Promise<void>;
  onBack: () => void;
}) {
  const { status, code, start, error, setError } = useGitHubSignIn(github, available);
  const [repos, setRepos] = useState<RepoSummary[] | null>(null);
  const [repo, setRepo] = useState<RepoSummary | null>(null);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    if (!status?.signedIn || repos) return;
    void github.repos().then((rs) => {
      // Private ones only (records are never public); the usual name first.
      const mine = rs.filter((r) => r.private).sort((a, b) => Number(b.fullName.endsWith("/body-mechanics-records")) - Number(a.fullName.endsWith("/body-mechanics-records")));
      setRepos(mine);
      if (mine.length === 1 || mine[0]?.fullName.endsWith("/body-mechanics-records")) setRepo(mine[0]!);
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [status, repos, github, setError]);

  let body;
  if (!available) body = <span className="muted">Joining works in the app, not in a browser preview.</span>;
  else if (!status) body = <span className="muted">Checking…</span>;
  else if (!status.signedIn) body = <SignInPrompt code={code} onStart={start} intro="Sign in to the GitHub account your other device syncs with." />;
  else if (!repos) body = <span className="muted">Finding your repositories…</span>;
  else if (!repo) {
    body = (
      <>
        <span className="label">Which repository holds your records?</span>
        {repos.length === 0 ? <span className="muted">No private repositories on {status.account?.login ?? "this account"}. Set up sync on your other device first (More › Sync).</span> : null}
        <div className="card" style={{ padding: 0, gap: 0 }}>
          {repos.map((r) => <button key={r.fullName} type="button" className="result" onClick={() => setRepo(r)}><span className="strong">{r.fullName}</span></button>)}
        </div>
      </>
    );
  } else {
    body = (
      <Card>
        <span className="label">Unlock {repo.fullName}</span>
        <span className="muted">Your passphrase from the other device, or your recovery key (AGE-SECRET-KEY-1…).</span>
        <input className="field" type="password" aria-label="Passphrase or recovery key" autoComplete="current-password" value={secret} onChange={(e) => setSecret(e.target.value)} />
        {progress && busy ? <span className="muted" role="status">{progress}</span> : null}
        <Button variant="primary" xl disabled={busy || !secret} onClick={() => {
          setBusy(true);
          setError(null);
          void onJoin(repo, secret, setProgress).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false));
        }}>{busy ? "Joining…" : "Join"}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => setRepo(null)}>A different repository</Button>
      </Card>
    );
  }
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onBack}>‹ Set up instead</Button></div>
      <h1 className="title">Join your records</h1>
      {body}
      {error ? <span className="warn-text" role="alert">{error}</span> : null}
    </div>
  );
}
