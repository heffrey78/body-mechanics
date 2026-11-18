/**
 * Sync with the remote (D2 item 4, #29; after writer's Syncer and conflicts.ts at writer e89d55c):
 * commit what's pending, fetch, then fast-forward (only they moved), push (only we did), or merge
 * (both did) and push the merge. Git merges what it can; every path it can't is a record both
 * devices changed, merged here record by record (merge.ts): decrypted, merged, encrypted again,
 * and committed with both sides as parents, so every commit stays in history.
 */
import type { GitAuth, GitPort, TreeEdit } from "../ports/git-port.ts";
import type { Vault } from "../vault/vault.ts";
import type { Committer } from "./committer.ts";
import { mergeRecords } from "./merge.ts";

export type SyncOutcome =
  | { status: "local" }
  | { status: "synced"; pulled: boolean; pushed: boolean; merged: boolean; flags: string[] };

export interface SyncOptions {
  remote?: string;
  branch?: string;
  auth?: GitAuth;
}

export async function sync(git: GitPort, vault: Vault, committer: Committer, { remote = "origin", branch = "main", auth }: SyncOptions = {}): Promise<SyncOutcome> {
  const root = vault.root;
  if (!(await git.remoteUrl(root, remote))) return { status: "local" };
  await committer.now();
  const tracking = `refs/remotes/${remote}/${branch}`;
  await git.fetch(root, remote, [`+refs/heads/${branch}:${tracking}`], auth ? { auth } : {});
  const head = await git.resolve(root, "HEAD");
  const upstream = await git.resolve(root, tracking);
  const push = async () => git.push(root, remote, [`HEAD:refs/heads/${branch}`], { setUpstream: true, ...(auth ? { auth } : {}) });
  if (!head) throw new Error("This repository has no commits yet.");
  if (!upstream) {
    await push();
    return { status: "synced", pulled: false, pushed: true, merged: false, flags: [] };
  }
  const { ahead, behind } = await git.aheadBehind(root, head, upstream);
  if (ahead === 0 && behind === 0) return { status: "synced", pulled: false, pushed: false, merged: false, flags: [] };
  if (ahead === 0) {
    await git.fastForward(root, upstream);
    return { status: "synced", pulled: true, pushed: false, merged: false, flags: [] };
  }
  if (behind === 0) {
    await push();
    return { status: "synced", pulled: false, pushed: true, merged: false, flags: [] };
  }
  const { flags } = await mergeWith(git, vault, head, upstream);
  await push();
  return { status: "synced", pulled: true, pushed: true, merged: true, flags };
}

/** Merge `upstream` into `head` in memory, settle every conflicting record, commit, and move to it. */
export async function mergeWith(git: GitPort, vault: Vault, head: string, upstream: string): Promise<{ commit: string; flags: string[] }> {
  const root = vault.root;
  const base = await git.mergeBase(root, head, upstream);
  const { tree, conflicts } = await git.mergeTrees(root, head, upstream);
  const flags: string[] = [];
  const edits: TreeEdit[] = [];
  const blob = async (rev: string | null, path: string) => (rev ? (await git.readFile(root, rev, path)) ?? undefined : undefined);
  for (const path of conflicts) {
    const [b, o, t] = await Promise.all([blob(base, path), blob(head, path), blob(upstream, path)]);
    if (!path.endsWith(".yaml.age")) {
      // format.yaml, .gitignore, keys/: the app writes these once; keep ours.
      edits.push(o ? { path, content: o } : { path, remove: true });
      continue;
    }
    const read = async (x: Uint8Array | undefined) => (x ? vault.decrypt(x) : undefined);
    const merged = mergeRecords(await read(b), await read(o), await read(t));
    flags.push(...merged.flags.map((f) => `${path}: ${f}`));
    edits.push(merged.record ? { path, content: await vault.encrypt(merged.record), mode: "100644" } : { path, remove: true });
  }
  const mergedTree = edits.length ? await git.buildTree(root, tree, edits) : tree;
  const commit = await git.commitTree(root, mergedTree, [head, upstream], flags.length ? `Merge records from another device\n\n${flags.join("\n")}` : "Merge records from another device");
  await git.fastForward(root, commit);
  return { commit, flags };
}
