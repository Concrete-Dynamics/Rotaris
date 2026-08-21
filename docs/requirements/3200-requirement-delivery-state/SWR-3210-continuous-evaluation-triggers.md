---
req-id: SWR-3210
status: approved
trace: required
test: required
title: "Continuous requirement evaluation"
epic: SWR-3200
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3210 — Continuous requirement evaluation

A board that only refreshes when the user asks is a screenshot. The repository
state moves under it constantly — commits, merges, branch switches, finished
runs, integrated worktrees — and each of those can change what is true about a
requirement.

Requirement: requirement evaluation re-runs on the repository events that can
change it: commit, merge, requirement source edit, branch switch, test run,
agent run completion, worktree integration, and explicit refresh. Evaluation is
incremental (SWR-3116), debounced so a burst of events causes one pass, and
publishes what changed rather than only that something did.

## Acceptance criteria

- Each listed event triggers exactly one evaluation, and a burst within the
  debounce window triggers one, not many.
- An evaluation publishes the set of requirements whose projection changed.
- A failing evaluation is reported and leaves the previous projection in place.
- Evaluation never runs on the UI thread.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each trigger fires once; a burst debounces to one; a failure keeps the previous projection | The evaluation scheduler | `tests/unit/requirements/test_evaluation_triggers.py` |
| Integration | A commit and a branch switch in a git fixture each produce one evaluation with the expected changed set | Triggers over a real repository | `tests/integration/test_requirement_evaluation.py` |
| User-flow E2E | A user commits while the board is open and the affected cards update without a restart | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board.py` |

Derived requirements: [SWR-3515 — One evaluation runs every propagation rule](../3500-requirement-change-propagation/SWR-3515-propagation-pass.md)

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
