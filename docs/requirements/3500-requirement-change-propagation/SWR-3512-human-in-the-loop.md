---
req-id: SWR-3512
status: approved
trace: required
test: required
title: "Decisions with product meaning reach the user"
epic: SWR-3500
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3512 — Decisions with product meaning reach the user

Rotaris should work autonomously, and there is a small set of decisions it must
not take alone. Enumerating them is what makes the autonomy trustworthy: the
user knows exactly what will come back to them.

Requirement: the following reach the user rather than being decided by an agent
— contradictory requirements, unclear scope, competing requirements, breaking
changes, an unclear superseding relation, a risky migration, and an
architectural decision the context cannot settle. Each moves the requirement to
`Blocked` or `Review` with the decision stated, the options named, and the
consequence of each option described. The decision and its actor are recorded.

## Acceptance criteria

- Each listed trigger produces a stated decision, not a generic block.
- The options and their consequences are named.
- A decision is recorded with its actor and time in the audit trail.
- Nothing outside the list interrupts an otherwise autonomous run.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each trigger produces its decision payload; unrelated conditions do not interrupt | The decision points | `tests/unit/requirements/test_human_in_the_loop.py` |
| Integration | A breaking-change analysis over fakes reaches Review with options and consequences recorded | Analysis + delivery store | `tests/integration/test_requirement_impact.py` |
| User-flow E2E | A user is asked one concrete question about a breaking change and the run continues after answering | Public product boundary → user-observable result | `tests/integration/test_requirement_impact.py` |

Derived requirements: [SWR-3516 — An open decision is an artefact](SWR-3516-open-decision-artefact.md)

Epic: [Requirement Change Propagation](../3500-requirement-change-propagation.md)
