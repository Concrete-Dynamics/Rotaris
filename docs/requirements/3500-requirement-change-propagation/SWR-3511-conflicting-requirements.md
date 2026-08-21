---
req-id: SWR-3511
status: approved
trace: required
test: required
title: "Conflicting requirements block instead of being resolved by an agent"
epic: SWR-3500
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3511 — Conflicting requirements block instead of being resolved by an agent

When two valid requirements contradict each other, choosing between them is a
product decision. An agent that picks one silently implements a decision nobody
made, and the losing requirement's tests will fail without anyone knowing why.

Requirement: a `conflicts-with` relation, whether declared in the source or
detected during analysis, blocks both requirements with the conflict stated: the
two ids, the contradicting statements, and the decision the user must take
(change one, deprecate one, or supersede one). No unit is scheduled for either
while the conflict stands.

## Acceptance criteria

- Both requirements block, not just the newer one.
- The blocker names both ids and the contradiction.
- Neither is scheduled while the conflict is open.
- Resolving the conflict in the source clears both blocks on the next
  evaluation.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Symmetric blocking, the scheduling hold, and the clear on resolution | The conflict rule | `tests/unit/requirements/test_conflicts.py` |
| Integration | Two conflicting requirements in a synthetic store block symmetrically and clear when one is deprecated | Relations + delivery store | `tests/integration/test_requirement_change.py` |
| User-flow E2E | A user with two contradicting requirements is asked to decide instead of getting one of them silently built | Public product boundary → user-observable result | `tests/integration/test_requirement_change.py` |

Epic: [Requirement Change Propagation](../3500-requirement-change-propagation.md)
