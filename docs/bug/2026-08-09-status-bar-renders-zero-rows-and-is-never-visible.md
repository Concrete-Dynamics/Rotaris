# Bug — the status bar has zero content rows, so the workspace path and git branch never render

**Date:** 2026-08-09
**Status:** Fixed 2026-08-09 — see [Fix](#fix)
**Severity:** Medium (a shipped user-facing surface is invisible, and its snapshot baseline
records the invisibility as correct)
**Affected requirements:** SWR-1065, SWR-1066, SWR-1067, SWR-1068, SWR-1069, SWR-1070

---

## What happened

Found while diagnosing
[2026-08-08-tui-snapshot-and-clock-tests-flake-under-parallel-load.md](2026-08-08-tui-snapshot-and-clock-tests-flake-under-parallel-load.md).
No committed snapshot baseline contains the workspace path or the git branch — not even
`tests/unit/__snapshots__/test_tui_snapshot_status_bar/test_snapshot_status_bar.raw`, the
baseline whose whole purpose is that widget. Its bottom row is a horizontal rule and nothing
else.

`StatusBar` computes and stores the right text; it simply has nowhere to draw it. Measured on a
running app (`app.run_test(size=(80, 24))`):

```
StatusBar size: Size(width=19, height=0)   content_region: Region(x=58, y=22, width=19, height=0)
styles.height: 1                            border: ('solid', ...)
#status-bar-path   size: Size(width=19, height=1)  render(): '~\\AppData…cratchpad'
#status-bar-branch size: Size(width=0,  height=0)  render(): ''
```

## Cause

`src/rotaris_core/tui/styles/app.tcss`:

```css
#status-bar {
    height: 1;
    border-top: solid $theme-border;
    ...
}
```

Textual sizes borders inside the declared height, so a 1-row widget with a top border has zero
rows left for content. The border is what the snapshot shows.

## Why the snapshot did not catch it

`test_snapshot_status_bar` asserts the widget renders *as recorded*, and the recording was made
after the regression, so the empty bar is now the baseline. The test passes and the requirement
looks covered.

## What was expected

SWR-1065…SWR-1070 describe a status bar showing the workspace path and the current git branch
below the right pane, truncating the path when the branch does not fit.

## Fix

**`border-top` dropped, `height: 1` kept** (`src/rotaris_core/tui/styles/app.tcss`). Chosen over
`height: 2` because it costs no rows — the widget box already owned that row, it was just
spending it on a rule — so nothing else in the layout moves. The border was redundant anyway:
the todo pane directly above draws its own bottom border, so the two rules sat adjacent.
Measured after the change: `StatusBar size height=1`, `content_region height=1`.

**Guard that does not depend on a baseline** —
`tests/unit/test_tui_status_bar.py::test_status_bar_has_a_visible_row_on_the_main_screen`
mounts the real `RotarisTuiApp` (every other test in that file mounts `StatusBar` into a bare
`App` with no stylesheet, which is precisely why none of them noticed) and asserts
`content_region.height >= 1` and a one-row, non-empty path static. Verified to fail with the
border restored.

**Snapshot determinism** — the bar now prints the working directory and the checked-out branch,
both machine-specific, so `tests/conftest.py` gained `_pin_status_bar_in_snapshots`: for
`test_snapshot_*` it pins `_collapse_home` to `~/demo` and replaces `_refresh_branch` with a
synchronous stub returning `main`. Replacing the whole method matters — the real one hops
through `asyncio.to_thread` to run `git rev-parse`, and neither `pilot.pause()` nor
`wait_for_scheduled_animations()` waits for a worker, so whether the branch had landed by
screenshot time would depend on machine load. That is the same failure class as
[the cursor-blink flake](2026-08-08-tui-snapshot-and-clock-tests-flake-under-parallel-load.md).

**Baselines re-recorded** (8 files, reviewed row by row): each differs in exactly one row,
`│─────────────────────` → `│~/demo · main`. No layout shift anywhere.
`test_snapshot_after_user_message_submitted` did not change — its warning toast covers that
corner.

## Follow-ups, not fixed here

- The bar is 19 columns wide (it lives under the right rail, per SWR-1065's placement), so a
  real absolute path middle-truncates to roughly ten characters. Whether that satisfies
  "display absolute workspace path" is a design question, not a defect in this fix.
- `_detect_git_branch_sync` runs `git rev-parse` in a thread with a **1.0 s timeout** and maps a
  timeout to "no branch", so on a loaded machine the branch silently disappears from the real
  UI. Now that the bar is visible, that is user-facing.
- `_middle_truncate` takes its width from `self.size.width` — the rail width, not the terminal
  width. Correct for the current placement; revisit if the bar ever moves.

## Related code

| File | Concern |
|------|---------|
| `src/rotaris_core/tui/styles/app.tcss` | `#status-bar` height/border — the fix |
| `tests/unit/test_tui_status_bar.py` | `test_status_bar_has_a_visible_row_on_the_main_screen` |
| `tests/conftest.py` | `_pin_status_bar_in_snapshots` |
| `src/rotaris_core/tui/widgets/status_bar.py` | was rendering into a zero-height region |
| `src/rotaris_core/tui/screens/main.py` | mounts `StatusBar` |
| `tests/unit/__snapshots__/**` | 8 baselines re-recorded |
