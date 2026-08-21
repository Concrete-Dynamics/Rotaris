---
req-id: SWR-3316
status: approved
trace: required
test: required
title: "The requirements area composes its own surfaces"
type: technical
derived-from: SWR-3301
epic: SWR-3300
date: 2026-08-15
source: docs/plans/2026-08-15-requirements-board-finalization.md
---

# SWR-3316 — The requirements area composes its own surfaces

SWR-3315 moved every wire the requirement feature needs out of
`views/main_window.py` and into `RequirementsController`, so that four slices
could grow the feature without making one 120 KB file the merge surface of the
whole delivery. It succeeded at that, and left one thing unsaid: **who
constructs the board.**

Nobody did. The window registers `RequirementsController.surface`; the
controller attaches a view when someone calls `attach_view`; and outside the
test suite nobody ever called it. A shipped Rotaris therefore opened
`Requirements` on the controller's own status surface — a count, a column
summary and a refresh button — with the board, the detail view, the evidence
view and the graph never constructed. Because the review and queue surfaces
install themselves only into an attached view, they were unreachable too, and
with the queue unreachable the scheduling limits of SWR-3413 bound nothing.

The gap is not a forgotten line: it is a missing rule. `attach_view` is an
extension point, and an extension point with no default has no product behind
it.

Requirement: the requirements area installs its own default surfaces, and
`views/main_window.py` still constructs the controller and registers the surface
and does nothing else.

Installing is staged, and the stages are not the same. The **board** is
installed when the area is first opened or refreshed, because an area with no
board has nothing to show. Every **pane** — review, queue, editor, blockers —
stays built-on-first-use, because a board somebody only reads must not pay for
surfaces it never opens. No stage displaces a surface a caller attached first,
so a test's composition and another window's survive untouched.

Every signal a default surface raises reaches a consumer inside the area: a
requirement can be opened, edited, created, unblocked and reviewed, its queue
can be opened, and an evidence site can be opened — without the window learning
that any of those surfaces exist.

Every surface the area installs is subject to the same window minimum as the
board it is installed beside: a pane wider than 1000×680 makes the *board*
unusable there, because they share one stack.

## Acceptance criteria

- Constructing the window and selecting `Requirements` yields a board with the
  project's requirements on it, without any caller having attached a view.
- Every signal in the controller's two signal tables is connected once the board
  is installed, and every signal a default surface raises has a consumer — no
  control on the board is live and inert.
- Each pane is installed by its own entry point, on first use, and a second use
  reuses it rather than building a second.
- A caller that attaches its own view, review, queue, editor or blocker surface
  keeps it; the defaults are not installed over it.
- Constructing the window builds no board and reads no requirement store.
- With every surface installed, nothing in the area clips at 1000×680.
- `views/main_window.py` gains no requirement-specific connection.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The area installs a board on first open, skips installation when one is attached, and installs nothing while the view is unopened | `RequirementsController` | `apps/rotaris/tests/test_requirements_board.py` |
| Integration | Every declared view and action signal is connected, and each default surface's signals reach a consumer | Controller + the default surfaces | `apps/rotaris/tests/test_requirements_board_actions.py` |
| User-flow E2E | A user opens Rotaris, clicks `Requirements` in the rail, and works with their project's board — opening a requirement, its evidence and its queue | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board.py` |

Derived from: [SWR-3301 — Requirements is a primary view](SWR-3301-requirements-navigation-entry.md)

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
