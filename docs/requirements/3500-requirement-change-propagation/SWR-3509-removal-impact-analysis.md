---
req-id: SWR-3509
status: approved
trace: required
test: required
title: "Removing a requirement analyses what it leaves behind"
epic: SWR-3500
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3509 — Removing a requirement analyses what it leaves behind

A requirement that disappears takes nothing with it: its code still runs, its
tests still pass, its technical requirements still point at it, and other
requirements may still depend on it. This repository's orphan-code enforcement
(SWR-2333) already surfaces one part of that; requirement management needs the
whole picture.

Requirement: a requirement that disappears from its source is tombstoned
(SWR-3113) and triggers an impact analysis over its code traces, test traces,
derived technical requirements, dependent requirements and superseding
relations. The analysis produces a worklist in the vocabulary of SWR-3507, and
the requirement's dependents are reported as newly dangling rather than silently
unblocked.

## Acceptance criteria

- Every trace, test, derived requirement and dependent of the removed id is
  named.
- Dependents are reported as dangling, not treated as satisfied.
- Nothing is deleted automatically as a consequence of the removal.
- The analysis result is retained under the tombstone.

## Notes

The analysis is **read-only by construction**, and that is worth stating because
it was once grouped with the requirements that write into a user's source. All
four criteria above are name / report / retain / delete nothing. `RemovalAnalyzer`
holds an analyst and a clock — no source, no store, no path, no trace editor —
so there is nothing in it that could remove anything, and without an analyst
every site comes back `decision-required`, which means a removal cannot even
*express* "delete this" until a person or a model says so.

Two things this needs that neither it nor SWR-3113 named:

- Detection across a process (SWR-3119). Before it, the first refresh of every
  process compared against nothing, so a removal was undetectable outside a
  single sitting — which is why this requirement had no production path rather
  than merely lacking a caller.
- The sites of an id no requirement declares. The board's swept coverage is keyed
  by the requirements the store *currently* holds, and a removed id is by
  definition not among them; asking it would name nothing and meet the first
  criterion vacuously. `coverage_map` answers because it keys by number and
  deliberately includes numbers that code references and nothing declares — the
  same set SWR-2333's orphan rule surfaces from the other side.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Enumeration over crafted relations and sites, and the dangling-dependent report | The removal analysis | `tests/unit/requirements/test_removal_impact.py` |
| Integration | Deleting a requirement file in a synthetic store names its traces, tests and dependents | Detection + coverage query + relations | `tests/integration/test_requirement_removal.py` |
| User-flow E2E | A user deletes a requirement and is shown the code and tests now unaccounted for | Public product boundary → user-observable result | `tests/integration/test_requirement_removal.py` |

Epic: [Requirement Change Propagation](../3500-requirement-change-propagation.md)
