---
req-id: SWR-2455
status: approved
trace: required
test: required
title: "Desktop workspace actions open a project folder"
epic: SWR-2000
date: 2026-08-24
---

# SWR-2455 — Desktop workspace actions open a project folder

When Rotaris starts without a workspace argument, it shall use the last
successfully opened project folder when that directory still exists. When no
valid remembered project exists, Rotaris shall first open the complete desktop
against the process working directory, then present the operating system's
native modal directory chooser titled "Open a project folder" after the window
has become visible.

Cancelling this first-launch chooser shall keep the default workspace and the
complete desktop usable. Rotaris shall then show a toast explaining that the
user can open a project folder by activating the workspace path in the title
bar. Cancellation shall preserve any remembered workspace value.

The workspace text in the desktop title bar shall be an accessible mouse and
keyboard action. Activating it shall open the same native project-folder
chooser, initially scoped to the current workspace. Selecting a different
folder shall reopen the desktop against that folder so configuration, sessions,
Git state, skills, MCP servers, and project initialization all use the selected
workspace.

An explicit workspace argument remains authoritative and becomes the remembered
project after it is accepted.

## Acceptance criteria

- A launch without an explicit or valid remembered workspace shows the complete
  desktop against the process working directory before presenting the chooser.
- The native project-folder chooser opens as a modal after the desktop has
  become visible.
- Selecting a folder opens Rotaris against that folder and remembers it.
- Cancelling the first-launch chooser keeps the default workspace and desktop
  usable, preserves the remembered value, and shows an actionable reminder
  toast.
- A later desktop launch restores the remembered folder while it still exists.
- Clicking the title-bar workspace text opens the same native folder chooser at
  the current workspace.
- The title-bar action is keyboard reachable and exposes an accessible name and
  description identifying its purpose and current project.
- Selecting a different folder from the title bar closes the idle project
  window and opens a replacement wired to the selected project.
- Cancelling a title-bar chooser preserves the active and remembered workspace.
- An explicit workspace argument bypasses onboarding and becomes the remembered
  folder.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Startup resolves explicit, remembered, and fallback workspace choices plus onboarding intent | Startup workspace resolution over temporary directories and settings | `apps/rotaris/tests/test_first_launch_workspace_resolution.py` |
| Integration | The title-bar workspace chip exposes accessible pointer and keyboard activation | TitleBar widget signal and accessibility contract | `apps/rotaris/tests/test_workspace_title_bar.py` |
| User-flow E2E | A first-launch user sees Rotaris before the modal, can cancel into a usable default workspace with a reminder, or choose another project | Desktop launch → post-show native chooser → toast or window/service reconstruction | `apps/rotaris/tests/test_first_launch_workspace.py` |

Depends on: [SWR-2431 — In-App Workspace Selection](SWR-2431-in-app-workspace-selection.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
