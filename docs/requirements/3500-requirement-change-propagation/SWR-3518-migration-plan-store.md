---
req-id: SWR-3518
status: approved
trace: required
test: required
type: technical
derived-from: SWR-3507
title: "A migration plan survives the read that produced it"
epic: SWR-3500
date: 2026-08-16
source: docs/plans/2026-08-16-requirements-migration.md
---

# SWR-3518 — A migration plan survives the read that produced it

SWR-3507 says the worklist "is presented before execution". Presented to a person
means: produced by one read, looked at, and acted on afterwards — possibly in
another process, certainly after a pause. Nothing in the epic carried it that far.

A board read plans a migration and files an `AnalysisRecord` (SWR-3514), which
flattens the worklist into one prose line per row. Nothing reads it back. So
`plan.digest` — the value an approval signs, and the value
`ApprovedMigration` re-checks to refuse a plan that changed underneath — cannot be
re-derived once the read that produced it has ended. Re-planning instead is both a
model call and a different answer, which would make the user's own approval
invalid.

Derived from: [SWR-3507](SWR-3507-superseding-migration.md)

Requirement: the planned worklist is retained until it is approved or superseded
by a newer plan.

- The plan is stored per requirement, whole, so an approval in a later process
  binds to the same digest the reader saw.
- The audit record stays what it is. The record says what was concluded and when;
  the store holds work awaiting a decision. They are different questions, and the
  pass's existing digest de-duplication keeps them in step.
- Requirement text is never stored — the plan carries site addresses, actions and
  the analyst's argument about them, not the requirements themselves.
- Reading never fails a board. An unreadable plan is a requirement with nothing
  pending, not a workspace that cannot be opened.

## Acceptance criteria

- A plan written by one process is loaded, digest-identical, by another.
- Approving a plan whose sites have moved since it was planned is refused, naming
  the drift rather than migrating against a stale worklist.
- The persisted plan contains no requirement title or description.
- An unreadable or absent plan file yields "nothing pending", never an error.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Round-trip, the stale-digest refusal, the content guard, and the corrupt-file degradation | The plan store | `tests/unit/requirements/test_migration_plan_store.py` |
| Integration | A plan raised by one evaluation is approved by a later one over the same workspace | The propagation pass + the store | `tests/integration/test_requirement_superseding.py` |
| User-flow E2E | N/A — a technical requirement; its product flow is SWR-3507's migration | — | — |

Epic: [Requirement Change Propagation](../3500-requirement-change-propagation.md)
