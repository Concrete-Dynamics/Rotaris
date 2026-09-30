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

## Measurement round authorized — 2026-09-23 ([R-048](../../product/requests.md#r-048))

No directive is owed: REQ-CHAT-055 is correct and the product fails it. The owner authorized the round this
note ends on, in this order:

1. **Tighten the proof.** Interleave the empty and 1,200-row samples, take about thirty of each, and report
   the result in frames as well as milliseconds, so the harness's own spread is small enough for a verdict.
2. **Trace the built app** over the same two fixtures, to name which of style recalculation, layout, paint or
   the `ResizeObserver` measurement pass carries the extra frames.
3. **Repair only the cause the trace names.** The candidates on record are a full-height scroll container
   laid out again on every append and a pin-to-bottom scroll write forcing a synchronous layout; neither is
   to be taken on a guess (`.agents/skills/debug-ui` step 8).

## Not taken 2026-09-27 ([R-054](../../product/requests.md#r-054))

The owner asked for this round again under R-054, and it did not start. All three steps drive the built
application, and the session ran in a Linux container as uid 0, where Electron will not start with Chromium's
sandbox on. Starting it any other way needs the sandbox switched off or the proof run under a different account,
and neither was done. So no proof was re-run, no trace was taken and no code changed. The round stays authorized as
R-048 left it, for a host that can launch the application: a Windows or Linux desktop, or a container running as
an unprivileged user.

## The round taken — 2026-09-28 ([R-062](../../product/requests.md#r-062), in R-048's order)

Host: a Linux container as uid 0, Node 24.21.0, Electron 44.1.1 (Chromium 152), the app under `xvfb-run` with
`--no-sandbox` (`hostSwitches`), four vCPUs. The frame cadence measured in the renderer — sixty consecutive animation
frames while nothing was live — was **16.7 ms** (p25 16.6, p75 16.7) in every launch, so a frame below is 16.7 ms.

### 1. The proof, tightened

`transcript-proof`'s append comparison now launches the two fixtures ALTERNATELY (empty, loaded, empty, loaded), pools
the samples, and reports every figure in frames beside milliseconds with its spread (median, quartiles, extremes,
median absolute deviation). The scripted run is `read,glob,read,glob,read,glob,think` — six tool calls, each two
appended rows and a settle, then the deliberation that ends the run. The earlier `think,read,answer` ended the run at
`think`, because a plain answer ends a run, and never reached its `read`: that is why the earlier rounds had five to
seven samples a launch. Each launch now yields 31 applies (17 row appends, 14 last-row updates), 62 a side pooled, and
the read of them is checked against the run's own end in the log. Every sample carries where its time went — `sync`
(the increment applied, React's synchronous flush, the layout effects), `frame1` (to the frame that showed it), `ms`
(to the frame after, REQ-CHAT-055's point) — what the increment did to the rows held, and when it arrived, so an
increment that arrived while the previous one was still being shown can be told from one that arrived to a quiet
surface (`apps/desktop/src/renderer/shell.ts`; the proof drops the attach increment).

**Before the repair** (run 1b — the tightened proof over `main` at `7a2b3bc` plus the instrument):

| pooled, 62 a side | empty (`S0`) | 1,200 rows (`S1200`) | difference |
| --- | --- | --- | --- |
| median shown-update, every update | **77.0 ms** (4.6 frames; p25 47.9, p75 106.3, max 166.8) | **120.7 ms** (7.2 frames; p25 78.6, p75 149.4, max 214.5) | **+43.7 ms** |
| median shown-update, row appends (34 a side) | 73.6 ms | 115.0 ms | +41.5 ms |
| per-launch medians | 61.3, 104.8 | 121.3, 120.1 | |
| `sync` per increment, median (p75) | 4.3 ms (5.8) | 7.2 ms (9.3) | **+2.9 ms** |
| `frame1`, median | 32.3 ms | 43.8 ms | +11.5 ms |
| increments that arrived while the previous was still being shown | 57 of 62 | 56 of 62 | |

The comparison fails at both cuts by a factor, and the spread (IQR 58 and 71 ms) is wider than the slack — but the
spread is not the harness's noise: **the run is one burst.** Its increments arrive 4–13 ms apart (the trace's own
arrival gaps), faster than the renderer shows them, so 57 of 62 samples measured the queue in front of them. The
sample list of a launch rises to the burst's head and then falls by one increment's work at a time (empty: 123.7,
120.3, 104.8, 101.5 … 19.4; loaded: 214.5, 198.1, 188.3 … 29.8), which is the shape of a queue draining and the
reason two identical launches disagree by 40 ms: they disagree about where the burst's head landed. REQ-CHAT-055's
figure is the time the reader waits, and in a burst that is the burst — on both sides alike, which is what makes the
comparison fair — so the difference between the sides is the per-increment cost times the queue, and the
per-increment cost is the `sync` row: **2.9 ms more per increment at 1,200 rows**, paid by every increment in front of
the one being measured. The pace of the burst is the scripted client's (seven model calls answered in a few hundred
milliseconds); the increments, their cost and the queue are the product's.

### 2. The trace

One further launch of each fixture is recorded with Chromium's own startup tracing (`--trace-startup`,
`--trace-startup-file`, `--trace-startup-format=json` — Electron passes the switches through; about 40 MB a launch,
under `.proof/transcript-proof/`), the renderer bracketing every increment with two user-timing marks, and
`apps/desktop/scripts/lib/trace-summary.mjs` charging the renderer main thread's self time to style recalculation,
layout, pre-paint, paint, the compositor commit, the `ResizeObserver` delivery and script — upward, so Blink's own
events count for the step they belong to, and a layout under script is counted apart as forced. These two launches
are not pooled into the comparison; tracing has a cost of its own. Over the whole run of the first pair (run 1; 31
increments a side, the attach dropped, per increment):

| per increment | empty | 1,200 rows | difference |
| --- | --- | --- | --- |
| main thread busy | 11.2 ms | 14.8 ms | **+3.6 ms** |
| script | 6.83 ms | 8.63 ms | **+1.80 ms** |
| style recalculation | 0.76 ms | 1.24 ms | +0.48 ms |
| layout | 1.97 ms | 2.12 ms | +0.15 ms |
| of which forced by script (inclusive) | 2.66 ms in 2.9 layouts | 3.29 ms in 3.0 layouts | +0.63 ms |
| pre-paint + paint + commit | 0.98 ms | 0.94 ms | −0.04 ms |
| `ResizeObserver` delivery | 0.05 ms | 0.06 ms | +0.01 ms |
| React synchronous flushes | 3.35 | 3.71 | +0.36 |
| layout objects laid out, median a layout (of the tree) | 26 (of 966) | 26 (of 944) | — |

**Script carries it.** The `ResizeObserver` pass is fifty microseconds. Paint is unchanged. Layout's scope is the same
26 dirty objects a pass on both sides and its time is within 0.2 ms — the full-height scroll container is NOT laid out
again at depth. Style recalculation is half a millisecond more. The extra is the renderer's own JavaScript: React's
synchronous flush (`scheduleMicrotask` in the bundle, 1.6–1.7 s of self time over a launch), of which there are **three
to four per increment** — the increment's own render, the measurement pass's (`setMeasuredVersion`), the tail pin's
scroll event (`setScrollTop`), and a whole-session update arriving beside a tool event — and each of those renders
re-ran ADR-0046 step 4 whole-state over every resident row with `placements` beside it, rebuilt the context value
every bound row reads (so every visible row re-rendered on every render, and a full viewport holds more of them), and
re-ran the layout effect whose pin reads `scrollHeight` (a forced layout per render: 2.9–3.0 an increment, above).

**So both candidates on record are falsified as the cause and kept here.** The scroll container's layout costs
+0.15 ms an increment and lays out the same 26 objects; the pin's forced layout costs +0.63 ms an increment — real,
about a sixth of the extra, and not the term. And the previous round's falsification stands corrected in its
multiplier rather than its measurement: "the whole pure-function part of an apply at 1,200 rows is about one
millisecond" was measured per RENDER; an increment causes three to four renders, and a burst queues fifteen increments
in front of the median sample, so one millisecond became forty-five.

### 3. The repair — only what the trace named — and what it changed

Four changes, all in `packages/ui/src/transcript/`, all to how much script an increment costs and none to what is
projected or drawn (`projector.ts` with `projector.test.ts`, 7 cases; `TranscriptPane.tsx`):

1. **Step 4 runs once per change of its inputs, not once per render.** The pane holds one projector; every input step 4
   reads is a key — `rows` and `expanded` by identity, the two pending lists element by element (the view hands the
   pane `session.pendingApprovals ?? []`, a fresh array per render), the caps by value.
2. **The one projection an increment does cause is the bounded one** step 4 had from its first line —
   `{ previous, from }`, with `from` read off the two rows arrays' identity prefix (`changedFrom`) rather than threaded
   across the seam; a truncation, a change reaching position 0 (older rows paged in) or any other input changing falls
   back to the whole window, and the bounded result is asserted equal to the whole one across a run's shapes.
3. **The offset table is rebuilt when the rows, the width, the expansion or a measurement change**, not every render
   — a thousand lookups and, for every row never yet on screen, an estimate, three or four times an increment before.
4. **The surface value every row reads is built once per change of what it carries**, so a render no longer
   re-renders every bound row for a value none of them could see change.

Measured in steps, because `.agents/skills/debug-ui` step 8 keeps a repair only if its number moved. Each row is the
tightened proof once through: the pooled median shown-update time over every update (62 a side, loaded against empty),
the row appends alone, and `sync` — the synchronous work one increment costs:

| the code under test | every update | row appends | `sync` per increment | verdict |
| --- | --- | --- | --- | --- |
| before (run 1b) | 120.7 vs 77.0 ms, **+43.7** | 115.0 vs 73.6, +41.5 | 7.2 vs 4.3 | fail |
| 1 alone (run 2) | 103.3 vs 75.5, +27.8 | 96.6 vs 71.5, +25.1 | 5.7 vs 4.0 | fail — the number moved, kept |
| 1 + 4 (run 3) | 97.1 vs 89.4, +7.7 | 88.3 vs 82.0, +6.3 | 6.3 vs 3.9 | pass |
| 1 + 4 again (run 4) | 111.7 vs 84.3, +27.4 | 103.5 vs 79.7, +23.8 | 6.9 vs 4.7 | fail — run 3 was the noise's edge, not a floor |
| 1 + 2 + 3 + 4 (run 5b) | 83.6 vs 92.0, **−8.4** | 76.9 vs 85.9, −9.0 | 4.8 vs 4.2 | **pass** |
| the same (run 7) | 68.8 vs 83.9, **−15.1** | 61.6 vs 78.9, −17.3 | 5.0 vs 3.2 | **pass** |
| the same (run 8) | 82.3 vs 98.3, **−16.0** | 73.7 vs 89.6, −15.9 | 4.8 vs 4.8 | **pass** |

The slack is one frame at the cadence measured, 16.7 ms. In the last three runs the loaded transcript showed its
appends **faster** than the empty one at the median — the strongest form the clause can take, and the form ADR-0045's
first execution had once measured and this note had lost. The increments that arrived alone read the floor: empty
15.8–26.9 ms (one to two frames), loaded 30.9–31.8 ms (two frames: the append, then the frame the measurement pass
costs it), four a side a run — too few for a verdict of their own, reported beside the one that has one.

**Run 4 also found the first form of change 2 never taken in the built app**: the expansion set was memoised on the
rows, so every increment changed one of the projector's keys and `changedFrom` refused. Measured, not read — which is
why the pane now publishes its projection counts (`data-projections`, verification only, like `data-cache`) and the
proof refuses a launch in which the bounded form never ran: 31 of a launch's 34–36 projections took it in every launch
since (the others are the resume's whole read, a cap or state change, and the trailers).

**Two runs did not reach the comparison, and both were the harness's.** Run 5 was refused its session by the previous
launch's run host, still exiting when the next launch opened the same session (pid liveness; the proof now waits for a
launch's children — `fixed/a-session-lock-outlives-the-application-that-held-it-for-as-long-as-its-run-host-takes-to-exit.md`,
open when this was written, because the window is the product's too; repaired 2026-09-28, main now ends after its run host). Run 6 aborted at the geometry stage, whose first sample was an
appointment at 3.0 s and whose live line closed at about 2.35 s — six runs of seven had caught it in exactly one sample
(`fixed/the-geometry-stage-catches-its-live-line-in-one-sample-or-none.md`; the first sample now waits for the line).

**The trace, after** (run 5b's traced pair, per increment over the whole run): script **7.59 ms empty against 7.38 ms
loaded** (from 6.83 against 8.63 before), style 1.12 against 1.05, layout 3.51 against 2.09 (forced 4.27 against
2.92), paint 0.44 against 0.61, the observer pass 0.03 against 0.03; the main thread busy 15.0 ms an increment on the
empty transcript and 13.0 ms on the loaded one. The per-increment cost no longer grows with the rows held. What remains
above the empty side in the pooled `sync` (0.6–1.8 ms in the three passing runs) is inside a frame, reported, and not
pursued: it is the bounded projection, the replica's own upsert over the resident window and the measurement pass's
second render — each of them work step 4 or REQ-CHAT-058 asks for.

## ~~Repaired — 2026-09-28 under R-062~~ — withdrawn the same day (fix round 1, below)

*Kept as written, because the fix round falsified it: the three passing runs were measured on a first form of
`changedFrom` that drew removed rows, and six runs after its repair did not pass three in a row.*

REQ-CHAT-055's append comparison passes in three consecutive runs of `transcript-proof` on Linux (runs 5b, 7 and 8
above — the third with the geometry stage's first sample repaired, the product code identical across the three), each
alternating the fixtures, pooling 62 samples a side, reading both cuts at one frame of slack, and requiring the
bounded projection to have run. Pinned by `packages/ui/src/transcript/projector.test.ts` (once per change of inputs;
the bounded form's `from` and its agreement with the whole window across a run) and
`apps/desktop/scripts/lib/trace-summary.test.ts` (the account the trace verdict rests on), with
`append-cost.test.ts` unchanged and green. The measurement point is reported back into ADR-0045 in place, and the
reading the round left open — the comparison under a burst, and what "an empty transcript" is compared against — is
**OQ-89**. The three runs' `results.json`, `append.json` and the two traces are under `.proof/transcript-proof/` of the
last run; the earlier runs' logs and figures were kept beside the work and are summarised in the tables above.

## Fix round 1 — 2026-09-28 (R-062): reopened

**What the independent verifier found.** The first form of `changedFrom` fell back to the whole window only when the
rows array got SHORTER. When the row at the first differing position had been removed and at least as many rows
followed, it returned the next array's later index, and the bounded form kept the removed row: switching REQ-CHAT-069's
"This task" from one agent to another drew the first agent's row inside the second's scoped transcript
(`[row 0, row 1, row 2, row 3]` where the whole projection gives `[row 0, row 2, row 3]`), and an increment removing its
earliest-changed row while appending kept it too. "Nothing about WHAT is projected changes here", as written above and in
ADR-0045, was false for those shapes.

**Repaired** (`projector.ts`, `project.ts`, `projector.test.ts`): the bounded form is taken only for an append past the
previous end or a row replaced at its own index; a different index at the first differing position projects the whole
window. A seeded walk of 600 steps over every shape the pane can be handed (appends of every kind across three agents,
settles and growth, a kind changed in place, removals through `projectIncrement`, scope switches through `scopedRows`,
truncations, rows paged in above) found one more in step 4 itself — a previous run stranded below the cut when a member
was replaced by a row that no longer joins it — recorded and repaired as
`fixed/the-bounded-projection-strands-a-run-whose-member-changed-in-place.md`. With either repair reverted the tests fail.
Appends and settles are untouched: **31 bounded projections a launch** (of 34–36) in every launch below, as before.

**The proof, re-run on the repaired form.** The first three runs aborted at the geometry stage before the comparison
("no sample caught a live line") — a race in the stage's own first sample, repaired in the same round
(`fixed/the-geometry-stage-catches-its-live-line-in-one-sample-or-none.md`, whose earlier diagnosis is falsified and
kept). Then six complete runs, same host, same built product, the harness unchanged between them; the host was shared
with other agents' Electron proofs throughout, which is noise this proof cannot remove:

| run | every update, loaded vs empty | row appends | IQR empty / loaded (every update) | `sync` median, loaded vs empty | verdict |
| --- | --- | --- | --- | --- | --- |
| F1 | 88.2 vs 79.0 ms, +9.2 | 82.5 vs 76.2, +6.3 | 50.1 / 50.7 | 4.8 vs 4.0 | pass |
| F2 | 94.0 vs 76.1, **+17.9** | 86.5 vs 71.0, +15.6 | 44.6 / 57.0 | 5.0 vs 3.35 | **fail** |
| F3 | 89.2 vs 95.0, −5.8 | 83.4 vs 88.2, −4.8 | 60.4 / 60.0 | 5.45 vs 5.0 | pass |
| F4 | 96.0 vs 85.8, +10.3 | 90.6 vs 82.4, +8.2 | 51.0 / 56.2 | 5.4 vs 4.15 | pass |
| F5 | 89.7 vs 66.8, **+22.9** | 84.8 vs 64.6, **+20.1** | 44.5 / 54.7 | 5.8 vs 3.3 | **fail** |
| F6 | 86.0 vs 72.2, +13.8 | 78.5 vs 69.8, +8.7 | 51.1 / 56.8 | 4.55 vs 4.0 | pass |

Slack one frame at the measured cadence, 16.7 ms in every launch; 62 pooled samples a side a run. The verifier's own
run on the first form read +4.5 / +11.0 with pooled IQRs of 94.1 and 62.3 ms. **Four passes in six, never three in a
row**, and the loaded side above the empty side at the median in five of six (median difference over the six, every
update: +12.1 ms). The builder's "loaded faster than empty" (−8.4, −15.1, −16.0) did not recur and is not a result.

The traced pair a run, per increment over the whole run (script / layout, empty against loaded, ms):

| run | script | layout | React flushes an increment |
| --- | --- | --- | --- |
| F1 | 6.31 / 6.04 | 2.72 / 1.81 | 3.45 / 3.52 |
| F2 | 5.01 / 5.84 | 1.99 / 1.73 | 3.52 / 3.45 |
| F3 | 7.35 / 6.46 | 2.50 / 1.87 | 3.45 / 3.55 |
| F4 | 4.80 / 6.81 | 1.83 / 2.17 | 3.45 / 3.45 |
| F5 | 6.25 / 6.13 | 2.54 / 1.80 | 3.55 / 3.58 |
| F6 | 5.03 / 7.59 | 1.79 / 2.59 | 3.45 / 3.55 |

**The state now.** The main thread's cost per increment does not grow with the rows held — script is higher on the
loaded side in three traced pairs of six and lower in three, and layout is lower on the loaded side in four of six — which is what the repair was for and
still holds. The pooled comparison does not pass reliably: a residual of about two thirds of a frame stands on the loaded
side at the median, inside a spread three times the slack, and the pooled `sync` stays 0.45–2.5 ms above the empty side
in every run. Not measured and so not claimed: whether the residual is the bounded projection, the replica's O(n) upsert
and the measurement pass's second render (the earlier section's reasoning), or the fixtures, which are NOT reseeded
between launches — `S0` holds 1, 18 and 35 rows before its three append launches and `S1200` 1,200, 1,217 and 1,234
(OQ-89 names the question of what "an empty transcript" is). This note therefore stays open, with the comparison's
reading under a burst still OQ-89's and no second repair taken on a guess (`.agents/skills/debug-ui` step 8). The six
runs' logs, `append.json` files and traces were kept beside the work; `.proof/transcript-proof/` holds only the last.


## Fix round 2 — 2026-09-28 (R-062): still open

**What the independent verifier found, and what changed.** The bounded projection the pane takes on every append still
drew something the whole-state projection does not, on a pure append: `cleanCut` read runs on the raw rows while the fold
reads the rows hygiene keeps (a live duplicate reasoning row REQ-CHAT-048 drops split its agent's activity line), and a
repeated edit diff REQ-CHAT-050 drops, re-sent at its own index with the rows behind it removed, let the reused prefix
reach past `from`. Recorded and repaired as
[`fixed/the-bounded-projection-reads-runs-on-rows-hygiene-drops.md`](the-bounded-projection-reads-runs-on-rows-hygiene-drops.md);
`projector.test.ts` pins both, and its seeded walks now run seven seeds with diff rows and reasoning durations over every
value of `running`, `groupTools` and `showReasoning`. Fix round 1's claim that the bounded form is "taken only where it
projects what the whole-state form projects" was false for those two shapes until this repair; the pass/fail series above
was measured on that form.

**The repair costs nothing measurable at the unit.** A throwaway median of 400 calls at the proof's S1200 shape (the
bounded projection of one appended tool row, not kept): 0.117 ms before the repair, 0.119 ms after; the whole-window
projection 0.21 and 0.20 ms. At one row, 0.002 and 0.004 ms. Whatever moves the proof below, it is not this change.

**The verifier's three runs on fix round 1's build**, which the note did not yet hold: every update +11.45, −4.4 and
−12.4 ms — three passes in a row. With F1–F6 that build read **7 passes in 9**, and its three consecutive passes were
the verifier's, not a series this note had recorded.

**Six runs on the repaired build** (G1–G6; `pnpm build`, then
`xvfb-run -a -s "-screen 0 1600x1000x24" node apps/desktop/scripts/transcript-proof.mjs --skip-build`, same Linux host
as root, 62 pooled samples a side, slack one frame at the measured cadence of 16.7 ms in every run, 31 bounded
projections a launch of 34–36, trace coverage 31 of 31 in every traced launch). The host carried other agents' Electron
proofs throughout (sixteen Electron processes counted during G1), and G5 additionally overlapped a vitest run of this
round's own for about ten seconds:

| run | every update, loaded vs empty | row appends | IQR empty / loaded (every update) | `sync` median, loaded vs empty | verdict |
| --- | --- | --- | --- | --- | --- |
| G1 | 114.1 vs 84.55 ms, **+29.55** | 105.65 vs 81.6, **+24.05** | 45.1 / 66.2 | 6.2 vs 4.0 | **fail** |
| G2 | 92.2 vs 80.55, +11.65 | 86.35 vs 77.4, +8.95 | 51.8 / 64.1 | 5.65 vs 4.3 | pass |
| G3 | 118.45 vs 82.6, **+35.85** | 112.6 vs 76.0, **+36.6** | 48.9 / 63.8 | 5.6 vs 4.55 | **fail** |
| G4 | 99.75 vs 81.1, **+18.65** | 94.25 vs 74.75, **+19.5** | 55.5 / 60.0 | 5.95 vs 4.25 | **fail** |
| G5 | 130.1 vs 86.4, **+43.7** | 123.35 vs 82.3, **+41.05** | 58.6 / 67.7 | 7.0 vs 4.45 | **fail** |
| G6 | 99.7 vs 95.2, +4.5 | 92.65 vs 87.9, +4.75 | 60.5 / 60.4 | 5.9 vs 4.55 | pass |

The traced pair a run, per increment over the whole run (the first increment dropped, 31 a side; script / layout /
main thread busy, empty against loaded, ms). G1's traces were overwritten by an aborted second run before they were
copied, so G1 has the comparison and no trace account:

| run | script | layout | busy |
| --- | --- | --- | --- |
| G2 | 5.09 / 7.64 | 1.63 / 2.24 | 8.81 / 13.73 |
| G3 | 5.23 / 8.43 | 2.02 / 2.62 | 9.76 / 14.98 |
| G4 | 6.38 / 6.42 | 2.46 / 2.29 | 11.47 / 11.27 |
| G5 | 4.95 / 9.76 | 1.93 / 5.04 | 9.32 / 19.49 |
| G6 | 7.44 / 7.22 | 2.09 / 2.13 | 13.62 / 11.98 |

**The state now.** Two passes in six on the repaired build, against four in six (and the verifier's three of three) on
fix round 1's — with the projection's own cost unchanged at the unit, the per-increment script at parity in two traced
pairs and 2.5–4.8 ms higher on the loaded side in three, and the pooled `sync` 1.05–2.55 ms above the empty side in every
run. Over the fifteen runs since the fix rounds began, the comparison passed nine; its outcome on this host moves with
something the proof does not control. What the fifteen runs agree on: the loaded side sits above the empty side at the
median in twelve of them, by a residual larger than the projection could explain (0.12 ms at the unit), inside
spreads three to four times the slack. Not measured, and so not claimed: whether that residual is the replica's O(n)
upsert and the measurement pass's second render, the fixtures growing between launches (`S0` at 1, 18 and 35 rows;
`S1200` at 1,200, 1,217 and 1,234), or contention on a shared host — the loaded traces of G3 and G5 carry
layout and busy time the empty ones do not, which a neighbour's load could equally produce. No further repair is taken
without a trace naming its cause (`.agents/skills/debug-ui` step 8), the note stays open, and OQ-89 still holds the
reading under a burst and what "an empty transcript" holds. The six runs' logs, `append.json` files and traces (G2–G6)
were kept beside the work; `.proof/transcript-proof/` holds only G6.

**Not reached by any test, and so guarded by this proof alone:** the offset table and surface-value memos in
`TranscriptPane.tsx`. The vitest environment is `node`, with no DOM testing library in the repository; a stale
dependency there (the offset table keyed without `measuredVersion`, say) would be caught only by `transcript-proof`'s
geometry and append stages.

## Fix round 3 — 2026-09-28 (R-062): a record-only round, still open

**What the independent verifier found.** The record outside this note still gave fix round 1's reading as the current
state: `first-release-plan.md` said, in the present tense, that the per-increment cost "no longer grows with depth" and
that the comparison stands "about two thirds of a frame over at the median"; `codebase.md` said the first; and
`first-executions.md` placed the original round's traced script (7.6 against 7.4 ms, from 6.8 against 8.6) after fix
round 2's sentence, where it read as fix round 2's. Fix round 2's own series does not support either reading — its six
runs stand +24.1 ms over at the median (1.4 frames), and its per-increment script is at parity in two traced pairs of
five. Each place now keeps fix round 1's figure struck or labelled as that round's, beside fix round 2's. No code
changed for it.

**The verifier's three runs on fix round 2's build**, reported with the finding: every update +8.95, **+40.65** and
**+18.1** ms — one pass in three.

**Three re-runs on the same build** (H1–H3; the build made from fix round 2's tree before this round's only code edit,
a doc comment in `project.ts`; then `xvfb-run -a -s "-screen 0 1600x1000x24" node apps/desktop/scripts/transcript-proof.mjs --skip-build`
three times in a row, each exiting 0). Unlike G1–G6 the host was quiet: no other Electron process at the start or after
any run, load average 0.04 when the first began. 62 pooled samples a side, frame 16.7 ms in every run, 31 bounded
projections a launch of 34–36, trace coverage 31 of 31 in every traced launch:

| run | every update, loaded vs empty | row appends | IQR empty / loaded (every update) | `sync` median, loaded vs empty | frames median, loaded vs empty | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | 95.25 vs 92.4 ms, +2.85 | 85.25 vs 85.2, +0.05 | 64.5 / 87.8 | 6.4 vs 4.8 | 5.70 vs 5.54 | pass |
| H2 | 92.95 vs 82.0, +10.95 | 84.75 vs 76.5, +8.25 | 48.7 / 62.6 | 4.9 vs 3.65 | 5.57 vs 4.91 | pass |
| H3 | 105.2 vs 104.3, +0.9 | 100.9 vs 88.55, +12.35 | 65.0 / 42.6 | 5.3 vs 5.0 | 6.30 vs 6.25 | pass |

The traced pair a run, per increment over the whole run (the first increment dropped, 31 a side; empty against loaded,
ms):

| run | script | layout | busy |
| --- | --- | --- | --- |
| H1 | 6.23 / 8.46 | 2.04 / 2.61 | 11.01 / 14.95 |
| H2 | 5.44 / 6.63 | 1.90 / 2.46 | 10.97 / 11.41 |
| H3 | 5.02 / 9.26 | 1.69 / 2.18 | 8.85 / 15.34 |

**The state now.** H1–H3 are three consecutive passes, the count this item names for moving the note — and the note is
**not** moved, because the same build's other nine runs pass three (G1–G6 two, the verifier's one), and because the
traces do not agree with the passes: in all three traced pairs the loaded side's script is 1.2–4.2 ms higher per
increment and its layout 0.5–0.6 ms higher, on a quiet host where a neighbour's load cannot explain it. On fix round
2's build the comparison reads **six passes in twelve**, and over the twenty-one runs since the fix rounds began,
thirteen; the loaded side sits above the empty side at the median in eighteen of the twenty-one. Its per-increment
script is at parity in two traced pairs of eight and 1.2–4.8 ms higher on the loaded side in six, so **whether the
per-increment cost still grows with depth is unshown** — fix round 1's "at parity in every traced pair" is that round's
reading, not this build's. What the quiet host adds is one observation, not a cause: every run on it passed, every
failure of this build was on a shared host or the verifier's. No trace yet names the loaded side's extra script, so no
repair is taken (`.agents/skills/debug-ui` step 8); the candidates stay the ones fix round 2 named. OQ-89 still holds the
reading under a burst and what "an empty transcript" holds. The three runs' logs, `append.json` files and traces were
kept beside the work; `.proof/transcript-proof/` holds only H3.

## The CPU profile — 2026-09-29 (R-062, R-048's order continued): the loaded side's extra script named, and repaired

*Fix round 3 left this note open on one observation: in every traced pair the loaded side's script was 1.2–4.2 ms higher
per increment, and no trace named it — Chromium's `FunctionCall` event names only the entry point React's scheduler was
called through, never the component or helper the time went to. This round adds V8's own sampling profiler to the same
traced launches, names the extra script by function, and repairs only what it names.*

**The instrument.** The traced launches add `disabled-by-default-v8.cpu_profiler` and its fine interval
(`…cpu_profiler.hires`) to the startup-tracing categories; V8 sampled the renderer's main thread every 168–174 µs (169 at
the median), 3,100–3,750 samples over a launch's increments. `apps/desktop/scripts/lib/trace-summary.mjs` reads the
`Profile` and `ProfileChunk` events back and charges every sample inside the increments' span — the first kept apply to
the last shown frame, the span the trace account's per-increment figures read — by the trace account's own bucket rule: a
sample inside style, layout, pre-paint, paint or the commit is the browser's whatever script was on the stack (so a
forced layout is layout, and `under` says which function forced it), a sample with no event open is idle, V8's own
`(idle)` inside a task is not (the frames' paint was sampled as it — measured, not assumed), and every other sample is the
sampled function's self time, named by the source module the renderer bundle's `//#region` markers place its line in. A
gap between samples longer than four intervals is capped at four. `append.json` gains `profile`: each side per increment
by function and by module, and loaded minus empty. `trace-summary.test.ts` pins the placement of samples across chunks,
the gap cap, the naming, the charging and the per-increment difference (6 cases).

**Host.** The same Linux container as uid 0, Node 24.21.0, Electron 44.1.1, `xvfb-run`, four vCPUs. Other agents' Electron
proofs ran beside most of the naming launches (8 to 22 other Electron processes counted). A per-function difference
tolerates that better than the timing comparison does, because the functions it names are near zero on the empty side
whatever the neighbours do; the totals do not, and are read with that in mind.

### What the profile names

Three traced pairs in the proof's own launch order — a scratch driver of the proof's append stage alone: plant, two
untraced alternating pairs, then three traced pairs, so the empty launches hold `S0` at 35, 52 and 69 rows and the loaded
ones `S1200` at 1,234, 1,251 and 1,268, both viewports full as in the proof's traced pair — on `main`'s product at
`fa377e6` with only the instrument added. Loaded minus empty, milliseconds per increment:

| per increment | pair 1 | pair 2 | pair 3 | mean, empty → loaded | mean difference |
| --- | --- | --- | --- | --- | --- |
| main thread busy | +2.29 | +1.41 | +1.70 | 8.48 → 10.28 | **+1.80** |
| script | +1.18 | +1.32 | +2.00 | 3.96 → 5.46 | **+1.50** |
| layout | +0.49 | +0.01 | −0.09 | 1.59 → 1.73 | +0.14 |
| style | −0.02 | −0.01 | +0.10 | 0.61 → 0.64 | +0.03 |
| paint, pre-paint and commit | +0.23 | +0.04 | −0.14 | 0.61 → 0.65 | +0.04 |
| garbage collection | +0.10 | −0.02 | −0.01 | 0.09 → 0.11 | +0.02 |
| native, unbucketed | +0.32 | +0.08 | −0.13 | 1.59 → 1.68 | +0.09 |

The extra is script, as the trace account had said. By module (script self time):

| module | pair 1 | pair 2 | pair 3 | mean, empty → loaded | mean difference |
| --- | --- | --- | --- | --- | --- |
| `packages/ui/src/transcript/project.ts` | +0.32 | +0.23 | +0.30 | 0.12 → 0.40 | **+0.28** |
| `packages/ui/src/transcript/TranscriptPane.tsx` | +0.09 | +0.23 | +0.42 | 0.91 → 1.15 | **+0.24** |
| `packages/ui/src/transcript/pool.ts` | +0.20 | +0.20 | +0.17 | 0.01 → 0.20 | **+0.19** |
| `packages/ui/src/transcript/Row.tsx` | +0.18 | +0.16 | +0.23 | 0.04 → 0.23 | **+0.19** |
| `react-dom` | −0.14 | +0.08 | +0.40 | 1.61 → 1.73 | +0.11 |
| `src/renderer/main.tsx` | +0.05 | +0.12 | +0.12 | 0.05 → 0.15 | +0.10 |
| `packages/ui/src/transcript/cache.ts` | +0.07 | +0.04 | +0.09 | 0.09 → 0.16 | +0.07 |
| `packages/ui/src/transcript/projector.ts` | +0.03 | +0.12 | +0.02 | 0.02 → 0.07 | +0.06 |
| *the six transcript modules together* | +0.89 | +0.97 | +1.23 | 1.17 → 2.21 | **+1.03** |

**Named: the transcript's own code, walking every displayed row on every increment.** Of +1.50 ms of script an increment,
1.03 ms is in the six modules of `packages/ui/src/transcript/`, larger on the loaded side in every pair, and the functions
carrying it are at or near zero on the empty side — work that grows with the rows held, which REQ-CHAT-055 forbids to the
extent that it moves the shown-update figure, and which the burst makes move it by multiplying it by the queue in front
of each sample. By function, grouped by the pass each belongs to (mean difference over the three pairs; larger on the
loaded side in all three unless marked):

| pass | functions and their mean difference, ms per increment | what it did on every increment |
| --- | --- | --- |
| the offset table | the table's memo in `TranscriptPane.tsx` +0.084, `estimateHeight` +0.077, `wrappedLines` +0.060, `peek` +0.038, `measureKey` +0.035 — **+0.29** | rebuilt over every displayed row two or three times an increment (the new rows, then each measurement they caused): a key, two cache lookups and, for every row never yet on screen, an estimate |
| the projection | `projectDisplay` +0.083, `lastIndexOf` +0.053, `foldRuns` +0.053, `changedFrom` +0.039 (two pairs of three), smaller helpers — **+0.34** with `projector.ts` | the bounded form filtered the whole previous display, then searched it again for its cut; a run beginning or ending (`running` flipping) projected the whole window, twice a run; the changed row was found by a scan from the top |
| the places | `placements` +0.046 and its map +0.050, `rowRole` +0.018 — **+0.11** | REQ-CHAT-057/067's two facts recomputed for every displayed row once a projection |
| the update shape | `updateShape` +0.039 and its map +0.012 — **+0.05** | both displays mapped to their keys to classify an append |

Not named as the product's own work over the rows held: React's reconciliation and DOM writes (+0.11, two pairs of three),
the layout the pin's effect forces (+0.18 of layout under it, two pairs of three — the browser's), the renderer shell's
`App` and `Workspace` and the composer (+0.10, among them the composer draft's IPC write, `write`, +0.044), and small
native and collection terms that change sign between pairs.

**The comparison's other shape, measured and not repaired.** The traced pair holds both viewports full. The comparison's
first empty launch does not: `S0` starts at one row and gains seventeen, so its viewport never fills and an append binds
a new slot while every other slot keeps its row; on the loaded side every append at the tail moves the bound range and so
rebinds every bound slot. Profiled once as a pair of its own (a fresh `S0` at one row against `S1200` at 1,200): the main
thread busy **+3.43 ms** an increment — script +1.73, of it React's DOM writes for the rebound slots +0.45 and the
transcript's own passes above about +1.1; layout +0.87 over twice the objects (73 dirty layout objects an increment
against 36, twelve text-shaping passes against six); style +0.25 (50 elements restyled against 25); paint, pre-paint and
commit +0.23. In the traced pairs, whose empty side is full too, the dirty objects and the text shaping are nearly level
(67–78 against 79–85 dirty objects and 12–14 against 14–15 shaping passes an increment in fix round 3's three pairs).
That part is visible-row work: REQ-CHAT-055's first sentence permits it, and its third sentence's comparison charges it to
the loaded side whenever the empty side's viewport is part-empty — OQ-89's second reading. It is not the product's defect
on the record's present reading, and it is not repaired here; it is measured again after the repair below.

### The repair — only the passes the profile named

All in `packages/ui/src/transcript/`, each built to answer what the whole pass answered, each with a test that fails on
the first form:

1. **The offset table is rebuilt where it changed** (`pool.ts`'s `reuseOffsets`): a row that is the same object at the
   same position, and whose identity the measurement pass has not re-measured since the committed table, keeps its height
   and its offset, and the prefix sums are re-summed from the first height that changed. The pane stamps each
   `ResizeObserver` delivery and marks the identities it re-measures in a `MeasureLedger`; the two measurement caches
   report their evictions and clears to it (`cache.ts`'s new `onEvict`); with nothing marked, the pane hands the table no
   lookup at all. *Test:* at 1,200 displayed rows an append reads one height and a measurement of three identities reads
   three — the first form read 1,201 — and a seeded walk of 800 steps (appends, settles, removals, rows changed in place,
   measurements, evictions, resizes, toggles) holds the table to `buildOffsets` of every height at every step.
2. **The update shape compares keys only past the rows both arrays share** (`pool.ts`'s `updateShape`). *Test:* an append
   at 1,200 reads at most four keys — the first form read 2,401 — and 2,000 seeded pairs answer what the first form
   answered. (It never answers `extend`, and neither did the first form: recorded as
   [`the-update-shape-never-answers-extend.md`](../the-update-shape-never-answers-extend.md).)
3. **The places are built from the previous projection's** (`Row.tsx`'s `placementsFrom`, carried by the projector): a
   row the bounded form carried over keeps its place object, and above the first changed position only a row entering or
   leaving the most recent tool pair gets a new one. *Test:* an appended tool row at 1,200 builds its own place and
   rebuilds one above it, the tool row it pushes out of the most recent pair — the first form built 1,201 — and a seeded
   walk of 1,000 steps and the projector's walks hold the places to `placements`.
4. **The bounded projection finds its reusable prefix by bisection** over the previous display's reach, the highest row
   index any displayed row up to a position covers, which each bounded projection carries forward (`project.ts`), and
   finds the changed row by bisection too; the redundant filter is gone. *Test:* the second of two appends at 1,200 asks
   the rows above it nothing (at most eight reads of a row's shape) — the first form asked 4,800.
5. **A run beginning or ending is bounded from the first row that settles with it** (`projector.ts`'s `changedFrom`,
   `project.ts`'s `settlesWithRunning`): `settle` is the only place step 4 reads `running`, and it answers differently only
   for a row still streaming or still marked running. *Test:* at 1,200 rows with a live call at the tail, the run starting
   and then ending are each projected from that call — the first form projected the window — and the projector's seeded
   walks now flip `running` in about one step of twelve and still equal the whole-state projection at every step.

What each of these still reads of the rows held is a pointer comparison per row, an array copy or a bisection per
update — the residue measured below, not a pass that re-derives anything per row.

### Measured after

**The profile, step by step** (the same scratch driver and launch order, three traced pairs each; other agents' proofs ran
beside both steps — 11 to 19 other Electron processes counted — which the totals show and the transcript modules largely
do not):

| loaded minus empty, ms per increment (mean of three pairs) | before | after 1–3 and the filter's removal | after all five |
| --- | --- | --- | --- |
| main thread busy | +1.80 | +1.23 | +0.62 |
| script | **+1.50** | +0.68 | **+0.36** |
| `project.ts` | +0.28 | +0.20 | +0.04 |
| `TranscriptPane.tsx` | +0.24 | +0.17 | +0.18 |
| `pool.ts` | +0.19 | +0.08 | +0.05 |
| `Row.tsx` | +0.19 | +0.01 | +0.04 |
| `projector.ts` | +0.06 | +0.04 | +0.05 |

`cache.ts` (+0.07 before) fell below the modules the aggregation listed at both steps (at most +0.004 and +0.013 an
increment). The last column's build lacks one later refinement that the proof runs below carry: with nothing re-measured,
`reuseOffsets` is handed no lookup. Every step moved the number of the pass it repaired (`.agents/skills/debug-ui` step
8): `estimateHeight` from +0.077 to +0.021 (the rows that changed), `placements` and its map from +0.10 to
`placementsFrom`'s +0.008, `updateShape`'s key maps gone, `lastIndexOf` from +0.053 (+0.038 once the filter was gone) to
nothing once the cut was bisected — for `extendReach`'s copy of the reach, +0.030 — and `foldRuns` from +0.053 to nothing
once a run's beginning and end were bounded.

**The comparison: twelve consecutive runs of the proof on the repaired build** (Q1–Q12; `pnpm build`, then
`xvfb-run -a -s "-screen 0 1600x1000x24" node apps/desktop/scripts/transcript-proof.mjs --skip-build`, a runner that
waited before each run until no other agent's Electron process was running and counted them every five seconds during
it; 62 pooled samples a side in every run, the frame cadence 16.7 ms in every launch, slack one frame; 33 bounded
projections a launch of 34–36, where fix rounds 1–3 read 31 — the two a run's beginning and end took whole are bounded
now; every traced launch covered 31 of 31 increments and carried its profile):

| run | other Electron processes: at start / most during | every update, loaded vs empty (ms) | row appends | IQR empty / loaded | `sync` median, loaded vs empty | frames median, loaded vs empty | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | 0 / 8 | 62.4 vs 65.65, **−3.25** | 57.35 vs 64.75, −7.40 | 43 / 33.2 | 3.25 vs 3 | 3.74 vs 3.93 | pass |
| Q2 | 0 / 11 | 67.5 vs 63.45, **+4.05** | 60.95 vs 59.9, +1.05 | 42 / 44.7 | 4.1 vs 3.3 | 4.05 vs 3.8 | pass |
| Q3 | 0 / 0 | 76.1 vs 71.35, **+4.75** | 70.5 vs 68.75, +1.75 | 48.4 / 59.4 | 4.3 vs 3.65 | 4.56 vs 4.28 | pass |
| Q4 | 0 / 0 | 59.45 vs 69.05, **−9.60** | 57.1 vs 66.45, −9.35 | 43 / 37.7 | 4.4 vs 3.4 | 3.56 vs 4.14 | pass |
| Q5 | 0 / 0 | 70.55 vs 67.25, **+3.30** | 67.6 vs 64.8, +2.80 | 42.6 / 39.1 | 4.05 vs 3.15 | 4.22 vs 4.03 | pass |
| Q6 | 0 / 9 | 65.05 vs 75.65, **−10.60** | 61.75 vs 73.45, −11.70 | 47.2 / 41.6 | 3.8 vs 3.65 | 3.9 vs 4.53 | pass |
| Q7 | 0 / 8 | 71.25 vs 59.6, **+11.65** | 66.3 vs 56.05, +10.25 | 46.5 / 35.5 | 3.95 vs 3.2 | 4.27 vs 3.57 | pass |
| Q8 | 0 / 8 | 75.2 vs 94.65, **−19.45** | 70.8 vs 91.8, −21.00 | 53.4 / 54.1 | 3.9 vs 4.55 | 4.5 vs 5.67 | pass |
| Q9 | 0 / 0 | 64 vs 71.6, **−7.60** | 59.25 vs 67.95, −8.70 | 50.9 / 45 | 4.15 vs 3.7 | 3.83 vs 4.29 | pass |
| Q10 | 0 / 8 | 51.75 vs 64.95, **−13.20** | 50.6 vs 63.6, −13.00 | 41.9 / 38.9 | 4.25 vs 3.15 | 3.1 vs 3.89 | pass |
| Q11 | 0 / 0 | 58.9 vs 63.45, **−4.55** | 53.8 vs 59.55, −5.75 | 41.2 / 50 | 4.4 vs 3.2 | 3.53 vs 3.8 | pass |
| Q12 | 0 / 11 | 65.6 vs 67.45, **−1.85** | 59.35 vs 64.35, −5.00 | 50 / 42 | 4.1 vs 3.35 | 3.93 vs 4.04 | pass |

**Twelve passes in twelve**, both cuts in every run. The loaded side's median stands above the empty side's in four runs
of twelve (+3.3 to +11.7 ms, inside the slack) and below it in eight; the median difference over the twelve is −3.9 ms on
every update and −6.6 ms on the row appends. Before the repair the same comparison read six passes in twelve on fix round
2's build and thirteen in twenty-one across the fix rounds, the loaded side above at the median in eighteen of the
twenty-one. The synchronous apply (`sync`) still stands above the empty side's in eleven runs of twelve, by 0.15–1.2 ms
at the median (0.3–2.55 ms in every run of the fix rounds) — the residue and the rebinding below, inside a frame, and a figure
REQ-CHAT-055 does not judge. The host was not quiet throughout: the runner waited for no other Electron process at each start, and in
five runs (Q3, Q4, Q5, Q9, Q11) none appeared at any sample; in the other seven another agent's proof started part-way
through (8–11 of its processes at most) — by fix round 3's standard, none at the start or after the run, Q8 was quiet
too. The five runs with no neighbour at any sample read +4.75, −9.60, +3.30, −7.60 and −4.55 ms. The host's load was read
only at each run's start and end (1-minute load 0.16–3.39 at the starts), so whether other work than Electron shared it is
not known for these twelve.

**Five more runs, waiting for a quiet host** (QQ1–QQ5; the same build and command). The runner waited before each
run for thirty seconds with no other Electron process and counted them every five seconds during it; from QQ3 on it also
sampled the host's 1-minute load. QQ3 and QQ4 had no other Electron process at any sample and still shared the host with
other agents' gates — at QQ4's end their `pnpm check`, eslint and vitest in two other worktrees — at a load of 3 to 9 on
four vCPUs; so from QQ5 the runner also waited for a load under 1.0 before a run, and a run counts as **quiet** only when no
sample found another Electron process and the load stayed under 4.0, the host never saturated. The append stage's samples
are counted apart; a run's own launches load the host to about 2–3:

| run | other Electron processes: at start / most at a sample / append-stage samples with any | highest 1-min load | every update, loaded vs empty (ms) | row appends | IQR empty / loaded | `sync` median, loaded vs empty | frames median, loaded vs empty | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QQ1 | 0 / 11 / 15 of 43 | not sampled | 70.7 vs 70.65, **+0.05** | 66.35 vs 67.65, −1.30 | 50.3 / 55.8 | 4.4 vs 3.25 | 4.24 vs 4.24 | pass |
| QQ2 | 0 / 11 / 18 of 42 | not sampled | 54.3 vs 60.85, **−6.55** | 51.1 vs 59.5, −8.40 | 36.9 / 34.3 | 3.95 vs 3.15 | 3.25 vs 3.65 | pass |
| QQ3 | 0 / 0 / 0 of 43 | 9.36 | 113.65 vs 92.5, **+21.15** | 105.95 vs 75.25, +30.70 | 68.8 / 86.8 | 5.2 vs 3.85 | 6.81 vs 5.54 | **fail** |
| QQ4 | 0 / 0 / 0 of 43 | 8.07 | 76.1 vs 95.8, **−19.70** | 67.55 vs 92.45, −24.90 | 48.5 / 60 | 5.55 vs 4.7 | 4.56 vs 5.74 | pass |
| QQ5 | 0 / 16 / 22 of 43 | 5.44 | 83.75 vs 77.5, **+6.25** | 79.25 vs 73.85, +5.40 | 56.2 / 41.4 | 4.25 vs 3.7 | 5.02 vs 4.64 | pass |

**Four passes in five**. QQ3 failed (+21.15 ms) and QQ4 passed (−19.70) under the same kind of load: a host at twice its
cores moves a run's medians by twenty milliseconds either way, whichever side it lands on. **No run met that
criterion.** The stricter wait allowed one start in an hour — QQ5, after 1,005 s — and another agent's proof started 2.8
minutes into it; collecting stopped at 07:19 UTC with the host still shared (24 other Electron processes). Over all
seventeen runs since the repair the comparison passed **sixteen**, the loaded side above the empty side at the median in
seven (median difference −3.25 ms on every update, −5.75 on the row appends); before it, thirteen of twenty-one.

**The traced pair of each run, after** (per increment over the increments' span — the profile of the proof's own traced
launches, the empty side at 35 rows and the loaded at 1,234):

| run | main thread busy, empty → loaded | script | layout | the transcript modules' script |
| --- | --- | --- | --- | --- |
| Q1 | 7.48 → 9.54 (+2.06) | 3.55 → 4.52 (+0.97) | 1.35 → 1.70 (+0.35) | 1.06 → 1.52 (+0.46) |
| Q2 | 9.01 → 9.05 (+0.04) | 4.21 → 4.31 (+0.09) | 1.95 → 1.70 (−0.24) | 1.31 → 1.37 (+0.06) |
| Q3 | 10.00 → 10.97 (+0.98) | 4.57 → 5.53 (+0.96) | 1.94 → 1.87 (−0.08) | 1.20 → 1.79 (+0.59) |
| Q4 | 11.80 → 9.26 (−2.54) | 5.71 → 4.21 (−1.49) | 2.44 → 1.92 (−0.52) | 1.62 → 1.37 (−0.25) |
| Q5 | 8.18 → 8.32 (+0.14) | 3.99 → 3.99 (0.00) | 1.49 → 1.66 (+0.17) | 1.14 → 1.30 (+0.17) |
| Q6 | 7.66 → 7.59 (−0.07) | 3.60 → 3.63 (+0.03) | 1.55 → 1.43 (−0.13) | 0.96 → 1.23 (+0.27) |
| Q7 | 9.60 → 12.18 (+2.59) | 4.61 → 6.20 (+1.59) | 1.80 → 2.28 (+0.49) | 1.29 → 2.15 (+0.85) |
| Q8 | 7.63 → 8.46 (+0.84) | 3.61 → 3.76 (+0.15) | 1.57 → 1.60 (+0.04) | 1.08 → 1.30 (+0.22) |
| Q9 | 10.76 → 11.50 (+0.74) | 4.97 → 5.09 (+0.12) | 2.03 → 2.14 (+0.11) | 1.41 → 1.80 (+0.39) |
| Q10 | 8.48 → 8.22 (−0.25) | 3.93 → 3.74 (−0.18) | 1.94 → 1.66 (−0.27) | 1.29 → 1.24 (−0.05) |
| Q11 | 6.84 → 10.12 (+3.29) | 3.16 → 4.80 (+1.64) | 1.35 → 1.92 (+0.57) | 0.86 → 1.42 (+0.56) |
| Q12 | 9.90 → 8.13 (−1.78) | 4.93 → 3.97 (−0.96) | 2.06 → 1.52 (−0.54) | 1.57 → 1.26 (−0.31) |

Over the twelve pairs the loaded side's main thread is +0.50 ms busier an increment (above in eight pairs), its script
+0.24 (above in eight) and its layout −0.01 (above in six), against +1.80, +1.50 and +0.14 before; the transcript's
modules +0.25 (above in nine), against +1.03. A single traced pair still moves by a millisecond or two with the host —
Q7's and Q11's loaded launches were 2.6 and 3.3 ms busier an increment, Q4's and Q12's 2.5 and 1.8 ms less busy — which
is why no verdict is read off one pair.

**What still reads the rows held** (the twelve pairs; every product function whose difference is positive in at least
nine of them and at least +0.003 ms, loaded minus empty, ms per increment):

| function | module | what it still reads of the rows held | mean difference | pairs above |
| --- | --- | --- | --- | --- |
| `project` | `projector.ts` | the projector's own step, with what V8 inlined into it (the input comparisons) | +0.027 | 11/12 |
| `updateShape` | `pool.ts` | a pointer comparison over the rows both displays share | +0.024 | 12/12 |
| `changedFrom` | `projector.ts` | a pointer comparison over the two rows arrays up to the first difference | +0.020 | 12/12 |
| the attachments effect | `TranscriptPane.tsx` | `rows.flatMap` over every row's attachments, on every change of the rows | +0.020 | 12/12 |
| `modelCallStartedAt`, and its memo in `WorkspaceView.tsx` | `packages/ui/src/composer.ts` | a scan from the tail for an unsettled row — the whole array once every row has settled (REQ-CHAT-158's approximated boundary) | +0.020, +0.008 | 11/12, 10/12 |
| `reuseOffsets` | `pool.ts` | the offset table's unchanged prefix, copied | +0.019 | 11/12 |
| `TranscriptPane` and `isLive` | `TranscriptPane.tsx`, `project.ts` | the pane's render body, whose one walk of the displayed rows is `display.some(isLive)` | +0.017, +0.009 | 9/12, 9/12 |
| `dropRepeatedDiffs` | `project.ts` | REQ-CHAT-050's filter over the window's rows, once a projection | +0.017 | 12/12 |
| `extendReach` and `lastIndexOf` | `project.ts` | the reach's unchanged prefix, copied, and each new row's reach | +0.016, +0.004 | 11/12, 10/12 |
| `classifyRows` and `projectIncrement` | `packages/ui-core/src/replica.ts` | the replica's upsert: the held window filtered twice at the earliest change, and copied | +0.013, +0.009 | 10–11/12, 11–12/12 |
| `placementsFrom` and `blockRole` | `Row.tsx` | the places' unchanged prefix, sliced, and the new rows' roles | +0.008, +0.003 | 9/12, 11/12 |

Each is under three hundredths of a millisecond an increment at 1,234 rows; together they come to about +0.2 ms, most of
the transcript modules' +0.25 above and a quarter of what the profile named. None re-derives anything per row — each
compares a pointer, copies a number or tests a field per row — and REQ-CHAT-055 forbids such a residue not "in itself"
but "to the extent that it moves" the shown-update figure, which the twelve runs do not show it doing. They are not
repaired here, because this round repairs what the profile named as moving the comparison. Should the comparison
regress, the profile the proof now carries says whether it is one of these.

**The comparison's other shape, after the repair** (two pairs on the repaired build, a fresh one-row `S0` against
`S1200` at 1,200, the same driver): the main thread busy **+2.01 ms** an increment (+1.30 and +2.72) — layout +0.84
(+0.86 and +0.82), nearly all of it the layout the pin's effect forces, over twice the objects (79.5 and 72.0 dirty layout
objects an increment against 35.3 and 34.9; 13.0 and 11.6 text-shaping passes against 5.7 and 5.7); script +0.60, of it
React's DOM writes for the rebound slots +0.21 and the residue above +0.41 (the empty side holds 1 to 18 rows here, so
none of it cancels); style +0.14 (51–56 elements restyled against 26); paint, pre-paint and commit +0.17; native +0.27.
Down from +3.43 by the script the repair removed (+1.73 → +0.60); the layout (+0.87 → +0.84) is the rebinding's, which
the repair was not for. The pooled comparison passes with it in Q1–Q12 and in sixteen runs of seventeen — the empty side's
first launch is one of its two — so on this harness it does not decide the verdict; OQ-89 holds whether it should.

## Repaired — 2026-09-29 under R-062

REQ-CHAT-055's append comparison passes: twelve consecutive runs of `transcript-proof` on the repaired build passed, and
sixteen of seventeen in all, both cuts at one frame of slack at the cadence the proof measured. Its one red since the
repair (QQ3, +21.15 ms) ran with no other Electron process but at a load of up to 9 on four vCPUs, and QQ4 under the same
load passed by −19.70 ms: a saturated host moves the comparison by a frame either way, which is the harness's limit,
recorded as OQ-89's evidence, not the product's. The cause is named by function in V8's CPU profile of the built app —
the transcript's own passes over every displayed row, 1.03 ms of the loaded side's +1.50 ms of script an increment — and
repaired in `packages/ui/src/transcript/` alone, each pass pinned by a test that fails on its first form
(`transcript.test.ts`, `projector.test.ts`, `rows.test.ts`: nine cases, the seeded walks extended). The traced pairs now
agree with the passes, which fix round 3's did not: the loaded side's script +0.24 ms an increment over twelve pairs,
from +1.50. The proof carries the profile from now on (`append.json`'s `profile`; `trace-summary.test.ts`, six cases), so
a regression is named by function rather than guessed at. What remains of the rows held is the residue tabled above —
about 0.2 ms an increment at 1,234 rows, none of it a pass that re-derives a row — which REQ-CHAT-055 does not forbid
while it does not move the shown-update figure.

**Not shown: twelve runs on a quiet host.** Other agents' proofs and gates shared this host all day. Five of Q1–Q12 saw
no other Electron process at any sample, their load unsampled, and all five passed; no run from QQ3 on had both no other
Electron process and a load under 4.0 throughout. The move rests on the twelve consecutive passes, sixteen of seventeen,
and the profile's agreement with them; a series on a host that stays quiet is the check still owed, and a red there
reopens this note.

Left open, and not this note's: the comparison's reading under a burst and against which empty transcript (**OQ-89**,
with this round's evidence — the part-empty first launch still charges a full viewport's rebinding, about 1.6 ms an
increment, to the loaded side), and the proof on Windows, which this Linux container cannot run. Noticed on the way and
recorded, not repaired:
[`a-new-reasoning-row-is-drawn-through-the-row-beneath-it-until-its-first-measurement.md`](a-new-reasoning-row-is-drawn-through-the-row-beneath-it-until-its-first-measurement.md) (repaired 2026-09-29),
[`the-update-shape-never-answers-extend.md`](../the-update-shape-never-answers-extend.md), and — running the proofs whose
surfaces this round touched — [`terminal-proofs-live-section-drives-powershell-commands-on-every-platform.md`](terminal-proofs-live-section-drives-powershell-commands-on-every-platform.md) (a duplicate of a note `main` had already repaired; settled at the merge)
and [`chat-controls-proof-reads-a-failed-project-setup-as-the-compress-passs-notice.md`](../chat-controls-proof-reads-a-failed-project-setup-as-the-compress-passs-notice.md);
`rows-proof`, `questions-proof`, `layout-proof`, `compression-proof` and `plan-gate-proof` passed. The runs' logs,
`append.json` files and traces were kept beside the work; `.proof/transcript-proof/` holds only the last. Reported back
into ADR-0045 in place, with one row in `first-executions.md` and OQ-89's evidence.
