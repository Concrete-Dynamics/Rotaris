# ADR-0055 — Startup sequencing, the instance claim, and the first-paint budget — Preceded by the reserved-token branch — 2026-09-06, Part T (ADR-0035's first execution)

Part 12 of 17 of [ADR-0055](../0055-startup-sequencing.md), which indexes every part.

## Preceded by the reserved-token branch — 2026-09-06, Part T (ADR-0035's first execution)

Phase 0 is no longer the first thing main does. `main/sentinel.ts` is main's first import and, when the first argument
is `builtin:code-intelligence`, hands the process to the bundled runtime **synchronously** and exits with its status
before this file's phase 0 — the machine id, the data directory, the instance claim that reads `process.argv` — is
evaluated at all; a launch that carries the token never claims, never hands over, never writes. For every other launch
nothing changed: the module sees no token and phase 0 runs as recorded above. Measured on the development and the
packaged binary (`spikes/code-intelligence-branch.md`): no instance record touched, no window, the runtime's own exit
status. The one ordering hazard ADR-0035 named — anything that writes to standard output before the branch — turned
out to be Electron's own CR LF, not ours, and is tolerated by the transport rather than prevented here.
