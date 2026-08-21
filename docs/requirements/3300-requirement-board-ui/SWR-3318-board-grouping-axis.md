---
req-id: SWR-3318
status: approved
trace: required
test: required
title: "The board groups by a chosen axis"
type: technical
derived-from: SWR-3309
epic: SWR-3300
date: 2026-08-15
source: docs/plans/2026-08-15-requirements-board-adoption.md
---

# SWR-3318 — The board groups by a chosen axis

SWR-3302 makes the delivery states the board's columns, because "what is where"
is the question a user asks first. That is right, and it stays the default. But
delivery state is the one axis that is *empty* on the day a project adopts
Rotaris: everything Rotaris has not delivered is `Backlog`, correctly, and a
single column holding every card answers no question at all.

Meanwhile the projection already computes several other axes — health
(SWR-3211), lifecycle, epic, priority and source — and already answers queries on
every one of them. The board reads only one of them for its columns.

Which of them helps depends on the project, and that is the point of making the
axis a choice rather than picking a second default. Measured over this
repository's own 1508 requirements before anything was adopted: **epic** produces
36 populated columns and **lifecycle** three, while **health** produces two —
because every requirement owes a verification (SWR-3206), none has one yet, and
the board therefore reads `Incomplete Traceability` almost everywhere. That is
truthful and no more useful than one `Backlog` column. Health becomes worth
grouping by once a verification has run (SWR-3217); epic and lifecycle are what
separate a project on the day it arrives.

Requirement: the board's grouping axis is a display choice, alongside the sort
order and the filters SWR-3309 already offers.

- The axes are delivery state (the default), health, lifecycle, epic, priority
  and source. Each produces one column per distinct value, with its count in the
  header, exactly as the delivery axis does.
- The column set comes from the projection, never from a second table in the
  user interface, so an axis can never disagree with what the cards say
  (SWR-3311).
- Grouping is display only: it changes neither delivery state nor scheduling
  order, and it writes nothing.
- Every card appears in exactly one column of whichever axis is chosen, and a
  requirement with no value for that axis lands in a stated column rather than
  disappearing.
- An empty column says what belongs there, on every axis (SWR-3302).
- The chosen axis persists across a restart, like the filter and the sort order.
- Drag-and-drop remains a delivery-state action: on any other axis a card is not
  draggable between columns, because dropping a card into "Healthy" is not a
  workflow action (SWR-3601). The move bar keeps working, since it targets
  delivery states directly.
- `Blocked` keeps its pinned column on the delivery axis (SWR-3303) and is an
  ordinary value elsewhere.

## Acceptance criteria

- Switching the axis regroups every card without a re-read of the engine and
  without any write.
- On each axis, the sum of the column counts equals the number of visible cards.
- Filters and sort order compose with every axis unchanged.
- Cards are not draggable between columns on a non-delivery axis, and the
  refusal is stated rather than silent.
- The axis chosen in one session is the axis on the next start.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Column assignment on each axis over a crafted projection, including the missing-value column and the empty-column message | Board model | `apps/rotaris/tests/test_requirements_board.py` |
| Integration | Switching axes over a real projection keeps every card exactly once and preserves filters; the choice persists | Projection → board → settings | `apps/rotaris/tests/test_requirements_board.py` |
| User-flow E2E | A user whose requirements are all in Backlog groups by another axis and sees their project distributed | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board.py` |

Derived from: [SWR-3309 — Board sorting and filtering](SWR-3309-board-sorting-and-filtering.md)

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
