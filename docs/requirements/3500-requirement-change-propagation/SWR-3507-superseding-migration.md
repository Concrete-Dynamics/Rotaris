---
req-id: SWR-3507
status: approved
trace: required
test: required
title: "Superseding produces a migration worklist"
epic: SWR-3500
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3507 — Superseding produces a migration worklist

Marking a requirement as superseded is bookkeeping. The work is in what its
implementation and tests must now become: some of it is obsolete, some belongs
to the new requirement, some has to be migrated, some has to be re-pointed at
the new id. Leaving that implicit is how superseded code becomes dead code the
verifier still counts as traced.

Requirement: when a requirement declares `supersedes`, Rotaris analyses the
superseded requirements' implementation traces and covering tests and produces a
migration worklist assigning each site one of `remove`, `adapt`, `keep`,
`migrate` or `re-point`. The worklist is presented before execution, becomes the
scope of the execution units that carry the migration, and is part of the agent
context (SWR-3407).

## Acceptance criteria

- Every trace and test of every superseded requirement appears exactly once in
  the worklist with an assigned action.
- A site the analysis cannot classify is listed as needing a decision, not
  defaulted to `keep`.
- The worklist is inspectable before any code changes.
- Executing the worklist leaves no `@traces` pointing at a removed requirement.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Worklist completeness over crafted sites, the undecidable case, and the action vocabulary | The migration worklist | `tests/unit/requirements/test_superseding.py` |
| Integration | A superseding requirement over a synthetic store produces a worklist covering every trace of the old ids | Relations + coverage query | `tests/integration/test_requirement_superseding.py` |
| User-flow E2E | A user replaces an old requirement and sees exactly what will happen to its existing code before it happens | Public product boundary → user-observable result | `tests/integration/test_requirement_superseding.py` |

Derived requirements:
[SWR-3517](SWR-3517-one-annotation-grammar.md) — one reader of the annotation
grammar, so the rewriter and the sweep cannot disagree;
[SWR-3518](SWR-3518-migration-plan-store.md) — the planned worklist survives
the read that produced it, so an approval binds to what was shown.

Epic: [Requirement Change Propagation](../3500-requirement-change-propagation.md)
