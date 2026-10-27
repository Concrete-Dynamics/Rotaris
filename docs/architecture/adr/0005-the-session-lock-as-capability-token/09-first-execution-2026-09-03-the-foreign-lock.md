# ADR-0005 — The session lock as the single capability token, and the one lock that is not a row — First execution — 2026-09-03, the foreign-lock report (IC-4, half 1)

Part 9 of 15 of [ADR-0005](../0005-the-session-lock-as-capability-token.md), which indexes every part.

## First execution — 2026-09-03, the foreign-lock report (IC-4, half 1)

*Recorded under GD-10; the report is `../spikes/machine-identifier-rename.md`.*

The restore's assessment lists lock rows naming another machine **together**, separately from rows this
machine can prove live; the confirmation names how many and which, states the risk (a run there may be
writing now and the restore replaces what it writes), and proceeding clears nothing one at a time.
Consequence 11's drop of foreign rows from the artifact ran on every restore. The rename half of IC-4 is
prepared as a two-phase harness the owner runs around a real rename and reboot.
