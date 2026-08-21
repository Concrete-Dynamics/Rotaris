---
req-id: SWR-3201
status: approved
trace: required
test: required
title: "Requirement delivery state"
epic: SWR-3200
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3201 — Requirement delivery state

A requirement's lifecycle (`draft` / `approved` / `deprecated`) says whether the
requirement is the current specification. It says nothing about where its
implementation stands. Rotaris needs the second axis to schedule, display and
resume work.

Requirement: every requirement carries a delivery state from the closed set
`Backlog`, `Ready`, `Running`, `Review`, `Needs Update`, `Blocked`, `Done`. The
state is Rotaris-owned operational data (SWR-3114), defaults to `Backlog` for a
requirement Rotaris has never seen, and is defined for every requirement the
registry returns, including epics and tombstones.

## Acceptance criteria

- The state set is closed; an unknown value read from disk is reported and
  degraded to `Backlog` rather than crashing the board.
- A newly discovered requirement is `Backlog` without a write, and persists only
  once its state is first changed.
- A `Blocked` requirement carries a stated reason; the state alone is never the
  whole answer.
- Epics derive their state from their children (SWR-3212) and cannot be set
  directly.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Every state parses and round-trips; an unknown persisted value degrades to `Backlog` with a report | The delivery state model | `tests/unit/requirements/test_delivery_state.py` |
| Integration | A freshly opened workspace reports `Backlog` for every requirement and writes nothing until a state changes | Registry + delivery store | `tests/integration/test_requirement_delivery.py` |
| User-flow E2E | `N/A — model; its product flow is the board's columns (SWR-3302)` | — | — |

Derived requirements: [SWR-3216 — Board projection API](SWR-3216-requirement-board-projection-api.md)

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
