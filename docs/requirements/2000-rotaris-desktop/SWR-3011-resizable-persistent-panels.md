---
req-id: SWR-3011
status: approved
trace: required
test: required
title: "Every content pane is drag-resizable and remembers its size"
epic: SWR-2000
date: 2026-08-13
---

# SWR-3011 — Every content pane is drag-resizable and remembers its size

Rotaris hard-codes the width of every pane it puts beside another one. The
workspace context sidebar is 236 px, the inspector 288 px, the Overview right
column 340 px, the Mission delegation tree 285 px, and the prompt composer is
48 px tall. Those numbers were chosen for a 1440-wide window and they do not
move: on a wide display the transcript cannot be given the extra room, and on
any display a todo whose text is longer than 236 px stays truncated forever
because there is no gesture that would widen the pane holding it.

Panes that sit side by side shall be resizable by the user, and the sizes they
are given shall be the sizes they have on the next launch.

- **Resizable panes.** Each of the following pairs or triples is split by a
  draggable divider: the workspace's context sidebar, transcript column, and
  inspector; the workspace's transcript and its prompt area; Overview's two
  columns; Mission's delegation tree and activity table; Git's worktrees and
  commit history; the Library's prompt stash and prompt history.
- **Bounded, never collapsed.** A pane has a minimum size that keeps its content
  legible and, where one pane is a fixed-purpose rail, a maximum. A divider
  cannot be dragged far enough to collapse a pane to nothing, and no pane's
  minimum may raise the window's minimum-size hint above the supported
  1000×680.
- **Global and persistent.** A size the user sets applies to every workspace and
  survives quitting and relaunching Rotaris. It is stored per divider, so
  resizing the Overview columns does not disturb the workspace.
- **Keyboard reachable.** Resizing is not mouse-only: a divider takes focus in
  the tab order, announces itself by name, shows a visible focus indicator, and
  moves under the arrow keys, restoring its default size on `Home`.
- **Compact layout is unaffected.** Below the 1180 px breakpoint the sidebar and
  inspector remain the mutually exclusive overlay drawers of SWR-2016; crossing
  the breakpoint in either direction preserves the sizes the user set for the
  wide layout.
- **Stored sizes that no longer fit are ignored, not applied.** A stored size
  recorded against a different set of panes is discarded and the defaults are
  used, so a layout change cannot resurrect as a corrupted split.

## Acceptance criteria

- Dragging the divider between the workspace context sidebar and the transcript
  changes both widths, and the sidebar keeps its new width after the app is
  closed and reopened.
- Every listed pane pair exposes a divider; no divider can collapse a pane
  below its stated minimum.
- A divider can be focused with the keyboard, is announced by an accessible
  name, and moves with the arrow keys; `Home` restores its default.
- Shrinking the window below 1180 px and back leaves the sidebar and inspector
  at the widths the user set.
- The window still opens at its 1000×680 minimum with no clipped controls.
- A stored size whose pane count does not match the current layout is ignored
  and the defaults apply.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A user's pane size is written once per gesture, read back on the next launch, and a size recorded against a different pane count is refused | `PanelLayoutService.save`/`restore`/`reset_all` over `QSettings`, `PanelSplitter` default application and arrow-key handle resize | `apps/rotaris/tests/test_panel_layout.py` |
| Integration | Workspace, Overview, Mission, Git, and Library each expose their dividers, honour their minimums at 1000×680, and the workspace keeps the user's widths across the compact breakpoint | `WorkspaceView` splitter wiring and `_apply_responsive_layout` undock/redock, per-view splitter keys and minimum widths | `apps/rotaris/tests/test_views.py` |
| User-flow E2E | User widens the workspace context sidebar to read a long todo, quits Rotaris, reopens it, and the sidebar is still wide | Real `MainWindow` with real store wiring and a real `QSettings` store, second window built against the same settings | `apps/rotaris/tests/test_panel_resize_e2e.py` |

Related: [SWR-3012 — Panel sizes can be reset to their defaults from Settings](SWR-3012-reset-panel-sizes.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
