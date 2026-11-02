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
[`a-row-that-grows-is-drawn-through-the-row-beneath-it-until-it-is-measured-again.md`](a-row-that-grows-is-drawn-through-the-row-beneath-it-until-it-is-measured-again.md)
(fix round 1).

## Repaired — 2026-10-02, under R-062 (measured 2026-10-01)

**Reproduced, and the first cause was not the one guessed above.** Diagnostics were wrapped around every `ResizeObserver`
in a scratch build: what each callback observed and disconnected, and which observed elements changed size during it. On
the code before the repair (`b19b74e`), `transcript-proof --only=geometry` carried the console line in 34 of 39 geometry
launches, unpinned and beside busy loops. In every launch whose diagnostics were kept, it came at the moment the
measurement observer was **made again inside its own delivery**: `disconnect`, a new observer, `observe` on every slot,
all within the callback. No launch showed it without that. The observer's effect depended on `display` and `capacity`, so
each displayed change disconnected the observer and observed every slot afresh. A passive effect is flushed when React next
renders, and the delivery's `flushSync` is such a render. A displayed change committed, the delivery came in the same frame,
and the pending effect ran inside it, observing all twenty slots at the depth just delivered. A slot rebound or re-observed
by the `flushSync` render (the guess above, and the triage's) was not seen once. So the triage's sketch, marking the keys
`measureAtCommit` reads as observed, would have left the line where it was, and it was not built.

**A second cause, under heavy load.** With the first removed, the line came back in 6 of 65 geometry launches, all beside
busy loops (load averages of 13.5 and 15.6 on four CPUs where they were recorded). In every one the scrollbar had appeared inside a delivery's render. A measured height
carried the pool past the viewport, about the step that expands the activity line, where in an ordinary launch the bar
appears in a render of its own. Every slot narrowed from 746 to 740 px within the callback, and their sizes were deferred. The code before showed the same, in 3 of the 15 launches alternated against the repair (loads 8.6, 14.8, 16.4). This
cause is not only a console line, which **falsifies this note's "Nothing a reader sees follows from it", kept above beside
this**. Each slot's measurement key carries the width, so every bound row was re-keyed. The geometry stage's attachment
reading then found the opened row under a new key and could not ask its frames: "the opened attachment never grew the row
under its own key", in 3 launches (loads 14.8 and 15.6 where recorded), on the code before and after alike. And once the row the
narrower width re-wrapped was painted 30.7 px through the row beneath it ("two rows overlap by 30.7 px", `row:25` and
`row:26`).

**The repair.**
- `TranscriptPane.tsx`: the measurement observer is made once per pane. Its effect depends only on identities held in
  state, so it runs at mount and never again, and nothing can disconnect it inside a delivery. A slot that a displayed
  change rebinds, or that a capacity growth adds, is observed by the every-commit layout effect (`observeAgain`) under its
  new key, as a scroll's rebinding already was. `measureAtCommit` still reads every newly bound key before the paint.
  With one observer for the pane's life, a slot whose node unmounts (a capacity that shrank) would have stayed observed
  and remembered under its old key, so a node mounted later in that slot under the same key went unobserved. Each slot's
  ref callback is now made once (`slotRef`, `pool.ts`): React calls it on mount and unmount only, and an unmounted node is
  unobserved and forgotten.
- `shell.css`: `.transcript__scroll` holds its scrollbar gutter (`scrollbar-gutter: stable`), so a bar that appears
  narrows no row. Only the width the rows are laid out at changes: the track is transparent (`docs/design/system/base.css`),
  and the design material (the mockup's stylesheet) states no rule for a scroller's gutter, so the held 6 px draws
  nothing. In every launch the scroller reported a single width, 740 px. Without it, each launch reported 746 px and then
  740 px.
- **Pinned** by three `transcript.test.ts` cases. A slot whose node unmounts is forgotten and unobserved (red with the
  forgetting removed: "expected false to be true"). The other two read the source, because the pane mounts under Electron
  and the suite has no document. The observer's effect depends on the five state identities alone (red with `display, capacity`
  put back: "expected [ 'measurements', …(6) ] to deeply equal [ 'measurements', …(4) ]"). The scroller's rule holds
  `scrollbar-gutter: stable` (red without it).
- **Shown** by `transcript-proof`, which now fails a run if any launch's log carries "ResizeObserver loop" (collected per
  launch in `results.resizeObserverLoops`, enforced after the last stage so a red run keeps its evidence).

**After.** Geometry alone, beside three busy loops and alternated launch by launch with the code before (load 5.9 to
16.5): 13 of 15 launches before carried the line, and 2 of 15 on the observer repair, both of them the scrollbar case. Over
all 65 geometry launches on the observer repair, 6 carried it, every one the scrollbar case. The gutter was then
alternated against the observer repair alone (load 7.2 to 11.6): 0 of 12 launches against 0 of 12. The scrollbar did not
appear inside a delivery on either side at those loads; with the gutter it cannot, since the width never changes.

**Again on the branch, 2026-10-02**, after origin/main `503a98d`, as root under Xvfb, Node 24, `--skip-build` after one
`pnpm build`, with the proof's new check. On the code before (`TranscriptPane.tsx` and `shell.css` as on `503a98d`), the
line came in 1 of 4 geometry launches, with the other plan's agents on the host (load average 7.7 to 11.6), and the run
failed on it. On the repair with `slotRef`: 0 of 10 geometry launches beside two busy loops (7.2 to 9.6), and 0 of the 33
launches of three whole runs (load 5 to 11). Two of the whole runs passed. The second was red on REQ-CHAT-055's append
comparison alone (103.45 ms against 53.8 ms, load average 5 to 6 from the other plan's agents, no busy loop of this
round's), and the third, taken at once after it, passed.

**Falsified by verification, 2026-10-02, kept above beside its replacement: "0 of the 33 launches of three whole runs".**
The verifier ran the branch at `0d6eb2b` (as root under Xvfb, Node 24, `--skip-build`, load average 1.8 to 5.4, no busy
loops) and the proof's check failed 3 of 5 runs on the line: whole run 1 in `append-loaded-2`, and two `--only=append` runs
in `append-loaded-traced` and `append-empty-traced`, each 20 to 120 ms after the run ended `completed`. The two repairs
above did not reach a third cause.

**The third cause: a delivery's render moved the bound span.** Reproduced on the branch at `1227a30` with the diagnostics
of 2026-10-01 wrapped around every `ResizeObserver` in a scratch build: 1 of 4 `--only=append` runs (1 of 24 launches,
load 1.4 to 3.9), in `append-loaded-traced`, about 200 ms after `run S1200 ended completed`. The measurement observer's
delivery had changed a height and rendered synchronously. Slots are bound by position (slot `i` holds row `first + i`),
and the corrected height moved `first` six rows: the slot that held `row:1221` now held `row:1227`, and likewise every
slot. Six slots emptied (33.4 and 47.3 px to 0), and twenty-one were observed again inside the callback by
`observeAgain` under their new keys. Every one is at the depth just delivered, so the browser deferred them and reported
the line. This is the cause the paragraph at the top guessed ("a render inside a delivery can rebind a slot"), which
the first round did not see in its geometry launches. The triage's sketch, marking the keys `measureAtCommit` reads as
observed, would not have repaired it either: a rebound slot changes size whether or not it is observed again.

**The repair.** `pool.ts`'s `bindRange`: a render binds the span the pool last committed while a delivery holds it, else
the span the viewport needs (`visibleRange`). `TranscriptPane.tsx` records the span each commit binds, and the observer's
delivery sets the hold in the same `flushSync` as the measured version, then releases it with an ordinary update, which
renders after the frame, outside any delivery, and rebinds what the delivery held back. The delivery's render therefore
moves rows and rebinds none, and the row that grew is still painted with the row beneath it moved. The held span is the
viewport's with `OVERSCAN` rows either side, and the same render pins the tail or restores the anchor, so the rows on
screen stay bound for that frame.
- **Pinned** by two `transcript.test.ts` cases. `bindRange` over sixty 40 px rows, the reader at the tail: a delivery that
  corrects the forty rows above to 20 px moves the viewport's span from rows 35 to 59 to rows 49 to 59, and the held render
  binds 35 to 59 still (red with the hold ignored: "expected { first: 49, last: 59 } to deeply equal { first: 35, last: 59 }").
  The other reads the pane's source, as the two above do: the hold and the measured version in one synchronous render,
  the release outside it (red on `1227a30`'s pane).
- **Shown** by `transcript-proof`'s check. Without the scratch diagnostics, on a build that counted each delivery that
  changed a height and each render the hold changed: 0 of 24 launches in four `--only=append` runs (load 3.6 to 14.7, the
  other plan's gates running) carried the line. Such a delivery came in 3 of the 24 launches, and in 2 the hold kept a
  span the old code would have rebound (`held 1015-1042 instead of 1022-1042`: seven rows). With the observer diagnostics
  also in place (they read every observed element's computed style after each callback), 0 of 30 launches in five more
  runs carried it, one of them holding, and three of the five were red on the append comparison. The four runs' REQ-CHAT-055 append
  comparison went red twice (164.1 against 130.0 ms at load 14.7, 110.1 against 90.9 ms at load 5 to 7); in the second the
  loaded side's launches had no changed delivery at all, so they ran no code the hold adds. The figures after the
  diagnostics were removed are in the next paragraph.

**On the repair as committed, 2026-10-02** (no diagnostics; as root under Xvfb, Node 24, `--skip-build` after one
`pnpm build`; the other plan's proofs and gates running beside it, load average 1.5 to 6.6): three whole runs and two
`--only=append` runs, 0 of 47 launches carrying the line. Four of the five passed. Whole run 3 was red on REQ-CHAT-055's
append comparison alone (175.9 against 135.6 ms, load 5.9 to 6.6, the other plan's app proofs running); the line was in
none of its launches. `rows-proof` and `theme-proof` passed on the same build (the scroller's held gutter).
