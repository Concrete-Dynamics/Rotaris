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
