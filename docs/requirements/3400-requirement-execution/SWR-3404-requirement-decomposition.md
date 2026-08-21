---
req-id: SWR-3404
status: approved
trace: required
test: required
title: "Automatic requirement decomposition"
epic: SWR-3400
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3404 — Automatic requirement decomposition

Some requirements are too large for one agent run — not because the text is
long, but because they touch several components, need several independent
changes, or would produce a change set no reviewer can check. Attempting them in
one run produces a half-finished worktree and an unusable diff.

Requirement: before execution, Rotaris assesses the requirement against the
number of affected components, the number of independent changes, technical
dependencies, expected test surface, architecture boundaries, context size,
parallelisability and merge-conflict risk, and produces a decomposition plan:
either one unit, or several units with a dependency graph between them. The plan
is inspectable and its reasoning is recorded before any run starts.

## Acceptance criteria

- A small requirement produces exactly one unit and no ceremony.
- A plan's dependency graph is acyclic; a cyclic plan is rejected and reported.
- The plan states, per unit, its scope and why it is separate.
- Decomposition creates no requirements — only units (SWR-3401) — unless the
  technical-requirement rule of SWR-3411 applies.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Plan validation including cycle rejection, single-unit passthrough, and the recorded rationale | The decomposition plan | `tests/unit/requirements/test_decomposition.py` |
| Integration | A scripted decomposition over a multi-component requirement yields the expected unit graph | Planner + unit store | `tests/integration/test_requirement_decomposition.py` |
| User-flow E2E | A user releases a large requirement and sees the units it was split into before they run | Public product boundary → user-observable result | `tests/integration/test_requirement_decomposition.py` |

Epic: [Requirement Execution](../3400-requirement-execution.md)
