---
req-id: SWR-3212
status: approved
trace: required
test: required
title: "Epic progress aggregation"
epic: SWR-3200
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3212 — Epic progress aggregation

An epic is not implemented by one run; it is finished when its children are. Its
card therefore has to summarise them, and the summary has to be an aggregation
rather than a state someone maintains by hand.

Requirement: an epic aggregates over its children (SWR-3108): the count per
delivery state, the traceability and verification health, the active runs and
the blockers. An epic's own delivery state is derived — `Done` only when every
non-deprecated child is `Done`, `Blocked` when any child is blocked, `Running`
when any child is running — and cannot be set directly.

## Acceptance criteria

- A twelve-child epic reports the per-state counts and the traceability
  percentage its children imply.
- Deprecated children are excluded from progress and stated separately.
- Nested epics aggregate transitively.
- Setting an epic's state directly is refused (SWR-3203).

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Counts, percentages, exclusion of deprecated children, and transitive nesting | The aggregation | `tests/unit/requirements/test_epic_progress.py` |
| Integration | Aggregation over this repository's epics matches the requirements each folder declares | Aggregation over the real store | `tests/integration/test_requirement_delivery.py` |
| User-flow E2E | `N/A — its product flow is the epic card (SWR-3308)` | — | — |

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
