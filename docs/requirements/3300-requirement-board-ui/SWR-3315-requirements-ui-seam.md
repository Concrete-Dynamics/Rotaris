---
req-id: SWR-3315
status: approved
trace: required
test: required
title: "Requirements UI service seam"
type: technical
derived-from: SWR-3301
epic: SWR-3300
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3315 — Requirements UI service seam

`views/main_window.py` is the application's wiring point and already carries
every view's signal connections. Letting the requirement feature add its
connections there over four separate slices would make one 120 KB file the
merge surface for most of this delivery — and the board, the actions and the
review view are being built in different slices, partly in parallel.

Requirement: the requirement feature is wired into the window exactly once,
through a `RequirementsController` service that owns the bridge to the engine's
projection API (SWR-3216), the store extension for requirement state, and every
signal connection the requirement views need. The window constructs the
controller and registers the view; everything else the feature grows attaches to
the controller.

## Test coverage

Unit tests assert the controller owns the connections (constructing it wires the
view's signals) and that the window's own additions are limited to construction
and registration. An integration test drives a board action through the
controller to the engine seam without touching a window private. The originating
product flow enabled by `derived-from` is the Requirements view itself
(SWR-3301).

Derived from: [SWR-3301 — Requirements is a primary view](SWR-3301-requirements-navigation-entry.md)

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
