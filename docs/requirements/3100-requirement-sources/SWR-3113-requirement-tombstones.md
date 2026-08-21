---
req-id: SWR-3113
status: approved
trace: required
test: required
title: "Removed requirements leave a tombstone"
epic: SWR-3100
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3113 — Removed requirements leave a tombstone

An id that has ever meant something must never mean something else. When a
requirement disappears from its source, Rotaris still holds delivery state, run
history and evidence for it, and a later re-use of the id would silently
re-attach that history to an unrelated requirement.

Requirement: a requirement present in a previous read and absent from the
current one becomes a tombstone — id, last known title, source, and removal
timestamp — retained in the requirement index. A tombstoned id is never issued
by creation (SWR-3112), its delivery state and history remain queryable, and its
disappearance triggers the removal impact analysis of SWR-3509. For the built-in
source the tombstone is written into the store's retired-ids log (SWR-2318) so
the project keeps the record, not only Rotaris.

## Acceptance criteria

- Removing a requirement from the source yields a tombstone, not a vanished id.
- A tombstoned id is refused for creation.
- The requirement's runs, hashes and evidence stay retrievable after removal.
- A tombstone reappearing in the source (restored file) resolves back to a live
  requirement without losing its history.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Removal produces a tombstone; creation refuses the id; restoration re-links the history | The tombstone index | `tests/unit/requirements/test_tombstones.py` |
| Integration | Deleting a requirement file from a synthetic store tombstones the id and preserves its delivery record | Registry + delivery store | `tests/integration/test_requirement_removal.py` |
| User-flow E2E | `N/A — its user-visible half is the removal impact report (SWR-3509)` | — | — |

Derived requirements: [SWR-3119](SWR-3119-registry-memory.md) — what a refresh
compares against has to survive the process that produced it.

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
