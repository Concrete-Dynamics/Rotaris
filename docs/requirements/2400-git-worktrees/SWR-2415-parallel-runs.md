---
req-id: SWR-2415
status: approved
trace: required
test: required
title: "Multiple parallel runs on isolated worktrees"
epic: SWR-2400
date: 2026-07-25
---

# SWR-2415 — Multiple parallel runs on isolated worktrees

The user may start a new run while one or more runs are already active, and may
switch focus between any active or completed run to view its transcript, interact
with it, and control it independently. Every concurrently running session must
operate in its own isolated git worktree, so that no two runs share filesystem
state. Starting, stopping, or completing one run must not affect any other
running session. Runs that complete normally leave their worktrees intact for
later review and merge. No artificial limit is placed on the number of parallel
runs; the practical bound is the host machine's resources.

## Scope

- **In scope**: Launching multiple concurrent runs from the Rotaris desktop
  interface. Switching focus between active and completed runs (transcript view,
  controls, status). Dashboard and session list reflecting every run's live
  status and worktree association. Enforced worktree isolation for any run
  started while another run is active. Graceful shutdown of all runs on app
  quit.
- **Out of scope**: CLI parallel-run support. Per-agent worktree isolation
  within a single session. Automatic resource throttling or load shedding.
  Auto-resuming multiple active runs after an app restart. Merging parallel-run
  results (covered by SWR-2413). Cross-run communication between agents.

## Acceptance criteria

**Launch & isolation**

- **AC-001**: When a run is active, the launch control remains available.
  Starting a second run does not block, cancel, or pause the first.
- **AC-002**: The first run in a session may use the main working tree. Any run
  started while another run is already active must be placed in its own git
  worktree. The system enforces this automatically — the user is not required to
  remember to enable isolation.
- **AC-003**: Two concurrent runs never share a worktree or the main working
  tree. An agent in one run cannot see or modify files created by an agent in
  another concurrent run.
- **AC-004**: If worktree creation fails for a new parallel run (branch name
  collision, non-git workspace, filesystem error), a clear, user-readable error
  is surfaced and only that run fails to start — already-running sessions are
  unaffected.
- **AC-005**: If an auto-generated branch name collides with an existing branch
  or worktree, a unique alternative is produced and the resolved name is shown
  to the user before the run begins.

**Focus switching**

- **AC-006**: When multiple runs exist (active or completed), the user may bring
  any run into focus. Bringing a run into focus displays that run's transcript,
  shows run controls that reflect that run's current state, and updates the
  status area to show that run's worktree branch.
- **AC-007**: Switching focus away from a running session does not pause,
  cancel, or otherwise affect it — the run continues uninterrupted.
- **AC-008**: The session list or run-switcher distinguishes the currently
  focused run visually from other active and completed runs.
- **AC-009**: If the user brings a just-launched run into focus before its first
  agent has begun work, the interface shows a transitional loading state rather
  than appearing empty or broken.
- **AC-010**: When a run that is not currently focused completes, a
  non-blocking notification appears and the run's status updates in the session
  list without disrupting the view of the focused run.

**Independence & lifecycle**

- **AC-011**: Stopping or cancelling one run does not affect any other running
  session.
- **AC-012**: Session snapshots and diagnostic data for every parallel run are
  stored under the main workspace, never inside a worktree directory.
- **AC-013**: When all parallel runs complete, every worktree persists. Each
  completed session remains eligible for the worktree-acceptance workflow
  (SWR-2413).

**App quit with multiple active runs**

- **AC-014**: When the user closes the application while multiple runs are
  active, the confirmation dialog states how many runs will be stopped. On
  confirmation, all active runs are shut down — not just the focused one.

**Status & display**

- **AC-015**: The dashboard and session list show every active run with its
  current status and worktree branch name.
- **AC-016**: The status area shows the worktree branch of the currently focused
  session. When the focused session is the first (or only) run on the main
  working tree, the main branch name is shown.

**Runtime prompts across parallel runs**

- **AC-017**: A message queued while one session is focused belongs to that
  session. Only that session's run may consume it, and it is listed, edited, or
  deleted only while its owning session is focused. A concurrent run never
  picks up another run's queued message.

## Test portfolio

| Level         | Productive scenario                                                                                                                                                                          | Exercised boundary                                               | Planned/covering test                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| Unit          | A second run is started while one is active; each run receives its own handle and a mandatory distinct worktree, and controls reach only the focused run.                                     | Run lifecycle management with multiple concurrent sessions       | `apps/rotaris/tests/test_run_coordinator.py`       |
| Unit          | A user queues a message for one run while another runs concurrently; only the owning run may see or consume it.                                                                              | Queued-prompt session ownership in the shared prompt registry    | `tests/unit/test_queued_prompt_session_scope.py`   |
| Integration   | Two concurrent sessions are launched on a real repository; the second branch name collides and a deterministic alternative worktree is produced.                                              | Real git worktrees and session persistence                       | `tests/integration/test_parallel_worktree_runs.py` |
| User-flow E2E | User starts run A, starts run B, switches focus to A and views its transcript, switches to B and stops it — A continues unaffected. App quit with two active runs warns and shuts down both. | Full Rotaris UI: launch, focus, control, quit with multiple runs | `apps/rotaris/tests/test_parallel_runs_e2e.py`     |

## Known limitations

- **App restart does not auto-resume parallel runs.** If the application exits
  while multiple runs are active, their session snapshots are persisted, but on
  relaunch the user must manually resume each one. Automatic batch-resume is a
  potential future enhancement.

## Relationship to other requirements

- **Requires**: SWR-2401 (worktree isolation), SWR-2404 (isolation toggle —
  mandatory when another run is active), SWR-2405 (session association in Git
  view)
- **Compatible with**: SWR-2413 (accept worktree changes) — parallel runs produce
  independent worktrees that can be merged independently or together; SWR-2414
  (background improvement analysis) — each completed run triggers its own
  analysis independently
- **Extends**: SWR-1023 (multiple sessions) — lifts the implicit
  single-active-run constraint in the desktop interface and adds focus-switching

Derived requirements: [SWR-2434 — Session-scoped run routing](SWR-2434-session-scoped-run-routing.md)

Epic: [Git Worktree Isolation](../2400-git-worktrees.md)
