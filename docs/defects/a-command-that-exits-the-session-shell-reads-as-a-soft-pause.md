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
[`a-command-that-replaces-the-shell-reads-as-a-soft-pause.md`](fixed/a-command-that-replaces-the-shell-reads-as-a-soft-pause.md),
whose watch sees a replaced process but not one that has gone. Not repaired.

## Specs

- `REQ-TOOLS-097` / `REQ-TOOLS-098`: a soft pause is for a command still running with no output for 30 seconds; here
  nothing is running, and the observation says the process may be.
- `REQ-TOOLS-100` / `REQ-TOOLS-099`: `session_reinitialized` reports a restarted session; the call that runs in the
  respawned shell reports false, and nothing tells the agent its shell state was lost.
- `REQ-TOOLS-103`: a failure before the command completes is an `execution_error` that says so.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts`: `ensure`'s `onExit`, which only forgets the PTY; `execute`'s wait,
  which nothing ends when the shell exits; `reinitialized`, set by `resetNow` and not by a respawn after an exit.
