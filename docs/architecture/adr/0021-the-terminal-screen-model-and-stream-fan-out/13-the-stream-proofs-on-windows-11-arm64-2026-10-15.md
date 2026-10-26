# ADR-0021 — The terminal screen model and the fan-out of one stream to three views — The stream proofs on Windows 11 ARM64 — 2026-10-15

Part 13 of 13 of [ADR-0021](../0021-the-terminal-screen-model-and-stream-fan-out.md), which indexes every part.

## The stream proofs on Windows 11 ARM64 — 2026-10-15

*Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, pwsh 7.6.6 arm64 (and one
`terminal-proof` run under Windows PowerShell 5.1), at `9f4b144b`; display at 150%; the Windows ARM64 session's B9. A
windows-arm64 reading, which OQ-400's ruling counts toward an obligation owed to "a Windows host".*

`pnpm terminal-stream-proof`, three runs, all green: every flag of `results.json` true; `keystrokeArmsFlushUnderCeiling`
framed the echo in 15.0 to 15.4 ms of a 2,000 ms interval; the 10,000 lines in 9 deltas of 108,894 bytes, as on Linux, in
1,259 to 1,374 ms, no delta empty, none carrying a marker; the stream reopened on a fresh row; the background stream on its
own counter; forty streams under the bound; streaming off sent nothing and changed nothing.

`pnpm terminal-proof`, four runs (three pwsh, one 5.1), 118 of 122 green each time. **AL2-3 now reads clean on ConPTY:**
`live.resizeRepaint` was `{"readyLines":1,"markerInBody":false,"lines":9}` every run, where the 2026-09-09 ConPTY reading was
`{2, true, 16}`. The process reported its grid size and the mid-command resize (118×26 then 118×16); the long command
reached the shell whole (ADR-0020's M1); the motion run's 37 samples agreed on every surface; 10,000 lines painted with the
window closed and open (625 and 605 ms, exit 3, outputs equal); end of input in 145 to 161 ms and the interrupt in 98 ms,
exit 130; the closing frame never blanked a preview; no input fence timed out. Red every run: REQ-SHELL-166's echo and
REQ-SHELL-096's burst never reached the grid in time
([`terminal-proofs-echo-and-burst-never-reach-the-windows-grid-in-time.md`](../../../defects/terminal-proofs-echo-and-burst-never-reach-the-windows-grid-in-time.md)),
though the run host frames the same echo in 15 ms; and the gutter's sampled colour at 150% scale
([`terminal-proofs-gutter-colour-reads-off-at-150-percent-display-scale.md`](../../../defects/terminal-proofs-gutter-colour-reads-off-at-150-percent-display-scale.md)).
The host's load beside the echo reads `[0,0,0]`: `os.loadavg()` is always zero on Windows, so `echoLoad` says nothing there.
