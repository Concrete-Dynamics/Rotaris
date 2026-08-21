---
req-id: SWR-3612
status: approved
trace: required
test: required
title: "Requirement runs reach the existing run surfaces"
epic: SWR-3600
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3612 — Requirement runs reach the existing run surfaces

A requirement run is a Rotaris run. Rebuilding a transcript, an agent tree or a
worktree list inside the Requirements view would duplicate three mature surfaces
and guarantee they diverge.

Requirement: a running or finished execution unit navigates to the surfaces that
already own it — its session in the Workspace view, its agents in Mission, its
branch and worktree in the Git view — carrying the session id, and the target
view focuses that session. Conversely, a session started from a requirement
states which requirement and unit it belongs to.

## Acceptance criteria

- Opening a unit's run focuses that session in the Workspace view.
- A requirement-started session states its requirement and unit where sessions
  are listed.
- No transcript, agent tree or worktree list is re-implemented in the
  Requirements view.
- Navigation works for finished sessions, not only live ones.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Navigation intents carry the session id; the reverse attribution is present on the session | Controller navigation | `apps/rotaris/tests/test_requirements_board_actions.py` |
| Integration | Opening a unit run focuses its session in the workspace, live and finished | Controller → window → workspace | `apps/rotaris/tests/test_requirements_board_actions.py` |
| User-flow E2E | A user follows a running requirement into its transcript and back | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board_actions.py` |

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
