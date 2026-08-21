---
req-id: SWR-3611
status: approved
trace: required
test: required
title: "Requirement work survives a restart"
epic: SWR-3600
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3611 — Requirement work survives a restart

Requirement runs are long. Closing Rotaris while three units are running must
not lose the work or, worse, leave the board claiming they are still running
when their processes are gone — the failure mode SWR-2817 already had to solve
for sessions.

Requirement: after a restart, the board reconstructs delivery states, execution
units, queued and running runs and their worktrees from persisted data. Runs
whose processes no longer exist are detected and reported as interrupted with
their work preserved, not shown as running. The queue resumes where it stopped.

## Acceptance criteria

- A requirement running before the restart is shown as running or interrupted
  according to its actual process state.
- Interrupted runs keep their worktree, branch and partial work.
- The queue resumes without re-running completed units.
- No requirement is silently reset to `Backlog` by a restart.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Reconstruction from persisted state, interrupted detection, and the no-reset guarantee | Recovery | `apps/rotaris/tests/test_requirements_recovery.py` |
| Integration | Restarting with three persisted units restores two as complete and one as interrupted | Store → controller → view | `apps/rotaris/tests/test_requirements_recovery.py` |
| User-flow E2E | A user closes Rotaris mid-run, reopens it, and finds the requirement work where they left it | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_recovery.py` |

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
