import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GitFailure, NO_OBJECT, text, type GitPort } from "../src/ports/git-port.ts";
import { built, rustGitPort } from "./support/rust-git-port.ts";

/**
 * The git port's contract (D16 in writer; D2 here, #21), from writer's packages/server/test/git-port.test.ts
 * at writer e89d55c: the local cases, held against libgit2 (crates/git2-port) through its stdio binary,
 * the same Rust the app calls in process. Remote cases come with sync (#29). writer runs these against
 * git as well, which is how libgit2 was shown to agree with it.
 */

// libgit2's, where it's built (`cargo build --release` in crates/git2-port; CI builds it first).
const rust = built() ? rustGitPort() : undefined;
export const PORTS: [string, GitPort][] = rust ? [["libgit2", rust]] : [];
afterAll(() => rust?.close());
if (!rust) it.skip("the git port: build crates/git2-port to run these", () => {});

let fresh: (name: string) => string;
let cleanUp: () => void;
beforeAll(() => {
  const tmp = mkdtempSync(join(tmpdir(), "bm-git-port-"));
  const config = join(tmp, "gitconfig");
  writeFileSync(config, "[user]\n\tname = Test\n\temail = test@example.com\n[init]\n\tdefaultBranch = main\n");
  process.env["GIT_CONFIG_GLOBAL"] = config;
  process.env["GIT_CONFIG_NOSYSTEM"] = "1";
  let n = 0;
  fresh = (name) => join(tmp, `${name}-${++n}`);
  cleanUp = () => rmSync(tmp, { recursive: true, force: true });
});
afterAll(() => cleanUp());

const write = (dir: string, path: string, content: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
};
const read = (dir: string, path: string) => readFileSync(join(dir, path), "utf8");
const move = (dir: string, from: string, to: string) => {
  mkdirSync(dirname(join(dir, to)), { recursive: true });
  renameSync(join(dir, from), join(dir, to));
};
const code = (p: Promise<unknown>) =>
  p.then(
    () => "no error",
    (e: unknown) => (e instanceof GitFailure ? e.code : `not a GitFailure: ${String(e)}`),
  );
const prose = (a: string, b: string, c: string) => `${a}\n\n${b}\n\n${c}\n`;
const LONG = Array.from({ length: 12 }, (_, i) => `Line ${i + 1} of a scene long enough for git to see a rename.`).join("\n") + "\n";

/** A repository with a name to commit by, and a first commit: book/a.md, book/b.md, book/c.md. */
async function started(p: GitPort, name = "book"): Promise<string> {
  const dir = fresh(name);
  mkdirSync(dir, { recursive: true });
  await p.init(dir, "main");
  await p.setConfig(dir, "user.name", "Ada Writer");
  await p.setConfig(dir, "user.email", "ada@example.com");
  write(dir, "book/a.md", prose("one", "two", "three"));
  write(dir, "book/b.md", prose("B", "bee", "buzz"));
  write(dir, "book/c.md", LONG);
  await p.stage(dir);
  await p.commit(dir, "Start");
  return dir;
}

describe.each(PORTS)("the git port: %s", (_, p) => {
  it("says which git it is", async () => {
    expect(await p.version()).toMatch(/^(git|libgit2) \d+\.\d+/);
  });

  it("commits what's staged, the message cleaned up as git commit -m does, by the configured name", async () => {
    const dir = fresh("commit");
    mkdirSync(dir);
    await p.init(dir, "main");
    expect(await p.isRepo(dir)).toBe(true);
    expect(await p.currentBranch(dir)).toBe("main");
    expect(await p.resolve(dir, "HEAD")).toBeNull();
    expect(await p.prefix(dir)).toBe("");
    expect(await p.gitDir(dir)).toBe(join(dir, ".git"));
    await p.setConfig(dir, "user.name", "Ada Writer");
    await p.setConfig(dir, "user.email", "ada@example.com");
    write(dir, "a.md", "Alpha\n");
    write(dir, "notes/b.md", "Beta\n");
    expect(await p.status(dir)).toEqual([
      { path: "a.md", x: "?", y: "?" },
      { path: "notes/b.md", x: "?", y: "?" },
    ]);
    await p.stage(dir);
    const staged = await p.stagedChanges(dir);
    expect(staged.map((c) => [c.status, c.path, c.old])).toEqual([
      ["A", "a.md", NO_OBJECT],
      ["A", "notes/b.md", NO_OBJECT],
    ]);
    expect(text((await p.readBlobs(dir, [staged[0]!.new])).get(staged[0]!.new)!)).toBe("Alpha\n");
    const first = await p.commit(dir, "Start  \n\nWhy it changed.  \n\n\n");
    expect(await p.commitInfo(dir, "HEAD")).toMatchObject({ oid: first, parents: [], message: "Start\n\nWhy it changed.\n", author: { name: "Ada Writer", email: "ada@example.com" } });
    expect((await p.commitInfo(dir, "HEAD")).committed).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(Z|[+-]\d\d:\d\d)$/);
    expect(await p.status(dir)).toEqual([]);
    expect(await p.commit(dir, "Nothing")).toBeNull();

    // A rename with a small edit is a rename, staged and in the status.
    renameSync(join(dir, "notes/b.md"), join(dir, "notes/beta.md"));
    write(dir, "c.md", LONG);
    await p.stage(dir);
    write(dir, "c.md", LONG + "One more line.\n");
    await p.remove(dir, ["a.md"]);
    expect(existsSync(join(dir, "a.md"))).toBe(false);
    expect((await p.stagedChanges(dir)).map((c) => [c.status, c.from ?? "", c.path])).toEqual([
      ["D", "", "a.md"],
      ["A", "", "c.md"],
      ["R", "notes/b.md", "notes/beta.md"],
    ]);
    expect(await p.status(dir)).toEqual([
      { path: "a.md", x: "D", y: " " },
      { path: "c.md", x: "A", y: "M" },
      { path: "notes/beta.md", x: "R", y: " ", from: "notes/b.md" },
    ]);
    await p.stage(dir);
    const second = await p.commit(dir, "Second");
    write(dir, "c.md", "Short now.\n");
    await p.stage(dir);
    const amended = await p.amend(dir);
    expect(amended).not.toBe(second);
    expect(await p.commitInfo(dir, "HEAD")).toMatchObject({ parents: [first], message: "Second\n" });
    expect(await p.count(dir, "HEAD")).toBe(2);
    expect(await p.ancestors(dir, "HEAD")).toEqual([amended, first]);
    expect(await p.listFiles(dir, ["notes"])).toEqual(["notes/beta.md"]);
  });

  it("keeps to the book's folder in a larger repository, and to the paths it's given, less what's excluded", async () => {
    const repo = await started(p, "shelf");
    const dir = join(repo, "book");
    expect(await p.prefix(dir)).toBe("book/");
    expect(await p.gitDir(dir)).toBe(join(repo, ".git"));
    write(repo, "outside.md", "Not the book's.\n");
    write(dir, "a.md", prose("one!", "two", "three"));
    write(dir, "new.md", "New.\n");
    write(dir, ".new.md.ghw-tmp", "Half written.\n");
    const temp = { exclude: ["**/.*.ghw-tmp"] };
    expect((await p.status(dir, temp)).map((e) => [e.path, e.x, e.y])).toEqual([
      ["a.md", " ", "M"],
      ["new.md", "?", "?"],
    ]);
    await p.stage(dir, { paths: ["a.md"] });
    expect((await p.stagedChanges(dir)).map((c) => c.path)).toEqual(["a.md"]);
    await p.stage(dir, temp);
    expect((await p.stagedChanges(dir, temp)).map((c) => c.path)).toEqual(["a.md", "new.md"]);
    expect(await p.commit(dir, "In the book", temp)).not.toBeNull();
    expect((await p.status(repo)).map((e) => e.path)).toEqual([".new.md.ghw-tmp", "outside.md"].map((f) => (f === "outside.md" ? f : `book/${f}`)).sort());
    expect(text((await p.readFile(dir, "HEAD", "new.md"))!)).toBe("New.\n");
    expect((await p.listTree(dir, "HEAD")).map((e) => e.path)).toEqual(["a.md", "b.md", "c.md", "new.md"]);
    expect((await p.log(dir, { path: "new.md" })).map((c) => c.summary)).toEqual(["In the book"]);
  });

  it("reads history: a file and a tree at a revision, blobs by ID, a path's log, each commit's changes with renames, deletions", async () => {
    const dir = await started(p);
    write(dir, "book/a.md", prose("one!", "two", "three"));
    await p.stage(dir);
    const second = await p.commit(dir, "Edit a");
    move(dir, "book/c.md", "book/later/c.md");
    write(dir, "book/later/c.md", LONG.replace("Line 3", "Line three"));
    await p.stage(dir);
    await p.commit(dir, "Move c");
    unlinkSync(join(dir, "book/a.md"));
    await p.stage(dir);
    const removed = await p.commit(dir, "Remove a");

    expect(text((await p.readFile(dir, second!, "book/a.md"))!)).toBe(prose("one!", "two", "three"));
    expect(await p.readFile(dir, "HEAD", "book/a.md")).toBeNull();
    const tree = await p.listTree(dir, "HEAD");
    expect(tree.map((e) => [e.path, e.mode])).toEqual([
      ["book/b.md", "100644"],
      ["book/later/c.md", "100644"],
    ]);
    expect((await p.listTree(dir, "HEAD", "book/later")).map((e) => e.path)).toEqual(["book/later/c.md"]);
    const blobs = await p.readBlobs(dir, tree.map((e) => e.oid));
    expect(text(blobs.get(tree[0]!.oid)!)).toBe(prose("B", "bee", "buzz"));

    expect((await p.log(dir, { path: "book/a.md" })).map((c) => c.summary)).toEqual(["Remove a", "Edit a", "Start"]);
    expect((await p.log(dir, { limit: 2 })).map((c) => c.summary)).toEqual(["Remove a", "Move c"]);
    expect(await p.count(dir, "HEAD")).toBe(4);
    expect((await p.history(dir)).map((c) => c.files.map((f) => `${f.status} ${f.from ? `${f.from} -> ` : ""}${f.path}`))).toEqual([
      ["A book/a.md", "A book/b.md", "A book/c.md"],
      ["M book/a.md"],
      ["R book/c.md -> book/later/c.md"],
      ["D book/a.md"],
    ]);
    expect((await p.history(dir, "book/later")).map((c) => c.files.map((f) => `${f.status} ${f.path}`))).toEqual([["A book/later/c.md"]]);
    expect(await p.deletions(dir, "book", 10)).toEqual([{ oid: removed, committed: expect.any(String), files: ["book/a.md"] }]);
  });

  it("makes, switches and deletes a version's branch, keeping a local change it doesn't touch and refusing one it would", async () => {
    const dir = await started(p);
    await p.createBranch(dir, "writer-version/rewrite", "HEAD");
    expect(await p.currentBranch(dir)).toBe("writer-version/rewrite");
    write(dir, "book/a.md", prose("ONE", "two", "three"));
    await p.stage(dir);
    await p.commit(dir, "Rewrite");
    await p.switchBranch(dir, "main");
    expect(read(dir, "book/a.md")).toBe(prose("one", "two", "three"));
    expect((await p.refs(dir, ["refs/heads/"])).map((r) => r.name)).toEqual(["refs/heads/main", "refs/heads/writer-version/rewrite"]);
    await p.setConfig(dir, "branch.writer-version/rewrite.description", "A rewrite");
    expect(await p.listConfig(dir)).toContainEqual(["branch.writer-version/rewrite.description", "A rewrite"]);

    write(dir, "book/b.md", "Unsaved elsewhere.\n");
    await p.switchBranch(dir, "writer-version/rewrite");
    expect(read(dir, "book/b.md")).toBe("Unsaved elsewhere.\n");
    write(dir, "book/a.md", "Would be lost.\n");
    expect(await code(p.switchBranch(dir, "main"))).toBe("GIT");
    expect(read(dir, "book/a.md")).toBe("Would be lost.\n");
    expect(await p.currentBranch(dir)).toBe("writer-version/rewrite");
    write(dir, "book/a.md", prose("ONE", "two", "three"));
    await p.switchBranch(dir, "main");
    await p.deleteBranch(dir, "writer-version/rewrite");
    expect((await p.refs(dir, ["refs/heads/"])).map((r) => r.name)).toEqual(["refs/heads/main"]);
  });

  it("tags a checkpoint, annotated, at HEAD or a commit, and restores the book from it: what it had back, what it hadn't gone", async () => {
    const dir = await started(p);
    const at = await p.resolve(dir, "HEAD");
    await p.tag(dir, "checkpoint/2026-10-21-before", "Before the rewrite\n\nwords: 120");
    expect(await p.tags(dir, "checkpoint/")).toEqual([{ name: "checkpoint/2026-10-21-before", commit: at, annotated: true, date: expect.stringMatching(/^\d{4}-/), message: "Before the rewrite\n\nwords: 120\n" }]);
    write(dir, "book/a.md", "Rewritten.\n");
    write(dir, "book/new.md", "New.\n");
    unlinkSync(join(dir, "book/b.md"));
    await p.stage(dir);
    const rewrite = await p.commit(dir, "Rewrite");
    await p.tag(dir, "checkpoint/2026-10-21-older", "Older", at!);
    expect((await p.tags(dir)).map((t) => [t.name, t.commit])).toEqual([
      ["checkpoint/2026-10-21-before", at],
      ["checkpoint/2026-10-21-older", at],
    ]);
    write(dir, "outside.md", "Not in the book.\n");
    await p.restore(dir, "checkpoint/2026-10-21-before", ["book"]);
    expect(read(dir, "book/a.md")).toBe(prose("one", "two", "three"));
    expect(read(dir, "book/b.md")).toBe(prose("B", "bee", "buzz"));
    expect(existsSync(join(dir, "book/new.md"))).toBe(false);
    expect(await p.status(dir)).toEqual([
      { path: "book/a.md", x: "M", y: " " },
      { path: "book/b.md", x: "A", y: " " },
      { path: "book/new.md", x: "D", y: " " },
      { path: "outside.md", x: "?", y: "?" },
    ]);
    expect(await p.resolve(dir, "HEAD")).toBe(rewrite);
  });

  it("merges in memory: a rename on one side and an edit on the other merge, the same paragraph doesn't; the app's merge is committed and fast-forwarded", async () => {
    const dir = await started(p);
    const base = (await p.resolve(dir, "HEAD"))!;
    await p.createBranch(dir, "theirs", "HEAD");
    write(dir, "book/a.md", prose("one", "two", "three (theirs)"));
    write(dir, "book/b.md", prose("B (theirs)", "bee", "buzz"));
    renameSync(join(dir, "book/c.md"), join(dir, "book/c-moved.md"));
    await p.stage(dir);
    const theirs = (await p.commit(dir, "Theirs"))!;
    await p.switchBranch(dir, "main");
    write(dir, "book/a.md", prose("one (ours)", "two", "three"));
    write(dir, "book/b.md", prose("B (ours)", "bee", "buzz"));
    write(dir, "book/c.md", LONG.replace("Line 12", "Line twelve"));
    await p.stage(dir);
    const ours = (await p.commit(dir, "Ours"))!;

    expect(await p.mergeBase(dir, ours, theirs)).toBe(base);
    expect(await p.aheadBehind(dir, ours, theirs)).toEqual({ ahead: 1, behind: 1 });
    expect(await p.isAncestor(dir, base, ours)).toBe(true);
    expect(await p.isAncestor(dir, theirs, ours)).toBe(false);
    expect(await p.inProgress(dir)).toBe(false);
    const merged = await p.mergeTrees(dir, ours, theirs);
    expect(merged.conflicts).toEqual(["book/b.md"]);
    expect(await p.inProgress(dir)).toBe(false);
    // What the app does next (conflicts.ts): its own merge of the paragraphs, in a tree of git's.
    const tree = await p.buildTree(dir, merged.tree, [{ path: "book/b.md", content: prose("B (both)", "bee", "buzz") }]);
    const commit = await p.commitTree(dir, tree, [ours, theirs], "Merge changes from origin\n");
    expect(await p.commitInfo(dir, commit)).toMatchObject({ tree, parents: [ours, theirs], message: "Merge changes from origin\n" });
    await p.fastForward(dir, commit);
    expect(read(dir, "book/a.md")).toBe(prose("one (ours)", "two", "three (theirs)"));
    expect(read(dir, "book/b.md")).toBe(prose("B (both)", "bee", "buzz"));
    expect(read(dir, "book/c-moved.md")).toBe(LONG.replace("Line 12", "Line twelve"));
    expect(existsSync(join(dir, "book/c.md"))).toBe(false);
    expect(await p.status(dir)).toEqual([]);
    expect(await p.aheadBehind(dir, "HEAD", theirs)).toEqual({ ahead: 2, behind: 0 });
  });

  it("fast-forwards only: not to a commit that isn't ahead, and not over a local change", async () => {
    const dir = await started(p);
    await p.createBranch(dir, "other", "HEAD");
    write(dir, "book/a.md", "Other.\n");
    await p.stage(dir);
    const other = (await p.commit(dir, "Other"))!;
    await p.switchBranch(dir, "main");
    write(dir, "book/b.md", "Main.\n");
    await p.stage(dir);
    await p.commit(dir, "Main");
    expect(await code(p.fastForward(dir, other))).toBe("NOT_FAST_FORWARD");

    const behind = await started(p);
    await p.createBranch(behind, "ahead", "HEAD");
    write(behind, "book/a.md", "Ahead.\n");
    await p.stage(behind);
    const ahead = (await p.commit(behind, "Ahead"))!;
    await p.switchBranch(behind, "main");
    write(behind, "book/a.md", "Typed, not saved in git.\n");
    expect(await code(p.fastForward(behind, ahead))).not.toBe("no error");
    expect(read(behind, "book/a.md")).toBe("Typed, not saved in git.\n");
    write(behind, "book/a.md", prose("one", "two", "three"));
    await p.fastForward(behind, ahead);
    expect(read(behind, "book/a.md")).toBe("Ahead.\n");
  });

  it("rebases: our commits replayed on theirs; on a conflict, nothing done and the paths said", async () => {
    const dir = await started(p);
    await p.createBranch(dir, "theirs", "HEAD");
    write(dir, "book/a.md", prose("one", "two", "three (theirs)"));
    await p.stage(dir);
    const theirs = (await p.commit(dir, "Theirs"))!;
    await p.switchBranch(dir, "main");
    write(dir, "book/b.md", prose("B (ours)", "bee", "buzz"));
    await p.stage(dir);
    await p.commit(dir, "Ours");
    expect(await p.rebase(dir, theirs)).toEqual({ conflicts: [] });
    expect((await p.log(dir)).map((c) => c.summary)).toEqual(["Ours", "Theirs", "Start"]);
    expect(read(dir, "book/a.md")).toBe(prose("one", "two", "three (theirs)"));

    write(dir, "book/a.md", prose("one", "two", "three (ours)"));
    await p.stage(dir);
    const head = await p.commit(dir, "Ours again");
    await p.switchBranch(dir, "theirs");
    write(dir, "book/a.md", prose("one", "two", "three (theirs again)"));
    await p.stage(dir);
    const again = (await p.commit(dir, "Theirs again"))!;
    await p.switchBranch(dir, "main");
    expect(await p.rebase(dir, again)).toEqual({ conflicts: ["book/a.md"] });
    expect(await p.resolve(dir, "HEAD")).toBe(head);
    expect(await p.currentBranch(dir)).toBe("main");
    expect(await p.status(dir)).toEqual([]);
    expect(await p.inProgress(dir)).toBe(false);
  });
});

