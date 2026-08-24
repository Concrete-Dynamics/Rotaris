---
req-id: SWR-2455
status: approved
trace: required
test: required
title: "First desktop launch opens a real project folder"
epic: SWR-2000
date: 2026-08-24
---

# SWR-2455 — First desktop launch opens a real project folder

When Rotaris starts without a workspace argument, it shall use the last
successfully opened project folder when that directory still exists. When no
valid remembered project exists, Rotaris shall prompt the user with the
operating system's native directory chooser titled "Open a project folder".

Rotaris shall create the main window and begin project initialization only
after a real project folder has been selected. Cancelling the chooser shall
exit the launch cleanly and shall leave the remembered workspace unchanged.
The process working directory and Rotaris's per-user application-data
directory shall never become an implicit project workspace.

An explicit workspace argument remains authoritative and becomes the remembered
project after it is accepted.

## Acceptance criteria

- A desktop launch without a workspace and without a valid remembered project
  opens the native folder chooser at the user's home directory.
- Selecting a folder opens Rotaris against that folder, remembers it, and lets
  project initialization run there.
- A later desktop launch restores the remembered folder while it still exists.
- Cancelling the chooser creates no main window, starts no project
  initialization, and preserves the remembered value.
- An explicit workspace argument bypasses the chooser and becomes the
  remembered folder.
- The current process directory and per-user Rotaris data directory are never
  inferred as the workspace.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Startup resolves explicit, remembered, missing, and cancelled workspace choices | Startup workspace resolution over temporary directories and settings | `apps/rotaris/tests/test_first_launch_workspace_resolution.py` |
| Integration | A chosen folder reaches desktop service construction as the active workspace | Native chooser seam → desktop entry point → real window/store wiring | `apps/rotaris/tests/test_first_launch_workspace.py` |
| User-flow E2E | A first-launch user chooses a project and sees Rotaris open on that folder | Desktop entry point with only the native OS chooser faked | `apps/rotaris/tests/test_first_launch_workspace.py` |

Depends on: [SWR-2431 — In-App Workspace Selection](SWR-2431-in-app-workspace-selection.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
