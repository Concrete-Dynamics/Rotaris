---
req-id: SWR-3505
status: approved
trace: required
test: required
title: "Impact outcomes create the right execution units"
epic: SWR-3500
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3505 — Impact outcomes create the right execution units

The value of classifying a change is lost if every outcome produces the same
generic run. A test-only change should not put the implementation at risk, and a
change that needs decomposition should not be attempted in one run.

Requirement: `tests affected` creates a unit scoped to the requirement's test
surface; `implementation affected` creates a unit scoped to its implementation;
`implementation and tests affected` creates units covering both, with their
dependency; `decomposition required` runs the decomposition of SWR-3404. Each
created unit carries the requirement diff and the affected traces and tests in
its agent context (SWR-3407).

## Acceptance criteria

- Each outcome produces the stated unit shape and no other.
- Created units name the affected traces and tests, not the whole requirement
  surface.
- The requirement moves to `Ready` only when units exist to run.
- No units are created for `no behavioural impact` or `human clarification
  required`.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Unit shape per outcome, the affected-site scoping, and the two no-unit outcomes | The outcome-to-unit mapping | `tests/unit/requirements/test_impact_outcomes.py` |
| Integration | A criterion change produces a test unit and an implementation unit with the right dependency | Analysis + unit store | `tests/integration/test_requirement_impact.py` |
| User-flow E2E | A user tightens an acceptance criterion and Rotaris updates the test and the implementation | Public product boundary → user-observable result | `tests/integration/test_requirement_impact.py` |

Epic: [Requirement Change Propagation](../3500-requirement-change-propagation.md)
