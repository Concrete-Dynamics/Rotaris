---
req-id: SWR-3623
status: approved
trace: required
test: required
title: "The board resolves the blocker chain and starts at its root"
epic: SWR-3600
depends-on: SWR-3510
date: 2026-08-21
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3623 — The board resolves the blocker chain and starts at its root

Telling a user that `SWR-2608` waits for `SWR-3101` is only half an answer when
`SWR-3101` itself waits for `SWR-3305`. Following the chain by hand means
opening each card, reading its `depends-on` and repeating — work the relation
graph can do exactly once and deterministically.

Requirement: when a release is held (SWR-3622), Rotaris resolves the whole
chain of unsatisfied `depends-on` ancestors, orders it so that nothing precedes
what it waits for, and offers to release its **root** — the requirement with
nothing of its own left to wait for. The root is named before it is released,
never after. Releasing it starts its run and leaves the requirement the user
dragged exactly where it was; when that requirement is no longer held, the
board says so.

A chain that has no root says so rather than inventing one. A dependency cycle
(SWR-3510) blocks every member and is stated as the loop a user has to break; a
`depends-on` whose target the requirement set does not contain (SWR-3109) is
named as unknown; a root that is already `Ready`, `Running`, `Review` or
`Blocked` is reported in its own state rather than being released a second
time.

## Acceptance criteria

- The chain is the transitive set of unsatisfied `depends-on` ancestors, in an
  order where nothing precedes what it waits for, and it is the same order on
  every read of the same project.
- The root is named in the control that releases it, before it is released.
- Releasing the root moves that requirement to `Ready` and starts its run; the
  requirement the user dragged is not moved.
- A cycle, an unknown target, or a root that cannot be released is stated, and
  no root is proposed.
- The user is told when the requirement they deferred is no longer held.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Chain resolution over a line, a diamond, a cycle, an unknown target and a root already in flight | Dependency gate | `tests/unit/requirements/test_dependencies.py` |
| Integration | Choosing "handle the blockers first" reaches the engine's flow seam with the root, not with the dragged requirement | Actions → controller → engine | `apps/rotaris/tests/test_requirements_release_gate.py` |
| User-flow E2E | A user drags a requirement two links below the root, chooses to handle the blockers first, and a run starts for the root while their card stays where it was | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_release_gate.py` |

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
