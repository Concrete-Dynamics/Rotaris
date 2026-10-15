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

Not repaired (record-only).

## Specs

PD-TOOLS-001 (a reset re-applies the directory and exported variables of the last completed command, and says what it
restored) read against REQ-SHELL-092's kill, whose reset `killActive` names as REQ-TOOLS-099's.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts` — the `outcome.kind === 'kill'` branch, beside the `timeout`/`abort`,
  `replaced` and `shellEnded` branches that call `restoreState`; `killActive`.
