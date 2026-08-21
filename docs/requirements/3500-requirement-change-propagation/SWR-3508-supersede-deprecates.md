---
req-id: SWR-3508
status: approved
trace: required
test: required
title: "A superseded requirement is deprecated, never deleted"
epic: SWR-3500
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3508 — A superseded requirement is deprecated, never deleted

Deleting the requirement that a code trace still points at breaks the trace and
loses the history of why the code exists. The lifecycle already has the right
state for this, and ids must remain stable forever.

Requirement: completing a superseding migration sets the superseded
requirements' lifecycle to `deprecated` through the source write path
(SWR-3111), leaving their ids, history and delivery records intact. The reverse
relation `superseded-by` is computed (SWR-3110). A superseded requirement is
excluded from scheduling and from epic progress, and stated as superseded in the
UI rather than hidden.

## Acceptance criteria

- Superseding never removes a requirement or its id.
- The lifecycle change is written to the source, once, and only after the
  migration completed.
- Superseded requirements are excluded from scheduling and progress and are
  still reachable.
- A read-only source yields a stated manual step instead of a silent skip.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Deprecation after migration only, exclusion from scheduling and progress, and the read-only path | The superseding completion | `tests/unit/requirements/test_superseding.py` |
| Integration | A completed migration deprecates the old requirement in a synthetic store and keeps its history | Write path + delivery store | `tests/integration/test_requirement_superseding.py` |
| User-flow E2E | A user's replaced requirement remains visible as superseded with its history intact | Public product boundary → user-observable result | `tests/integration/test_requirement_superseding.py` |

Epic: [Requirement Change Propagation](../3500-requirement-change-propagation.md)
