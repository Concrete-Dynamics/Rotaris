---
req-id:
  [
    SWR-2400,
    SWR-2401,
    SWR-2402,
    SWR-2403,
    SWR-2404,
    SWR-2405,
    SWR-2406,
    SWR-2407,
    SWR-2408,
    SWR-2409,
    SWR-2410,
    SWR-2411,
    SWR-2412,
    SWR-2413,
  ]
status: approved
trace: required
test: required
title: "Git Worktree Isolation"
---

# 2400-git-worktrees spec

## SWR-2400 — Git Worktree Isolation

trace: optional
test: optional

Running agents in isolated git worktrees.

### Requirements

SWR-2401–SWR-2413 are specified in this file. The requirements below have their
own files in `2400-git-worktrees/`:

| ID | Title | Priority | Status |
| --- | --- | --- | --- |
| [SWR-2415](2400-git-worktrees/SWR-2415-parallel-runs.md) | Multiple parallel runs on isolated worktrees | — | approved |
| [SWR-2434](2400-git-worktrees/SWR-2434-session-scoped-run-routing.md) | Session-scoped run routing for parallel Rotaris runs | — | approved |
| [SWR-2436](2400-git-worktrees/SWR-2436-iteration-checkpoints.md) | Automatic per-iteration git checkpoints | P1 | approved |
| [SWR-2437](2400-git-worktrees/SWR-2437-checkpoint-rollback.md) | Checkpoint rollback | P1 | approved |
| [SWR-2817](2400-git-worktrees/SWR-2817-stale-run-status-recovery.md) | Stale run status detection and repair | — | approved |
| [SWR-2907](2400-git-worktrees/SWR-2907-run-display-names.md) | Human-readable run display names | — | approved |

## SWR-2401 — Agent file isolation\*\*: When a session is launched with worktree isolation, all agent file operations (read, write, edit, terminal commands, workspace-bound tools) must operate within the dedicated worktree directory. The main working tree must not be affected. Session metadata (snapshots, diagnostics, `.rotaris/`) must remain on the main workspace.

legacy-id: REQ-20260713-001
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-git-worktree-isolation.md
priority: High

## SWR-2402 — Session record of worktree\*\*: Each session's persistent state must record whether and which worktree it used, so that session history, the Git view, and status displays can surface this information. Existing sessions without this data must remain loadable.

legacy-id: REQ-20260713-002
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-git-worktree-isolation.md
priority: High

## SWR-2403 — Rotaris session list shows worktree\*\*: The Rotaris session browser must display the worktree (branch name or \"—\") for each session, sourced from the session's persistent state.

legacy-id: REQ-20260713-003
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-git-worktree-isolation.md
priority: High

## SWR-2404 — Rotaris dashboard — isolation toggle\*\*: The session-launch UI in Rotaris must provide a toggle for worktree isolation. When enabled, the user must be able to specify a branch name or accept an auto-generated one (derived from the session identifier). If worktree creation fails, the error must be surfaced and the session must not launch.

legacy-id: REQ-20260713-004
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-git-worktree-isolation.md
priority: High

## SWR-2405 — Rotaris Git view — session association\*\*: The worktree table must show which session (ID or label) is associated with each worktree, and the session's runtime status (running, completed, etc.). Worktrees not associated with any session must indicate this clearly (e.g., \"—\").

legacy-id: REQ-20260713-005
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-git-worktree-isolation.md
priority: High

## SWR-2406 — Rotaris status bar — worktree indicator\*\*: When the active session is running on an isolated worktree, the status bar must show the worktree's branch name. When the session is on the main working tree, it must show the main branch name.

legacy-id: REQ-20260713-006
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-git-worktree-isolation.md
priority: Medium

## SWR-2407 — Worktree storage location\*\*: Worktrees created for session isolation must be stored within the existing `.rotaris/` directory (already gitignored) rather than scattered across the workspace root. The exact sub-path must be configurable.

legacy-id: REQ-20260713-007
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-git-worktree-isolation.md
priority: Medium

## SWR-2408 — CLI — create-and-isolate flag\*\*: The CLI must support a flag that creates a new worktree (auto-named from session ID if no name given) and launches the session against it.

legacy-id: REQ-20260713-008
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-git-worktree-isolation.md
priority: Medium

## SWR-2409 — CLI — attach to existing worktree\*\*: The CLI must support a flag that launches a session against an already-existing worktree path, validated to be a legitimate Git worktree of the current repository.

legacy-id: REQ-20260713-009
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-git-worktree-isolation.md
priority: Low

## SWR-2410 — Worktrees survive session completion\*\*: Worktrees created for session isolation must never be automatically deleted — not on success, failure, cancel, or crash. Cleanup is a manual user action.

legacy-id: REQ-20260713-010
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-git-worktree-isolation.md
priority: High

## SWR-2411 — Auto-generated branch names are valid Git refs\*\*: When a branch name is auto-generated from a session identifier, it must be sanitized to contain only valid Git ref characters.

legacy-id: REQ-20260713-011
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-git-worktree-isolation.md
priority: Medium

## SWR-2412 — Backward compatibility\*\*: Workspaces and sessions that do not use worktree isolation must behave identically to the current system. No new configuration is required. All existing tests must continue to pass.

legacy-id: REQ-20260713-012
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-git-worktree-isolation.md
priority: High

## History

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.

## SWR-2413 — Accept isolated worktree changes into base

When one or more completed isolated sessions are selected in Rotaris, the user can accept
their worktree changes for integration into the workspace's checked-out base branch. Rotaris
must run an internal, non-browsable integration session in a temporary integration worktree.
That session receives the selected branches in the user-selected order, merges them, resolves
conflicts with its normal agent tools, and leaves the base worktree untouched until the
integration result is clean and contains every selected branch. The user sees a progress-only
dialog and a final success or recovery error. One integration operation per base workspace may
run at a time; selected completed sessions are locked for its duration. The final promotion
must require an unchanged, clean base and use a fast-forward update. Source worktrees remain
available after a successful merge.

### Test portfolio

| Level         | Productive scenario                                                                       | Exercised boundary                                  | Planned/covering test                                 |
| ------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| Unit          | A user accepts source worktrees with pending files.                                       | Git worktree service                                | `tests/unit/test_worktrees.py`                        |
| Integration   | Parallel completed sessions are reserved, integrated in order, and promoted atomically.   | Session persistence + real temporary Git repository | `tests/integration/test_worktree_integration.py`      |
| User-flow E2E | A Rotaris user selects completed worktrees, confirms merge, and sees base branch updated. | Rotaris Git view + integration bridge               | `apps/rotaris/tests/test_worktree_integration_e2e.py` |

### Innovation suggestion

Recording the worktree association in session state enables a future "review and merge" workflow: side-by-side diff of worktree against main branch after session completion, with one-click merge of agent-produced changes. The data model supports this from day one.

Sub-requirements: see the epic's [Requirements index](#requirements) — SWR-2415
and SWR-2434 extend this integration flow to parallel runs.
