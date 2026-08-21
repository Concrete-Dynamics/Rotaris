---
req-id: SWR-3110
status: approved
trace: required
test: required
title: "Reverse relations are computed, never stored"
epic: SWR-3100
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3110 — Reverse relations are computed, never stored

If `supersedes` were written on one requirement and `superseded-by` on the
other, the two could disagree — and a requirement store with two contradictory
truths about the same fact is worse than one with none. ReqToCode already made
this choice for `derived-from`; the canonical model must generalise it.

Requirement: for every relation kind exactly one direction is authored in the
source and is the single source of truth. The opposite direction
(`superseded-by`, `derived requirements`, `children`, `blocks`) is computed on
load and is never written back to a source.

## Acceptance criteria

- Writing a requirement never emits a reverse relation field into the source.
- A source that nevertheless declares a reverse field has it ignored, with a
  warning naming the file.
- Computed reverse relations are complete: every forward edge yields exactly one
  reverse edge.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A store declaring `supersedes` yields the `superseded-by` edge; an authored reverse field is ignored with a warning | Reverse computation | `tests/unit/requirements/test_relations.py` |
| Integration | Write-back of an edited requirement emits no reverse relation field | Write-back + relations | `tests/integration/test_requirement_writeback.py` |
| User-flow E2E | `N/A — invariant; observable through SWR-3307's relation panel` | — | — |

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
