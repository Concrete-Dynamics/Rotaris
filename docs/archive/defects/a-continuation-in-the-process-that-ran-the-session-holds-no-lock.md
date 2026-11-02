## A continuation in the process that ran the session holds no lock

Every run releases the session's lock in its teardown (`Run`'s `writer.release` in the `finally`), but the live entry
stays in `Sessions.live`. A later continue in the same process does not take the lock back. `continueSession` never
reads it, and `prompt` does check it (`lock.pid !== this.deps.pid` → `this.resume(...)`), but `resume` then finds the
live entry and returns `ok` before `SessionWriter.open` claims anything. Neither `launchContinuation` nor the run
claims it either. So every run after the first one in a process runs with no lock row. A second Rotaris instance on the
same workspace is not stopped from loading and continuing the session at the same time, because nothing in the app
takes a single-instance lock. Two runs then write one session's rows.

Noticed while repairing the at-rest cancel of `PD-ORCH-005` clause 16 (R-065, 2026-09-28). That cancel now takes the
lock for its write and gives it back (`lockForWrite`, OQ-101). The continue paths are not repaired.

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
- `packages/engine/src/session-writer.ts`: `SessionWriter.open` and `SessionWriter.create`, which claim a lock with a
  writer, and `claimLockReaping`, the claim with its one dead-local-holder reap that `open` goes through.
- `packages/engine/src/sessions.ts`: `lockForWrite`, the at-rest cancel's claim (through `claimLockReaping`), which
  takes the lock without opening a writer and gives it back after the write. A repair of the continue paths chooses
  whether they reuse it, call `claimLockReaping` and hold the lock for the run, or reopen a writer.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067, with
[`a-continue-by-message-cannot-re-claim-a-lock-it-no-longer-holds.md`](a-continue-by-message-cannot-re-claim-a-lock-it-no-longer-holds.md),
by one change. The claim is not made in `launchContinuation`, as the triage proposed, because every continue writes
before it launches — `prompt` appends the user's row, `continueSession` resolves a message-limit pause, `planDecision`
resolves the gate — and those writes need the lock too. Each of the three entries instead claims it once its refusals
that write nothing have answered and before its first write (`Sessions.holdForContinue`). A lock this process already
holds is kept (a session loaded here, or held at the plan gate, whose park does not release it); otherwise the claim goes
through `claimLockReaping` (REQ-SESSION-047's one reap of a dead local holder), and a lock another live process holds
refuses the continue with `resume`'s REQ-SESSION-048 words (`lock-held-local` naming the pid, `lock-held-foreign` naming
the machine and when it took the lock), with nothing written and that lock untouched (REQ-SESSION-083). The run the
continue launches holds the lock until its teardown releases it, as the first run did; a continue that launches no run
(the resolution's `cancel`, a plan `cancel`, a failure after the claim) gives back only what it took. The at-rest cancel's
`lockForWrite` and the continues share one claim (`claimHold`).

Evidence: five tests in `packages/engine/src/session-resume.test.ts` ("a continue in the process that ran the session
holds the lock") — a second and a third run in one process each hold the row and give it back; the Continue action holds
it and its `cancel` gives it back; a live local holder and a foreign one refuse both continues with nothing written; a
dead local holder is reaped; a session loaded here keeps its load's lock — and one in `run/plan-gate.test.ts` (a plan
decision refused under a live holder, and holding the lock for its relaunch). Four of them fail on the code before the
repair, as does the plan-gate one. In the built app `part-j-proof`'s pause scenario samples the store every 50 ms from a
worker thread while the app runs, and asserts every sample of the continued run while active names a holder: it passed
on the repaired build (the pause's teardown left no lock row, the continued run held pid 26082 throughout) and failed
on the code before the repair (`running`, no lock row). `sessions-proof` passed its lock scenarios (live, repair-one,
repair-all) against the repaired build; see the bundle's report for how it was run on Linux. ADR-0005 carries the first
execution, and corrects its 2026-09-05 claim in place.
