---
req-id: SWR-3203
status: approved
trace: required
test: required
title: "Delivery transitions are a validated state machine"
epic: SWR-3200
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3203 — Delivery transitions are a validated state machine

Board actions (SWR-3601) and agent runs both move requirements between states.
If either could write any state, a requirement could reach `Done` without a run,
or leave `Running` while a run is still in flight, and the board would stop
describing reality.

Requirement: delivery-state changes go through one transition function that
knows the legal moves, the actor (user or system) permitted to make each, and
the preconditions each carries. An illegal transition is refused with a reason
naming the unmet precondition. Every accepted transition records actor, time,
requirement hash and cause (SWR-3213).

Legal moves at minimum: `Backlog↔Ready`; `Ready→Running` (system, on run start);
`Running→Review` (system, on run completion); `Running→Blocked`;
`Review→Done` (user or system, gated by SWR-3215); `Review→Ready`;
`Done→Needs Update` (system, on specification change); `Needs Update→Ready`;
any state `→Blocked` and `Blocked→` its predecessor once the blocker clears —
except that a *user* releasing a requirement blocked out of `Running` releases it
to `Ready`, because `Blocked→Running` asserts that a run is in flight and that is
the system's to assert.

## Acceptance criteria

- `Backlog→Done` is refused with a stated reason.
- `Review→Done` is refused while a completion condition of SWR-3215 is unmet.
- A transition rejected by a precondition leaves the stored state unchanged.
- Every accepted transition appends exactly one audit record.
- A requirement blocked while a run was in flight is released by a user to
  `Ready`, never into a run nobody started; there is no delivery state a user can
  reach and then not leave.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The legal matrix is enforced; each refusal names its unmet precondition; each acceptance appends one audit record | The transition function | `tests/unit/requirements/test_delivery_transitions.py` |
| Integration | A run driving `Ready→Running→Review` produces the expected stored states and audit trail | Delivery store + run lifecycle fake | `tests/integration/test_requirement_delivery.py` |
| User-flow E2E | A user dropping a card on a column it may not reach is told why, and the card returns | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board_actions.py` |

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
