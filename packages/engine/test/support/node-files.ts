import { mkdir, readdir, readFile, rename, rm, rmdir, stat, lstat, copyFile, realpath, writeFile, unlink } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import type { FilesPort } from "../../src/ports/files-port.ts";

/** The files port on Node's fs, for tests that need a real disk (git). The app's own is Rust's (#21). */
export const nodeFiles: FilesPort = {
  read: async (p) => readFile(p).then((b) => new Uint8Array(b), () => undefined),
  stat: async (p) => lstat(p).then(
    (s) => ({ kind: s.isFile() ? "file" : s.isDirectory() ? "dir" : s.isSymbolicLink() ? "symlink" : "other", size: s.size, mtimeMs: s.mtimeMs }),
    () => undefined,
  ),
  list: async (p, { recursive = false } = {}) => {
    const entries = await readdir(p, { withFileTypes: true, recursive }).catch(() => []);
    return entries.map((e) => ({
      path: relative(p, join(e.parentPath, e.name)).split(sep).join("/"),
      kind: e.isFile() ? "file" : e.isDirectory() ? "dir" : e.isSymbolicLink() ? "symlink" : "other",
    }));
  },
  write: async (p, data) => {
    await mkdir(dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.bm-tmp`;
    await writeFile(tmp, data);
    await rename(tmp, p);
  },
  remove: (p) => unlink(p).catch(() => undefined),
  removeTree: (p) => rm(p, { recursive: true, force: true }),
  removeEmptyDir: (p) => rmdir(p).then(() => true, () => false),
  rename: (a, b) => rename(a, b),
  makeDir: async (p) => void (await mkdir(p, { recursive: true })),
  copy: (a, b) => copyFile(a, b),
  real: (p) => realpath(p).catch(() => undefined),
  join: (root, ...parts) => join(root, ...parts),
  dirname: (p) => dirname(p),
  relative: (root, p) => {
    const r = relative(root, p);
    return r.startsWith("..") ? undefined : r.split(sep).join("/");
  },
  watch: async () => async () => {},
};
