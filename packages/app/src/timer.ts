import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * Hold and rest timers (#22). On Android a foreground service keeps time and cues with the screen
 * locked; the page shows the same clock. Elsewhere the page keeps time and cues itself (a tone and,
 * where there is one, a vibration). Time is measured from a start instant, never by counting ticks.
 */
export interface TimerSpec {
  kind: "hold" | "rest";
  label: string;
  targetSeconds: number;
}

export interface RunningTimer {
  spec: TimerSpec;
  startedAt: number;
  native: boolean;
}

export async function startTimer(spec: TimerSpec, elapsedSeconds = 0): Promise<RunningTimer> {
  let native = false;
  if (isTauri()) {
    native = await invoke<boolean>("timer_start", { kind: spec.kind, label: spec.label, targetSeconds: spec.targetSeconds, elapsedSeconds });
  }
  return { spec, startedAt: Date.now() - elapsedSeconds * 1000, native };
}

export async function stopTimer(): Promise<void> {
  if (isTauri()) await invoke("timer_stop");
}

export function elapsedSeconds(t: RunningTimer, now = Date.now()): number {
  return Math.max(0, Math.floor((now - t.startedAt) / 1000));
}

/** The page's own cue, where no service cues: two short tones, and a vibration if the device has one. */
export function pageCue(): void {
  try {
    const ctx = new AudioContext();
    for (const at of [0, 0.35]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.25);
    }
  } catch {
    /* no audio: the vibration, if any */
  }
  navigator.vibrate?.([400, 200, 400]);
}
