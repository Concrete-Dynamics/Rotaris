---
req-id: SWR-3108
status: approved
trace: required
test: required
title: "Requirement hierarchy of epics and children"
epic: SWR-3100
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3108 — Requirement hierarchy of epics and children

Requirements are not a flat list. This repository groups them under epics, and
other projects nest them further. The board (SWR-3308) and epic progress
(SWR-3212) both need the hierarchy as data.

Requirement: the canonical model expresses parent/child hierarchy of arbitrary
depth. A requirement names at most one parent; children are computed from the
parents, never stored twice. A requirement whose parent id does not resolve is
reported as a dangling parent and kept as a root, so an incomplete source still
loads.

## Acceptance criteria

- An epic with three children exposes exactly those children, in id order.
- A cycle in the parent chain is detected and reported rather than looping.
- A dangling parent is reported and the requirement remains reachable.
- Depth is not limited to two levels.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Three-level nesting resolves; a cycle and a dangling parent are both reported | Hierarchy resolution | `tests/unit/requirements/test_hierarchy.py` |
| Integration | Every epic of this repository's store reports exactly the requirements its folder declares | Hierarchy over the real store | `tests/integration/test_requirement_sources.py` |
| User-flow E2E | `N/A — model; its product flow is the epic card (SWR-3308)` | — | — |

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
