## A long variable comes back from a timeout reset with a newline in it

PD-TOOLS-001 captures the shell's directory and exported variables after every completed command, by running `env`
in the session and reading the answer off the session's emulated screen (ADR-0021). The screen wraps a line at its
240 columns, and the parser joined a continuation line back with a newline. A `PATH` longer than the screen therefore
came back with a newline inside it, and the restore after a hard-timeout reset exported that value. Every command
lookup in the respawned shell then failed: `/bin/sh: 30: sleep: not found`.

Found 2026-09-24 on Linux, while making the terminal suite pass there. Under `pnpm vitest` the `PATH` carries every
`node_modules/.bin` directory and runs past 240 columns. The same thing happens to any user whose `PATH` does.

## Specs

- `PD-TOOLS-001`: the reset re-applies the exported variables so the next command continues where the timed-out one
  left off. It re-applied a corrupted one.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts`: `snapshotCommand`, `parseSnapshot`, `restoreCommand`.

## Repaired — 2026-09-24

The POSIX capture now emits the directory and `env -0`, NUL-separated, as base64 folded to 64 columns, and the parser
decodes it. No captured line reaches the screen's width, and NUL separates entries even where a value holds a newline.
A capture that names no variable (a shell without `env -0`) is refused and the previous capture kept, because restoring
an empty environment would unset everything the fresh shell has.

Evidence: `terminal.test.ts`, two new cases run the real capture line through `/bin/sh` with a 600-character value and
a value holding a newline, and refuse a capture with no variables. The whole terminal suite passes on Linux, three runs
out of three.

**Not changed:** the PowerShell capture still prints one variable per line and relies on continuation rejoining. A
Windows value longer than 240 columns may wrap the same way. That has not been measured here, and it needs a Windows host
to test.
