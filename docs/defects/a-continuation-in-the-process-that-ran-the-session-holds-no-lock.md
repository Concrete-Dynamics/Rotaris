## A continuation in the process that ran the session holds no lock

Every run releases the session's lock in its teardown (`Run`'s `writer.release` in the `finally`), but the live entry
stays in `Sessions.live`. A later continue in the same process does not take the lock back. `continueSession` never
reads it, and `prompt` does check it (`lock.pid !== this.deps.pid` → `this.resume(...)`), but `resume` then finds the
live entry and returns `ok` before `SessionWriter.open` claims anything. Neither `launchContinuation` nor the run
claims it either. So every run after the first one in a process runs with no lock row. A second Rotaris instance on the
same workspace is not stopped from loading and continuing the session at the same time, because nothing in the app
takes a single-instance lock. Two runs then write one session's rows.

Noticed while repairing the at-rest cancel of `PD-ORCH-005` clause 16 (R-064, 2026-09-28). That cancel now takes the
lock for its write and gives it back (`lockForWrite`, OQ-74). The continue paths are not repaired.

The same root cause is seen from `prompt`'s re-claim branch in
[`a-continue-by-message-cannot-re-claim-a-lock-it-no-longer-holds.md`](a-continue-by-message-cannot-re-claim-a-lock-it-no-longer-holds.md).
One repair answers both, and moves both notes.

## Specs

ADR-0005 (one holder per session: its lock row, claimed at load and held for writes). REQ-SESSION-047/083/112 (claim an
existing session, with one local-dead-pid reap).

## Relevant files

- `packages/engine/src/sessions.ts`: `prompt`'s lock check and re-resume; `resume`'s early return for an existing
  live entry; `continueSession`, which has no check; `launchContinuation`.
- `packages/engine/src/run/run.ts`: the teardown's `writer.release`.
- `packages/engine/src/session-writer.ts`: `SessionWriter.open`, the only place outside `create` that claims a lock.
