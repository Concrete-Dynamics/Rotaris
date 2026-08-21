---
req-id: SWR-3405
status: approved
trace: required
test: required
title: "Each execution unit runs in its own worktree"
epic: SWR-3400
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3405 — Each execution unit runs in its own worktree

Two agents editing one working tree overwrite each other, and a requirement run
that dirties the user's checkout is unusable in practice. Rotaris already owns
session worktrees with collision-free branch names (SWR-2401, SWR-2415);
requirement execution must use that, not a second mechanism.

Requirement: every execution unit run gets an isolated git worktree and its own
branch through the existing `GitWorktreeService`, cut from the snapshot's base
commit. The branch naming strategy is configurable (SWR-3117) with the default
`rotaris/req/<requirement-id>/<unit-id>`, collisions resolve deterministically
as they already do, and the worktree and branch are recorded on the run.

Derived requirements: [SWR-3418 — The Windows path limit is stated in Rotaris' words](SWR-3418-worktree-path-limit-in-rotaris-words.md)

## Acceptance criteria

- A unit run never writes to the base checkout.
- Two units of the same requirement get different branches and different
  worktrees.
- A branch name that collides resolves deterministically rather than failing.
- The recorded worktree path and branch are the ones git reports.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Branch naming from the strategy, collision resolution, and the recorded worktree fields | Branch naming + service call | `tests/unit/requirements/test_unit_worktrees.py` |
| Integration | Two units of one requirement produce two worktrees and two branches in a git fixture | GitWorktreeService over a real repository | `tests/integration/test_requirement_execution.py` |
| User-flow E2E | A user runs a requirement and their working tree is untouched while the work happens on its own branch | Public product boundary → user-observable result | `tests/integration/test_requirement_execution.py` |

Epic: [Requirement Execution](../3400-requirement-execution.md)
