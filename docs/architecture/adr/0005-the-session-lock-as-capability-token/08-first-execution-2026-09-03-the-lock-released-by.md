# ADR-0005 — The session lock as the single capability token, and the one lock that is not a row — First execution — 2026-09-03, the lock released by a run that ends

Part 8 of 15 of [ADR-0005](../0005-the-session-lock-as-capability-token.md), which indexes every part.

## First execution — 2026-09-03, the lock released by a run that ends

*Recorded under GD-10.*

**Built and run:** a run's teardown releases the lock row inside the one durable transaction that also
records `session.end` and `result` and the terminal status (ADR-0008's first-execution note of the same
date states the reading of `REQ-SESSION-094` against `REQ-EVENTS-098` this rests on). On every path the
tests and the application reached — completed, interrupted by a stop, failed on a model error, stopped at
the iteration limit, ended by shutdown — the lock row was gone when the commit was visible. A force exit
still leaves a live-looking row for the next start to reap; that path is unchanged and unbuilt.

**Found: nothing in this record.**
