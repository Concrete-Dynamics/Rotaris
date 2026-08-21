---
req-id: SWR-3310
status: approved
trace: required
test: required
title: "Requirement-to-code-to-test graph"
epic: SWR-3300
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3310 — Requirement-to-code-to-test graph

For impact analysis, audits and large or legacy codebases the interesting
question is not "which column is this in" but "what hangs off this" — the epic
above it, the technical requirements derived from it, the modules that implement
it and the tests that verify it.

Requirement: the Requirements view offers a graph presentation of a requirement
and its neighbourhood: relations to other requirements, implementation sites and
covering tests, with each node carrying its health. The graph is navigable —
selecting a node re-centres it — and bounded, so a store of hundreds of
requirements is explored rather than rendered at once.

## Acceptance criteria

- The graph renders a requirement with its relations, implementations and tests
  from the projection alone.
- Node depth is bounded and the bound is stated, not silently truncating.
- Selecting a node re-centres and states what is now in view.
- The graph is reachable and operable by keyboard, with a textual alternative
  listing the same edges.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Graph assembly from a crafted projection, bounded depth, and the textual edge listing | Graph model | `apps/rotaris/tests/test_requirements_graph.py` |
| Integration | A graph over this repository's store expands a real epic to its children and their tests | Projection → graph | `apps/rotaris/tests/test_requirements_graph.py` |
| User-flow E2E | A user follows a requirement to the tests that verify it and back to its epic | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_graph.py` |

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
