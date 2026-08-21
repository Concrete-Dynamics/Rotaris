---
req-id: SWR-3604
status: approved
trace: required
test: required
title: "Review decisions"
epic: SWR-3600
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3604 — Review decisions

A review with only an accept button is a rubber stamp. The realistic outcomes
are broader, and each of them has a different consequence for the branch, the
worktree and the requirement.

Requirement: from the review the user can accept the result, re-run the unit,
send the agent back with instructions, edit the requirement, reject the
integration, or keep the worktree for manual work. Each option states its
consequence for the branch and worktree before it is taken; each is recorded
with its actor (SWR-3610). Accepting is subject to the `Done` conditions of
SWR-3215.

## Acceptance criteria

- All six options are reachable, and each names its consequence.
- Rejecting an integration preserves the unit branches and worktrees.
- Sending the agent back carries the user's instructions into the next run's
  context.
- Accepting with unmet conditions is refused with the conditions named.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each option's intent, consequence text and recorded decision | Review actions | `apps/rotaris/tests/test_requirements_review.py` |
| Integration | Rejecting an integration leaves the branches intact and the requirement actionable | Review → engine | `apps/rotaris/tests/test_requirements_review.py` |
| User-flow E2E | A user sends an agent back with a correction and the next run receives it | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_review.py` |

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
