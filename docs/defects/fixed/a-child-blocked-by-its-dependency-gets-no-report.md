## A child blocked by its dependency gets no report

When a dependency fails, is cancelled or is blocked, REQ-ORCH-048's cascade moves each dependent that has not started
to `blocked` (`Scheduler.cascadeBlocked`). The transition stores no report, so the child ends terminal with none. No
artifact is materialised for it either. A parent reading its children's reports finds nothing for it.

Noticed 2026-09-27 by the adversarial review of PD-ORCH-005's phase 7, which read every path that settles a child.
Established by reading the code; not driven.

`PD-ORCH-005` clause 16 adds a route to it. A child cancelled while its session rests runs no cascade, so a paused
agent whose `depends_on` names it is resumed by the Continue action and blocked by the resumed run's first pass, with
no report (OQ-101, "A dependent of the cancelled child"). Found 2026-09-28 by the merged revision 4 build's ninth review
round, driven in a scratch test over `crash.test.ts`'s harness.

## Specs

`REQ-ORCH-108`: "Every child reaching a terminal state MUST produce a machine-readable report artifact before its parent
resumes". `REQ-LIBRARY-092`: every terminal child report is materialised.

## Relevant files

- `packages/engine/src/children/scheduler.ts` — `cascadeBlocked`.
- `packages/engine/src/children/ledger.ts` — `storeChildReport`, the one write a report would go through.
- `packages/engine/src/sessions.ts` — `cancelPausedUnderLock`, the at-rest cancel, which runs no cascade.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. `Scheduler.cascadeBlocked` now stores a report for each child it moves to `blocked`,
through `ChildLedger.storeReport`, so the `child_report` artifact is materialised with it (REQ-LIBRARY-092). The report
comes from `blockedReport` in `children/scheduler.ts`:
- status `blocked` (REQ-ORCH-112);
- a summary and one `blocked` error naming the dependency, its task id and the state it ended in;
- empty responses, since the child never ran and no summarising pass is made.

The report is stored before the terminal callbacks fire, so a parent resumed by them reads it (REQ-ORCH-108). The
same repair covers `PD-ORCH-005` clause 16's route: the resumed run's first pass blocks a paused dependent of a child
cancelled at rest, and that pass is this cascade.

Evidence, in `packages/engine/src/children/children.test.ts`:
- "REQ-ORCH-048 with REQ-ORCH-108 / REQ-ORCH-112: each child the cascade blocks …". A failed dependency blocks two
  dependents transitively, and each is seen by the terminal callback with its report already stored.
- "a dependent of the cancelled child (OQ-101) is blocked by the resumed run's first pass …". Clause 16's route,
  driven through `Sessions`: pause, cancel at rest, continue. The dependent ends `blocked` with its report and a
  `blocked` artifact, the root is resumed with that report, and the iteration closes.

Both tests fail on the code before the repair. OQ-101's sentence "it gets no report" is corrected in place.

A blocked child still fires no `child_completed` hook. Neither do the other paths that settle a child outside its
execution. That is recorded in
[`a-child-settled-outside-its-execution-fires-no-child-completed-hook.md`](../a-child-settled-outside-its-execution-fires-no-child-completed-hook.md).
