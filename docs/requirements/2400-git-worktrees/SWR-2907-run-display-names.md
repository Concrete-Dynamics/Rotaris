---
req-id: SWR-2907
status: approved
trace: required
test: required
title: "Human-readable run display names"
epic: SWR-2400
date: 2026-08-10
---

# SWR-2907 — Human-readable run display names

Wherever Rotaris lists runs (the workspace sidebar's active-run switcher and the
dashboard session list), each run's primary label must be a short human-readable
wording of what the session does — derived from the task the user submitted —
not the machine session id. The session id remains discoverable as secondary
detail for support and cross-referencing, but it is never the main visual
identifier of a run.

## Acceptance criteria

- **AC-001**: A run row's primary label is a compact single-line title derived
  from the run's most recent top-level task, using the same compaction rule as
  agent-facing task display names (whitespace collapsed, ellipsized past the
  length budget).
- **AC-002**: The label is human-readable from the moment the run appears: a
  just-launched run is labeled from its submitted prompt, before any snapshot
  exists on disk.
- **AC-003**: Sessions listed from disk (after an app restart or a background
  refresh) obtain their label from session metadata alone, without loading the
  full session snapshot.
- **AC-004**: The session id stays reachable on every run row — via tooltip
  and accessible description — so a run can still be matched to its session
  directory and worktree branch.
- **AC-005**: A session with no recorded task (pre-upgrade session directories,
  metadata written before this requirement) falls back to showing its session
  id; the row never renders blank.

## Test portfolio

| Level         | Productive scenario                                                                                                                       | Exercised boundary                                       | Planned/covering test                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| Unit          | A snapshot with a todo state is saved; its metadata carries the latest top-level task's title, and title-less metadata defaults cleanly.   | Session metadata write/read (`metadata.json`)            | `tests/unit/test_session_persister.py`             |
| Unit          | The desktop session list maps metadata titles to row names, falls back to the session id, and labels a starting run from its prompt.       | Desktop store projection of persisted + starting runs    | `apps/rotaris/tests/test_session_refresh.py`, `apps/rotaris/tests/test_run_coordinator.py` |
| Integration   | A session is saved and re-listed through the session manager; the listed entry exposes the task title without loading the snapshot.        | Real session persistence round-trip                      | `tests/unit/test_session_manager.py`               |
| User-flow E2E | User starts a run from the workspace composer; the sidebar's active-run row reads as a short wording of the prompt, with the id in tooltip. | Full Rotaris UI: composer → run launch → sidebar row     | `apps/rotaris/tests/test_parallel_runs_e2e.py`     |

## Relationship to other requirements

- **Extends**: SWR-2415 (parallel-run switcher) — the rows it mandates gain a
  human-readable primary label; SWR-1023 (multiple sessions) — session listings
  carry a task-derived title.

Epic: [Git Worktree Isolation](../2400-git-worktrees.md)
