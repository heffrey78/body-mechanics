import type { FileEventType, FilesPort } from "./files-port.ts";
import type { GitPort } from "./git-port.ts";
import { gitFailure, type GitErrorCode } from "./git-port.ts";
import { fromBase64, toBase64 } from "./base64.ts";
import type { SecretsPort } from "./secrets-port.ts";


/**
 * Ports whose work is done elsewhere (D2; from writer's remote-ports.ts at writer e89d55c): the engine
 * in the webview, its git, files and secrets in the host's Rust, reached through Tauri's invoke. A call names the port and the operation and carries its arguments
 * as JSON, bytes and maps encoded (`encode`); what can't cross (a clone's progress, an abort signal, a
 * test's write hook) stays on this side, and a watch's events come back on the channel's listener.
 */

export interface PortChannel {
  call(port: "git" | "files" | "secrets", op: string, args: unknown[]): Promise<unknown>;
  /**
   * Watch events for the watches this side started, as `{ watch, type, path }`; and, with
   * `onConnection`, when the host is lost (false) and back (true).
   */
  listen(onEvent: (e: { watch: string; type: FileEventType; path: string }) => void, onConnection?: (up: boolean) => void): () => void;
}

/** A value made fit for JSON: bytes as base64, maps as entries; the rest as it is. */
export function encode(value: unknown): unknown {
  if (value instanceof Uint8Array) return { $bytes: toBase64(value) };
  if (value instanceof Map) return { $map: [...value].map(([k, v]) => [k, encode(v)]) };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v !== "function" && !(v instanceof AbortSignal)).map(([k, v]) => [k, encode(v)]));
  return value;
}

/** `encode`'s value back. */
export function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.$bytes === "string") return fromBase64(o.$bytes);
    if (Array.isArray(o.$map)) return new Map((o.$map as [unknown, unknown][]).map(([k, v]) => [k, decode(v)]));
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, decode(v)]));
  }
  return value;
}

/** A failure as the channel reports one: a git failure keeps its code. */
export interface RemoteFailure {
  code?: string;
  message: string;
  detail?: string;
}

async function called(channel: PortChannel, port: Parameters<PortChannel["call"]>[0], op: string, args: unknown[]): Promise<unknown> {
  try {
    return decode(await channel.call(port, op, args.map(encode)));
  } catch (e) {
    const f = e as RemoteFailure;
    if (port === "git" && f?.code) throw gitFailure(f.code as GitErrorCode, f.detail ?? f.message);
    throw Object.assign(new Error(f?.message ?? String(e)), f?.code ? { code: f.code } : {});
  }
}

/** Every operation of a port, by name, as a call on the channel. */
function proxy<T extends object>(channel: PortChannel, port: "git" | "files", local: Partial<T> = {}): T {
  return new Proxy(local as T, {
    get: (target, op: string) => (op in target ? target[op as keyof T] : (...args: unknown[]) => called(channel, port, op, args)),
  });
}

export function remoteGitPort(channel: PortChannel): GitPort {
  return proxy<GitPort>(channel, "git");
}

/** The files port through the channel: "/"-separated paths, as on Android and Linux; watching by the channel's events. */
export function remoteFilesPort(channel: PortChannel): FilesPort {
  const watchers = new Map<string, (type: FileEventType, path: string) => void>();
  channel.listen((e) => watchers.get(e.watch)?.(e.type, e.path));
  const norm = (p: string) => `/${p.split("/").filter(Boolean).join("/")}`;
  return proxy<FilesPort>(channel, "files", {
    join: (root, ...parts) => norm([root, ...parts].join("/")),
    dirname: (path) => norm(path.split("/").slice(0, -1).join("/")),
    relative: (root, path) => {
      const [r, p] = [norm(root), norm(path)];
      if (p === r) return "";
      return p.startsWith(r === "/" ? "/" : `${r}/`) ? p.slice(r === "/" ? 1 : r.length + 1) : undefined;
    },
    // The write hook is a test's, on this side: it isn't carried.
    write: (path, data) => called(channel, "files", "write", [path, typeof data === "string" ? new TextEncoder().encode(data) : data]) as Promise<void>,
    watch: async (root, ignore, onChange) => {
      const watch = (await called(channel, "files", "watch", [root])) as string;
      watchers.set(watch, (type, path) => {
        if (!ignore(path)) onChange(type, path);
      });
      return async () => {
        watchers.delete(watch);
        await called(channel, "files", "unwatch", [watch]);
      };
    },
  });
}


/** The secrets port through the channel (#25): the OS keychain on the desktop, the keystore on Android. */
export function remoteSecretsPort(channel: PortChannel): SecretsPort {
  return {
    get: async (name) => ((await called(channel, "secrets", "get", [name])) as string | null) ?? undefined,
    set: async (name, value) => void (await called(channel, "secrets", "set", [name, value])),
    delete: async (name) => void (await called(channel, "secrets", "delete", [name])),
  };
}
