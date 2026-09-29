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

## Measurement round authorized — 2026-09-23 ([R-048](../product/requests.md#r-048))

No directive is owed: REQ-CHAT-055 is correct and the product fails it. The owner authorized the round this
note ends on, in this order:

1. **Tighten the proof.** Interleave the empty and 1,200-row samples, take about thirty of each, and report
   the result in frames as well as milliseconds, so the harness's own spread is small enough for a verdict.
2. **Trace the built app** over the same two fixtures, to name which of style recalculation, layout, paint or
   the `ResizeObserver` measurement pass carries the extra frames.
3. **Repair only the cause the trace names.** The candidates on record are a full-height scroll container
   laid out again on every append and a pin-to-bottom scroll write forcing a synchronous layout; neither is
   to be taken on a guess (`.agents/skills/debug-ui` step 8).

## Not taken 2026-09-27 ([R-054](../product/requests.md#r-054))

The owner asked for this round again under R-054, and it did not start. All three steps drive the built
application, and the session ran in a Linux container as uid 0, where Electron will not start with Chromium's
sandbox on. Starting it any other way needs the sandbox switched off or the proof run under a different account,
and neither was done. So no proof was re-run, no trace was taken and no code changed. The round stays authorized as
R-048 left it, for a host that can launch the application: a Windows or Linux desktop, or a container running as
an unprivileged user.

## The round taken — 2026-09-28 ([R-062](../product/requests.md#r-062), in R-048's order)

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
[`fixed/the-bounded-projection-reads-runs-on-rows-hygiene-drops.md`](fixed/the-bounded-projection-reads-runs-on-rows-hygiene-drops.md);
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
