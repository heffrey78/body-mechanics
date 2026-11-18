import { useEffect, useRef, useState } from "react";
import { elapsedSeconds, pageCue, startTimer, stopTimer, type RunningTimer, type TimerSpec } from "../timer.ts";
import { Button, Card, Timer } from "../ui/components.tsx";

/**
 * A check for #22 on the phone: start a 30 s hold or a 15 s rest, lock the screen, and the cue should
 * still come. Logging (#32) uses the same timer.
 */
export function TimerCheck() {
  const [timer, setTimer] = useState<RunningTimer | null>(null);
  const [now, setNow] = useState(Date.now());
  const cued = useRef(false);

  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timer]);

  const seconds = timer ? elapsedSeconds(timer, now) : 0;
  const { kind, targetSeconds } = timer?.spec ?? { kind: "hold", targetSeconds: 0 };
  const shown = kind === "rest" ? Math.max(0, targetSeconds - seconds) : seconds;

  useEffect(() => {
    if (!timer || cued.current || seconds < targetSeconds) return;
    cued.current = true;
    if (!timer.native) pageCue();
    if (kind === "rest") setTimer(null);
  }, [timer, seconds, targetSeconds, kind]);

  const start = async (spec: TimerSpec) => {
    cued.current = false;
    setNow(Date.now());
    setTimer(await startTimer(spec));
  };
  const stop = async () => {
    await stopTimer();
    setTimer(null);
  };

  return (
    <Card>
      <span className="label">Timer check (#22)</span>
      <Timer seconds={shown} label={timer ? `${kind} timer` : "No timer running"} />
      <span className="muted" style={{ textAlign: "center" }}>
        {timer ? (kind === "rest" ? "Rest: cues at 0:00" : `Hold: cues at ${Math.floor(targetSeconds / 60)}:${String(targetSeconds % 60).padStart(2, "0")}`) : "Start one, then lock the screen."}
        {timer ? (timer.native ? " · Android service" : " · page timer") : ""}
      </span>
      {timer ? (
        <Button variant="stop" xl onClick={() => void stop()}>Stop</Button>
      ) : (
        <div className="pair">
          <Button variant="primary" onClick={() => void start({ kind: "hold", label: "Timer check · hold", targetSeconds: 30 })}>Hold 30 s</Button>
          <Button onClick={() => void start({ kind: "rest", label: "Timer check · rest", targetSeconds: 15 })}>Rest 15 s</Button>
        </div>
      )}
    </Card>
  );
}
