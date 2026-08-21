---
req-id: SWR-3301
status: approved
trace: required
test: required
title: "Requirements is a primary view"
epic: SWR-3300
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3301 — Requirements is a primary view

The requirement work has no home in the product today. Requirements are neither
a workspace concern nor a git concern, and hanging them off an existing view
would make them a sub-feature of something they are not.

Requirement: the navigation rail gains a seventh primary view, `Requirements`,
between `Mission` and `Git`. It follows the existing view contract: an entry in
`NAV_ITEMS`, a stacked widget registered in the window's view map, state
restoration through the active-view store field, and a nav glyph that survives
the DPI treatment of SWR-2092. `apps/rotaris/AGENTS.md` and the accessibility
sweep are updated from six primary views to seven in the same change.

## Acceptance criteria

- The view is reachable from the rail, by the same keyboard path as the other
  six, and is restored as the active view after a restart.
- The accessibility sweep covers the new view without a bespoke test.
- The nav glyph renders at the same perceived size as the others at 100 %,
  125 % and 200 % scaling.
- An empty workspace shows an empty state explaining what a requirement source
  is and how to configure one, never a blank pane.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | `NAV_ITEMS` carries the entry, the glyph rasterises at each DPR, and the view registers in the window map | Chrome + window view map | `apps/rotaris/tests/test_requirements_board.py` |
| Integration | Selecting the view stores the active view and restores it on the next construction | Nav rail + store | `apps/rotaris/tests/test_requirements_board.py` |
| User-flow E2E | A user clicks `Requirements` in the rail and reaches the board | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board.py` |

Derived requirements: [SWR-3315 — Requirements UI service seam](SWR-3315-requirements-ui-seam.md),
[SWR-3316 — The requirements area composes its own surfaces](SWR-3316-requirements-area-composition.md)

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
