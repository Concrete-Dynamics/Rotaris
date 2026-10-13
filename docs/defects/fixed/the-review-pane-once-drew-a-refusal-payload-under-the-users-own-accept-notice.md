## The review pane once drew a refusal payload under the user's own accept notice

`requirements-proof`'s end-to-end stage went red once in four runs at `a68f121` (run 3, load 1.6 to 3, in
`Rotaris-crw-wt-live`): "REQ-TRACE-424/426 (L12): the pane shows a refusal right after the user's own accept: "REQ-101 is
not awaiting a review decision: it is in done."". The same read at 36800 ms found the accept's notice ("Accept recorded for
REQ-101. The review you were reading is out of date.") and its one action, the reload, so the decision had been taken and
noticed, and the payload on screen was a FRESH read of the review taken after the accept had moved the card to `done`.
The pane's payload changes only through `loadReview` (`packages/ui/src/requirements/RequirementsView.tsx`), which only the
pane's opening (the detail's Review control) and the notice's own Reload call; the notice is the pane's local state and
survives a fresh read while the pane stays open. So a second read was asked between the accept and the read at 36800, and
nothing in the harness acts in that window (its next steps are a reveal at 37000 and the Reload at 38800).

**Not reproduced.** The stage was looped 24 times on 2026-10-07 at loads 4.6 to 23.6 with the build instrumented to log every
`loadReview` call and its caller, every decision and every answer: all green, and every run read the review exactly twice,
once on opening and once from the Reload (`<scratchpad>/fin30/l12/loop1.out`, `loop2.out`). fin30's full
`pnpm requirements-proof --skip-build` (load 9.5 to 9.8) passed the stage with the reads `open` then `reload`. Whether the second read is the
product's (a path not found by reading) or the harness's (a press landing on the detail's Review control) is not settled.

**What is in place for the next red.** The board's observable now carries `reviewReads` — each read of the review, `open`
or `reload`, with its instant — and the stage's pane read prints it, so a recurrence names which read drew the refusal.

## Specs

REQ-TRACE-426: after a decision the pane keeps the payload the decision was made against, says it is out of date and offers
the reload alone. REQ-TRACE-424: a review asked for on a card not awaiting one names the state instead. The red shows both at
once, which neither requirement allows together.

## Relevant files

- `packages/ui/src/requirements/RequirementsView.tsx` — `loadReview`, `openPane`, the pane's `onReload`; `reviewReads` on the
  observable.
- `packages/ui/src/requirements/panes/ReviewPane.tsx` — `decided`, local state that a fresh payload does not clear.
- `apps/desktop/scripts/requirements-proof.mjs` — the end-to-end stage's `REVIEW_AT` reads at 36800 and 39800.

## Outcome

Repaired by fin34 (2026-10-13), from the code; the red itself was still not reproduced. **Every path by which the pane can
draw a payload, read for this note:** the pane's payload changes only in `loadReview`, and `loadReview` is reached only from
`openPane` (the detail's Review control) and the notice's Reload; nothing re-reads on a board change (`adoptBoard`, the
`onChanged` subscription and `refreshDetail` touch the board and the detail, never the review), no effect calls `openPane`,
and the decision path (`decide` → `perform`) writes no review state. A read cannot be outstanding while the decisions are
offered, since every read sets the pane to `reading` first and the decisions are drawn only over a payload. So the refusal at
36800 was a read asked after the accept, by the detail's Review control: nothing else asks one.

**What made the red's shape possible was the product's.** The decision's notice was `ReviewPane`'s local state, and the pane
stays mounted while its target is unchanged, so a fresh read — the review opened again — replaced the payload and left the
notice standing: REQ-TRACE-424's refusal for the card the accept had moved, under a notice saying the payload on screen was
the one the decision was made against. That is exactly the red. The notice now belongs to the read it was made against:
each read is numbered (`reviewReads`, `packages/ui/src/requirements/panes/review-reads.ts`), the pane is given the number of
the read its payload came from, the notice records the number it was decided against, and it is drawn only while those agree
(`decidedNoticeShown`). The review opened again after a decision now shows the fresh payload alone; the Reload behaves as
before. Reading this path also found a second one, recorded and repaired with it: a read outstanding for one requirement drawn
in the pane retargeted to another
([note](a-review-read-for-one-requirement-lands-in-the-pane-retargeted-to-another.md)).

Pinned by `packages/ui/src/requirements/panes/review-reads.test.ts` (the notice is not shown over a later read; red before:
the notice had no read to belong to). **Not settled:** what pressed the detail's Review control in run 3 at `a68f121` — the
script presses it only at 32000, before the accept. A recurrence now reads as a missing notice at 36800, with
`reviewReads` naming the second `open`, rather than as a refusal under the notice.
