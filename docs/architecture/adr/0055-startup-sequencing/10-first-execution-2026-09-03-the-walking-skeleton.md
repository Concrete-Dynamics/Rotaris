# ADR-0055 — Startup sequencing, the instance claim, and the first-paint budget — First execution — 2026-09-03, the walking skeleton

Part 10 of 17 of [ADR-0055](../0055-startup-sequencing.md), which indexes every part.

## First execution — 2026-09-03, the walking skeleton

*Recorded under GD-10.*

**Built and run:** alternative I — our own record file, exclusive create, `pid`/`host`/`acquired_at`
plus a hand-over endpoint (named pipe on Windows), probed by the lock liveness predicate; at most one
reclaim and two claim attempts. `platform/src/instance.ts`, before `app.whenReady()`.

**Measured on the built application:** a second launch carrying a workspace directory was handed
over and **exited 0 in 327–328 ms**, with no window; the running instance logged the hand-over,
surfaced its window and opened the carried directory (REQ-STARTUP-162, -163). A force-killed instance
left its record behind and the next launch reclaimed it (probed pid dead) — as REQ-STARTUP-164 (3)
requires and as the primitive this record refused did not do.

**Found, in the harness rather than the mechanism:** the in-process test's third claim collided with
its own second endpoint (`EADDRINUSE`) because `close()` did not await the server's close and the
endpoint name was the pid alone. Fixed by making `close` awaitable and adding a nonce to the endpoint
name — which is also the right shape for a reclaimed pid, which must not inherit a dead process's name.
**Not exercised:** the 5-second hand-over interval against a primary that is running but not pumping
messages — the case that refused the primitive — because no wedge exists in the skeleton to inject.
