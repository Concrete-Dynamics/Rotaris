---
req-id: SWR-3622
status: approved
trace: required
test: required
title: "Releasing a requirement with unmet dependencies asks first"
epic: SWR-3600
depends-on: SWR-3510
date: 2026-08-21
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3622 — Releasing a requirement with unmet dependencies asks first

`Backlog → Ready` starts an unattended, full-permission agent run (SWR-3601,
SWR-3707). SWR-3510 already decides that a requirement whose `depends-on`
targets are not delivered may not sensibly be implemented — the agent would
invent the missing foundation — but that verdict was reached only *after* the
drop, in the scheduler, as a hold on a unit nobody was looking at. The user
made a gesture, saw a card land in `Ready`, and learned nothing.

Requirement: a move that lands in `Ready` and would dispatch a run is refused
to the user's judgement first when the dependency gate holds the requirement.
The board states which requirements are in the way and why each one blocks, in
the gate's own words, and offers three ways forward: release anyway, be taken
to one of the blockers, or handle the chain first (SWR-3623). Cancelling and
dismissing both write nothing, so the card stays where it was.

The wait is also visible *before* the gesture completes: while a held card is
being dragged, the `Ready` column's own drop indicator names the dependencies
that are not delivered instead of the plain release consequence.

## Acceptance criteria

- A move landing in `Ready` that would start a run raises the prompt when, and
  only when, the dependency gate holds the requirement.
- The prompt names every requirement in the way and states why each one blocks,
  carried verbatim from the gate rather than worded by the board.
- The user may release anyway, and the release then proceeds unchanged.
- The user may be taken to a blocker: the board opens its column, scrolls to it
  and focuses its card, and nothing is moved.
- Cancelling — including by dismissing the prompt — writes nothing and leaves
  the card in the column it came from.
- While a held card is dragged, the `Ready` column states the unmet
  dependencies rather than the plain release consequence.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The gate is projected onto the board; each answer to the prompt does exactly one thing; the drag indicator names the dependencies | Board projection, board actions | `tests/unit/requirements/test_board_projection.py`, `apps/rotaris/tests/test_requirements_release_gate.py` |
| Integration | A drop on `Ready` for a held requirement reaches the prompt and not the transition port; releasing anyway reaches the port | View → controller → engine | `apps/rotaris/tests/test_requirements_release_gate.py` |
| User-flow E2E | A user drags a requirement whose dependency is not delivered to `Ready`, is told what is in the way, and is taken to the blocking requirement without anything moving | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_release_gate.py` |

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
