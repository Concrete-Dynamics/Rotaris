---
req-id: SWR-3622
status: approved
trace: required
test: required
title: "A released requirement runs as an interactive session"
epic: SWR-3600
date: 2026-08-21
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3622 — A released requirement runs as an interactive session

SWR-3612 said a requirement run is a Rotaris run and pointed the board at the
surfaces that already own one. It is half true: the session exists, it is filed
in the workspace and it carries its requirement, so it can be *read*. It cannot
be *taken part in*. The host runs the agent itself and registers no handle with
the run coordinator, so pausing, steering, stopping and answering a run are all
inert for exactly the runs a user most wants to reach — the ones working
unattended on their behalf. A run nobody can stop is also a run that ends only
by finishing or by the application dying, which is how a requirement's work
comes back as `interrupted` hours later.

Requirement: a unit run started from the board is driven by the same run
coordinator a user's own session is. It has a live handle from the moment it
starts, so the session controls act on it, an approval or a question reaches a
person, and closing the application cancels it rather than abandoning it. The
run's session id reaches the requirement's run record while the run is still in
flight, so the board can open the session it started at the time that matters.

## Acceptance criteria

- A released unit's run holds a live coordinator handle, so the workspace's stop,
  pause and steer controls act on it.
- The run adopts the worktree the seam already provisioned; it never creates a
  second one.
- The run's session id is on the requirement's run record while the run is
  running, and survives a restart.
- Closing the application cancels a released run rather than leaving it in
  flight.
- A composition without a coordinator — the headless CLI, a test with an injected
  agent — still runs the unit and reports it, unchanged.

## Test coverage

Unit tests cover the adoption of the seam's worktree, the fallback for a
composition with no coordinator, and the session id reaching the run record
mid-run. Integration tests queue a prompt into a released run, pause it and stop
it through the coordinator, and close the application on one to see it cancelled
rather than abandoned. The originating product flow is a user releasing a
requirement and taking part in the work it started (SWR-3413, SWR-3612).

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
