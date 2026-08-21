---
req-id: SWR-3401
status: approved
trace: required
test: required
title: "Execution units are work artefacts, not requirements"
epic: SWR-3400
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3401 — Execution units are work artefacts, not requirements

A requirement describes what the system must do. How much of it fits into one
agent run is a scheduling question, and letting it shape the specification would
corrupt the specification: teams would split requirements to suit context
windows.

Requirement: an execution unit is a Rotaris-owned work artefact belonging to
exactly one requirement. A requirement has zero or more units; a small
requirement produces one, a large one several. Units carry an id, a title, a
scope description, a dependency list over sibling units, a state, and the runs
that executed them. Creating, splitting or discarding units never writes to the
requirement source and never changes the requirement's identity or hash.

Derived requirements: [SWR-3417 — One identity per delivery cycle](SWR-3417-one-identity-per-delivery-cycle.md)

## Acceptance criteria

- A requirement with one unit and a requirement with five are handled by the
  same path.
- No unit operation writes to a requirement source — asserted, not assumed.
- Unit ids are stable across restarts and unique within a requirement.
- Discarding a unit keeps its runs in the execution history (SWR-3414).

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Unit creation, dependency declaration, stable ids, and the no-source-write guarantee | The unit model | `tests/unit/requirements/test_execution_units.py` |
| Integration | Units created for a requirement persist across a store round-trip with their dependencies | Unit store + delivery store | `tests/integration/test_requirement_execution.py` |
| User-flow E2E | `N/A — work artefact; its product flow is the unit list on the card (SWR-3304)` | — | — |

Epic: [Requirement Execution](../3400-requirement-execution.md)
