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

*Falsified 2026-10-06, kept as written above:* "No captured line reaches the screen's width" is not true. A row is the
12-column `__rot_b64__:` marker plus 64 characters, 76 columns, and the display narrows the PTY to as few as 20
(REQ-TOOLS-128). Below 76 columns the screen wraps every row. The parse kept only the rows that began with the marker,
so it dropped each continuation and decoded the pieces into a spliced environment. The parse now joins the rows back
and refuses a capture that does not add up
([the note](the-shell-state-snapshot-is-corrupted-on-a-screen-narrower-than-its-rows.md)).

Evidence: `terminal.test.ts`, two new cases run the real capture line through `/bin/sh` with a 600-character value and
a value holding a newline, and refuse a capture with no variables. The whole terminal suite passes on Linux, three runs
out of three.

**Not changed:** the PowerShell capture still prints one variable per line and relies on continuation rejoining. A
Windows value longer than 240 columns may wrap the same way. That has not been measured here, and it needs a Windows host
to test. *(2026-10-15, Windows 11 ARM64, pwsh 7.6.6 and 5.1: the capture has printed encoded rows since 2026-10-06, and a
`Path` of 24 extra entries and a 600-character value came back from a hard-timeout reset whole, with no newline, at every
width from 34 to 240 columns; below 34 no call ends at all, so the reset is not reached there
([`below-34-columns-…`](below-34-columns-every-powershell-call-runs-to-its-hard-timeout.md)).)*
