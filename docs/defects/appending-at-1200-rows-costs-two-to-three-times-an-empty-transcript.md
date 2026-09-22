## Appending at 1,200 rows costs two to three times what it costs on an empty transcript

`transcript-proof`'s append comparison (REQ-CHAT-055) fails, and the two distributions barely overlap —
this is not one slow sample. Measured on `main` at `1f3bad9`, 2026-09-22, both launches in the same run
of the script, each figure the time from an apply to the frame that SHOWS it (double `requestAnimationFrame`,
the measurement point ADR-0045 fixes):

| transcript | samples (ms) | median |
| --- | --- | --- |
| empty (`S0`) | 71.5, 40.8, 33.7, 23.1, 36.8 | **36.8** |
| 1,200 rows (`S1200`) | 69.8, 98.2, 139.1, 98.9, 83.9, 65.8, 75.9 | **83.9** |

Three runs of four have failed the comparison (74.8 vs 27.8 on `main` at `1f303e4`; 66.6 vs 37.0 in a
worktree; 83.9 vs 36.8 above). The one that passed is the only evidence that this is sometimes within the
budget, and its figures were not kept.

The red was **not visible until 2026-09-22**: the script stopped earlier, at the group-expansion assertion
that `docs/defects/fixed/the-two-driven-transcript-proofs-are-red-on-main.md` repaired, so the append
comparison had not been reached in any recent run. It is being recorded as found, not as new.

## Specs

`REQ-CHAT-055` fixes the append cost as a comparison rather than as a budget in milliseconds: appending at
depth must cost no more than appending to an empty transcript. The proof allows one frame at 60 Hz (16.7 ms)
of slack on top, which is the frame cadence being the floor at both ends and not a widening of the
requirement. A median of 83.9 ms against 36.8 ms is over that by a factor, not by a margin.

Whether the product violates the requirement or the measurement includes work the requirement does not mean
is exactly what is open. The figure is taken through `window.__rotarisApplies()`, which times an apply to
the painted frame — so it includes the projection, the pool's binding pass and the measurement pass, all of
which a 1,200-row transcript does more of than an empty one.

## Relevant files

- `apps/desktop/scripts/transcript-proof.mjs` — `appendRun`, `APPLIES`, and the comparison around line 430.
- `packages/ui/src/transcript/TranscriptPane.tsx` — the apply path: the projection, the visible range, the
  pin, and the ResizeObserver measurement pass.
- `packages/ui/src/transcript/pool.ts` — the fixed slot pool and its binding.
- `packages/ui/src/transcript/project.ts` — the projection the apply runs before any of that.

Noticed 2026-09-22 while repairing the two driven transcript proofs; recorded rather than repaired, because
finding out which of the two readings is true is its own measurement.

**Diagnosed and part-repaired 2026-09-22; still open, and now open about something narrower.**

The note left two readings on the table — the product violates REQ-CHAT-055, or the measurement includes
work the requirement does not mean. **The first is true**, and the mechanism is no longer a guess:
`TranscriptPane` builds one `measureKey` per DISPLAYED row on every render, and `measureKey` hashes
`sourceTextOf(d)`, which for a row concatenates its body, input, output and diff. One appended row
therefore re-hashed the text of all 1,200. That is work that grows with depth by construction, which is
precisely the growth the requirement forbids, and it is on the apply path the proof times.

Two memos now hold the content part and the whole key against the row **object**, which is a sound proxy
for "this content has not changed" because `ui-core/replica.ts` upserts by index and keeps the untouched
objects rather than mutating them — a changed row is a new object and misses, which is the only case that
should pay. `WeakMap`, so nothing needs evicting.

**Measured, three runs of the proof at each step, same machine, same session** (loaded median against
empty median, one frame of slack at 16.7 ms):

| | run 1 | run 2 | run 3 |
| --- | --- | --- | --- |
| before | 45.8 / 29.7 (**+16.1**, pass) | 62.4 / 37.9 (**+24.5**, fail) | fail |
| content hash held | 33.3 / 29.1 (**+4.2**, pass) | 47.3 / 27.1 (**+20.2**, fail) | 50.3 / 26.1 (**+24.2**, fail) |
| whole key held | 54.9 / 34.3 (**+20.6**, fail) | 37.1 / 41.6 (**−4.5**, pass) | 39.2 / 30.7 (**+8.5**, pass) |

The number moved and the repair is kept — a run in which the loaded transcript appended **faster** than the
empty one did not happen before — but two passes in three is not a pass, and the spread across identical
runs is wider than the effect being measured. The comparison is still not reliably inside the slack.

**What remains, and why it is not done here.** The other term that grows with depth is the projection
itself: `projectDisplay` runs whole-state over every row on every render, and `placements(display)` beside
it. `projectDisplay` already HAS an incremental form — `{ previous, from }`, with `cleanCut` for the
boundary — and the pane does not use it, because the pane is not told which row changed: `earliestChanged`
lives in the replica and there is no prop carrying it. Wiring it is a contract change across a seam, not a
memo, and nothing measured here says that term is what is left rather than the variance. Taking it on a
guess is the thing `.agents/skills/debug-ui` step 8 exists to forbid.

So the note stays open on a narrower question than it was recorded with: **not** whether the product is at
fault — it is — but which of the remaining depth-dependent terms is worth a seam change, measured under a
harness whose own spread is currently ±20 ms.

## The remaining candidate is falsified — 2026-09-22

The note closed the last round naming one thing to try: `projectDisplay` runs whole-state on every render,
an incremental form (`{ previous, from }`) exists, and the pane does not use it because no prop carries the
replica's `earliestChanged` across the seam. **It is measured now, and it is not where the cost is.**

`packages/ui/src/transcript/append-cost.test.ts` builds the proof's own S1200 fixture and times every pure
term on the apply path. On the development machine, medians of twenty-one runs after warm-up:

| term, at 1,200 displayed rows | median |
| --- | --- |
| `projectDisplay`, whole-state | 0.873 ms |
| `projectDisplay`, incremental (`from: 1199`) | 0.276 ms |
| `placements` over the displayed array | 0.072 ms |
| `measureKey` for every displayed row | 0.089 ms |

The same four at one row total about 0.017 ms. So the entire depth-dependent JavaScript on the apply path
is **about one millisecond**, and threading `earliestChanged` across the seam would buy **0.6 ms of a 47 ms
gap** — around one percent of it. That is the seam change the note was holding itself open to consider, and
it is not worth taking for this.

**Where the cost must therefore be.** The sample is `applyIncrement` plus two `requestAnimationFrame`
callbacks, so it is quantised by the frame cadence: the empty transcript's 36.8 ms is almost exactly the
two-frame floor the double-rAF imposes on anything at all, and the loaded transcript's 83.9 ms is five.
Three extra frames, with one millisecond of this product's own synchronous work in them, means the time is
being spent by the browser — style, layout, or paint over a scroll container whose offset table is 1,200
rows tall — or by the measurement pass the `ResizeObserver` drives after the pool rebinds. The pool itself
is bounded (`visibleRange` against `capacity`), so it is not element count.

**The note stays open, and the question it is open on has changed again.** It is no longer "which of the
remaining depth-dependent terms is worth a seam change" — none of them is. It is whether `REQ-CHAT-055`'s
comparison can be met at all under a scroll container that carries the whole transcript's height, or
whether the harness's apply-to-paint proxy is charging the product for frames it does not cause. Settling
that needs profiling inside the built application, across a measurement whose own spread is ±20 ms, which
is a round of work rather than a change — and is exactly the thing `.agents/skills/debug-ui` step 8 exists
to keep from being guessed at a third time.

What is kept from this round is the falsification, as a test rather than as prose: the bounds in
`append-cost.test.ts` are two orders above what was measured, so they cannot flake, and they can only fail
if one of these terms ever becomes the dominant one — which is the only condition under which the seam
change would be worth revisiting.
