# ADR-0009 — The event history as a table, with the line-delimited form as an export — Second execution — 2026-09-05, one ordinal series across a resumed session

Part 7 of 7 of [ADR-0009](../0009-the-wire-event-journal.md), which indexes every part.

## Second execution — 2026-09-05, one ordinal series across a resumed session

*Recorded under GD-10.*

A session resumed by a second process continued its timeline ordinals from the stored maximum
(`REQ-EVENTS-097`): the built app's two runs on one session produced ordinals 1–9 with no gap and no repeat,
the second `run_start` at 6 (`pnpm part-h-proof`). The writer's counters are rebuilt from the store when an
existing session is opened. **Found: nothing.**
