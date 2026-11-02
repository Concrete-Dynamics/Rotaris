## A kill from the terminal window resets the session without restoring its state

Measured 2026-10-15 on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, dev tree, pwsh 7.6.6, at `a7540444` (the
Windows ARM64 session's B7; a scratch case, never committed), and read from the code, where nothing is Windows-specific.
After `$env:ROTARIS_KEPT = 'kept'`, a running command (a node parent with a grandchild, `timeout: 20`) was killed from the
terminal window. The kill itself held: exit −1, "the command was killed from the terminal window", `session_reset`, both
processes gone. The next call reported `session_reinitialized: true` and read `ROTARIS_KEPT` as empty (`[]`). The same
variable came back after a hard-timeout reset in the same session's B2 and B7 (c): PD-TOOLS-001's restore ran there.

In `ForegroundSession`'s call loop every reset path re-applies the last completed command's snapshot (`restoreState`) — the
hard timeout and the run's cancel, a replaced shell, an ended one — except `outcome.kind === 'kill'`, which only finishes the
call. `killActive`'s own comment calls it "the same reset a hard timeout performs (REQ-TOOLS-099)". So a person who kills one
runaway command from the window loses the agent's directory and variables with it, and the agent is not told: the kill's
detail names no restore and no loss.

~~Not repaired (record-only).~~ Repaired 2026-10-20 (plan loc1, branch `loc1-terminal-kill`); see the outcome below.

## Specs

PD-TOOLS-001 (a reset re-applies the directory and exported variables of the last completed command, and says what it
restored) read against REQ-SHELL-092's kill, whose reset `killActive` names as REQ-TOOLS-099's.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts` — the `outcome.kind === 'kill'` branch, beside the `timeout`/`abort`,
  `replaced` and `shellEnded` branches that call `restoreState`; `killActive`.

## Outcome — repaired 2026-10-20

The window's kill now re-applies PD-TOOLS-001's snapshot as every other reset path does. In `ForegroundSession.execute` the
`outcome.kind === 'kill'` branch awaits `restoreState()` after the reset `killActive` performed (`{ status: 'failed' }` when
the reset itself failed), and so does the kill that lands during the first call's handshake, before the command was written
(its error now says it never ran). The result carries `killed: 'during' | 'before'` and the restore. `terminal/index.ts`
gives a killed call its own detail, in REQ-TOOLS-099's and PD-TOOLS-001's words: the command was killed from the terminal
window and has no exit status of its own; the session was forcibly restarted to terminate the process tree, and shell state
(working directory, variables, aliases, background jobs) was lost; and, beside it, what was restored ("The working directory
and N exported variables were restored (<dir>); aliases, functions and background jobs were not."), that the restore failed,
or that there was nothing to restore. Exit −1, `failure_kind` `execution_error` and `kill_status` are unchanged.

Pinned by "PD-TOOLS-001, REQ-SHELL-092: a kill from the terminal window re-applies the directory and the exported variables,
and the observation names the loss and the restore" in `packages/agent-tools/src/terminal/terminal.test.ts`, on the host's
real shell (pwsh here, the POSIX shell elsewhere): a variable exported and a directory changed, a running command killed
through `m.streams.kill(foregroundStreamId(…))`, the kill's detail naming the loss and the restore, and the next call reading
`[kept]` and the directory back with `session_reinitialized: true`. Without the repair it read `[]` and the spawn directory,
and the detail was "Terminal execution failed before completion: the command was killed from the terminal window" alone
(measured on this branch, Windows 11 ARM64, pwsh 7.6.6, before the change).
