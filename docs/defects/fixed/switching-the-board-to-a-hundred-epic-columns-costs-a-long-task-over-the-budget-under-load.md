## Switching the board to a hundred epic columns costs a long task over the budget under load

Final acceptance finacc3, round 2 (at `d12f1f2`), finding A2-02. In `requirements-proof`'s scale stage, the switch of the
generated 1,500-requirement board to the epic axis (100 populated columns) took a long task of 144 to 181 ms across the
sweep's runs (r2 181 ms at load 7.2; r4 144 ms at one-minute load 1.85 to 3.05, five-minute 4.47 to 3.16), against
REQ-TRACE-239's 100 ms; Part AK′'s own record reads 72, 87, 89 and 89 ms quiet and 134 ms loaded. Every functional stage
passed. The brief asks for a run alone on a quiet host (load under 1) before calling it a product defect; this host never
reached one on 2026-10-07 (load 4.5 to 23.6 all day, a sibling plan and the orchestrator's live runs beside it).

**Profiled 2026-10-07** (`<scratchpad>/fin30/board/out/scale2`, Chromium's startup trace with V8's CPU profile, load 15.6):
the switch was one 396 ms task — the capture seam's `change` on the axis `<select>`, inside which React re-rendered
synchronously. Of the 175 ms the sampler covered: 65 ms of layout and 13 ms of style forced by a visible `Column`'s layout
effect reading its list's height (`Column.tsx`, the realised band), 32 ms of React's own render and commit, 28 ms of the
grouping in `packages/ui-core/src/requirements/display.ts` (`axisValue`, `columnsFor`, `sortCards`, `priorityRank` over all
1,500 cards), and a few ms each of `epicSummary`, the cards built and the hundred placeholders created. A second run at
load 14.4 read 129 ms, and fin30's full `pnpm requirements-proof --skip-build` (load 9.5 to 9.8, every other stage green)
read 144 ms. Nothing in it is work on cards off screen beyond the grouping every column's count needs
(REQ-TRACE-300 requires all hundred columns present), and the forced layout covers the whole row of placeholders.

Recorded open: whether this is a product defect is decided by a quiet run, which this host could not give. If the quiet
figure holds above 100 ms, the candidates the profile names are the grouping (memoised per axis and membership) and the
forced layout (the band read after the browser's own layout rather than inside the commit).

**Seen again in fin30's review, 2026-10-07** (`pnpm requirements-proof --skip-build`, every functional stage green): at load
9.6 to 15.2 the axis switch read 140 ms and the generated store's arrival a 121 ms task after the engine's answer (its
view mount, 419 ms, reported apart); at load 10.2 to 10.1 the run stopped earlier, on the minimum window's board at 106 ms.
The builder's run at load 9.5 to 9.8 read 47 ms for the arrival and 62 ms for the minimum window. None of these was taken
on a quiet host.

## Specs

REQ-TRACE-239 (100 ms, "measured at the minimum supported window size under the reference conditions of REQ-TRACE-088" —
one thread, a contemporary workstation, alone) and REQ-TRACE-300 (no column truncated, hidden or refused for being one of
many). Not shown contradicted: the figure is over the budget only on a loaded host, and the reference conditions exclude one.

## Relevant files

- `packages/ui/src/requirements/RequirementsView.tsx` — the axis switch and the columns area.
- `packages/ui/src/requirements/Column.tsx` — the layout effect that reads the list's height.
- `packages/ui-core/src/requirements/display.ts` — the grouping by axis.
- `apps/desktop/scripts/requirements-proof.mjs` — the scale stage's axis window (armed at 11000, read at 14500).

## Closed 2026-10-13 (fin38) — the quiet reading: load, not the product

The quiet run this note waited for was taken: three `pnpm requirements-proof --skip-build` runs under `xvfb-run`, alone, at load
0.3 to 1.1 on 4 CPUs, on 2026-10-13 at `552d346`, all **PASSED**. Their `results.json` read `axisSwitchLongestTaskMs` **0** —
no long task at all on the switch to the 100 populated epic columns of the generated 1,500-requirement board, against
REQ-TRACE-239's 100 ms (the third run's copy is the orchestrator's `quiet-reqproof-results-run3.json`: `stage2.scale`
`axisSwitchLongestTaskMs: 0`, `realisedOnEpicAxis: 35`; `stage2.board.longTasks: 0`). The board's paint read 17 to 20 ms on the
fixture and 31 to 41 ms at 1,500 requirements (the minimum window 26 ms in run 3). The 144 to 181 ms of A2-02, and the
129 to 140 ms of fin30's runs, were taken at loads of 1.85 to 15.6 beside sibling plans and live runs; REQ-TRACE-088's reference
conditions exclude them. Nothing in the product was changed, and the candidates the profile named (the grouping, the forced
layout) stay unbuilt: no quiet figure asks for them.
