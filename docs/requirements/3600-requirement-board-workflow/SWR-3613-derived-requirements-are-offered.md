---
req-id: SWR-3613
status: approved
trace: required
test: required
title: "A derived technical requirement is offered, never written silently"
epic: SWR-3600
date: 2026-08-15
source: docs/plans/2026-08-15-requirements-board-finalization.md
---

# SWR-3613 — A derived technical requirement is offered, never written silently

SWR-3411 says an execution run may propose a technical requirement, and that
"Rotaris states the difference where the proposal is presented: a unit is a work
split and disappears; a technical requirement is permanent". Its own portfolio
promises a user who **is offered** a derived technical requirement after a run
and whose **acceptance** updates the project's store.

Neither exists. The engine's derivation is complete — it proposes, validates the
draft against the store's own rule, writes through the source write path
(SWR-3112) and confirms the reciprocal link — but the desktop calls it at the
end of a run and sends the result to `logging.info`. Nothing reaches a user.
There is no surface where a proposal is *presented*, so the sentence SWR-3411
asks for is never said, and the only two outcomes a workspace can have are "a
requirement was created without anyone being asked" or, with
`confirm_source_writes` on, "a requirement nobody ever hears about was not
created".

Requirement: a technical requirement a run proposes is **offered** to the
reviewer and **never written without their acceptance**.

- A finished run's proposals are carried on the review of the requirement they
  came from, as an element of that surface alongside the claim and the
  measurement (SWR-3603). It states the proposed title, its origin, and — in
  words — the difference SWR-3411 asks for: a unit is a work split and
  disappears, a technical requirement is permanent and joins the project's own
  store.
- The reviewer accepts one proposal at a time, through the review's own decision
  set (SWR-3604), and the acceptance is what triggers the write. It goes through
  the board's single write path, so it is attributed and recorded like every
  other board action (SWR-3609, SWR-3610).
- Declining is doing nothing: a proposal nobody accepts is never written, and a
  run is never failed by that.
- Because the offer exists, this path no longer consults
  `requirements.human_in_the_loop.confirm_source_writes`. That flag's own
  justification is that the write is already a user action, which becomes true
  here only once there is something to accept; it keeps its meaning for every
  other write into a requirement source.
- A refusal — a read-only source, a draft the store rejects — comes back as the
  engine's own sentence on the review, and leaves the requirement where it was.

## Acceptance criteria

- After a run that proposed one, the requirement's review presents the proposal
  with its origin and the permanence sentence, and states plainly when a run
  proposed nothing.
- Accepting a proposal creates the technical requirement in the project's own
  store, with `type: technical` and `derived-from` naming its origin.
- Nothing is written until a reviewer accepts, whatever
  `confirm_source_writes` says.
- A refused write states the source's own reason on the review and changes no
  requirement.
- The acceptance is one of the board's named actions, so it carries a
  consequence, an attribution and an audit record.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The proposal element states origin and permanence, and the decision is refused while there is nothing to accept | Review surface + `BoardAction` | `apps/rotaris/tests/test_requirements_review.py` |
| Integration | Accepting reaches the source write path and records the action; declining writes nothing | Review → `RequirementActions` → write-back | `apps/rotaris/tests/test_requirements_review.py` |
| User-flow E2E | A user is offered a derived technical requirement after a run and accepting it updates the project's store | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_review.py` |

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
