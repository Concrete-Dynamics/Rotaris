---
req-id: SWR-3603
status: approved
trace: required
test: required
title: "Review view"
epic: SWR-3600
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3603 — Review view

Review is where an autonomous system earns trust. The user has to be able to see
what was actually done, against which specification version, with what evidence
— in one place, without leaving Rotaris for a terminal.

Requirement: opening a requirement in `Review` presents the requirement and its
snapshot version, its execution units and their outcomes, the changed files, the
traceability changes the work produced, the test and check results, the agent's
summary, the risks it reported, and the branch and worktree the work lives on.
Changed files open as diffs; the branch and worktree reach the Git view.

## Acceptance criteria

- Every listed element is present or explicitly stated as unavailable.
- The specification version shown is the snapshot's, and a difference from the
  current version is stated (SWR-3403).
- Diffs are readable at the minimum window size.
- The view distinguishes what the agent claimed from what Rotaris measured.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Section rendering from a crafted review payload, including the unavailable cases | Review view | `apps/rotaris/tests/test_requirements_review.py` |
| Integration | A completed run over fakes produces a review showing its real changed files and check results | Engine → controller → review view | `apps/rotaris/tests/test_requirements_review.py` |
| User-flow E2E | A user reviews a finished requirement and sees the diff, the tests and the branch it is on | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_review.py` |

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
