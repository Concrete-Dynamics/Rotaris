---
req-id: SWR-3312
status: approved
trace: required
test: required
title: "The board follows the repository live"
epic: SWR-3300
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3312 — The board follows the repository live

The board is a claim about the repository. If the repository moves and the board
does not, the claim is false — and the user has no way to tell which of the two
is stale.

Requirement: the Requirements view subscribes to the evaluation results of
SWR-3210 and updates the affected cards in place, without a manual refresh and
without rebuilding the whole board. Card selection, scroll position, expansion
state and the open detail view survive an update. The view states when it last
evaluated and offers an explicit refresh.

## Acceptance criteria

- An evaluation that changes one requirement updates one card and leaves
  selection and scroll intact.
- An evaluation running while the detail view is open updates it in place.
- Evaluation work never runs on the Qt event loop; the board stays responsive
  during a full re-evaluation.
- A failed evaluation shows a persistent, actionable notice and keeps the last
  good board.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | In-place card update, preserved selection and scroll, and the failure notice | Board + bridge | `apps/rotaris/tests/test_requirements_board.py` |
| Integration | A committed change in a git fixture reaches the board through the bridge as a changed card | Evaluation → bridge → view | `apps/rotaris/tests/test_requirements_board.py` |
| User-flow E2E | A user commits in another window and the affected requirement's card changes without a restart | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board.py` |

Derived requirements: [SWR-3319 — The board says when it is analysing changes, and lets you stop](SWR-3319-analysing-changes-is-visible-and-stoppable.md)

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
