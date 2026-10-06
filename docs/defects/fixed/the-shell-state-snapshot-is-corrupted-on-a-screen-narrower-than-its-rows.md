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

## Repaired — 2026-10-06 (acceptance finding A4 of finacc2)

Confirmed on `origin/main` `27a5127` before the change, by the same measurement through a real PTY with the host's
`dash` (`captureState` called directly after `export PROBE_VAR=hello-there`, the host's own 170 variables in the
spawn environment): at 240, 80 and 76 columns the capture was whole; at 75 it held 53 entries and no `PATH`; at 40 it held
67 entries, the wrong directory, no `PATH` and `PROBE_VAR` spliced into `hello-NAGER_ENABLE_DIAG_LOGS=true`; at 30 and 20
it held 26 and 21 entries and the wrong directory; at 10 nothing parsed. A hard-timeout reset at 20 columns, through the
tool, reported "Restoring the working directory and variables failed; the session is at its defaults"; at 40 it ran a
restore of the spliced environment.

**What changed** (`packages/agent-tools/src/terminal/foreground.ts`). `parseSnapshot` no longer keeps the rows that
begin with the marker; `encodedSnapshot` joins the screen's rows with nothing between them, so a continuation the screen
wrapped onto the next row rejoins its head, and reads each `__rot_b64__:` and the base64 characters after it as one of
the capture's rows. Base64 holds no newline of its own, so a row break inside the capture is always the screen's. What
the joining could still get wrong is refused and the previous capture kept, never decoded into a spliced environment:
every row but the last must carry exactly 64 characters and the last 1 to 64, the whole must be padded base64, and its
decoded text must end with the NUL `env -0` writes after each entry. So that the 64 holds on every host,
`snapshotCommand` takes the encoder's own line breaks out (`base64 | tr -d '\n'; echo`, GNU and busybox break at 76,
BSD not at all) before `fold -w 64`. The comment that read "a 64-column line never wraps" is kept beside its
replacement, marked falsified. The PowerShell capture is unchanged (no Windows host here); its own wrap is recorded open in
[the PowerShell note](../the-powershell-shell-state-snapshot-joins-a-wrapped-row-with-a-newline.md).

**What pins it** (`packages/agent-tools/src/terminal/terminal.test.ts`, each red on `27a5127`'s parse): "reads the same
directory and variables back off an emulated screen at every width the display may give it" (the real capture line run
through `/bin/sh`, written into the `@xterm/headless` emulator at 20, 33, 40, 64, 75, 76, 77 and 240 columns, each
parse equal to the unwrapped one); "refuses a capture that lost or gained characters" (a dropped continuation, a stray
row of base64 letters between rows or after the last, refused; a stray job notice between rows left out); and, through a
real PTY with the host's shell, "at 20 and 40 columns a hard-timeout reset restores the directory and every exported
variable whole" (the reset reads "were restored", and the next call reads the variable, the directory, `PATH` and
`HOME` back and finds `sleep`). Re-measured after the repair with the same `captureState` call at 10, 20, 30, 40, 75,
76, 80 and 240 columns: every capture identical to the 240-column one, every host variable back but `TERM` (which the
session sets to `dumb`) and `_`, and `PROBE_VAR` whole.

**Added in the repair round (2026-10-06).** The checks above do not catch a WHOLE row lost from the top of the capture
(the emulator's scrollback overflowing under a very large environment at a narrow width): every row left still carries
64 characters, and the decode starts mid-entry. `$PWD` is always absolute, so `parseEncodedSnapshot` now refuses a
directory that does not start with `/`; pinned by "refuses a capture that lost whole rows from its top", red without the
check. The earlier repair's claim that "no captured line reaches the screen's width" is marked falsified in place in
[its note](a-long-variable-comes-back-from-a-timeout-reset-with-a-newline-in-it.md).
