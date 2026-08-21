---
req-id: SWR-3409
status: approved
trace: required
test: required
title: "Multi-unit results are integrated before they reach the base"
epic: SWR-3400
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3409 — Multi-unit results are integrated before they reach the base

Several units of one requirement produce several branches. Merging them into the
base one at a time makes the base the place where their conflicts are
discovered, which is the one place the user cannot afford breakage.

Requirement: when a requirement has more than one completed unit, their branches
are merged in a separate integration worktree, verified there, and only then
taken to the requirement's target branch (SWR-3419). Integration failure leaves
the base untouched, keeps the unit branches, and reports which units conflicted.

**A conflict is reported, not resolved.** The merge is aborted the moment one
occurs, and the outcome names the units and the files that collided. An earlier
version of this sentence said the integration reused "the existing agent-assisted
worktree integration" (`GitWorktreeService.integration_prompt`, SWR-2413) — it
never did, and the text was corrected to the behaviour rather than the other way
round. Putting a model in the loop of a merge that then fast-forwards onto a
user's own branch is a larger claim than this requirement makes, and it would
need its own decision about what happens when the agent makes the conflict worse.
The units' branches all survive a refusal, so resolving one by hand costs nothing
that was not already there.

## Acceptance criteria

- The base branch is not modified until integration verified successfully.
- A conflicting integration names the conflicting units and files and preserves
  every unit branch.
- A single-unit requirement skips integration rather than running an empty one.
  Whether it nevertheless *lands* is [SWR-3420](SWR-3420-single-unit-landing.md):
  this criterion is about the integration worktree, and reading it as being about
  the promotion is what left most requirements with no landing step at all.
- The integration result is recorded as integration evidence (SWR-3206).

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Integration planning, the single-unit skip, and the failure report shape | The integration plan | `tests/unit/requirements/test_unit_integration.py` |
| Integration | Three unit branches in a git fixture integrate, verify and land; a conflicting one leaves the base untouched | Integration worktree over a real repository | `tests/integration/test_requirement_integration.py` |
| User-flow E2E | A user's multi-unit requirement lands as one verified change, and a conflict is reported instead of a broken base | Public product boundary → user-observable result | `tests/integration/test_requirement_integration.py` |

Epic: [Requirement Execution](../3400-requirement-execution.md)
