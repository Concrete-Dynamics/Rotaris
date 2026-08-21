---
req-id: SWR-3217
status: approved
trace: required
test: required
title: "Existing work is adopted after verification, never asserted"
epic: SWR-3200
date: 2026-08-15
source: docs/plans/2026-08-15-requirements-board-adoption.md
---

# SWR-3217 — Existing work is adopted after verification, never asserted

Every project that adopts Rotaris already has requirements whose code is written,
annotated and green. SWR-3201 says such a requirement is `Backlog` without a
write, and that is correct — Rotaris' delivery axis records what *Rotaris'
delivery* did, and it did nothing. But SWR-3302 promises a user who opens
Requirements and sees their project distributed over the delivery columns, and on
a repository of a thousand hand-built requirements those two cannot both hold.

The way out is not to guess a state from a status flag. It is the one SWR-3504
already sanctions for a reworded requirement: **verify the implementation that is
already there.** A requirement whose completion conditions genuinely hold at the
current commit has earned `Done` — the only thing missing was a run willing to
check.

Requirement: a user may ask Rotaris to adopt the work already in the repository.
Adoption runs the workspace's verification, and a requirement enters `Done` only
when the completion conditions of SWR-3215 hold against the evidence that run
produced.

- Adoption is **never** automatic and never a consequence of opening a workspace
  or of a board read. It is an action a user takes (SWR-3614), and until they
  take it nothing is written (SWR-3201).
- The gate is SWR-3215's, unmodified. Adoption does not relax a condition, does
  not supply its own weaker check, and does not exempt itself: a requirement with
  no implementation trace, or whose covering tests did not run or did not pass,
  is **not** adopted and stays where it was.
- What adoption records is a real delivery (SWR-3204): the verification run that
  confirmed it, the commit it ran against, and the requirement's current hash as
  the satisfied one. That is what makes a later edit surface as `Needs Update`
  (SWR-3502) instead of vanishing.
- The delivery names its origin (SWR-3219), so a card never implies an
  implementing run that did not happen.
- `deprecated` requirements are excluded: the project retired them, which is not
  the same as having finished them.
- Adoption reports **per requirement** what it adopted and what it did not, with
  the unmet condition named — the same obligation SWR-3609 places on every bulk
  action.
- An adoption is reversible per requirement. What Rotaris itself delivered is
  not: reverting is offered only where the recorded delivery is an adopted one.

## Acceptance criteria

- Opening a workspace, reading the board and evaluating it write no delivery
  record; only an adoption a user asked for does.
- A requirement whose covering tests did not execute is refused with
  `covering-tests-passed` named, and stays in its previous state.
- An adopted requirement carries a satisfied hash equal to its current hash, and
  editing its text afterwards moves it to `Needs Update`.
- A requirement a user has already moved is left untouched by adoption.
- Reverting an adoption returns the requirement to `Backlog`; the same action is
  refused for a requirement delivered by a Rotaris run.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The candidate rules, the per-requirement report, and the exclusion of deprecated and already-moved requirements | The adoption pass | `tests/unit/requirements/test_requirement_adoption.py` |
| Integration | An adoption over a synthetic store adopts only what verification supports, and a later edit moves an adopted requirement to Needs Update | Adoption + delivery store + change propagation | `tests/integration/test_requirement_adoption.py` |
| User-flow E2E | A user adopts an existing codebase and the board stops being one Backlog column | Public product boundary → user-observable result | `tests/integration/test_requirement_adoption.py` |

Derived requirements: [SWR-3218 — The adoption pass](SWR-3218-adoption-pass.md)

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
