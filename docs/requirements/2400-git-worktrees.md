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

Source documents merged into this epic (sections preserved verbatim; requirement tables migrated to the files above).

### Requirements Document (2026-07-13)

Original: `docs/requirement-log/unresolved/requirements-20260713-git-worktree-isolation.md` — document status: Not Started

#### Summary

Parallel rotaris-cli sessions running against the same workspace interfere with each other's filesystem state — agent A edits a file while agent B reads a stale version, or two sessions produce conflicting changes. Git worktrees solve this by giving each session its own isolated working tree backed by the same repository. This requirement adds an opt-in "isolate on worktree" toggle to the Rotaris dashboard and CLI, so a session can be launched on a dedicated worktree that doesn't interfere with the main working tree or other running sessions.

---

#### Context

### Problem being solved

When two sessions run concurrently against the same workspace directory, agent file operations (read, write, edit, shell commands) collide. Session A's agent writes `src/foo.py` while Session B's agent is reading it — B sees a half-written or inconsistent file. Terminal commands in one session pollute the working tree for the other. There is currently no filesystem isolation between parallel sessions; users must manually sequence sessions or accept corrupted state.

### Current behaviour

1. **Rotaris has worktree UI but no session integration**: `GitView` (`apps/rotaris/src/rotaris/views/git.py`) displays worktrees and offers a "+ Worktree" button that calls `GitService.create_worktree()`. `WorktreeInfo` (`apps/rotaris/src/rotaris/models/state.py:109`) models worktree metadata. But worktree creation is a standalone Git-management action — it does not connect to session launch at all.

2. **`workspace_root` is fixed at startup**: `RunBridge.__init__()` receives a single `workspace: Path` (`apps/rotaris/src/rotaris/services/run_bridge.py:31`) that flows into `SessionManager(workspace)` and `_run_task(prompt, config, manager, state, ...)` (`run_bridge.py:248-264`). There is no mechanism to change it per session.

3. **`RotarisConfig.workspace_root` is a static `Path` default** (`src/rotaris_core/config/schema.py:632`). `ConfigService.build_run_config()` (`apps/rotaris/src/rotaris/services/config_service.py:158`) copies the loaded config without modifying `workspace_root`.

4. **`SessionState.workspace_root` is a plain `str`** (`src/rotaris_core/session/state.py:29`) — recorded at session creation time and never changed.

5. **`SessionInfo` has no worktree field** (`apps/rotaris/src/rotaris/models/state.py:59-66`) — the Rotaris session list doesn't show which worktree a session ran on.

6. **Backend has zero worktree awareness**: `src/rotaris_core/` contains no `worktree` string match. No part of the orchestration, session management, or agent infrastructure knows about Git worktrees.

7. **Sessions directory lives under `workspace_root`**: `SessionManager.sessions_dir = workspace_root / ".rotaris" / "sessions"` (`src/rotaris_core/session/manager.py:35`). If `workspace_root` were naively pointed at a worktree, session snapshots would scatter across worktree directories instead of being centrally managed.

### What needs to change

1. **Session isolation on worktrees**: When a session is launched with worktree isolation, agent file operations (reads, writes, edits, terminal commands) must be sandboxed to a dedicated Git worktree. Other sessions — including those running on the main working tree — must see no interference.

2. **Session data stays on main workspace**: Session snapshots, diagnostics, and `.rotaris/` metadata must remain on the main workspace regardless of where agent file operations are directed. Only agent-produced file changes go to the worktree.

3. **Rotaris dashboard toggle**: The session-launch flow must offer a user-facing control to enable/disable worktree isolation, with a way to specify or accept an auto-generated branch name.

4. **Rotaris Git view association**: The existing worktree table must show which session (if any) is associated with each worktree, including live-running sessions.

5. **Rotaris status indication**: The UI must indicate when the active session is running on an isolated worktree versus the main working tree.

6. **CLI support**: The CLI must support launching sessions on a worktree — both creating a new worktree on the fly and attaching to an existing one.

7. **Worktree lifecycle**: Worktrees created for isolation must survive session completion — agent work product is preserved for user review. Cleanup is manual.

8. **Backward compatibility**: Sessions launched without worktree isolation must behave identically to current behaviour. No configuration changes required for existing workspaces.

---

#### Acceptance Criteria

- [ ] **AC-001**: Toggling worktree isolation ON in the Rotaris session-launch UI reveals a branch-name input pre-filled with an auto-generated name based on the session identifier.
- [ ] **AC-002**: Launching a session with isolation ON creates a worktree inside `.rotaris/` on the specified branch. Agents operate entirely within that worktree.
- [ ] **AC-003**: An agent in an isolated session creates a file. The file exists in the worktree but not in the main working tree.
- [ ] **AC-004**: Two parallel isolated sessions on different worktrees cannot see each other's agent-created files.
- [ ] **AC-005**: Session snapshots (`.rotaris/sessions/<id>/`) are always written to the main workspace, never to a worktree.
- [ ] **AC-006**: The session's persistent state records the worktree path. The Rotaris session browser shows the branch name for that session.
- [ ] **AC-007**: The Rotaris Git view worktree table shows the associated session ID and status for worktrees that have sessions. Unassociated worktrees show a clear "no session" indicator.
- [ ] **AC-008**: When an isolated session completes, the worktree persists. The Git view shows the session status updated to `completed`.
- [ ] **AC-009**: The Rotaris status bar shows the worktree branch name when the active session is isolated, and the main branch name when it is not.
- [ ] **AC-010**: The CLI `--isolate` flag creates a worktree, runs the session against it, and exits without deleting the worktree.
- [ ] **AC-011**: With isolation toggled OFF (the default), behaviour matches the current system — no worktree, no new fields populated.
- [ ] **AC-012**: Existing tests pass without modification.
- [ ] **AC-013**: If worktree creation fails (path exists and is non-empty, invalid branch name, etc.), the user sees a clear error and the session does not start.
- [ ] **AC-014**: No new `.gitignore` entry is needed — `.rotaris/` is already ignored.

---

#### Dependencies

- **Depends on**: `docs/requirement-log/done/requirements-20260711-rotaris-desktop.md` (Rotaris Git view with worktree table and worktree creation — FR-ROTARIS-005)
- **Depends on**: `docs/requirement-log/done/requirements-20260703-scheduler-run-path-deepening.md` (session lifecycle foundations)
- **Related**: `docs/requirement-log/done/requirements-20260709-terminal-tool-reliability.md` (terminal tool must respect the isolated workspace directory)
- **Blocks**: Nothing currently.

---

#### Resolved Conflicts

_None — this is a new capability with no conflicting existing requirements._

---

#### Notes

### Assumptions and self-resolved decisions

1. **Session data stays on main workspace, file ops go to worktree**: The simplest path — pointing the entire session at a worktree — would scatter `.rotaris/sessions/` across worktree directories. Instead, session metadata stays centralized on the main repo; only agent file-level work is sandboxed into the worktree.

2. **No auto-delete of worktrees**: Agent-produced files are valuable work product. Auto-deleting on session completion would destroy work before the user reviews it. Cleanup is manual. This also avoids crash/cancel/partial-failure edge cases around cleanup.

3. **Worktrees live under `.rotaris/`**: Already gitignored. Keeps isolation artifacts self-contained. Configurable for users who prefer a different location.

4. **Branch names from session IDs**: Session IDs are UUIDs — unique and traceable. Auto-derived branch names won't collide and can be traced back to the session that produced them. User can override.

5. **Non-Git workspaces**: If the workspace is not a Git repository, worktree isolation is unavailable. The system must surface a clear message, not fail silently.

### Out of scope

- Auto-pruning / garbage-collecting stale worktrees
- Per-agent isolation (different agents in one session using different worktrees)
- Merging worktree changes back to the main branch (standard Git workflow, not Rotaris's concern)

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
