---
req-id: SWR-2455
status: approved
trace: required
test: required
title: "Desktop workspace actions open a real project folder"
epic: SWR-2000
date: 2026-08-24
---

# SWR-2455 — Desktop workspace actions open a real project folder

When Rotaris starts without a workspace argument, it shall use the last
successfully opened project folder when that directory still exists. When no
valid remembered project exists, Rotaris shall prompt the user with the
operating system's native directory chooser titled "Open a project folder".

The workspace text in the desktop title bar shall be an accessible mouse and
keyboard action. Activating it shall open the same native project-folder
chooser, initially scoped to the current workspace. Selecting a different
folder shall reopen the desktop against that folder so configuration, sessions,
Git state, skills, MCP servers, and project initialization all use the selected
workspace.

Rotaris shall create or reopen the main window and begin project initialization
only after a real project folder has been selected. Cancelling either chooser
shall leave the current or remembered workspace unchanged. The process working
directory and Rotaris's per-user application-data directory shall never become
an implicit project workspace.

An explicit workspace argument remains authoritative and becomes the remembered
project after it is accepted.

## Acceptance criteria

- A desktop launch without a workspace and without a valid remembered project
  opens the native folder chooser at the user's home directory.
- Selecting a folder opens Rotaris against that folder, remembers it, and lets
  project initialization run there.
- A later desktop launch restores the remembered folder while it still exists.
- Clicking the title-bar workspace text opens the same native folder chooser at
  the current workspace.
- The title-bar action is keyboard reachable and exposes an accessible name and
  description identifying its purpose and current project.
- Selecting a different folder from the title bar closes the idle project
  window and opens a replacement wired to the selected project.
- Cancelling either chooser preserves the active and remembered workspace.
- An explicit workspace argument bypasses the chooser and becomes the
  remembered folder.
- The current process directory and per-user Rotaris data directory are never
  inferred as the workspace.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Startup resolves explicit, remembered, missing, and cancelled workspace choices | Startup workspace resolution over temporary directories and settings | `apps/rotaris/tests/test_first_launch_workspace_resolution.py` |
| Integration | The title-bar workspace chip exposes accessible pointer and keyboard activation | TitleBar widget signal and accessibility contract | `apps/rotaris/tests/test_workspace_title_bar.py` |
| User-flow E2E | A user clicks the title-bar workspace text, chooses another project, and sees the replacement desktop use it | Desktop title bar → native chooser seam → window/service reconstruction | `apps/rotaris/tests/test_first_launch_workspace.py` |

Depends on: [SWR-2431 — In-App Workspace Selection](SWR-2431-in-app-workspace-selection.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
