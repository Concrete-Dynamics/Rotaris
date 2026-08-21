---
req-id: SWR-3202
status: approved
trace: required
test: required
title: "Delivery state is independent of the requirement lifecycle"
epic: SWR-3200
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3202 — Delivery state is independent of the requirement lifecycle

The two axes must not be collapsed. An `approved` requirement whose
specification has since changed is operationally `Needs Update` and
specification-wise still the truth; a `draft` requirement may legitimately be
`Running`. Conflating them would either hide work in progress or misreport the
specification.

Requirement: lifecycle and delivery state are stored, changed and displayed
independently. Changing one never implicitly changes the other. The only
permitted couplings are stated explicitly: a `deprecated` requirement is not
schedulable (SWR-3412), and a requirement superseded by another moves to
`deprecated` by the superseding flow (SWR-3508), not by any board action.

## Acceptance criteria

- Setting a delivery state never writes to the requirement source.
- A lifecycle change in the source never rewrites the delivery state, except
  through the change-propagation rules of epic SWR-3500.
- `approved` + `Needs Update` and `draft` + `Running` are both representable and
  both render.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each axis changes without touching the other; the source file is untouched by a state change | Delivery store + registry | `tests/unit/requirements/test_delivery_state.py` |
| Integration | A requirement flipped to `approved` in the source keeps its delivery state and its history | Source re-read + delivery store | `tests/integration/test_requirement_delivery.py` |
| User-flow E2E | `N/A — invariant; observable on the card's two badges (SWR-3304)` | — | — |

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
