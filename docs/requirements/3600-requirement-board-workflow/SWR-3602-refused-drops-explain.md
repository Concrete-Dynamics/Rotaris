---
req-id: SWR-3602
status: approved
trace: required
test: required
title: "A refused move says why"
epic: SWR-3600
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3602 — A refused move says why

An action that silently does nothing is worse than one that fails: the user
repeats it. The transition machinery already knows exactly which precondition
was unmet.

Requirement: a refused delivery transition surfaces the engine's stated reason
as persistent, actionable inline feedback naming the unmet precondition and what
would satisfy it — not a transient toast, and never an unexplained snap-back.
Columns a card cannot reach are indicated during the drag, and the indication
does not rely on colour alone.

## Acceptance criteria

- The refusal reason shown is the engine's, not a UI-side guess.
- Feedback persists until dismissed or resolved.
- Unreachable columns are indicated during the drag with more than colour.
- Refusals are not counted as failures of the board (no error state on the
  view).

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Reason propagation from the engine refusal, persistence of the feedback, and the drag indication | Board actions | `apps/rotaris/tests/test_requirements_board_actions.py` |
| Integration | A `Backlog → Done` attempt shows the engine's named precondition | Actions → engine | `apps/rotaris/tests/test_requirements_board_actions.py` |
| User-flow E2E | A user trying to skip review is told which conditions are unmet and what to do | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board_actions.py` |

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
