---
req-id: SWR-3610
status: approved
trace: required
test: required
title: "Board actions are attributed and auditable"
epic: SWR-3600
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3610 — Board actions are attributed and auditable

The audit trail's value collapses if half its entries say "system". A human
release, a human acceptance and a human override are exactly the entries a later
reader most needs to identify.

Requirement: every board action that changes state — release, accept, re-run,
reject, hold, edit, create, answer a blocker, override — is recorded with the
acting user, the time, the requirement and its hash at that moment, and appears
in the requirement's history (SWR-3213). Actions taken by the scheduler or an
agent are recorded as such and are distinguishable from user actions.

## Acceptance criteria

- User and system actors are distinguishable in the trail.
- Each action records the requirement hash it acted on.
- The history view shows board actions alongside runs and verifications.
- No state-changing action exists that writes no record.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Actor tagging per action and the completeness sweep over the action set | Action recording | `apps/rotaris/tests/test_requirements_board_actions.py` |
| Integration | A release followed by an acceptance leaves two attributed records with their hashes | Actions → audit store | `apps/rotaris/tests/test_requirements_board_actions.py` |
| User-flow E2E | A user sees who released and who accepted a requirement, and when | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_review.py` |

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
