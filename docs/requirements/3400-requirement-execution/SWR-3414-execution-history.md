---
req-id: SWR-3414
status: approved
trace: required
test: required
title: "Execution history per requirement"
epic: SWR-3400
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3414 — Execution history per requirement

Auditability (SWR-3213) needs the execution side of the story: which runs
touched this requirement, in which worktree, on which branch, producing which
commits, with which outcome — including the runs that failed.

Requirement: every unit run is recorded with its unit, snapshot, session id,
worktree path, branch, base commit, produced commits, changed files, verification
outcome and terminal state. Failed and abandoned runs are retained. The history
is queryable per requirement and per unit, and survives worktree removal and
branch deletion.

## Acceptance criteria

- A run's record exists before it starts and is completed when it ends.
- Failed runs are retained with their reason.
- Removing the worktree does not remove the record.
- The history answers "which commits carry this requirement's implementation".

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Record lifecycle, retention of failures, and the per-requirement query | The execution history | `tests/unit/requirements/test_execution_history.py` |
| Integration | A run in a git fixture leaves a record naming its real branch and commits after the worktree is removed | History + git | `tests/integration/test_requirement_execution.py` |
| User-flow E2E | `N/A — its product flow is the Execution section of the detail view (SWR-3307)` | — | — |

Epic: [Requirement Execution](../3400-requirement-execution.md)
