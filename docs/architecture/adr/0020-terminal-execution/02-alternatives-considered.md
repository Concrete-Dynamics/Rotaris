# ADR-0020 — Terminal execution: PTY-backed persistent foreground sessions, pipe-backed background sessions — Alternatives considered

Part 2 of 15 of [ADR-0020](../0020-terminal-execution.md), which indexes every part.

## Alternatives considered

**A — A fresh child process per foreground call, pipes only.** Simple, exact exit codes, clean stream
separation, trivially correct truncation. Fatal against `REQ-TOOLS-097` — working directory and
exported variables must persist across calls and must be observably lost on a hard timeout — and
against `REQ-SHELL-166`, which requires a real pseudo-terminal whose reported size follows the grid.

**B — One PTY per call.** Keeps the PTY requirement and gives a clean exit status per child. Still
fails the persistence rule, and re-pays PTY setup on every call.

**C — One long-lived PTY-hosted interactive shell per terminal session with an out-of-band completion
protocol; background commands spawned separately with merged pipes.** Chosen.
