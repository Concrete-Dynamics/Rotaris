---
req-id: SWR-3317
status: approved
trace: required
test: required
title: "The board scales to a repository-sized requirement store"
type: technical
derived-from: SWR-3302
epic: SWR-3300
date: 2026-08-15
source: docs/plans/2026-08-15-requirements-board-finalization.md
---

# SWR-3317 — The board scales to a repository-sized requirement store

SWR-3302's fourth acceptance criterion says a board over several hundred
requirements renders without freezing the UI thread. It is not met, and the
number says so: over this repository's own store — 1494 requirements — the board
realises **1494 card widgets**, takes **84 seconds** to paint them after the
engine has answered, and spends **66–74 seconds on the Qt thread for every
single keystroke** in the search box, because `_search_changed` → `set_filter` →
`_rebuild` destroys and recreates every card each time.

Chunked creation was the wrong fix for the right problem. It keeps the event
loop turning between chunks, so the window is technically alive, but the total
work is unchanged: a user who types five characters pays for 7470 card widgets.
The board must stop paying per requirement and start paying per *visible* one.

Requirement: the board realises card widgets only for what a user can see.

- Each column keeps its model's ordered membership and realises widgets for the
  cards inside its own scroll viewport plus a small overscan, driven by the
  scrollbar it already owns. Scrolling recycles those widgets rather than
  creating more.
- A widget is **recycled**, never destroyed and rebuilt: a card leaving the band
  is repainted in place for the card entering it, through the same `set_card`
  the live-update path of SWR-3312 already uses.
- A filter change recomputes membership and repaints the bands. Nothing is torn
  down, so the selection, the column scroll positions and the open pane survive
  a filter exactly as they survive a re-evaluation (SWR-3312).
- The search box debounces into that recompute, so a burst of keystrokes costs
  one repaint rather than one per character.
- A card the user has not scrolled to has no widget, so the board offers a way
  to make one exist — used by "return to the board and focus the selection", and
  by anything else that needs a specific card.

Reviewing a requirement is the other place this area blocks the Qt thread: the
review surface reads its projection through `project_detail`, which re-reads the
requirement and delivery stores. That read moves onto a worker, where the board
read already lives, and the surface states that it is reading rather than
freezing until it has an answer.

## Acceptance criteria

- Over a store of more than a thousand requirements the board realises far fewer
  card widgets than it holds cards, and every column still reports its true
  count.
- Typing in the search box repaints the board once per pause, not once per
  character, and the repaint takes a small fraction of the time a full rebuild
  took.
- Scrolling a column realises the cards that come into view and reuses the
  widgets of the ones that leave, without the widget count growing.
- A filter change keeps the selection and every column's scroll position.
- Opening a review does not read a projection on the Qt thread; the surface
  states that it is reading and refuses a second read while one is in flight.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A column over hundreds of ids realises a bounded band, recycles on scroll, and reveals a card on request | `_Column` + `RequirementsView` | `apps/rotaris/tests/test_requirements_board.py` |
| Integration | A filter change repaints without teardown and keeps selection and scroll; the review read happens off the Qt thread | Board + controller + review surface | `apps/rotaris/tests/test_requirements_board.py`, `apps/rotaris/tests/test_requirements_review.py` |
| User-flow E2E | A user opens a board of a thousand requirements and types in the search box without the window freezing | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board.py` |

Derived from: [SWR-3302 — Kanban board over delivery states](SWR-3302-kanban-board.md)

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
