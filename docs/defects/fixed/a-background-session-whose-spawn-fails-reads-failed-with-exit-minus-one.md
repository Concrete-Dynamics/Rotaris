## A background session whose spawn fails reads `failed` with exit −1

When the background session's process emits `error` instead of starting, for example because the shell file cannot be
executed, `BackgroundSession`'s `error` handler appends `[spawn error] …` to the buffer and sets status `failed` with
exit code −1. REQ-TOOLS-179 gives −1 to `killed` alone on a background session, and REQ-TOOLS-109 reads `failed` as a
nonzero exit, which a command that never ran does not have. The observation also carries no `failure_kind`, although
`execution_error` is the terminal vocabulary's word for a command the tool could not run (REQ-TOOLS-100). A spawn
that throws synchronously is already answered as an error at the start (`The background command could not be
started: …`), so this is only the asynchronous `error` event.

Noticed 2026-09-29 while repairing live-run finding L4 (a signal death read `failed (exit -1)`), which left this path
as it was. Not repaired, and not measured: no run has produced it.

## Specs

- `REQ-TOOLS-179`: −1 is a soft pause (foreground) or killed (background).
- `REQ-TOOLS-109`: `failed` is a nonzero exit.
- `REQ-TOOLS-100`: `execution_error` is a `failure_kind`.

## Relevant files

- `packages/agent-tools/src/terminal/background.ts`: the `child.on('error', …)` handler in `BackgroundSession`'s constructor.
- `packages/agent-tools/src/terminal/index.ts`: `sessionAction`'s `finish`, which classifies whatever status and code
  the session holds.

## Repaired — 2026-09-30 under R-067

**Confirmed first on the branch** (`fix-accept1-8`, from `origin/main` 7ae9d9e): a background session whose shell file
does not exist read `Session ts_… is failed (exit -1).`, `outcome_kind` `background_terminal`, `exit_code` −1, and
no `failure_kind`. Node emitted `error` (ENOENT) and never `exit`, and the child had no pid.

**What the status and code of such a session are is not stated, so it is
[OQ-142](../../architecture/open-questions.md), and the build proceeds under the reading recorded there.**
- `BackgroundSession`'s `error` handler (`background.ts`) now tells a spawn failure from any other error by the
  child's pid. With no pid, the command never ran: the session is `failed` with **no exit code** (null), its timer is
  cancelled, and the cause is kept on the session (`spawnError`). An `error` once the child has a pid is warned about
  and is no longer read as the session's end; its `exit` still comes.
- `sessionAction`'s `finish` (`index.ts`) assigns `execution_error` to such a session. Every poll or termination of it
  is then an `execution_error` at `error`, `error_class` `ExecutionError`, and its detail says that terminal execution
  failed before completion and quotes the error (REQ-TOOLS-100, REQ-TOOLS-103, REQ-TOOLS-112's first test). The
  diagnostic block drops the null exit code, the list's structured entry carries `exit_code: null`, and the text
  table shows `-`.
- The session's `bg:` live stream ends with no exit code (`TerminalStreams.end` accepts a null code and leaves
  `exitCode` off the meta), so the terminal surface draws `exited`. It had drawn the −1 of a kill.

**Pinned by** `terminal.test.ts`, "REQ-TOOLS-100/103/179: a spawn that fails after start returns reads failed with no
exit code and failure_kind execution_error, never the −1 of killed". It drives the real `child_process.spawn` against
a missing shell file and failed before the change on `exit -1`. `streams.test.ts`, "REQ-TOOLS-179 (OQ-142): a
background stream whose process could not be started ends with no exit code", pins the stream's end.

**No proof or live-run scenario shows it.** None found it: the note was recorded from reading the code, and no run
has produced it. A run cannot, because the registered shell exists on every host the scenarios drive, so the unit
case above, over a real spawn, is the evidence. Repaired 2026-09-30 under R-067.
