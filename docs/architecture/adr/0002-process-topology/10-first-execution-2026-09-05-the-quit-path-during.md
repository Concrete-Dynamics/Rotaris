# ADR-0002 — Process topology — First execution — 2026-09-05, the quit path during a run

Part 10 of 11 of [ADR-0002](../0002-process-topology.md), which indexes every part.

## First execution — 2026-09-05, the quit path during a run

*Recorded under GD-10.* The skeleton left the user-driven quit unexercised. `pnpm part-j-proof` closes the main
window during a run: main's `window-all-closed` asks the run host to shut down and waits, the run host stops
every run for `application_shutdown` (anything blocked on a person released first — the stop's own rule), the
terminal pair is written, the locks are released, the terminal manager is disposed, and the application quits
after — REQ-MONITOR-131's order, measured from the store: stop reason `application_shutdown`, `session.end` and
`result` present, no lock row left. **Found: nothing in this record.**
