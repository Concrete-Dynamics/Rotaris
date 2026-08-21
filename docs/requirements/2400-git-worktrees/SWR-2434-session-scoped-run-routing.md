---
req-id: SWR-2434
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2415
title: "Session-scoped run routing for parallel Rotaris runs"
epic: SWR-2400
date: 2026-08-03
---

# SWR-2434 — Session-scoped run routing for parallel Rotaris runs

Parallel runs (SWR-2415) let more than one session execute at once inside a
single Rotaris workspace. The desktop previously owned exactly one run bridge,
one refresh cycle, one projection target, and one global queued-prompt list —
every one of those is single-run state that two concurrent runs would corrupt.
This layer introduces the routing substrate the parallel-run behavior builds on;
it carries no product behavior of its own.

The layer comprises:

- **`RunCoordinator`** — owns one run handle per session id, launches, resumes,
  and focuses handles, re-emits every run lifecycle signal with its originating
  session id, aggregates background-analysis activity across handles, and
  requests shutdown on every handle before joining any worker.
- **Per-handle run isolation in `RunBridge`** — each handle keeps its own
  worker, thread, refresh generation, queued-prompt scope, improvement jobs, and
  an immutable run-configuration snapshot captured at launch, so a restart or a
  settings change in one run cannot reach another.
- **Focused-only projection** — only the focused handle applies a full
  `SessionProjection` to the store; unfocused handles publish a session summary
  (status and worktree branch) used to keep session lists live.
- **Queued-prompt session ownership** — `QueuedPrompt` records carry the session
  that owns them, the registry can be read filtered by session, and a run loop
  may be scoped so it only triggers prompts owned by its own session. Unscoped
  submission keeps its existing whole-registry behavior for the TUI and headless
  CLI.
- **Collision-safe session worktree creation** — a requested or generated branch
  that already exists as a branch or worktree yields deterministic `-2`, `-3`, …
  alternatives; unrelated Git or filesystem failures are never retried.

## Acceptance criteria

- Run handles are addressable by session id; commands issued for the focused
  session never reach another handle.
- Every run lifecycle signal identifies its session.
- A handle whose session is not focused never writes the focused session's
  transcript, agents, todos, or KPIs into the store.
- Reading queued prompts filtered by session returns only prompts owned by that
  session; reading unfiltered returns every prompt.
- Collision-safe worktree creation returns the final resolved branch and raises
  unrelated Git errors unchanged.

## Test portfolio

| Level       | Productive scenario                                                                                        | Exercised boundary                              | Planned/covering test                              |
| ----------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| Unit        | Two handles run at once; focus routing, forced isolation, and shutdown-then-join ordering hold.            | `RunCoordinator` over fake run handles          | `apps/rotaris/tests/test_run_coordinator.py`       |
| Unit        | Prompts queued by one session are invisible to another session's filtered read.                            | `PromptRegistry` / `PromptSubmissionAPI`        | `tests/unit/test_queued_prompt_session_scope.py`   |
| Integration | A second session requests a branch that already exists and receives a deterministic alternative worktree.  | `GitWorktreeService` on a real Git repository   | `tests/integration/test_parallel_worktree_runs.py` |

Derived from: [SWR-2415 — Multiple parallel runs on isolated worktrees](SWR-2415-parallel-runs.md)

Epic: [Git Worktree Isolation](../2400-git-worktrees.md)
