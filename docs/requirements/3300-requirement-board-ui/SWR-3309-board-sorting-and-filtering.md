---
req-id: SWR-3309
status: approved
trace: required
test: required
title: "Board sorting and filtering"
epic: SWR-3300
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3309 — Board sorting and filtering

A board of four hundred requirements is a wall unless the user can reduce it to
the ones they care about. Priority already exists in most requirement sources
and should drive the default order rather than being displayed and ignored.

Requirement: the board sorts by priority (`Critical`, `High`, `Normal`, `Low`)
and then by id, and filters by epic, source, lifecycle, health, priority and
free text over id and title. Sorting and filtering are display-only: they change
neither delivery state nor scheduling order, and the active filter is stated so
a filtered board is never mistaken for an empty one.

## Acceptance criteria

- Requirements with no priority sort after `Low` rather than randomly.
- An active filter is visible and clearable in one action.
- A filter that matches nothing says so and offers to clear itself.
- Filter and sort selections persist across a restart.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Sort order including missing priority, each filter dimension, and the empty-result state | Board model | `apps/rotaris/tests/test_requirements_board.py` |
| Integration | Filter and sort selections persist and are restored on the next construction | Board + settings persistence | `apps/rotaris/tests/test_requirements_board.py` |
| User-flow E2E | A user filters to one epic's critical requirements and back | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board.py` |

Derived requirements: [SWR-3318 — The board groups by a chosen axis](SWR-3318-board-grouping-axis.md)

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
