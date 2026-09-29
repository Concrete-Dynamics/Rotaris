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

Measured 2026-09-28 by the proof sweep on `main` at `392f681`, and reproduced 2026-09-29 on `fix-proofs-b6` from `main`
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
