# Resolution Record — Domain 20, Machine-Readable Event Stream, Replay, and Trajectory Export — Accepted amendment, 2026-09-06 — A6: latest-run outcome

Part 5 of 8 of [domain 20's resolutions](../20-event-history-replay-export.md), which indexes every part.

## Accepted amendment, 2026-09-06 — A6: latest-run outcome

REQ-EVENTS-138 now derives identity and terminal outcome within the segment
starting at the latest retained `session.start`. An unfinished segment exports
an unknown outcome, empty stop reason/end timestamp and zero duration. The
whole-history counts retain their scope. This addresses the sequence
`start(A), end(A), result(A), start(B)` and also prevents session-row state from
supplying an outcome absent from the exported events. Regression coverage is
in `packages/engine/src/session-actions.test.ts`.

**Dependent contracts reconciled, 2026-09-13.** REQ-SESSION-153 now states the
two scopes the one document carries — identity and outcome from the latest run
segment, every summary count from the whole exported history — and cites
REQ-EVENTS-138 as the owner of the derivation rather than restating it.
REQ-SESSION-193's key inventory is unchanged and needed no change: the amendment
moved no key and added none. No ADR states a competing derivation; ADR-0024 owns
the export's shape and file discipline, not its outcome fields, and the audit
confirmed it names none.

**What the reconciliation found in the implementation.** `duration_seconds` was
read from the segment's last `session.end` whatever that event carried. Two
consequences, both contradicting the amendment: an end carrying the figure but no
status — the shape a writer produces when the figure is recorded before the
outcome is decided — exported `status: unknown` beside a non-zero duration, which
this requirement forbids in terms; and where a `result` supplied the outcome, its
own `duration_seconds` was discarded in favour of elapsed time between the two
timestamps, against "its supplied duration takes precedence". The duration is now
taken from whichever terminal event supplied the outcome, and is zero when neither
supplied a status.
