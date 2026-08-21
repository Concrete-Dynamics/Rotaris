---
req-id: SWR-3614
status: approved
trace: required
test: required
title: "The board offers adoption and never performs it unasked"
epic: SWR-3600
date: 2026-08-15
source: docs/plans/2026-08-15-requirements-board-adoption.md
---

# SWR-3614 — The board offers adoption and never performs it unasked

Adoption (SWR-3217) writes a delivery record for potentially every requirement in
a project and runs the workspace's verification to do it. Both are things a user
must choose. A board that adopted on first open would be writing a thousand
records because somebody clicked a navigation entry, and SWR-3201's "nothing is
written until a state is first changed" would be true only in the letter.

This is the same principle SWR-3613 settled for derived requirements: what
Rotaris concludes is **offered**, and acceptance is what writes.

Requirement: where a workspace has never delivered anything and its repository
carries evidence, the board states the finding and offers the action.

- The offer names real numbers read from the projection — how many requirements
  carry an implementation trace, out of how many — never an estimate and never a
  bare invitation.
- It states what adoption will do before it starts: run the workspace's
  verification, and move only what passes.
- It offers the cheaper alternative beside it — grouping by health (SWR-3318)
  shows the same information immediately and writes nothing.
- It is dismissible, and dismissing it writes no delivery record either.
- The offer disappears once anything has been delivered or adopted, because the
  finding it reports is no longer true.
- While adoption runs, the board says so and stays usable; when it finishes it
  reports per requirement what was adopted and what was not, with the unmet
  condition named (SWR-3609).
- The action is attributed like every other board action (SWR-3610) and produces
  the ordinary audit records (SWR-3213).

## Acceptance criteria

- On a workspace with no delivery records and traced requirements, the offer
  appears and states the true counts.
- Nothing is written until the user accepts — not by rendering the offer, not by
  dismissing it, not by switching axes.
- Accepting reports per requirement, naming the unmet condition for each one it
  did not adopt.
- The offer is absent on a workspace that has already delivered or adopted.
- The board remains responsive while adoption runs.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The offer's counts, its absence once anything is delivered, and that rendering or dismissing writes nothing | Controller + board state | `apps/rotaris/tests/test_requirements_adoption.py` |
| Integration | Accepting runs the pass and reports per requirement; the board reflects the result | Controller → actions → engine | `apps/rotaris/tests/test_requirements_adoption.py` |
| User-flow E2E | A user opens Requirements on an existing codebase, accepts the offer, and the board stops being one column | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_adoption.py` |

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
