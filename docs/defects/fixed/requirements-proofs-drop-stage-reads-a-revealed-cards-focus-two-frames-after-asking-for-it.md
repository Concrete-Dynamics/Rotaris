## requirements-proof's drop stage reads a revealed card's focus two frames after asking for it

`requirements-proof`'s drop stage calls the board's reveal operation (`window.__rotarisBoard.reveal('REQ-104')`), waits two
animation frames, and then requires the card to hold the focus. The board's reveal takes the focus through React: the call
sets state, the render and its passive effect run on React's scheduler, and the effect focuses the card in a further
animation frame (`revealCard` and the reveal effect, `packages/ui/src/requirements/RequirementsView.tsx`). Whether that
lands inside the proof's two frames depends on where the scheduler's task falls against the proof's first frame, so on a
loaded host the stage reads `focused: false` for a card that is revealed and then focused moments later.

Seen twice: finacc3 round 2's sweep run r1 (load 6.95 to 11), and fin30's review on 2026-10-07 at 09:10 UTC, `pnpm
requirements-proof --skip-build` at load 11.6 to 15.4 (every delivery suite green, then "REQ-TRACE-364: revealing REQ-104
answered {"revealed":true,"focused":false,"dragging":"true","types":["application/x-rotaris-requirement"]}"). The next run
at load 10.2 passed the stage. The drag that followed went through in both reds (`dragging: "true"`, the transfer type
present), so the card existed and the board answered; only the focus read came early.

## Specs

REQ-TRACE-364 requires an operation that forces a named card to be realised, scrolls its column to it and returns the
now-visible widget, and says that returning to the board and focusing the current selection use it. It fixes no number of
frames within which the focus is taken. The product is not shown to contradict it; the proof's two-frame wait is the
harness's own bound.

## Relevant files

- `apps/desktop/scripts/requirements-proof.mjs` — the drop stage's `DROP` expression and its REQ-TRACE-364 assertion.
- `apps/desktop/scripts/lib/board-window.mjs` — `revealUntilFocused`, the bounded wait the stage now sends.
- `packages/ui/src/requirements/RequirementsView.tsx` — `revealCard` and the effect that focuses the revealed card.

## Outcome — repaired 2026-10-07 (fin30 review), in the proof, as the requirement's text allows

The drop stage now asks through `revealUntilFocused` (`apps/desktop/scripts/lib/board-window.mjs`, sent to the renderer as
its own one-line source): it reveals the card, then waits frame by frame until that card holds the focus, up to 1000 ms,
and stops at once when the reveal answered false. The REQ-TRACE-364 assertion is unchanged — the card must be revealed and
focused — and the stage now records how long the focus took (`focusFrames`, `focusMs` in `results.json`). Nothing in the
product changed.

Pinned by `apps/desktop/scripts/lib/board-window.test.ts` ("the drop stage waits for the revealed card to take the focus"):
a page whose board focuses the card on the fourth frame reads focused (a two-frame read did not), a focus that never comes
still reads unfocused at the bound, an unrevealed card stops after one frame, and `requirements-proof.mjs` sends this
function and no longer reads the focus two frames after the reveal; red before the repair (3 of 7). Shown by `pnpm
requirements-proof --skip-build` on 2026-10-07 at load 9.6 to 15.2: the drop stage green with the focus taken in 2 frames
(47 ms), every functional stage green; the run exited 1 on two timing budgets at that load, the generated store's arrival
(121 ms) and the epic-axis switch (140 ms), recorded open in
[`switching-the-board-to-a-hundred-epic-columns-costs-a-long-task-over-the-budget-under-load.md`](../switching-the-board-to-a-hundred-epic-columns-costs-a-long-task-over-the-budget-under-load.md).
