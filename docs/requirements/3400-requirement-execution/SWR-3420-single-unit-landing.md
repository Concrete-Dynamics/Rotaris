---
req-id: SWR-3420
status: approved
trace: required
test: required
title: "A verified single unit lands too"
epic: SWR-3400
date: 2026-08-16
source: docs/plans/2026-08-16-requirements-landing.md
---

# SWR-3420 — A verified single unit lands too

SWR-3409 is about several units, and its third acceptance criterion is right:
a requirement with one completed unit has nothing to integrate, and running an
empty integration to say so would be ceremony. But "skip the integration" was
read as "skip the landing", and most requirements produce exactly one unit — so
the epic's headline claim, that a requirement run produces work that reaches the
base, was true only for the requirements that happened to be split.

The gap is not visible from any one requirement. SWR-3410 verifies the unit in
its own worktree, SWR-3409 promotes an integration, and between them sits the
case neither covers: one unit, verified, on a branch nobody moves.

Requirement: a requirement whose single completed unit verified in its own
worktree has that unit's branch promoted to the target branch (SWR-3419), with
no integration worktree created.

- The promotion is the same fast-forward an integration performs, onto the same
  target, recorded as the same integration evidence (SWR-3206) — one landing
  step, not a second one that could disagree with it.
- An unverified single unit is not promoted. A workspace that declares no check
  suite therefore lands nothing by itself, which is the same answer SWR-3410
  gives everywhere else: "nobody checked" is not "everything holds".
- A promotion that cannot fast-forward leaves the target untouched, keeps the
  unit branch, and says why.
- No integration worktree is created, and the outcome still states that
  integration was skipped and why.

## Acceptance criteria

- A single-unit requirement whose unit verified reaches the target branch
  without an integration worktree being created.
- A single-unit requirement whose unit was not verified does not reach the
  target branch, and the outcome names the reason.
- The target branch is not modified when the fast-forward is refused, and the
  unit branch survives.
- The landing is recorded as integration evidence, so the board reads one
  history whether the requirement had one unit or five.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The verified promotion, the unverified refusal, and that no worktree is asked for | The integration outcome | `tests/unit/requirements/test_unit_integration.py` |
| Integration | A one-unit requirement in a git fixture verifies in its worktree and lands on the target | Integration over a real repository | `tests/integration/test_requirement_integration.py` |
| User-flow E2E | A user runs a requirement that needs no splitting and the work is on their branch afterwards | Public product boundary → user-observable result | `tests/integration/test_requirement_integration.py` |

Epic: [Requirement Execution](../3400-requirement-execution.md)
