import { useState } from "react";
import { Button, Card } from "../ui/components.tsx";

/**
 * First run (#25): set up the encrypted records with a passphrase, then show the recovery key once.
 * Joining from another device needs sync (#29); until then this device starts its own records.
 */
export function SetupScreen({ onCreate, onDone, onJoin }: { onCreate: (passphrase: string) => Promise<string>; onDone: () => void; onJoin: () => void }) {
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState("");
  const [copied, setCopied] = useState(false);

  const problem = pass.length > 0 && pass.length < 8 ? "At least 8 characters." : again.length > 0 && again !== pass ? "The two don't match." : "";
  const ready = pass.length >= 8 && again === pass && !busy;

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      setRecovery(await onCreate(pass));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (recovery) {
    return (
      <div className="pad">
        <h1 className="title">Your recovery key</h1>
        <p className="muted" style={{ margin: 0 }}>
          It opens your records if you forget your passphrase. This is the only time it's shown: keep it in a password manager or on paper, somewhere safe.
        </p>
        <Card>
          <code className="num" style={{ wordBreak: "break-all", fontSize: 15, lineHeight: 1.5 }} data-testid="recovery-key">{recovery}</code>
          <Button onClick={() => void navigator.clipboard.writeText(recovery).then(() => setCopied(true))}>{copied ? "Copied" : "Copy"}</Button>
        </Card>
        <Button variant="primary" xl onClick={onDone}>I've kept it safe</Button>
      </div>
    );
  }

  return (
    <div className="pad">
      <h1 className="title">Set up your records</h1>
      <p className="muted" style={{ margin: 0 }}>
        Everything you log is encrypted on this device before it's saved. Choose a passphrase: you'll need it to add another device.
      </p>
      <label className="label" htmlFor="pass">Passphrase</label>
      <input id="pass" className="field" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
      <label className="label" htmlFor="again">The same again</label>
      <input id="again" className="field" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
      {problem || error ? <span className="warn-text" role="alert">{problem || error}</span> : null}
      <Button variant="primary" xl disabled={!ready} onClick={() => void create()}>{busy ? "Securing your key…" : "Set up"}</Button>
      <Button variant="ghost" onClick={onJoin}>I already use Body Mechanics on another device</Button>
    </div>
  );
}
