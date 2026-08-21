---
req-id: SWR-3501
status: approved
trace: required
test: required
title: "Requirement change detection across sources"
epic: SWR-3500
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3501 — Requirement change detection across sources

ReqToCode's `diff` (SWR-2332) already classifies requirement changes between two
git revisions of this repository's store. Requirement management needs the same
classification continuously, for every configured source — including sources
that are not files in this repository and have no git history of their own.

Requirement: change detection compares the current canonical requirement set
against the last evaluated one and classifies each difference as `added`,
`removed`, `modified` (content hash differs) or `status` (lifecycle changed,
hash unchanged), and additionally reports a modified requirement whose
implementation and test sites were not touched. Detection is source-agnostic and
uses `revision()` (SWR-3102) to decide whether a source needs re-reading at all.

## Acceptance criteria

- Every change class is produced for a file source and for a non-file source.
- A source whose revision is unchanged is not re-read and produces no changes.
- The first evaluation of a workspace reports no spurious changes.
- For the built-in source the classification agrees with `reqtocode diff` on the
  same content.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each class from crafted before/after sets; the unchanged-revision short-circuit; the first-run case | The classifier | `tests/unit/requirements/test_change_detection.py` |
| Integration | Editing, adding and deleting requirements in a synthetic store yields the expected classes; the built-in source agrees with `reqtocode diff` | Detection over the real store | `tests/integration/test_requirement_change.py` |
| User-flow E2E | `N/A — detection; its product flows are SWR-3502 and SWR-3503` | — | — |

Epic: [Requirement Change Propagation](../3500-requirement-change-propagation.md)
