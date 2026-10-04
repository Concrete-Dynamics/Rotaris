## The shell-state snapshot is corrupted on a screen narrower than its rows

Noticed 2026-10-04 by fin15 while varying the foreground PTY's width for the terminal's echo repair, and not repaired
there (outside that task). PD-TOOLS-001's snapshot runs `snapshotCommand` on the session's shell, which prints the
directory and environment as base64 in rows of `__rot_b64__:` followed by 64 characters (76 columns), and reads them off
an emulated screen of the session's own width (`runRaw` → `ForegroundSession.clean` → `parseSnapshot`). `parseSnapshot`
keeps each screen row that **starts** with `__rot_b64__:`, so on a screen narrower than 76 columns every row's
continuation (the wrapped rest of its 64 characters) is dropped and the remaining pieces are decoded as one base64
text.

Measured through a real PTY with the host's `dash`, after `export PROBE_VAR=hello-there`, by calling the session's
`captureState` directly: at 240 columns it returned the directory and the whole environment; at 40 columns (the display
may resize the PTY down to 20, REQ-TOOLS-128 and REQ-SHELL-100) it returned the right directory and an environment of
three entries, `{"HOMnalysisCachePath":"","TERM":"dumb","PROBE_VAR":"hell"}`: `PATH`, `HOME` and the rest gone, one name
spliced from two, and the variable's value cut. Not measured, read from the code: a hard-timeout reset at that width
would restore that environment (`restoreCommand`), so the next command would run without `PATH` and with the variables
the agent set cut short, while the observation says they were restored.

## Specs

- PD-TOOLS-001 — a hard-timeout reset restores the shell's working directory and exported variables; at a narrow width
  it restores a corrupted environment and names it as restored.
- REQ-TOOLS-128 — the display resizes the foreground PTY, which is what makes the width narrower than the snapshot's rows.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts` — `snapshotCommand` (the `fold -w 64` rows), `parseSnapshot` (keeps
  rows that start with `__rot_b64__:`), `runRaw` (reads the round trip off a screen of the session's width),
  `captureState` and `restoreCommand`.
- `packages/agent-tools/src/terminal/terminal.test.ts` — the PD-TOOLS-001 cases, all at the default 240 columns.
