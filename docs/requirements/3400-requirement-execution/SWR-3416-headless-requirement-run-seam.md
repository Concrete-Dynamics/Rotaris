---
req-id: SWR-3416
status: approved
trace: required
test: required
title: "Requirement runs are launchable without the desktop"
type: technical
derived-from: SWR-3413
epic: SWR-3400
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3416 — Requirement runs are launchable without the desktop

Run launching lives in the desktop app's `RunCoordinator` today, which is the
right place for a user-initiated run and the wrong place for a scheduler that
must work in a headless run, in CI, and under test. Building requirement
execution on the Qt object would make the engine untestable without a display
and would put the desktop app in the dependency path of the CLI.

Requirement: requirement execution reaches the run machinery through an engine
seam in `rotaris_core` that starts a run for an execution unit with a given
isolation request and reports its lifecycle, with no Qt dependency. The desktop
coordinator becomes one consumer of that seam; the headless CLI and the tests
are others.

## Test coverage

Unit tests drive the seam with a fake run host, asserting the isolation request,
the lifecycle events and the failure path. An integration test starts a
requirement unit run headlessly, without importing `rotaris`, and asserts the
worktree and terminal state. The originating product flow enabled by
`derived-from` is the Ready-to-Review flow (SWR-3413).

Derived from: [SWR-3413 — Ready starts the agentic requirement flow](SWR-3413-ready-starts-the-flow.md)

Epic: [Requirement Execution](../3400-requirement-execution.md)
