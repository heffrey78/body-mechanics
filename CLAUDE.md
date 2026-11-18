# body-mechanics

An exercise app (Tauri desktop + Android). The product idea is in `idea.md`.

## Project tracking: gh-project

Requirements, architecture decisions and tasks live as GitHub issues in
`heffrey78/body-mechanics`, managed through the `gh-project` MCP server
(configured in `.mcp.json`). Use its tools for all tracking work. Do not
create or edit these issues with `gh issue` or by hand-editing labels.
That bypasses the server's rules and shows up as drift.

### Start of a session

- Call `get_status` first. It shows ready tasks, blocked work, requirements
  waiting on a decision, and drift. Fix or report any drift before new work.
- Use `query_records` (`ready: true`) to pick the next task, highest priority first.

### Record kinds

- **Project:** a GitHub milestone with a purpose, success criteria and
  out-of-scope list (`save_project`). Requirements join a project through
  their `project` field, and their tasks follow.
- **Requirement:** `create_requirement`. Starts in **Draft**. Give it a type
  (FUNC, NFUNC, TECH, BUS, INTF), a priority (P0–P3), its current and desired
  states, and acceptance criteria. Set `origin` honestly: `stated` when the
  user said it, `derived-from-code` or `derived-from-transcript` when Claude
  inferred it.
- **Decision (ADR):** `create_decision`. Starts **Proposed**. Record the
  context, the options considered, the drivers and the consequences, and link
  it to the requirements it `addresses`.
- **Task:** `create_task`. Always created under a requirement or a parent task
  (`parent`). Include an implementation plan, a test plan and a definition of
  done. Use `blocked_by` for ordering.

### Owner-only decisions. Always ask first.

- Moving a requirement to **Approved** or **Validated** is the owner's call.
  Ask before doing it. `set_status` will not walk through these states on
  its own.
- Accepting or rejecting a decision (**Accepted** / **Rejected**) is also
  the owner's call. Propose it, then ask.
- Editing a requirement that is Approved or later needs a `reason`. Say what
  changed and why.

### Working a task

1. `set_status` → **In Progress** when you start.
2. Commit the work. Reference the issue number in the commit message (e.g. `#12`).
3. `set_status` → **Complete** with the `commit` SHA and `evidence` (a test
   result or the check you ran). Don't mark a task Complete without evidence.
4. When blocked, `set_status` → **Blocked** with a `comment` giving the reason.
5. When all tasks under a requirement are done (`query_records` with
   `work_complete: true`), tell the owner. They decide whether it moves to
   Implemented and then Validated.

### Changing records

- Use `update_record` for edits; only the fields you name change.
- A decided ADR is never rewritten. Add an `amendment` for a correction, or
  create a new decision and link it with `supersedes`.
- Use `add_comment` for progress notes, findings or questions on a record.
- `link_records` / `unlink_records`: `child_of`, `blocked_by`, `addresses`,
  `supersedes`. Each reads as `source type target`.

### Exports

`export_docs` writes Markdown snapshots plus a Mermaid link diagram to
`exports/` by default. Run it only when asked. GitHub issues are the source
of truth, not the exported files.

## The owner's phone (adb)

- adb is installed in the home folder, not on the PATH: `~/Android/Sdk/platform-tools/adb`
  (Google's platform-tools; installing system packages needs the owner's sudo password).
- The test phone is a Pixel 10 Pro (Android 17), connected by USB. The app's package is
  `io.github.heffrey78.bodymechanics`.
- Useful commands:
  - `adb devices -l`: is the phone connected? If it isn't listed, ask the owner to plug it in
    and accept the USB debugging prompt.
  - `adb install -r <apk>`: install over the existing app. The CI debug key keeps the data.
  - `adb logcat -c`, then `adb logcat --pid=$(adb shell pidof io.github.heffrey78.bodymechanics)`:
    the app's log for one run. Rust and WebView console output both land here.
  - `adb shell dumpsys netpolicy | grep <uid>` and `adb shell dumpsys package <pkg>`: network
    policy and permissions, for "can't reach GitHub" problems.
  - `adb shell uiautomator dump` and `adb shell input tap X Y`: read and drive the screen, but only
    while the phone is unlocked.
- The phone holds the owner's real records. Never uninstall the app or clear its data.
