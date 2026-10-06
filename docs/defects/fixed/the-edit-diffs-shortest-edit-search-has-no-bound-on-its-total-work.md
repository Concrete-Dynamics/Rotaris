## The edit-diff's shortest-edit search has no bound on its total work

`lcsChanges` (`packages/agent-tools/src/tools/diff.ts`) diffs a changed region past its 4,000,000-cell table by Myers'
shortest edit script (`shortestEdit`), searching up to 2,000 changed lines. That bound limits the edit distance and the
O(D²) trace, but not the snake extension: every diagonal's matching run is compared line by line, O((n+m)·D) in total.
A large changed region of many repeated lines with a little under 2,000 changes keeps every diagonal's snake long. Measured
on this host at 2026-10-06 (load about 2): a 300,000-line region of two repeated lines, about 1,900 changed, took
18,704,756 line comparisons and 1.26 s in `shortestEdit` alone; a 1,000,000-line region with about 1,800 changed took
0.6 s. Both are on the tool path: `renderDiff` runs on the whole file for every write_file and haet_edit call, so the call
waits for it. The whole-replace fallback that came before the search (fin21) answered such a region at once.

Found by fin21's verifier (acceptance finding F08 of finacc3, known finding 4) and recorded on branch `finacc3-accept1-6`.

## Specs

- `REQ-CHAT-050`: the edit-diff row is a display of the change; nothing in it asks for an exact diff at any cost, and a
  call that waits seconds for its display row is a regression against the bounded fallback the row had before.
- None contradicted outright; it degrades the tool path's latency.

## Relevant files

- `packages/agent-tools/src/tools/diff.ts` — `shortestEdit` (the snake loop and the per-step trace), `EDIT_DISTANCE_BOUND`,
  and `lcsChanges`'s branch past `LCS_CELLS` that calls it and falls back to the region's own lines.
- `packages/agent-tools/src/tools/files.ts` — the write tools that call `renderDiff` on the whole file.
- [an-edit-diff-row-of-a-file-past-2000-lines-counts-every-line-as-added-and-removed.md](an-edit-diff-row-of-a-file-past-2000-lines-counts-every-line-as-added-and-removed.md)
  — the repair that introduced the search.

## Repaired — 2026-10-06 (finacc3, bundle `finacc3-accept1-6`)

`shortestEdit` takes a work budget beside its edit-distance bound and counts one unit for every diagonal it steps onto and
every line it compares, the comparisons inside a diagonal's run of matching lines included; past the budget it answers
null and `lcsChanges` falls back to the region's own lines as removed and added, as it did before the search existed.
The budget is the table's own bound (4,000,000, one comparison a cell) plus one pass over the region (`n + m`), so a
long run the two sides share between two distant changes never sends a region to the fallback, and the search costs no
more than the table would in comparisons beyond that linear pass. The edit-distance bound stays: it bounds the trace's
O(D²) memory.

Measured on this host after the repair (load 1.6 to 2.2, nothing else running), `renderDiff` over the whole file, twice
each: the 300,000-line region of the description 1,354 and 1,160 ms before, 354 and 294 ms after; a 100,000-line region
with about 1,950 changes 707 and 748 ms before, 191 and 195 ms after; the 1,000,000-line region 1,029 and 915 ms before,
766 and 901 ms after. The fallback alone, over regions of the same sizes with no line in common, takes 246 and 233 ms
(300,000) and 616 and 563 ms (1,000,000): the cost left is the region's own lines being split and drawn, which the old
fallback paid too. Those regions' rows now read `+300002 -300002` and the like where they read `+955 -955`; a region
with fewer comparisons than the budget keeps its least script (the tests' regions of 2,100 to 2,400 lines, and a
one-line edit to a 3,000-line file, unchanged).

Pinned by `packages/agent-tools/src/tools/tools.test.ts`: "REQ-CHAT-050: the shortest-edit search compares no more lines
than its budget, and answers null past it" (a 20,000-line pair of repeated lines counted through a proxy on the before
side: null and at most 200,000 reads under a budget of 200,000, and the least script within a budget of 10,000,000) and
"REQ-CHAT-050: a region whose search would pass its budget is drawn as its own lines removed and added, never the
file's" (100,000 lines a side between a shared head and tail, drawn from line 2 to line 100,003). Both red on the
unbounded search (a script of 20,396 operations where null was expected; 977 removed lines where 100,002 were expected).
No proof draws this row; the finding was a verifier's reading of the code, and these measurements are its evidence.
