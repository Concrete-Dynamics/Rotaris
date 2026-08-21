---
req-id: SWR-3710
status: approved
trace: required
test: required
title: "Clearing a blocker restarts the work it stopped"
epic: SWR-3600
date: 2026-08-21
---

# SWR-3710 — Clearing a blocker restarts the work it stopped

A requirement is blocked out of `Running` — a user holds it, a flow blocks one it
could not finish, or the recovery pass closes a run whose process is gone
(SWR-3611). Clearing that blocker returns it to `Ready`, because entering
`Running` asserts that a run is in flight and no person may assert that
(SWR-3201, `resume_target`).

`Ready` is where a run starts from, and until now nothing started it. Releasing
is the gesture that dispatches work (SWR-3413), the matrix has no `Ready → Ready`
edge, and so a card cleared back into `Ready` was one no board gesture could
start: the only way out was dragging it to `Backlog` and releasing it again. A
user who cleared a blocker and waited was waiting on nothing.

Requirement: clearing a blocker that returns a requirement to `Ready` restarts
its work, in that one gesture.

## Acceptance criteria

- **AC-1** Clearing a blocker on a requirement that returns to `Ready` dispatches
  a run in the same gesture. No second action, and no round trip through
  `Backlog`.
- **AC-2** Where the requirement returns anywhere else — it was blocked out of
  `Backlog`, `Review`, `Needs Update` or `Done` — nothing is dispatched. The
  blocker clears and that is all it does.
- **AC-3** The scheduler still decides when. A stopped queue, a full concurrency
  limit or an unfinished dependency queues the release and says so in the
  scheduler's own words; the requirement starts by itself when the hold lifts
  (SWR-3412, SWR-3510).
- **AC-4** Clearing the blocker is never refused by the dispatch. A workspace that
  cannot host a run still lets the card leave `Blocked`, and the reason nothing
  started is reported on the action rather than swallowed — a blocker that could
  not be cleared because git has no commit would be a worse trap than the one
  this removes.
- **AC-5** What the action announces before it happens matches what it does: the
  stated consequence names the restarted run where the requirement returns to
  `Ready`.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Resuming to `Ready` dispatches; resuming to `Backlog` does not | Board action → run starter | `apps/rotaris/tests/test_requirements_board_actions.py` |
| Unit | A held or stopped queue reports the scheduler's sentence and leaves the card cleared | Board action → scheduler | `apps/rotaris/tests/test_requirements_board_actions.py` |
| User-flow E2E | A user whose run was interrupted clears the blocker and the work restarts without touching `Backlog` | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_recovery.py` |

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
