---
req-id: SWR-3728
status: approved
trace: required
test: required
title: "New sessions are available from the Workspace context toolbar"
epic: SWR-2000
date: 2026-08-24
---

# SWR-3728 — New sessions are available from the Workspace context toolbar

The Rotaris desktop shall expose a visible compact “New session” action at the
left of the Workspace transcript context toolbar, on the same row as the
transcript scope and search controls. The action shall use the design system’s
plus icon and secondary button treatment so the Workspace retains its own
primary-action hierarchy.

Activating the toolbar action shall enter the same guarded session-launch
workflow as the Overview action. The existing active-run protection, launch
options dialog, worktree and sandbox choices, session clearing, and transition
to the Workspace composer shall remain authoritative.

The action shall be mouse and keyboard reachable, expose the accessible name
“New session,” and remain fully visible without overlapping the transcript
scope and search controls at the supported 1000×680 minimum window size.

## Acceptance criteria

- A compact “New session” button with the design-system plus icon appears as
  the leftmost control of the Workspace transcript context toolbar.
- Mouse or keyboard activation requests the existing MainWindow new-session
  workflow through a Workspace signal.
- The existing launch dialog and active-run guard apply equally to Overview and
  Workspace-toolbar activation.
- The button exposes an accessible name and tooltip describing the action.
- At 1000×680, the button remains visible and separated from the transcript
  scope and search controls.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | N/A — the feature adds declarative Qt composition and signal forwarding with no independent decision logic | N/A | N/A |
| Integration | A user can discover and activate the accessible toolbar action at the minimum supported size | `WorkspaceView` context-toolbar layout, icon, accessibility, and signal contract | `apps/rotaris/tests/test_workspace_new_session.py` |
| User-flow E2E | A user working in the Workspace opens the real new-session launch dialog from the context toolbar | Visible `MainWindow` Workspace toolbar → signal wiring → `_SessionLaunchDialog` | `apps/rotaris/tests/test_workspace_new_session_e2e.py` |

Related: [SWR-2415 — Multiple parallel runs on isolated worktrees](../2400-git-worktrees/SWR-2415-parallel-runs.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
