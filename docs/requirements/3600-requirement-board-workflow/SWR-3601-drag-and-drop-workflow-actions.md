---
req-id: SWR-3601
status: approved
trace: required
test: required
title: "Moving a card is a workflow action"
epic: SWR-3600
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3601 — Moving a card is a workflow action

On this board a column is not a label, it is a state with consequences. Moving a
card is therefore an instruction: `Backlog → Ready` releases a requirement for
agentic implementation, `Needs Update → Ready` re-implements a changed version,
`Review → Done` accepts a result.

Requirement: dropping a card on a column invokes the delivery transition
(SWR-3203) with the user as actor, and the technical consequence of the
transition runs — releasing starts the flow of SWR-3413, accepting records the
satisfied hash of SWR-3204. The card shows the action in progress and its
outcome; the board never shows a card in a state the engine did not accept.

## Acceptance criteria

- A drop that starts work shows the work starting, not just a moved card.
- The card returns to its origin column if the transition is refused or fails.
- The consequence of a drop is stated before it happens for actions that start
  runs or accept results.
- Every drop has a keyboard equivalent (SWR-3314).

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each drop maps to its transition and consequence; a refused transition returns the card | Board actions | `apps/rotaris/tests/test_requirements_board_actions.py` |
| Integration | Dropping on Ready reaches the engine's flow seam with the requirement and the actor | Actions → controller → engine | `apps/rotaris/tests/test_requirements_board_actions.py` |
| User-flow E2E | A user drags a requirement to Ready and a run starts for it | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board_actions.py` |

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
