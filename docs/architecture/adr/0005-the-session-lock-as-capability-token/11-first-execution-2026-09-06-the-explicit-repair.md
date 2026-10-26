# ADR-0005 — The session lock as the single capability token, and the one lock that is not a row — First execution — 2026-09-06, the explicit repair on demand (Part U)

Part 11 of 15 of [ADR-0005](../0005-the-session-lock-as-capability-token.md), which indexes every part.

## First execution — 2026-09-06, the explicit repair on demand (Part U)

*Recorded under GD-10.*

**Built and run:** `REQ-SESSION-060`'s repair is ONE unit, `Sessions.repairOne` (`packages/engine/src/sessions.ts`),
shared by the session browser's Repair and Repair-all-stale (`REQ-SESSION-182`, the `session.repair` command → the run
host) and by `REQ-GIT-094`'s open-time repair in `checkpointListing`, which now calls it instead of carrying its own
copy. The unit re-checks liveness through the one predicate, reads the state (unreadable → nothing to do,
`REQ-SESSION-041`), requires an active status, writes `interrupted` through the writer's terminal-status path (the
stronger durability setting), files the `session.interrupted_recovered` timeline entry (REQ-SESSION-062's fixed shape, corrected under OQ-46), and the writer releases the lock
last. Per session repaired it reports the id, the stuck status, `interrupted` and the reason, which names which of
`REQ-SESSION-059`'s two conditions applied — "no process holds a lock for it", or "the lock names this machine and its
process (pid N) is gone" — plus the one this process produces itself, "this application holds its lock but runs nothing
for it"; nothing stale is an explicit sentence, never an empty answer. In the proof (`pnpm sessions-proof`) a run left
mid-flight by the application's exit read back `running` behind a dead lock; the browser marked it stale; Repair repaired
it naming the pid, the lock row was gone and the entry filed; Repair all stale over two planted stale sessions and one
whose lock named a child process this script held repaired exactly the two and left the live one; a second press
answered "Nothing was stale".

**Found — defect 40 (the fortieth by Part U's numbering; the manager reconciles).** The listing carried a *second*
liveness predicate beside `liveness()`: `lock present && (foreign host || pid <= 0 || probe alive)`. The two disagreed on
one case — a lock this process holds with no run behind it, which the listing called live (its own pid probes alive) and
`liveness()` called not live — so the browser showed a crash-resumed session as sound while the checkpoint listing
repaired it. `REQ-SESSION-171` forbids two verdicts for one pid at one moment and this record's "one predicate, four
call sites" names a second implementation a defect. The listing now consumes `liveness()`; the falsified predicate is
kept beside its replacement in `Sessions.list`; `session-actions.test.ts` drives the case through a real resume.

**Reading taken where this record and `REQ-SESSION-060` pull apart.** The requirement's order is status, then the lock's
release, then the timeline entry. The entry is written *before* the release here, as `checkpointListing` already did,
because the lock is the capability that authorises writing the session's rows (the decision above: "the run host … must
not write a session's rows without holding its lock"); what the requirement's ordering exists to forbid — the release
preceding the status — holds. The alternative, an entry written after the release, would be a row written without the
lock, which this record forbids outright.

*Corrected 2026-09-29 (R-067, acceptance finding A14): "the writer releases the lock last" and "an entry written after
the release would be a row written without the lock" held for a session **not** loaded in the process that repairs it,
whose writer `withWriter` opens (claiming the lock) for the call. For a session loaded here the unit wrote through the
live writer and never looked at the lock, which the run's teardown had already released, so the status, the entry and
the crash record were written with no lock row at all, and the safety checkpoint and the restore's outcome
(`recordSafetyCheckpoint`, `recordRestore`) the same way. The reading is kept as it was taken; the section "a write
through a loaded session outside a run" below is what the loaded branch does now.*
