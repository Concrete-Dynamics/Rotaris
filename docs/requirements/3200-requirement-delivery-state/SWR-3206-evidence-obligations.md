---
req-id: SWR-3206
status: approved
trace: required
test: required
title: "Evidence obligations per requirement"
epic: SWR-3200
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3206 — Evidence obligations per requirement

Counting `@traces` annotations measures annotation, not delivery. What makes a
requirement trustworthy is that the evidence it *is expected to have* exists and
is current — and which evidence is expected differs between a product
requirement, a technical requirement and an epic.

Requirement: each requirement resolves a set of evidence obligations from
`implementation`, `test`, `verification`, `execution` and `integration`. Each
obligation is required, optional or not applicable. Defaults follow the source's
own flags — ReqToCode's `trace: required` / `test: required` map directly — and
are overridable per requirement type in the configuration block (SWR-3117).

## Acceptance criteria

- A `trace: optional` requirement does not report a missing implementation
  obligation.
- An epic's obligations are derived from its children, not asserted on itself.
- A technical requirement carries implementation and test obligations but no
  user-flow obligation.
- Obligations are data, readable without running any check.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Obligation resolution per type and per source flag, including the epic and technical cases | The obligation resolver | `tests/unit/requirements/test_evidence_obligations.py` |
| Integration | Obligations resolved over this repository's store match the flags the verifier enforces | Resolver over the real store | `tests/integration/test_requirement_evidence_health.py` |
| User-flow E2E | `N/A — model; its product flow is the traceability ring (SWR-3305)` | — | — |

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
