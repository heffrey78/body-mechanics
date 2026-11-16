import { invoke, isTauri } from "@tauri-apps/api/core";

/** What the Rust side says about where the app runs; in a plain browser (vite dev without Tauri), "browser". */
export async function hostPlatform(): Promise<string> {
  if (!isTauri()) return "browser";
  return invoke<string>("host_platform");
}

/** Tells the smoke test what the page rendered (#20); does nothing unless the app was started with BM_SMOKE. */
export async function smokeReport(report: string): Promise<void> {
  if (isTauri()) await invoke("smoke_report", { report });
}
