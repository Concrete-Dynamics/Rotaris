## `terminal-stream-proof`'s real-PTY half speaks PowerShell to a POSIX shell, so off Windows it measures nothing

`pnpm terminal-stream-proof` runs four suites with `ROTARIS_TERMINAL_PROOF_DIR` set and asserts over the measurements
they write. The real-PTY half of `packages/agent-tools/src/terminal/streams.test.ts` (the `describe` titled "the live
stream behind a real PTY") is skipped only when `findShell()` finds no shell or the proof directory is unset. It is
not skipped off Windows. But every command it sends is PowerShell: `1..10000 | ForEach-Object { "line $_" }`,
`1..50 | ForEach-Object { "bg $_" }`, `Write-Output`, `Read-Host`, `cmd /c "exit 3"`,
`$Host.UI.RawUI.WindowSize` and `Start-Sleep`. REQ-TOOLS-104 sends Windows to PowerShell, and `findShell()`
(`packages/agent-tools/src/terminal/index.ts`) gives every other host the POSIX backend, `/bin/sh`. There every
command is a `not found` from the shell and exits 127:

- `tenThousandLinesGapless` and `closingFrameIsObservation`: exit 127, not 0.
- `backgroundStreamOwnCounter`: `expected '/bin/sh: 1: 1..50: not found…' to contain 'bg 50'`.
- `keystrokeArmsFlushUnderCeiling`: nothing reads the keystroke.
- `streamingOffZeroFramesSameResult`: `expected 127 to be 3`.
- `resizeReachesProcess`: `expected 127 to be +0`.
- The kill case (a test with no proof key of its own, so it only turns `testsPassed` red): the command has already
  ended when the kill arrives, `{ ok: false, error: "ended" }`.

The three checks that measure the limiter over synthetic sources (`fortyStreamsUnderBound`,
`twoWindowsUnderTheAggregateBound`, `obligation2LadderHoldsTheBound`) pass. The red is not a failure of the product
that was measured. Nothing about the stream was measured, because no command ran. The file's own header says "a REAL
PowerShell through a REAL PTY". It was written on the one host where the shell is PowerShell. Its neighbour
`terminal.test.ts` was later spelled in both shells ("every proof below is spelled in the shell the host actually
runs"), and this file was not.

Measured 2026-09-28 by the proof sweep on `main` at `392f681`, and reproduced 2026-09-28 on `fix-proofs-b6` from `main`
at `fa377e6`: as root on Linux under Xvfb, Node 24, `/bin/sh` → `dash`. `streams.test.ts (20 tests | 6 failed)`, exit
1 in 9 s. Another agent's `code-intel-proof` was running in a separate worktree during the reproduction. That cannot
matter here, because the failures are exit status 127, not timing.

## Specs

No requirement is contradicted by the product. The proof is evidence (`.claude/rules/tests-and-proofs.md`), and off
Windows it produced none for most of what it stands for. That covers REQ-TOOLS-127 (gapless frames, deltas equal to
the PTY output, and a closing frame equal to the observation), REQ-TOOLS-107 and REQ-TOOLS-127 (a background session
on its own stream), REQ-CONFIG-117 through REQ-TOOLS-126 (the armed flush), REQ-TOOLS-126 (streaming off changes
nothing the agent sees) and REQ-SHELL-106 (a resize reaches the real terminal). Under REQ-TOOLS-104, the POSIX backend
is the terminal every Linux and macOS user runs, so this is the half of the measurement that matters most off Windows.

## Relevant files

- `packages/agent-tools/src/terminal/streams.test.ts`: the real-PTY `describe` and its six PowerShell commands.
- `packages/agent-tools/src/terminal/terminal.test.ts`: the `SH` table, the precedent for spelling one behaviour in
  both shells.
- `packages/agent-tools/src/terminal/index.ts`: `findShell()`, which gives a posix host its backend.
- `apps/desktop/scripts/terminal-stream-proof.mjs`: the proof's checks over `measurements.json`.
- `AGENTS.md`: the proof's row.

Noticed 2026-09-28 by the proof sweep under R-062.

## Repaired — 2026-09-28, under R-062

The real-PTY half of `streams.test.ts` now spells each of its commands in the shell the host runs. A `PS`/`SH` table
sits beside `findShell()`'s result, as in `terminal.test.ts`. On PowerShell each spelling is the old literal,
character for character. On a POSIX shell each one is the same behaviour: a `while` loop printing `line <i>` (or
`bg <i>`), `printf`, `read`, `sh -c 'exit 3'` for a native exit status, `stty size` for the grid the process reads
from its terminal, and `sleep`. No assertion was loosened, and none was removed. The one assertion that named a
PowerShell word, "the observation does not contain `Write-Output`" (the echoed command leaked into the capture), now
names the word the host's own spelling uses (`stty` on POSIX). It asserts the same thing.

Pinned by the suite itself: on a POSIX host the six cases that exited 127 now run and pass. Measured by
`pnpm terminal-stream-proof` as root on Linux under Xvfb, Node 24, `/bin/sh` → `dash`, three runs in a row, all
exit 0 with `Tests 40 passed (40)` and every check `true`. Another agent's `code-intel-proof` (eleven Electron
processes) was live in a separate worktree throughout, at load 0.1–0.3:

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| 10,000 lines: frames / deltas / bytes / ms | 5 / 2 / 124,928 / 163 | 5 / 2 / 124,928 / 174 | 5 / 2 / 124,928 / 168 |
| gapless, deltas = PTY bytes, closing = observation | yes, yes, yes | yes, yes, yes | yes, yes, yes |
| background stream: own `bg:ts_…` id, frames, gapless | 4, yes | 4, yes | 4, yes |
| keystroke to framed echo at interval 2,000 ms | 1.1 ms | 1.8 ms | 2.1 ms |
| streaming off: frames on / off, exit on / off, output equal | 4 / 0, 3 / 3, yes | 4 / 0, 3 / 3, yes | 4 / 0, 3 / 3, yes |
| resize to 80×24: what the process reports, clean | `cols=80 rows=24`, yes | `cols=80 rows=24`, yes | `cols=80 rows=24`, yes |

Nothing in the product changed. **Could not show:** a Windows re-run on this branch. *(Run 2026-10-15 on Windows 11 ARM64
under pwsh 7.6.6, three times, every flag green, the 10,000 lines' 108,894 bytes equal to Linux's; ADR-0021, "The stream
proofs on Windows 11 ARM64".)* The PowerShell spellings are the
same literals as before, so nothing that ran there changed, but no Windows host was available. Nothing ran on macOS
either (IC-3). The echo is quick on `dash` because the kernel's line discipline echoes the keystroke, whereas
PowerShell echoes it itself. Both are the frame the armed flush produces, so the figure measures the flush and not the
shell. ADR-0021's "POSIX shell" note (2026-09-28) records this as a first execution.
