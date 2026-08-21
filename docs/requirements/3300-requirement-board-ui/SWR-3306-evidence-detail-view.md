---
req-id: SWR-3306
status: approved
trace: required
test: required
title: "Evidence details open from the ring"
epic: SWR-3300
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3306 — Evidence details open from the ring

An indicator that cannot be opened teaches the user to ignore it. The path from
"this looks wrong" to the file that is wrong has to be two clicks, not a search.

Requirement: activating the ring opens the evidence view for that requirement:
implementation sites and covering tests as file and line with their pass state,
the last verification with its verdict, commit and requirement hash, and the
execution and integration records. Each site opens its file at its line; each
run opens the corresponding session.

## Acceptance criteria

- The view opens by mouse and by keyboard from the focused card.
- Every listed site is activatable and reaches the file at the line.
- A requirement with missing evidence states what is missing rather than
  showing an empty list.
- The verification block names verdict, commit and requirement hash.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The view renders sites, verdicts and the missing-evidence state from crafted records | Evidence view | `apps/rotaris/tests/test_requirements_evidence_view.py` |
| Integration | Activating a site emits the open-file intent with the projection's path and line | Evidence view → window | `apps/rotaris/tests/test_requirements_board.py` |
| User-flow E2E | A user clicks a red ring and lands on the failing test | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board.py` |

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
