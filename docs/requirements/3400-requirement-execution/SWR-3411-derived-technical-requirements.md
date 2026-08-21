---
req-id: SWR-3411
status: approved
trace: required
test: required
title: "Execution can derive technical requirements"
epic: SWR-3400
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3411 — Execution can derive technical requirements

Sometimes an implementation creates a genuine, lasting technical obligation that
no product requirement covers — a deterministic merge journal, a migration
format, a compatibility guarantee. That is a requirement, not a work split, and
this repository already has the concept (SWR-2331). Confusing it with an
execution unit would lose it the moment the unit finishes.

Requirement: an execution run may propose a technical requirement with
`type: technical` and `derived-from` naming its origin. The proposal is created
through the source write path (SWR-3112), is mirrored back onto the origin, and
is distinguishable in the audit trail from a unit. Rotaris states the difference
where the proposal is presented: a unit is a work split and disappears; a
technical requirement is permanent.

## Acceptance criteria

- A proposed technical requirement passes the origin's own requirement check.
- The origin requirement gains the reciprocal derived link.
- A proposal against a read-only source is refused with its reason, and the run
  is not failed by the refusal.
- Units are never converted into requirements implicitly.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Proposal validation, the reciprocal link, and the read-only refusal | The derivation path | `tests/unit/requirements/test_derived_requirements.py` |
| Integration | A run proposing a technical requirement writes it into a synthetic store and it passes the verifier | Write path + ReqToCode check | `tests/integration/test_requirement_execution.py` |
| User-flow E2E | A user is offered a derived technical requirement after a run and accepting it updates the project's store | Public product boundary → user-observable result | `tests/integration/test_requirement_execution.py` |

Epic: [Requirement Execution](../3400-requirement-execution.md)
