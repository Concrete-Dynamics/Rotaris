---
req-id: SWR-3215
status: approved
trace: required
test: required
title: "Done requires its completion conditions"
epic: SWR-3200
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3215 — Done requires its completion conditions

`Done` is the one state the whole system's credibility rests on. If it can be
reached by dragging a card, it means nothing.

Requirement: a requirement may enter `Done` only when its completion conditions
hold: the execution of every non-abandoned execution unit finished, the required
implementation traces exist, the required tests exist and passed, the completion
gate (SWR-2604) passed for the delivering run, integration completed where the
requirement had more than one unit, `current_hash == satisfied_hash`, and no
unresolved blocker. Which conditions apply follows from the requirement's
evidence obligations (SWR-3206). An attempt to enter `Done` with unmet
conditions is refused, naming each unmet one.

## Acceptance criteria

- Each unmet condition is named individually in the refusal.
- A requirement whose obligations mark tests not applicable can reach `Done`
  without tests, and the exemption is visible.
- The check is evaluated at the moment of transition, against current evidence,
  not against evidence captured earlier.
- A forced override, if configured at all, is recorded in the audit trail as an
  override with its actor.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each condition blocks individually and is named; the not-applicable exemption; the override record | The completion condition check | `tests/unit/requirements/test_done_conditions.py` |
| Integration | A run that passes the completion gate but leaves a requirement uncovered cannot reach `Done` | Delivery + verifier evidence | `tests/integration/test_requirement_delivery.py` |
| User-flow E2E | A user accepting a review whose tests did not run is told which condition is unmet | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board_actions.py` |

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
