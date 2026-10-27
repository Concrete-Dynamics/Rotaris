# ADR-0047 — The terminal grid surface: emulator as a screen, input owned by the product — The live section on PowerShell and ConPTY — 2026-10-15

Part 12 of 12 of [ADR-0047](../0047-the-terminal-grid-surface.md), which indexes every part.

## The live section on PowerShell and ConPTY — 2026-10-15

*Windows 11 ARM64 (build 26200.9457), Electron 44.1.1 arm64, dev tree, pwsh 7.6.6 and once Windows PowerShell 5.1, at
`9f4b144b`, display at 150%; the Windows ARM64 session's B9.* `pnpm terminal-proof` four times, 118 of 122 green each run, the
live section's shell `powershell`: the grid size reported to the process and its resize, the motion run, throughput and the
flood, end of input and the interrupt within 500 ms, the closing frames, `inputFences` empty, `theme.remeasureReportsOnce`
and its frame variant green. **Not met here:** REQ-SHELL-166's echo (no frame carrying the key reached the grid in 3 s) and
the burst's order on the grid, recorded in
[`terminal-proofs-echo-and-burst-never-reach-the-windows-grid-in-time.md`](../../../defects/terminal-proofs-echo-and-burst-never-reach-the-windows-grid-in-time.md);
and the gutter's sampled colour at the host's 1.5 ratio
([`terminal-proofs-gutter-colour-reads-off-at-150-percent-display-scale.md`](../../../defects/terminal-proofs-gutter-colour-reads-off-at-150-percent-display-scale.md)).
"The live section on a POSIX shell" and "The re-measure under load" above keep their Linux readings; the load reading beside
the echo (`echoLoad`) is zero on Windows by `os.loadavg()`'s design.
