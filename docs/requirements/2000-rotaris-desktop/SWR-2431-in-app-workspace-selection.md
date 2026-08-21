---
req-id: SWR-2431
status: draft
trace: required
test: required
title: "In-App Workspace Selection"
epic: SWR-2000
date: 2026-08-03
---

# SWR-2431 — In-App Workspace Selection

The user must be able to set and change the active workspace path from within
the Rotaris UI, without relying on the CLI launch argument. This enables
workspace selection when Rotaris is launched outside a terminal (desktop
shortcut, application launcher, file association).

Two access points expose the same directory-browser dialog:

- **Title bar workspace chip** — the existing workspace-path chip in the title
  bar is clickable and opens a native directory chooser.
- **Settings view** — a workspace path row with the current path and a "Browse…"
  button that opens the same directory chooser.

When no workspace has been set (e.g., launch from a desktop shortcut without a
CLI argument), the main window opens in an empty-workspace state: the title bar
chip shows a placeholder like "No workspace — click to select", the Settings row
shows an empty path, and views that require a workspace (Workspace, Git,
Library) display their existing empty-state prompts.

Changing the workspace reloads configuration, sessions, git state, skills, and
MCP servers for the new path. If a run is active when the workspace changes, the
active run continues against the old workspace; new runs use the new workspace.
A dismissible notice informs the user when a workspace switch leaves an active
run on the previous workspace.

Previously opened agent windows stay open and continue to reflect the old
workspace's transcripts; they are not forcibly closed on workspace switch.

## Scope

- **In scope**: native directory chooser, empty-workspace startup state, title
  bar chip + Settings row as access points, configuration reload on switch,
  active-run preservation notice.
- **Out of scope**: recent-workspace list, workspace auto-detection from
  surrounding directories, workspace switching via keyboard shortcut alone
  (beyond the existing command palette), per-workspace session isolation beyond
  the existing session manager behavior.

## Acceptance criteria

- Clicking the title bar workspace chip opens a native directory chooser.
- Selecting a directory sets it as the active workspace and reloads
  configuration, sessions, git state, skills, and MCP servers.
- The Settings view shows the current workspace path with a "Browse…" button
  that opens the same directory chooser.
- When no workspace is set (launch without CLI argument), the title bar chip
  displays a placeholder prompting the user to select a workspace.
- All views that depend on workspace data degrade gracefully to their existing
  empty states when no workspace is set.
- Changing the workspace during an active run does not interrupt the run; the
  run continues against the old workspace.
- A dismissible notice appears when a workspace switch leaves an active run on a
  previous workspace.
- Cancelling the directory chooser does not change the current workspace.
- Previously opened agent windows remain open after a workspace switch.

## Test portfolio

| Level         | Productive scenario                                                                     | Exercised boundary                                                   | Planned/covering test                    |
| ------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------- |
| Unit          | Store `workspace_path` update triggers reload signals correctly                         | `WorkspaceStore` signal emission on path change                      | `apps/rotaris/tests/test_models.py`      |
| Integration   | Config service reloads config, sessions, git when workspace path changes                | `ConfigService` workspace-switch reload path                         | `apps/rotaris/tests/test_services.py`    |
| User-flow E2E | User clicks title bar chip, selects a directory, sees new workspace loaded in all views | Native directory chooser → store update → config reload → UI refresh | `apps/rotaris/tests/test_main_window.py` |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
