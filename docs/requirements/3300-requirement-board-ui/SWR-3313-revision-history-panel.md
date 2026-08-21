---
req-id: SWR-3313
status: approved
trace: required
test: required
title: "Revision history panel"
epic: SWR-3300
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3313 — Revision history panel

The question "which version of this requirement did we actually build, and
when" is the one a classical tracker cannot answer. Having assembled the answer
(SWR-3214), the product has to show it.

Requirement: the detail view presents the requirement's revision history as an
ordered list: per revision the hash, the run that implemented it, the commit
that carries it and the delivery outcome, with the current revision marked. A
revision that was never delivered is listed as such. Runs and commits are
activatable.

## Acceptance criteria

- Revisions are ordered oldest to newest with the current one marked.
- An undelivered revision is listed with a stated outcome, not omitted.
- Activating a run reaches its session; activating a commit reaches the Git
  view.
- A repository without history states that source history is unavailable rather
  than showing an empty list.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Ordering, current marking, the undelivered case and the no-history state | History panel | `apps/rotaris/tests/test_requirements_detail.py` |
| Integration | History over a git fixture lists the real commits that touched the requirement's file | Assembler → panel | `apps/rotaris/tests/test_requirements_detail.py` |
| User-flow E2E | A user sees that revision B was delivered by run 88 and revision C is not yet built | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board.py` |

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
