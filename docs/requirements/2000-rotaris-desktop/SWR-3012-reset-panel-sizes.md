---
req-id: SWR-3012
status: approved
trace: required
test: required
title: "Panel sizes can be reset to their defaults from Settings"
epic: SWR-2000
date: 2026-08-13
---

# SWR-3012 — Panel sizes can be reset to their defaults from Settings

Once pane sizes persist (SWR-3011) they can also go wrong and stay wrong. A user
who drags the inspector almost shut, or who moves from a 34-inch display to a
laptop, inherits a layout tuned for a window they no longer have — and the only
way back is to find every divider in six views and guess where it started.

Settings shall offer one control that restores every resizable pane in Rotaris
to its default size.

- The control lives in **Settings → Interface**, is labelled `Reset panel
  sizes`, and states in nearby text what it affects.
- Activating it discards the stored sizes for **every** divider in the
  application, not only the view the user is looking at.
- The effect is **immediate and visible**: panes already on screen snap back to
  their defaults without a relaunch, and the next launch also uses the defaults.
- Rotaris confirms the action happened, in words, after it happens.
- The action is not destructive and takes no confirmation dialog: it discards
  only layout preferences, and any size can be dragged back in one gesture.

## Acceptance criteria

- Settings → Interface shows a `Reset panel sizes` control with an accessible
  name and a description of its scope.
- After resizing panes in more than one view and activating the control, every
  affected pane is back at its default size without restarting Rotaris.
- The reset survives a relaunch: the stored sizes are gone, not merely
  overridden in the live window.
- Activating the control reports completion to the user.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Resetting clears stored sizes for every divider and re-applies defaults to the dividers currently alive | `PanelLayoutService.reset_all` over `QSettings` plus the live-splitter registry | `apps/rotaris/tests/test_panel_layout.py` |
| Integration | The Settings control reaches the window and the window reaches the layout service, reporting completion | `SettingsView.panel_sizes_reset_requested` → `MainWindow._reset_panel_sizes` → service, toast text | `apps/rotaris/tests/test_views.py` |
| User-flow E2E | User who has shrunk the inspector opens Settings → Interface, clicks `Reset panel sizes`, and watches the workspace panes return to their defaults | Real `MainWindow`, control found by accessible name and clicked, pane widths as the user sees them | `apps/rotaris/tests/test_panel_resize_e2e.py` |

Related: [SWR-3011 — Every content pane is drag-resizable and remembers its size](SWR-3011-resizable-persistent-panels.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
