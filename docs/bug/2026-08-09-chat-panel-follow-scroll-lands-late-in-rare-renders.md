# Bug — the chat panel's follow-scroll occasionally has not landed when a frame is captured

**Date:** 2026-08-09
**Status:** Open
**Severity:** Low (rare; observed once in ~15 renders. It has not yet failed a committed
baseline, but it is the last known nondeterminism in the TUI's settled render)
**Affected requirements:** SWR-1002, SWR-1219, SWR-1414

---

## What happened

While re-recording snapshot baselines for
[the status bar fix](2026-08-09-status-bar-renders-zero-rows-and-is-never-visible.md), one
render of `test_snapshot_agent_tree_with_children` differed from its baseline in two extra rows
beyond the intended one. The chat panel's vertical scrollbar thumb sat in a different place:

```
row 4  baseline |│Starting the task. Delegating implementation  ▂▂│││wait 0done 0│|
row 4  render   |│Starting the task. Delegating implementation  │││wait 0done 0│|

row 9  baseline |│All tests pass. No issues found.              ││└──────────── live ─┘|
row 9  render   |│All tests pass. No issues found.              ▆▆││└──────────── live ─┘|
```

Text content identical; only the thumb moved from near the top of the track to near the bottom.

## Why it is timing

`ChatPanel.set_transcript` follows the transcript to the end and then queues the follow a second
time, because the surrounding panes may still be resizing
(`src/rotaris_core/tui/widgets/chat_panel.py`):

```python
if self._following:
    self._scroll_to_end_if_following()
    # ... Textual still exposes the previous scroll range here, so repeat
    # the follow once layout has settled.
    self.call_after_refresh(self._scroll_to_end_if_following)
```

`on_resize` queues it again. Whether the deferred follow has run when the frame is captured
therefore depends on how many refresh cycles elapsed, i.e. on machine load — the same class of
defect as the cursor blink, but far rarer because the scroll range here is tiny (virtual height
7 against a 6-row viewport, so only the fractional end of the thumb moves).

## Reproduction

Not reliably reproducible. Observed once while rendering the
`test_snapshot_agent_tree_with_children` state repeatedly in one process; ten consecutive
renders immediately afterwards were all identical, as were three full serial runs of the
snapshot suite and several `-n auto` runs.

`tests/unit/test_tui_snapshot_determinism.py` renders the same state twice and asserts the SVGs
match, so it is the test most likely to catch this next; a mismatch there whose diff is a
scrollbar thumb is this bug, not a new one.

## Fix direction

Make the settled scroll position a function of state rather than of how many refresh cycles ran
— e.g. compute the follow target from the virtual transcript size when the layout is known
rather than re-running `scroll_end` opportunistically, or have `_scroll_to_end_if_following`
assert-and-retry until `scroll_y == max_scroll_y` instead of relying on `call_after_refresh`
firing at the right moment. Whatever the shape, the acceptance test is the determinism guard
above run many times, not a single snapshot comparison.

## Related code

| File | Concern |
|------|---------|
| `src/rotaris_core/tui/widgets/chat_panel.py` | `set_transcript`, `_scroll_to_end_if_following`, `on_resize` |
| `tests/unit/test_tui_snapshot_determinism.py` | the guard that should catch a recurrence |
