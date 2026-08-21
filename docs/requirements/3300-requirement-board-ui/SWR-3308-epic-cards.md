---
req-id: SWR-3308
status: approved
trace: required
test: required
title: "Epics on the board"
epic: SWR-3300
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3308 — Epics on the board

An epic is a requirement with children, and on a board it has to behave like a
grouping element rather than a work item that someone could drag into `Running`.

Requirement: epics appear as cards that summarise their children (SWR-3212):
child count, the count per delivery state, traceability percentage, active runs
and blockers. An epic card expands to its children, or filters the board to
them. Epic cards carry no direct delivery action; their state follows their
children.

## Acceptance criteria

- An epic card shows the counts and percentage its children imply.
- Expanding an epic reaches its children without leaving the board.
- Delivery actions are absent, not merely disabled, on an epic card.
- An epic with no children states that rather than reporting 100 %.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Aggregated rendering, the childless case, and the absence of delivery actions | Epic card | `apps/rotaris/tests/test_requirements_card.py` |
| Integration | Epic cards over this repository's real store report the counts its folders imply | Projection → board | `apps/rotaris/tests/test_requirements_board.py` |
| User-flow E2E | A user checks an epic's progress and reaches the one child that is blocked | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board.py` |

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
