---
req-id: SWR-3410
status: approved
trace: required
test: required
title: "Requirement verification runs inside the unit's workspace"
epic: SWR-3400
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3410 — Requirement verification runs inside the unit's workspace

Verifying a unit's work anywhere but in its own worktree measures the wrong
tree. The completion verifier already runs a configured check suite per
iteration (SWR-2602); requirement execution needs its result attached to the
unit and to the requirement, not only to the session.

Requirement: after a unit's implementation iteration, the check suite and the
ReqToCode verification run in that unit's worktree, and their results — check
outcomes, requirement coverage evidence (SWR-2606), scope drift (SWR-2607) — are
attached to the unit run and projected as the requirement's verification
evidence with the commit and requirement hash they were produced against.

## Acceptance criteria

- Verification runs against the unit's worktree, never the base checkout.
- The recorded evidence names the commit and the requirement hash.
- A workspace with no check suite yields "not verified", not "verified".
- Verification failure keeps the unit's work and reports which check failed.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Result attachment, the no-suite case, and the recorded commit and hash | The unit verification record | `tests/unit/requirements/test_unit_verification.py` |
| Integration | A unit run in a git fixture verifies in its own worktree and attaches the evidence | Verifier + unit run | `tests/integration/test_requirement_execution.py` |
| User-flow E2E | A user sees, per unit, which checks ran and whether the requirement's tests passed | Public product boundary → user-observable result | `tests/integration/test_requirement_execution.py` |

Derived requirements: [SWR-3421](SWR-3421-one-check-suite-composition.md) —
one composition builds the check-suite callable this requirement injects.

Epic: [Requirement Execution](../3400-requirement-execution.md)
