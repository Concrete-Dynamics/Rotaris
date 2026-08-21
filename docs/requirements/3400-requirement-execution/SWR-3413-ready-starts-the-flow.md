---
req-id: SWR-3413
status: approved
trace: required
test: required
title: "Ready starts the agentic requirement flow"
epic: SWR-3400
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3413 — Ready starts the agentic requirement flow

The user-facing promise of the board is that releasing a requirement is enough.
Everything between that release and a reviewable result is Rotaris' job, and
each stage of it has to be observable or the user cannot tell a slow stage from
a stuck one.

Requirement: moving a requirement to `Ready` starts the flow — snapshot, impact
and scope analysis, decomposition if required, unit creation, worktree creation,
agent run, implementation, tests, ReqToCode verification, review — and each
stage publishes its start, its outcome and its failure. A stage failure stops
the flow at that stage with a stated reason and leaves the requirement in a
state the user can act on, never mid-flight.

## Acceptance criteria

- Each stage is observable with start, outcome and duration.
- The surface that shows a requirement in `Running` reports the stage it is on
  while it is on it. The board reads persisted stores, and for the first minutes
  of a flow nothing is persisted — so a card that stated only what it could read
  said "No execution units yet · Never run" for a working run and a stuck one
  alike.
- A failure in any stage yields `Blocked` or `Review` with the failing stage
  named, never a silent stop.
- The flow is resumable: restarting Rotaris mid-flow recovers the stage state
  from persisted data (SWR-2817's recovery applies to requirement runs too).
- Nothing in the flow requires the user's presence.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Stage sequencing, per-stage failure handling, and the published stage events | The flow controller | `tests/unit/requirements/test_requirement_flow.py` |
| User-flow E2E | A user watches a released card and reads which stage the flow is on, before any unit exists to read from the store | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board_actions.py::test_a_running_flow_says_which_stage_it_is_on_before_it_ends` |
| Integration | A scripted end-to-end flow over fakes takes a requirement from Ready to Review with every stage observed | Flow + units + runs | `tests/integration/test_requirement_execution.py` |
| User-flow E2E | A user drops a requirement on Ready and, without further input, reaches a reviewable result | Public product boundary → user-observable result | `tests/integration/test_requirement_execution.py` |

Derived requirements: [SWR-3416 — Requirement runs are launchable without the desktop](SWR-3416-headless-requirement-run-seam.md)

Epic: [Requirement Execution](../3400-requirement-execution.md)
