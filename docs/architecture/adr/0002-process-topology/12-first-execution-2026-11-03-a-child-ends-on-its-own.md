# ADR-0002 — Process topology — First execution — 2026-11-03, a utility process ends on its own (R-091)

Part 12 of 12 of [ADR-0002](../0002-process-topology.md), which indexes every part.

## First execution — 2026-11-03, the last-resort handler and the parent's end (R-091, hardening §3.2 row 1)

Consequence 1 says a run host that ends is not forked again and its runs settle through stale detection; nothing said how
a child ends when no request path ends it. Two ends were missing
([the last-resort note](../../../archive/defects/the-run-host-and-the-workspace-service-have-no-last-resort-exception-handler-and-end-without-a-word.md),
[the orphaned run host](../../../archive/defects/the-run-host-outlives-a-killed-main-on-windows-and-keeps-calling-the-model.md)).
Both entries now install `superviseUtilityProcess` (`packages/platform/src/utility-process.ts`) first: an uncaught
exception or an unhandled rejection posts ONE `error` line with the stack to main and exits **70**; main's pid, probed every
250 ms, gone (or the parent pid changed) exits **69**. Main reads a status through `childExitReading` (`main/exit.ts`).

Measured on Windows 11 ARM64, Node 26.13.0, Electron 44.3.0, at `hrd1-child-process-failure`:

- **Before building** (a scratch app, never committed): `process.parentPort` has `start`, `pause` and `postMessage` and
  emitted no `close` when main was killed with `taskkill /F`; the child received no `disconnect` and no `exit`. Chromium
  ended it natively between about 0 and 3 s after the kill (four launches), with no JavaScript run — so the port's
  closing cannot be listened for on this platform. A pid probe every 100 ms saw main gone within 100 ms
  of the kill in 3 launches of 3. A line posted on the port and followed at once by `process.exit(70)` reached main before
  the exit event in 18 of 18 launches.
- **The built app**, driven (`pnpm app:drive start` on a scratch workspace), main killed with `taskkill /F`: the run host
  and the workspace service each read exit code **69** in four launches — 343 to 377 ms after the kill began in two, 1.2
  to 2.5 s in two — with the host's CPU at 100 % from another session's proofs.
- **`exit-trace-proof`** (CPU 26 % at its start, an Electron tree of another session beside it): 48 checks of 48, its two
  new `last-resort` launches reading "run host: an uncaught exception reached the run host's last-resort handler; ending
  with status 70 …" and "run host exited (70), its last-resort handler: …", both at `error`, the stack on the lines after,
  then an orderly quit exiting 0 (the workspace service likewise for a rejection); its `main-killed` launch read both
  children gone 60 ms after the kill.

Found by the same drive, not by this mechanism: a launch at 100 % CPU missed the run host's 5 s `hello` bound and ended main
on `UNHANDLED rejection in main: NoReplyWithinBound: no reply to hello within 5000 ms`, the note
[`a-launch-whose-run-host-misses-the-hello-bound-ends-on-an-unhandled-main-rejection.md`](../../../defects/a-launch-whose-run-host-misses-the-hello-bound-ends-on-an-unhandled-main-rejection.md)
reproduced on its first reading of this host; OQ-462 (2) rules what such a launch does, built as hardening §3.2 row 2.
