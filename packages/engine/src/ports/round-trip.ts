import type { FilesPort } from "./files-port.ts";
import type { GitPort } from "./git-port.ts";

/**
 * A round trip through the ports (#21): init a repository under `root`, write a file atomically,
 * commit it, and read history back. The app runs it for the smoke test on the desktop and the phone.
 */
export async function portsRoundTrip(git: GitPort, files: FilesPort, root: string): Promise<string> {
  const dir = files.join(root, "ports-check");
  await files.removeTree(dir);
  await files.makeDir(dir);
  await git.init(dir, "main");
  await git.setConfig(dir, "user.name", "Body Mechanics");
  await git.setConfig(dir, "user.email", "check@body-mechanics.invalid");
  await files.write(files.join(dir, "check.yaml"), "check: true\n");
  await git.stage(dir);
  await git.commit(dir, "Ports check");
  const log = await git.log(dir);
  const read = await files.read(files.join(dir, "check.yaml"));
  await files.removeTree(dir);
  const ok = log.length === 1 && read !== undefined && new TextDecoder().decode(read) === "check: true\n";
  return ok ? "git+files ok" : `git+files FAILED (commits: ${log.length}, read: ${read === undefined ? "none" : "different"})`;
}
