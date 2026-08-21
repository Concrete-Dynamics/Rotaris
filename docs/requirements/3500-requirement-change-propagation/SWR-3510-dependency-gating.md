---
req-id: SWR-3510
status: approved
trace: required
test: required
title: "Dependencies gate execution"
epic: SWR-3500
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3510 — Dependencies gate execution

A requirement that depends on another cannot sensibly be implemented first — the
agent would invent the missing foundation and the two implementations would
disagree. The relation already exists in the model (SWR-3109); the scheduler has
to honour it.

Requirement: a requirement with an unsatisfied `depends-on` is not schedulable
and states `Blocked by <id>` on the board. Satisfaction means the dependency is
`Done` with `current_hash == satisfied_hash`. When the dependency completes, its
dependents become schedulable automatically, and — where configured — start
automatically. A dependency cycle is reported as a blocker on every requirement
in the cycle.

## Acceptance criteria

- A dependent requirement cannot be scheduled while its dependency is unmet.
- The board names the blocking requirement, not just "blocked".
- Completing a dependency releases its dependents without user action.
- A dependency cycle blocks all its members with the cycle named.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Schedulability over crafted dependency graphs, the release on completion, and cycle detection | The dependency gate | `tests/unit/requirements/test_dependencies.py` |
| Integration | A two-requirement chain executes in order and the second starts when the first completes | Gate + scheduler | `tests/integration/test_requirement_scheduling.py` |
| User-flow E2E | A user releases two dependent requirements and Rotaris runs them in the right order | Public product boundary → user-observable result | `tests/integration/test_requirement_scheduling.py` |

Epic: [Requirement Change Propagation](../3500-requirement-change-propagation.md)
