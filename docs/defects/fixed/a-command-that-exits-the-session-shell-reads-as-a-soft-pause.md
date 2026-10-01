## A command that exits the session's shell reads as a soft pause, and the next call's respawn is not reported

A foreground `terminal` call whose command ends the session's shell (`exit`, `exit 3`, `logout`, a `kill -9 $$`) never
prints the wrapper's end frame: the shell that would have printed it is gone. The call waits out the no-output window
and returns a soft pause — exit −1, "The process may still be running" — about a process that has ended. The next
call finds no shell, `ensure` spawns a fresh one, and the command runs there with the working directory and every
variable the old shell held gone, while its observation reports `session_reinitialized` false and says nothing of the
loss. It is the sibling of the shell replaced by `exec` (acceptance A9, OQ-144): the same lost end frame, reached by
the shell ending rather than being replaced.

Measured 2026-09-30 on the `fix-accept1-8` branch, through a real PTY against `/bin/sh` (dash) with a 3 s no-output
window: `exit 3` returned after 3,007 ms as `soft_pause`, exit −1, `(no output)`; the next call, `printf next`, ran in a
fresh shell with `session_reinitialized` false. Noticed while repairing
[`a-command-that-replaces-the-shell-reads-as-a-soft-pause.md`](a-command-that-replaces-the-shell-reads-as-a-soft-pause.md),
whose watch sees a replaced process but not one that has gone. ~~Not repaired.~~ Repaired 2026-10-01; see below.

## Specs

- `REQ-TOOLS-097` / `REQ-TOOLS-098`: a soft pause is for a command still running with no output for 30 seconds; here
  nothing is running, and the observation says the process may be.
- `REQ-TOOLS-100` / `REQ-TOOLS-099`: `session_reinitialized` reports a restarted session; the call that runs in the
  respawned shell reports false, and nothing tells the agent its shell state was lost.
- `REQ-TOOLS-103`: a failure before the command completes is an `execution_error` that says so.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts`: `ensure`'s `onExit`, which only forgets the PTY; `execute`'s wait,
  which nothing ends when the shell exits; `reinitialized`, set by `resetNow` and not by a respawn after an exit.

## Repaired — 2026-10-01

**Confirmed first on the branch** (`fin1-term-shell-ends`, from `origin/main` e68f8f2), dash through a real PTY. The case
"REQ-TOOLS-097/098/100/103 (OQ-144): a command that ends the session's shell …" read `soft_pause` for `exit 3` after its
whole 3 s window. The case "REQ-TOOLS-098/100/103 (OQ-144): a soft-paused command that ends the shell …" read `soft_pause`
on the poll of a paused `sleep 2; exit 4` after the shell had gone.

**What changed.** The build proceeds under OQ-144's reading, extended in place to this case
([OQ-144](../../architecture/open-questions.md)); no requirement says what a call that ends its shell answers.
- `ForegroundSession` (`foreground.ts`) treats the PTY's exit as an event of the session (`shellExited`). This applies
  only while the shell is still the session's: `resetNow` and `dispose` forget the PTY before they end it. node-pty emits
  the exit once the PTY's output is drained, so what the command wrote first is in the capture.
- A running call ends at once as REQ-TOOLS-103's failure before completion: `execution_error`, `ExecutionError`, no exit
  code, and the detail "the command ended the session's shell". The shell is respawned with PD-TOOLS-001's snapshot
  re-applied (`respawnAfterShellEnded`), `kill_status` is `session_reset`, and the detail names what was restored.
  Nothing is killed, because the shell has gone.
- A soft-paused command that ends the shell is closed with no status of its own. Its poll reports it the same way and
  respawns the shell then.
- A shell that ended between calls is respawned and restored by the next call before its command is written. Its
  detail opens by saying so.
- `reinitialized` is set by every respawn, so the call that next runs in the fresh shell reports `session_reinitialized`
  true.

**Pinned by** the two cases above, both red before the change. Now `exit 3` ends in 16 to 37 ms and `kill -9 $$` in 12 to
18 ms (three runs each), and the next call reads `session_reinitialized` true with the directory and the exported variable
restored. The call after that reads false. The second case also pins the poll's hand-over and the respawn of a shell
ended by keystrokes between calls. The live run's `terminal` scenario carries the shape now (`ends-shell`, `exit 3`, in
`lib/terminal-shapes.mjs`). It checks the call and the same agent's next call; see the
[first-executions row](../../architecture/first-executions.md) for what the run read.

**Not reached:** Windows and macOS. Nothing here depends on `/proc`, but no such host has run it.
