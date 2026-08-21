---
req-id: SWR-3303
status: approved
trace: required
test: required
title: "Blocked requirements are unmissable"
epic: SWR-3300
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3303 — Blocked requirements are unmissable

`Blocked` is the state that needs a human, so it is the one state the board must
never let a user scroll past. It is also not a stage of progress — a blocked
requirement belongs to whatever it was doing before it blocked.

Requirement: blocked requirements are presented as a distinct, always-visible
condition: the card states that it is blocked and why, and the board surfaces
the blocked count where it is visible from any column. The presentation does not
rely on colour alone. Whether blocked cards additionally occupy their own column
is a display setting, not a change to the delivery model.

## Acceptance criteria

- A blocked card names its blocker in text on the card.
- The blocked condition is conveyed by text or glyph as well as colour.
- The blocked count is reachable without scrolling any column.
- Resolving the blocker returns the card to the state it came from.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Blocked rendering carries text and glyph; the count reflects the projection | Card + board header | `apps/rotaris/tests/test_requirements_board.py` |
| Integration | A projection with two blocked requirements renders both conditions and the count | Projection → board | `apps/rotaris/tests/test_requirements_board.py` |
| User-flow E2E | A user whose requirement blocked on a missing dependency sees it and reads why | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board.py` |

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
