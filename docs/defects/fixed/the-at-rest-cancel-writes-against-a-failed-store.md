## The at-rest cancel writes against a failed store, and a store failure presents as a crash

A run that ends on a recording failure (OQ-42) leaves the session's durable status busy with no run behind it, so the
liveness predicate reads `not-live`, exactly as for REQ-CHAT-008's recovery state. `crashLeftOf` had no store-failure
condition, so it named that session's unfinished agents as crash-left. `toAgentRecord` then presented them `paused` by
`crash`, and `resumableOf` stated a count for the Continue action. `Sessions.cancelPausedAtRest` had no store-failure
guard, so a Cancel sent for one of them — a persona window offers Cancel always (REQ-SHELL-075(g)) — judged it
crash-left, took the lock and called `recordCrashOf` against the failed writer. That logged the crash record's failed
writes and a failed move per agent before it refused. `continueSession` refuses every continue on such a session
`store-failed`, so the cancel and the presentation disagreed with the engine's own reading that it did not crash (OQ-103).

Found 2026-09-28 by the review of the merged revision 4 build of `PD-ORCH-005` (R-065).

## Specs

`PD-ORCH-005` clause 18 names the sessions a crash left, and OQ-103 reads a session a store failure left busy as not one
of them. OQ-42's recovery is the reopen, which rebuilds the writer.

## Relevant files

- `packages/engine/src/sessions.ts`: `crashLeftOf`, `resumableOf`, the two `readSession` closures, `cancelPausedAtRest`,
  and `continueSession`'s `store-failed` guard.

## Repaired — 2026-09-28

By the first fix round of the merged revision 4 build (R-065). `crashLeftOf` takes `storeFailed` and names no agent of a
busy session under a store failure. The projections read through `Sessions.restingOf`, which also states nothing to
resume for such a session, so its tree, its run-level agent and the composer's count present it as before.
`cancelPausedAtRest` refuses under a store failure first, writing nothing and warning nothing, as `continueSession` does.
In the process whose run failed the projection is frozen at the run's last live record anyway (OQ-42). There the
renderer still draws the count and the decline beside the two continues, and all of them are refused (OQ-103).

Evidence:
- `packages/engine/src/run/crash.test.ts`, "OQ-103: a session the store's failure left busy is not one a crash left":
  the agent presents `running` with no interruption, `resumable` is null, and the cancel is refused with nothing written
  and nothing warned. Removing the `crashLeftOf` guard, the `resumable` guard or the cancel's guard each turns it red.
