import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { git2GitPort, remoteFilesPort, remoteSecretsPort, type FilesPort, type GitPort, type PortChannel, type SecretsPort } from "@bm/engine";

/** What the Rust side says about where the app runs; in a plain browser (vite dev without Tauri), "browser". */
export async function hostPlatform(): Promise<string> {
  if (!isTauri()) return "browser";
  return invoke<string>("host_platform");
}

/** The app's own folder, where its repositories live. */
export function dataDir(): Promise<string> {
  return invoke<string>("data_dir");
}

/** The channel to the host's ports (#21): `port` for files, `listen` for its watch events. */
const channel: PortChannel = {
  call: (port, op, args) => invoke("port", { port, op, args }),
  listen(onEvent) {
    const events = new Channel<{ watch: string; type: "add" | "change" | "unlink"; path: string }>();
    events.onmessage = onEvent;
    void invoke("listen", { events });
    return () => {};
  },
};

/** The engine's ports in the webview: git through libgit2 in process, files through the host's Rust. */
export function hostPorts(): { git: GitPort; files: FilesPort; secrets: SecretsPort } {
  const git = git2GitPort((op, dir, args, progress) => {
    const updates = new Channel<never>();
    if (progress) updates.onmessage = progress;
    return invoke("git", { op, dir, args, progress: updates });
  });
  return { git, files: remoteFilesPort(channel), secrets: remoteSecretsPort(channel) };
}

/** Tells the smoke test what the page rendered (#20); does nothing unless the app was started with BM_SMOKE. */
export async function smokeReport(report: string): Promise<void> {
  if (isTauri()) await invoke("smoke_report", { report });
}

/** How many sessions the smoke run's storage check should use, if one was asked for (BM_SMOKE_STORAGE). */
export async function smokeStorage(): Promise<number | null> {
  return isTauri() ? invoke<number | null>("smoke_storage") : null;
}
