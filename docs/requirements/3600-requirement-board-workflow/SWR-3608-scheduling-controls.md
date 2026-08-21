---
req-id: SWR-3608
status: approved
trace: required
test: required
title: "Scheduling is visible and controllable"
epic: SWR-3600
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3608 — Scheduling is visible and controllable

Autonomous scheduling that cannot be seen or stopped is not a feature, it is a
risk. The user needs to know what will run next, and to be able to hold it.

Requirement: the Requirements view shows the delivery queue — what is running,
what is next, and why each held-back candidate is held — and offers control over
it: enable or disable automatic scheduling, set the concurrency limit, hold or
release an individual requirement, and stop the queue. Changes take effect
without a restart and are persisted in the configuration (SWR-3117).

## Acceptance criteria

- The queue shows the order the scheduler will actually use.
- Every held-back candidate shows the engine's stated reason.
- Stopping the queue does not cancel work already in flight, and says so.
- The concurrency limit is enforced by the engine, not only displayed.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Queue rendering, hold reasons, and the control intents | Queue panel | `apps/rotaris/tests/test_requirements_scheduling_ui.py` |
| Integration | Changing the concurrency limit reaches the scheduler and is persisted | View → config → scheduler | `apps/rotaris/tests/test_requirements_scheduling_ui.py` |
| User-flow E2E | A user enables automatic scheduling, watches two requirements run, and holds the third | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_scheduling_ui.py` |

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
