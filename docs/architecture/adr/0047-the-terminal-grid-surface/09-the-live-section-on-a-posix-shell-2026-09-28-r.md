# ADR-0047 — The terminal grid surface: emulator as a screen, input owned by the product — The live section on a POSIX shell — 2026-09-28 (R-062)

Part 9 of 12 of [ADR-0047](../0047-the-terminal-grid-surface.md), which indexes every part.

## The live section on a POSIX shell — 2026-09-28 (R-062)

*A first execution, reported back in place. The second and third executions drove the grid over a real PowerShell.
REQ-TOOLS-104 gives every other host a POSIX shell, and the live section had never measured one.*

**Found — three of the live section's commands spoke PowerShell to `/bin/sh`.** The echo program is a Node script, so
the checks it drives ran on Linux and passed: the echo, the burst, end input, interrupt and the audit entries. The size
probe, the motion command and the throughput flood were PowerShell. There each one exited 127, and four checks were
red with nothing measured: `live.processReportsGridSize`, `live.motionReallyMoved`,
`live.throughputEqualWindowClosedOrOpen` and `live.floodPainted`. Three motion checks passed vacuously over a stream
that never moved. The note is
[`terminal-proofs-live-section-drives-a-posix-shell-with-powershell.md`](../../../defects/fixed/terminal-proofs-live-section-drives-a-posix-shell-with-powershell.md).
Each command is now spelled in the shell the harness reports (`live.shell`), and the PowerShell spellings are the same
literals as before. Every assertion is kept.

**Found nothing at this surface.** On Linux (`dash`), three consecutive runs each passed **116 of 116** assertions:

- **Size:** the process reports the grid's last report, `cols=118 rows=16` (`stty size`), after the box shrank mid-command.
- **Echo:** key to frame 1.5–4.0 ms and key to paint 8.4–29.5 ms (budget 100 ms).
- **End input and interrupt:** end input 60–62 ms, and interrupt 61–62 ms with exit 130.
- **Motion:** 34 samples, 31–32 of them while running, over 20 distinct screens, with zero divergences of any kind.
- **Throughput:** 10,000 lines and exit 3 with the window closed and open, the output equal. Closed took 129–143 ms and
  open 112–148 ms.
- **Limiter:** delivered 54 frames and merged none.

**One reading beside it, not a finding.** Defect AL2-3's trigger (the box shrinking mid-command) left the observation
clean on a POSIX PTY: `READY` once, no start marker in the body, five lines. What this record attributes to ConPTY's
repaint is not seen here. That says nothing of Windows.

**Could not show.** A Windows re-run of the unchanged PowerShell spellings on this branch (no host), and macOS (IC-3).
On POSIX the motion command's 55 ms pause is `sleep 0.055`, a fraction that GNU and BSD `sleep` accept and POSIX does
not require. The full-screen program and the packaged window stay where the third execution left them.
