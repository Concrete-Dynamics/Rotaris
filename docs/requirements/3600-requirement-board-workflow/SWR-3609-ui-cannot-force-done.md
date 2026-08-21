---
req-id: SWR-3609
status: approved
trace: required
test: required
title: "The user interface cannot force Done"
epic: SWR-3600
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3609 — The user interface cannot force Done

Every guarantee the board makes is only as strong as its weakest write path. If
the UI could set `Done` directly — through a drop, a context menu or a bulk
action — the completion conditions would be advisory.

Requirement: no code path in the desktop application writes a delivery state
without going through the engine's transition function (SWR-3203), and no path
sets `Done` bypassing the completion conditions (SWR-3215). Where an override is
offered at all it is an explicit, confirmed action recorded as an override with
its actor and reason.

## Acceptance criteria

- A guard test asserts no desktop module writes the delivery store directly.
- Bulk actions apply the same conditions per requirement and report per
  requirement.
- An override, if used, is visible on the requirement and in the audit trail
  afterwards.
- A card cannot reach `Done` in the UI while the engine reports it cannot.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The guard sweep over `apps/rotaris/src/`, and per-requirement bulk reporting | Desktop modules | `apps/rotaris/tests/test_requirements_board_actions.py` |
| Integration | A bulk accept over three requirements accepts the two eligible ones and reports the third | Actions → engine | `apps/rotaris/tests/test_requirements_board_actions.py` |
| User-flow E2E | A user cannot mark an unverified requirement done, and is told what is missing | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board_actions.py` |

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
