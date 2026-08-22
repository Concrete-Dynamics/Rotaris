---
req-id: SWR-2452
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2447
title: "Transcript geometry is incremental and never partially laid out"
epic: SWR-2000
date: 2026-08-22
---

# SWR-2452 — Transcript geometry is incremental and never partially laid out

The transcript view owns its own row geometry instead of borrowing `QListView`'s.
`QListView` discards the entire item layout on every `rowsInserted` and every
`dataChanged`, so a one-row append to an N-row transcript re-measures all N rows —
measured at 315 delegate `sizeHint` calls for N=300, 1015 for N=1000 and 3015 for
N=3000 — and, under `LayoutMode.Batched`, rebuilds that layout `batchSize` rows per
event-loop pass. Rows past the laid-out prefix have a zero-height `visualRect` and
paint as background, so a transcript pinned to its tail reads blank for
`rowCount / batchSize` frames on every refresh. The blank grows with the length of the
conversation, which is the opposite of what a chat transcript owes its reader.

The incremental work `TranscriptListModel.sync` already does — insert, remove, update a
streamed tail — must therefore reach a layout that honours it. A row's measured height is
kept in a prefix-sum index; appending measures the appended rows only, mutating a row
measures that row only, and painting touches only the rows that intersect the viewport.

This carries no product behaviour of its own beyond what SWR-2447 (live repaint tick),
SWR-2448 (stable expansion identity) and SWR-2432 (tool-call grouping) already promise;
it is what makes them affordable on a long session.

## Acceptance criteria

- Appending one event to a settled transcript of any length measures a bounded number of
  rows, independent of `rowCount`. Attribution (SWR-2906) makes a row's height depend on
  the role of the row before it, so an insertion at row *r* re-measures *r* and *r+1* —
  and nothing else.
- Mutating the streamed tail row measures that row and its successor only.
- `delegate.sizeHintChanged` re-measures exactly the row it names.
- Every row has a non-zero height as soon as the geometry is current: no event-loop pass
  exists in which the view can paint a partially laid-out transcript.
- A viewport resize that changes only the height does not re-measure any row; a width
  change re-measures all of them, because a row's height is a function of its width.
- Painting a viewport of *v* visible rows calls the delegate *v* times, whatever
  `rowCount` is.
- While the view follows the tail, a geometry change lands the viewport at the bottom in
  one step. While it does not, the row under the reader keeps its screen position even
  when rows above it change height or new rows arrive.
- A size-cache hit costs no row measurement: the delegate builds its cache key from the
  event and the row before it, not from a re-render.

## Test coverage

`apps/rotaris/tests/test_transcript_geometry.py` covers `RowGeometry` directly — append,
insert, remove, height change, the dirty-suffix invariant, and `row_at`/`visible_span`
boundaries — with no Qt involved. `apps/rotaris/tests/test_transcript_render_cost.py`
counts `TranscriptDelegate.sizeHint` calls over a live `TranscriptListView` to gate the
bounded-measurement and bounded-paint criteria, and asserts no partially laid-out state is
observable. Scroll anchoring and tail following are covered against the real view.
The user-visible flows these serve are already covered by `test_views.py`,
`test_terminal_panel.py` and `test_transcript_tool_thinking.py`, which drive the same view
through clicks and keyboard.

This bounds the cost of *laying out* a long transcript. It says nothing about the cost
of producing the model it lays out, which is upstream and, when this was written, still
grew with session length — so a long session could satisfy every criterion here and
still update slowly.
[SWR-2454 — The live view keeps up with the run](SWR-2454-live-view-keeps-up-with-the-run.md)
carries the same bounded-cost property across that upstream half.

Derived from: [SWR-2447 — Transcript repaints on a timer while a row is live](../2000-rotaris-desktop/SWR-2447-live-transcript-repaint-tick.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
