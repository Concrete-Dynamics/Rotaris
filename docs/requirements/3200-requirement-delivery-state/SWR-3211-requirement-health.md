---
req-id: SWR-3211
status: approved
trace: required
test: required
title: "Derived requirement health"
epic: SWR-3200
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3211 — Derived requirement health

Lifecycle, delivery state and five evidence obligations are the right model and
the wrong summary. A user scanning a board needs one word per requirement, as
long as that word is derived and never becomes a third stored truth.

Requirement: a derived health value — `Healthy`, `Needs Update`,
`Incomplete Traceability`, `Verification Failed`, `Blocked`, `Superseded`,
`Deprecated` — is computed from lifecycle, delivery state and evidence health by
a documented, total precedence order. It is recomputed on every evaluation and
never persisted as an independent fact.

## Acceptance criteria

- The precedence order is total: every combination of inputs yields exactly one
  health.
- Health is computed, never stored, and never used as an input to a transition.
- A requirement can be `approved` and `Verification Failed` at once.
- The inputs that produced a health are retrievable from it.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A table-driven pass over the input combinations yields exactly one health each | The health derivation | `tests/unit/requirements/test_requirement_health.py` |
| Integration | Health over this repository's store agrees with the underlying projections for every requirement | Derivation over the real store | `tests/integration/test_requirement_evidence_health.py` |
| User-flow E2E | `N/A — derived display value; its flow is the card badge (SWR-3304)` | — | — |

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
