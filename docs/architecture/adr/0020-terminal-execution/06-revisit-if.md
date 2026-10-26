# ADR-0020 — Terminal execution: PTY-backed persistent foreground sessions, pipe-backed background sessions — Revisit if

Part 6 of 15 of [ADR-0020](../0020-terminal-execution.md), which indexes every part.

## Revisit if

The escalation is decided; or a requirement arrives that needs a true per-command exit status, which
would push toward alternative B and force `REQ-TOOLS-097` to be re-read; or `node-pty` stops being
maintained, in which case the PTY port defined here is the seam to replace.
