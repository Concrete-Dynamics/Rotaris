## terminal-proof's echo and burst never reach the Windows grid in time

Measured 2026-10-15 on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, display at
150%, at `9f4b144b` (the Windows ARM64 session's B9): `pnpm terminal-proof` four times, three launched from pwsh 7.6.6 and one
from Windows PowerShell 5.1, the live section's shell `powershell` each time; 118 of 122 assertions passed every run, the same
four red. Two of them are this note's:

- `live.echoUnder100ms`: after "Take control" (armed, the grid input focused), each of `q`, `w`, `e` pressed into a raw-mode
  `node echo.cjs` produced no `delta` frame carrying it within the probe's 3 s; every echo reads `keyToFrameMs: null`.
- `live.orderAndFidelityOnGrid`: the burst `abc123XYZ` (F5 and Insert inside it, transmitted as nothing, which
  `live.unmappedTransmitNothing` confirms) never showed as a grid line within 5 s; the detail is `null`.

The keys did reach the program: `live.endInputUnder500ms` reads its output as `READY` … `qwe` / `abc123XYZ` / `EOF` once
Ctrl-D ends it (161 ms). And the parts beneath the window are fast on the same host: a raw node-pty over pwsh delivered each
of `q`, `w`, `e` from the same `echo.cjs` 0 to 2 ms after the write, and `pnpm terminal-stream-proof` (three runs, all green)
framed a keystroke's echo in the run host's stream in 15.0 to 15.4 ms (`keystrokeArmsFlushUnderCeiling`). So the loss is
between the run host's frames and the window's grid in the proof's live section, or in how the probe reads them (it matches
only a `delta` frame whose payload includes the key). Which, is not yet shown; a red proof is the product's until the harness
is shown wrong. Not measured on Linux in this session.

Not repaired (record-only).

## Specs

REQ-SHELL-166 (a key pressed in the terminal window is echoed and painted within 100 ms) and REQ-SHELL-096 (keys reach the
process in order, nothing invented), as `terminal-proof`'s live section measures them.

## Relevant files

- `apps/desktop/scripts/terminal-proof/main.cjs` — the live section's echo probes and the burst (`live.echo`, `typed`).
- `packages/ui/src/terminal/proof-entry.tsx` — `echoProbe`, the frame match `frame.kind === 'delta' && frame.payload.includes(...)`.
- `packages/agent-tools/src/terminal/streams.ts`, `foreground.ts` — the run host's frames and `CommandRegion`, fast in
  `terminal-stream-proof`.
