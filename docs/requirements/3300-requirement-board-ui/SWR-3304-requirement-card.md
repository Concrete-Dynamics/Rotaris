---
req-id: SWR-3304
status: approved
trace: required
test: required
title: "Requirement card"
epic: SWR-3300
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3304 — Requirement card

A card has one job: let the user decide whether this requirement needs their
attention, without opening it.

Requirement: a requirement card shows the id, the title, the lifecycle badge,
the delivery condition (including `Needs Update`), the traceability ring
(SWR-3305), the number of execution units, and the age of the last run. It
states the exceptional facts in words — specification changed, blocked, tests
failing — rather than encoding them only in colour. Priority, parent epic,
dependency, assigned agent and last change are shown when present and omitted
cleanly when not.

## Acceptance criteria

- Every card element has an accessible name; the card as a whole is keyboard
  focusable and reachable in logical order.
- A card with no run, no units and no priority renders without empty
  placeholders.
- `Specification changed` appears on a card whose current hash differs from its
  satisfied hash.
- Card text stays readable at 1000×680 and at 200 % scaling.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each element renders from a crafted projection entry; absent fields omit rather than blank | Card widget | `apps/rotaris/tests/test_requirements_card.py` |
| Integration | Cards over a real projection show the lifecycle and delivery values the engine computed | Projection → card | `apps/rotaris/tests/test_requirements_board.py` |
| User-flow E2E | A user scanning the board can tell which requirement changed since it was delivered | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board.py` |

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
