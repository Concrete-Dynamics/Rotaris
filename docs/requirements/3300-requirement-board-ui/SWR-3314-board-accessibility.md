---
req-id: SWR-3314
status: approved
trace: required
test: required
title: "The board is fully operable without a mouse"
epic: SWR-3300
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3314 — The board is fully operable without a mouse

A board is the most mouse-shaped surface in the product, and the one where
keyboard operation is most often skipped. The accessibility standard for this
app makes that a defect, and the workflow actions of epic SWR-3600 will hang off
exactly these controls.

Requirement: every board interaction — moving focus between columns and cards,
opening a card, opening the ring, moving a card between states, filtering — is
reachable by keyboard with a visible focus indicator and a logical tab order.
Cards and columns carry accessible names and descriptions that convey state
without colour, and the drag interaction of SWR-3601 has a keyboard equivalent.

## Acceptance criteria

- The accessibility sweep passes for the new view with no bespoke exemptions.
- Every card action reachable by mouse is reachable by keyboard.
- Column and card accessible names state the delivery state and health in
  words.
- Focus is not stranded in a collapsed filter or a closed detail view.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Accessible names and descriptions on cards, columns and the ring; tab order over a populated board | Board widgets | `apps/rotaris/tests/test_requirements_a11y.py` |
| Integration | The repository accessibility sweep covers the seventh view and passes | Sweep over all primary views | `apps/rotaris/tests/test_accessibility_sweep.py` |
| User-flow E2E | A keyboard-only user moves a requirement from Backlog to Ready and opens its evidence | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_a11y.py` |

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
