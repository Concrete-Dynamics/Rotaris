---
req-id: SWR-3302
status: approved
trace: required
test: required
title: "Kanban board over delivery states"
epic: SWR-3300
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3302 — Kanban board over delivery states

The primary presentation of requirement delivery is a board whose columns are
the delivery states, because the question a user asks first is "what is where".

Requirement: the Requirements view renders one column per delivery state —
`Backlog`, `Ready`, `Running`, `Review`, `Needs Update`, `Done` — each holding
the cards of the requirements in that state, read from the board projection
(SWR-3216). Column headers state the count. The board is usable at the supported
minimum window size of 1000×680: columns scroll horizontally rather than
clipping, and each column scrolls vertically.

## Acceptance criteria

- Every requirement the projection returns appears in exactly one column.
- An empty column shows what belongs there rather than a blank space.
- At 1000×680 no column, card or header clips, and no action becomes
  unreachable.
- A board over several hundred requirements renders without freezing the UI
  thread.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Column assignment from a crafted projection, including the empty-column state | Board widget | `apps/rotaris/tests/test_requirements_board.py` |
| Integration | The board built from a real projection over a synthetic store places every requirement once | Projection → board | `apps/rotaris/tests/test_requirements_board.py` |
| User-flow E2E | A user opens Requirements and sees their project's requirements distributed over the delivery columns | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board.py` |

Derived requirements: [SWR-3317 — The board scales to a repository-sized requirement store](SWR-3317-board-scales-to-a-large-store.md)

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
