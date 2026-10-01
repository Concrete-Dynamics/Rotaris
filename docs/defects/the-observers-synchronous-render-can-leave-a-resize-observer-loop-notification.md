## The observer's synchronous render can leave a ResizeObserver loop notification in the renderer console

Since 2026-10-01 the transcript pane's measurement observer renders synchronously when a delivery changes a height
(`flushSync` around `setMeasuredVersion` in `TranscriptPane.tsx`), so a row that grows under an unchanged measurement key is
painted with the row beneath it already moved
(`fixed/a-row-that-grows-is-drawn-through-the-row-beneath-it-until-it-is-measured-again.md`). A render inside a delivery
can rebind a slot, or observe one again (`observeAgain`), and every slot sits at the same depth of the document; the
browser then defers that slot's size to the next frame, as the ResizeObserver specification requires, and reports
"ResizeObserver loop completed with undelivered notifications" as an error event on the window, which Chromium writes to
the renderer console.

Seen once in `transcript-proof`'s whole run of 2026-10-01 (as root under Xvfb, Node 24): in the geometry launch, about
4 s after start, while the resumed session was first drawn and the scripted run began, and in none of the other eight
launches (the invariance launch's three opens and five resizes, the 1,200-row behaviour launch, the capacity launch, the
four append launches). Before the change no transcript-proof log in this host's worktrees carried the line.

Nothing a reader sees follows from it: the deferred size is delivered on the next frame, which is where the observer's
render used to land for every size. The cost is the console line and a window `error` event that any future listener
for renderer errors would receive. Recorded, not repaired: whether to leave it, to suppress exactly this message, or to
stop observing again in the commits a delivery causes (the commit's measurement, `measureAtCommit`, already reads every
newly bound key) is not settled here.

## Specs

None contradicted. ADR-0045 ("heights are measured") is the mechanism; its 2026-10-01 report-back records this cost.

## Relevant files

- `packages/ui/src/transcript/TranscriptPane.tsx` — the measurement observer's `flushSync`, and the re-observing layout effect.
- `packages/ui/src/transcript/pool.ts` — `observeAgain`, `measureAtCommit`.
- `apps/desktop/scripts/transcript-proof.mjs` — the launches whose logs carry the renderer console (`geometry.log`).

Noticed 2026-10-01 while repairing
[`a-row-that-grows-is-drawn-through-the-row-beneath-it-until-it-is-measured-again.md`](fixed/a-row-that-grows-is-drawn-through-the-row-beneath-it-until-it-is-measured-again.md)
(fix round 1).
