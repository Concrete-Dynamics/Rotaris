## requirements-proof counted the Requirements view's first mount against the board on screen

`requirements-proof`'s board stage went red twice in four runs at `a68f121` (`Rotaris-crw-wt-live`, load 1.6 to 3): run 2 on
the board's own paint figure (168 ms against REQ-TRACE-239's 100 ms) and run 4 on "the renderer saw a 641 ms long task
while the board was put on screen"; run 5 read 44 ms and no long task. The stage arms a long-task observer 900 ms into the
launch, shows the board with Ctrl+4 at 1200 and reads back every long task that began after the arming.

**Traced 2026-10-07** (`<scratchpad>/fin30/board/out/run1..3`, Chromium's startup trace with V8's CPU profile, the stage's
own timings, load 12 to 13): the renderer is already 2.9 to 4.0 s old when the observer is armed, and the window then holds
the Requirements view's FIRST MOUNT — the Ctrl+4 key event, inside which React builds the view before it asks the engine
for anything. In run 3 that was one 423 ms task, 412 ms of it script and 210 ms of that V8's lazy compilation of the view's
code (`V8.CompileCode`, `ParseFunction`, `CompileIgnition`), while the board's own figure, from the engine's answer to the
laid-out DOM, was 32 ms. Runs 1 and 2 read 99 and 74 ms for the board and 109 and 81 ms for their longest task. The 641 ms
of run 4 had that shape: a long task the stage counted against "putting a board on screen once the engine has answered"
(REQ-TRACE-239) that ran before the engine was asked.

## Specs

REQ-TRACE-239 bounds the interface thread "putting a board on screen once the engine has answered", at 100 ms, under
REQ-TRACE-088's reference conditions (one thread, a contemporary workstation, the measurement alone, process start-up
excluded). The view's mount precedes the engine's answer, so the requirement's text does not count it; the harness did.
Not contradicted by the product on this evidence.

## Relevant files

- `apps/desktop/scripts/requirements-proof.mjs` — the board and scale stages' long-task windows (`ARM_LONGTASKS`, the
  reader).
- `packages/ui/src/requirements/RequirementsView.tsx` — the board's paint measure (`measure`, `paintMs`) and its observable.

## Outcome — repaired 2026-10-07 (fin30), in the proof, as the requirement's text allows

The board's observable now carries `paintFrom`, the instant its paint figure began (the engine's answer), and the stage's
reader (`readLongTasks`, `apps/desktop/scripts/lib/board-window.mjs`, sent to the renderer as its own one-line source)
counts only the long tasks that ENDED after it; the ones that ended before are reported apart as `beforeArrivalTasks` in
`results.json` and never counted. Every task that touches the window after the answer still counts, the budget is the
same 100 ms and the comparison is unchanged; the arrival on the generated store reads the same way. Not repaired, because
it is not the harness's: the board's own figure is the product's measure, and run 2's 168 ms on it at load 1.6 to 3 was not
reproduced (32 to 99 ms in three traced runs at load 12 to 13; 36 ms in the full proof below; 44 ms quiet at `a68f121`). If
it recurs, the trace to take is the one above.

Pinned by `apps/desktop/scripts/lib/board-window.test.ts` (the traced shape: a 422 ms task that ended before a 32 ms
paint's answer is reported apart and not counted; a task spanning the answer counts; the expression is one line; and
`requirements-proof.mjs` uses this reader and keeps none of its own, which the old proof fails). Shown by
`pnpm requirements-proof --skip-build` on 2026-10-07 at load 9.5 to 9.8: board 36 ms with no long task, the minimum window
62 ms, the generated store's arrival 47 ms with one 52 ms task, every functional stage green; it exited 1 on the axis switch
alone (144 ms), which is recorded open in
[`switching-the-board-to-a-hundred-epic-columns-costs-a-long-task-over-the-budget-under-load.md`](../switching-the-board-to-a-hundred-epic-columns-costs-a-long-task-over-the-budget-under-load.md).
The first form of the reader spanned lines, so the seam's log line for it was never matched and the stage read `undefined`;
the same run found it.
