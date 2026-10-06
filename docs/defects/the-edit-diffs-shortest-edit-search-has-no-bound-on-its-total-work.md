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
- `docs/defects/fixed/an-edit-diff-row-of-a-file-past-2000-lines-counts-every-line-as-added-and-removed.md` — the repair
  that introduced the search.
