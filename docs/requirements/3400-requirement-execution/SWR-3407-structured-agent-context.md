---
req-id: SWR-3407
status: approved
trace: required
test: required
title: "Requirement agents receive a structured context"
epic: SWR-3400
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3407 — Requirement agents receive a structured context

An agent asked to "implement SWR-4102" with only the requirement text will
re-discover the existing implementation, miss the covering tests, and ignore the
relations that constrain it. Everything it needs is already computed.

Requirement: an execution unit's agent receives a structured context containing
the requirement snapshot, its relations, its current implementation traces, its
current covering tests, the ReqToCode findings for it, the relevant architecture
context, the unit's scope, the base revision, the worktree information and the
acceptance conditions it will be judged against. For a changed requirement the
context additionally carries the old version, the new version, the requirement
diff, and the affected traces and tests. For a superseding requirement it
carries the superseded requirements, their existing traces, and the migration
obligations of SWR-3507.

## Acceptance criteria

- Each listed element is present or explicitly stated as absent; none is
  silently omitted.
- The context is assembled from the projection and the snapshot, not from a
  fresh unconstrained repository scan.
- Context assembly is deterministic for a given snapshot.
- The acceptance conditions handed to the agent are the ones SWR-3408 evaluates.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Context assembly for the plain, changed and superseding cases, including explicit absences | The context builder | `tests/unit/requirements/test_agent_context.py` |
| Integration | A context built over this repository's store carries the real traces and tests of a known requirement | Builder over the real store | `tests/integration/test_requirement_execution.py` |
| User-flow E2E | `N/A — agent input; its product flow is the unit run itself (SWR-3413)` | — | — |

Epic: [Requirement Execution](../3400-requirement-execution.md)
