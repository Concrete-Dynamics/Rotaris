# ADR-0045 — What paints the transcript: a fixed-capacity recycled row pool — The merge with Part AA — 2026-09-07: two defects the recycler only has when a real row is in the slot

Part 7 of 7 of [ADR-0045](../0045-what-paints-the-transcript.md), which indexes every part.

## The merge with Part AA — 2026-09-07: two defects the recycler only has when a real row is in the slot

*Recorded under GD-10, by the manager, on merged main. Part Z measured the pool against a placeholder row and
Part AA measured its row inside a plain list. Both were green. Neither arrangement is the product, and the two
defects below exist only in the one that is — which is the argument for merging before either half is believed.*

**Forty-five — every row read the INERT surface, so two shipped preferences did nothing.** The pane painted a
row by CALLING the renderer, `renderRow({ display, expanded, … })`, and a component called as a plain function
runs its hooks in the caller's render. The caller is `TranscriptPane`, which is *outside* the
`TranscriptSurfaceProvider` that `TranscriptPane` itself renders, so `useContext` resolved to the inert default:
`runActive` false, `display/showReasoning` and `display/autoCollapseTools` both off, no link opener, no context
menu. The visible symptom was small — a running tool call drew no `◉ running…` — and the cause was that half
the part's user-facing behaviour was disconnected. **Neither half could see it**: Part Z's placeholder read no
context at all, and Part AA's plain list rendered `<Row/>` as an element, which resolves context at its position.
The fix is `createElement(renderRow, props)`; the rendering cache is unaffected, because it caches the element.

**Forty-seven — keyboard navigation was dead in the pool.** `moveCurrentRow` finds rows with
`:scope > .row, :scope > * > .row`, which is correct for a list whose rows are its own children. In the pool a row
sits inside its slot inside the pool inside the scroller — four levels — so `rowsIn` found none and ArrowDown
moved nothing. REQ-CHAT-077 was met on the persona window and not on the Workspace, and only the merged product
has both. The handler now scopes to `.transcript__pool`.

**What both have in common is worth stating, because it will recur.** A recycled pool is not a list with a
different layout: it changes where a row sits in the element tree and how it is created. Any helper written
against "the rows are my children", and any component that reads context, has to be re-checked against the pool
rather than assumed to carry over. That is a consequence of this decision and belongs here rather than in the
part that tripped over it.

### Rendering finding — 2026-09-14

The fixed pool originally declared `will-change: transform` on every one of its 154 text-bearing slots. The browser then held each slot in a compositor layer across ordinary scrolling; on Windows, the fractionally translated layers rasterized transcript text and persona labels more softly than the same `Row` renderer in the persona list.

The coordinate contract remains `translateY(measuredOffset)`: offsets retain their measured fractional values, and the pool retains its fixed slot count. The stylesheet leaves `will-change` at the browser default, which returns text-layer selection to Chromium during steady-state reading.

`rows-proof` records the contract in the built renderer: bound Workspace slots expose `willChange: "auto"` and a live coordinate transform. Its density assertion follows PD-CHAT-003's content-sized one-line rows.

### The measurement point under a burst — 2026-09-28, the round R-048 authorized, taken under R-062

*Reported here because this record fixed the measurement point — the double `requestAnimationFrame` — and predicted that
appending would cost the frame cadence and nothing more. The defect note
`docs/defects/fixed/appending-at-1200-rows-costs-two-to-three-times-an-empty-transcript.md` holds every run and figure;
this is what the round found about the point itself and about the recycler.*

**The point measures the queue in front of an update, and the proof had been measuring a queue without knowing it.**
The scripted run the proof appends is a burst — thirty increments 4–13 ms apart, faster than the renderer shows them —
so the sample of an increment applied while the previous one was still being shown carries every increment queued
before it. The pooled median stood at five to seven frames on BOTH fixtures, while an increment that arrived alone showed
in one to two: the floor this record predicted, met exactly where the point measures what it names. That is not a fault
of the proxy; it is what a reader waits. But it changes what the append comparison compares: not one append against
another, but the per-increment cost times the queue. A millisecond of depth-dependent work per render — dismissed by the
note's earlier round as "0.6 ms of a 47 ms gap" — had become the gap: three or four synchronous renders an increment,
fifteen increments in front of the median sample.

**Where the recycler spent it** (Chromium's own trace of the built app, per increment at 1,200 rows against empty):
script +1.8 ms — React's synchronous flush, 3.4–3.7 a increment — style +0.5, layout +0.15 with the same 26 dirty
objects a pass on both sides (the full-height scroll container is not laid out again at depth), the pin's forced layout
+0.6, paint and the `ResizeObserver` delivery unchanged. The two candidates the note carried are both falsified as the
cause and kept there.

**What changed in the recycler** (`TranscriptPane.tsx`, `projector.ts`): step 4 runs once per change of its inputs and,
for the rows alone having changed, in the bounded form it always had (`{ previous, from }`, `from` read off the two
rows arrays' identity prefix — the replica keeps untouched row objects — rather than threaded across the seam); the
offset table is rebuilt when the rows, the width, the expansion or a measurement change, not every render; the surface
value every row reads is built once per change of what it carries, so a render no longer re-renders a viewport of rows
for a value none of them could see change. Nothing this record decided moved: the pool, its capacity, the slot index as
key, the measured heights, the anchor and the counting rule are as they were.

**Measured after, three consecutive runs of the proof (62 pooled samples a side, alternating launches):** the loaded
transcript's median shown-update time **below** the empty one's by 8.4, 15.1 and 16.0 ms (83.6 vs 92.0, 68.8 vs 83.9,
82.3 vs 98.3), on the row appends alone by 9.0, 17.3 and 15.9 ms; the traced pair's main-thread script per increment
7.59 ms empty against 7.38 ms loaded, from 6.83 against 8.63 before. The comparison this record's first execution had
measured passing on 2026-09-07 and the note had measured failing since 2026-09-22 passes again, and for a reason that is
now written down rather than a figure that was not kept.

**Fix round 1, the same day — the pass above is withdrawn, and kept.** The three passing runs were measured on a first
form of the bounded projection that drew removed rows (an agent's row inside another agent's scoped transcript,
REQ-CHAT-069; a row an increment removed at its earliest-changed index), so "nothing this record decided moved" held for
the pool and the anchor but not for what step 4 drew. The bounded form is now taken only for an append or a row replaced
at its own index, and step 4 projects the window when a previous run would be stranded below its cut. Six runs of the
proof on the repaired form: every update +9.2, **+17.9**, −5.8, +10.3, **+22.9**, +13.8 ms (loaded against empty; the
bold two fail at one frame of slack), four passes in six and never three in a row, pooled spreads of 45–60 ms. The
per-increment main-thread cost is at parity in all six traced pairs (script 4.8–7.6 ms a side, higher on the loaded side
in three and lower in three), so what the round found about the recycler stands; what it measured about the comparison
does not — "the loaded transcript faster than the empty one" did not recur and is not a result. The note is open again.

**Fix round 2, the same day — still open.** The bounded form was still wrong on a pure append: its cut read runs on the
raw rows while the fold reads the rows hygiene keeps (REQ-CHAT-048's dropped reasoning split an activity line), and a
repeated diff REQ-CHAT-050 drops let the reused prefix pass the changed index; both repaired in step 4 and pinned
(`docs/defects/fixed/the-bounded-projection-reads-runs-on-rows-hygiene-drops.md`). The repair moves the bounded
projection's own cost by nothing measurable (0.117 → 0.119 ms at 1,200 rows). Six runs on it: every update **+29.6**,
+11.7, **+35.9**, **+18.7**, **+43.7**, +4.5 ms — two passes in six, on a host carrying other agents' Electron proofs;
the verifier's three runs on fix round 1's build had passed three in a row (+11.5, −4.4, −12.4). Fifteen runs since the
fix rounds began pass nine, the loaded side above the empty one at the median in twelve. What this record can say is
that the per-increment cost is no longer the whole window's; what it cannot say is that the shown-update comparison
holds on this host, and it does not claim it.

**Fix round 3, the same day — record only, still open.** The release plan and the codebase map still gave fix round 1's
reading ("the per-increment cost no longer grows with depth", "two thirds of a frame over") as current; both now keep it
labelled beside fix round 2's. The verifier's three runs on fix round 2's build read +9.0, **+40.7**, **+18.1** ms, and
three re-runs of it on a quiet host +2.9, +11.0, +0.9 ms — three consecutive passes, six in twelve on that build. In all
three re-runs' traced pairs the loaded side's script is 1.2–4.2 ms higher per increment, so this record no longer says
the per-increment cost is at parity: on fix round 2's build it is at parity in two traced pairs of eight. What it can
say is unchanged — the cost per increment is no longer the whole window's projection — and the comparison is not
claimed.

**The CPU-profile round, 2026-09-29 (R-062, R-048's order continued) — repaired.** Fix round 3 left the per-increment
script 1.2–4.2 ms higher on the loaded side with no trace naming it: Chromium's `FunctionCall` names only the entry
point React's scheduler was called through. The traced launches now carry V8's sampling profiler
(`disabled-by-default-v8.cpu_profiler`, a sample about every 170 µs), attributed per increment to functions and source
modules by the trace account's own bucket rule (`lib/trace-summary.mjs`; `append.json`'s `profile`). Over three traced
pairs in the proof's own launch order it named the extra: +1.50 ms of script an increment, 1.03 ms of it the
transcript's own code walking every displayed row — the offset table rebuilt whole two or three times an increment, the
bounded projection filtering and searching the whole previous display for its cut, the places and the update shape over
every row, and a whole-window projection each time `running` flipped. So this record's "the per-increment cost is no
longer the whole window's projection" was true of the fold and not of the recycler's own bookkeeping around it, which
was still the whole window's. Repaired in the recycler only where the profile named it, each form answering what the
whole pass answered and pinned by a test that fails on the first form: the offset table is rebuilt from the first height
that changed, reading a height only for a row that changed or that the measurement pass re-measured (the caches report
their evictions to the same ledger); the places and the update shape are carried from the previous array; the reusable
prefix is found by bisection over a carried reach; a run beginning or ending is bounded from the first row that settles
with it. Nothing this record decided moved: the pool, its capacity, the slot index as key, the measured heights and the
anchor are as they were. **Measured after:** twelve consecutive runs of the proof passed both cuts (every update −19.5
to +11.7 ms, median −3.9; the loaded side above at the median in four of twelve); five more passed four of five, sixteen
of seventeen in all, none of them on a host that stayed quiet — no other Electron process and a load under 4.0 at every
sample — for the whole run; over the twelve traced pairs the loaded side's script is +0.24 ms an increment (+1.50
before) and the transcript's modules +0.25 (+1.03). What is left of the rows held is a residue of pointer comparisons,
copies and field tests — about 0.2 ms an increment at 1,234 rows, under 0.03 ms in any one function — which REQ-CHAT-055
forbids only to the extent that it moves the shown-update figure, and which these runs do not show moving it. What this
record can now say: the cost per increment is the visible rows' and that residue, and the comparison holds on this host
whenever the host is not saturated (its one red since the repair ran at a load of 9 on four vCPUs, and the run beside it
under the same load passed by as much the other way); the note is in `fixed/`, with a series on a host that stays quiet
for its whole length still owed — no run on this shared host could be shown to have had one. The profile also measured
what the repair does not touch and the note leaves to OQ-89: at a part-empty viewport — the comparison's first empty
launch — an append binds one new slot, while at the tail of a full one it moves the bound range and rebinds every slot,
which after the repair still costs the loaded side about 1.6 ms an increment (layout the pin forces over twice the
layout objects +0.84, React's DOM writes +0.21, style, paint and native time +0.6). That is visible-row work, which
REQ-CHAT-055's first sentence permits, and the pooled comparison passes with it.

**What the point still does not do, unchanged:** it says a frame boundary passed after the change was committed, not
that a frame carrying it was presented. And one reading the round surfaced is on the register rather than settled here
— whether REQ-CHAT-055's comparison is read on the update as it arrived or on one that arrived alone, and what "an empty
transcript" holds once the run has appended to it — **OQ-89**, with the reading the proof takes: both cuts, one frame
of slack at the cadence it measured.

**A new row before its first measurement, 2026-09-29 and 2026-09-30 (R-067) — repaired in the second round.** The pool
positions a row that has not been measured by `estimateHeight`, and `pool.ts` justified a coarse estimate by "a wrong
estimate below the viewport is never seen". Falsified at the tail, kept beside its replacement in `pool.ts`: a row
appended while the pane follows is inside the viewport for the frames before the `ResizeObserver` delivers its height,
and the state that delivery sets renders a frame later. `transcript-proof`'s geometry stage reads those frames directly:
the boxes on each of the twelve animation frames after the pool first binds a key, before that frame's layout and
observer delivery. **First round, falsified and kept:** it read the 3.4 px it found (`row:28` / `row:29`) as the 12 px
block gap, added the block gap to the estimate, and recorded 0 px in three runs of three. The verifier's runs of that build
read 3.4 px again in two of four, on the same pair: `row:28` is an agent message INSIDE a block, and the clean runs were
the timing of a watch that saw the overlap in some runs only. **Second round:** a planted transcript of every row kind,
measured in the built app, showed the estimate short on four terms besides the block gap — a Markdown body's 8 px block
margins (a one-line agent message inside a block drew 33.4 px into 30), a user row's 8 px padding above and below (11.4 px
short), a drawn line of 19.44 px counted as 18, and the row's own 46 px inline box left in the wrapping width — and an
activity line wrapping whole segments. `estimateBox` now builds the estimate from those parts and errs long; for every
row kind measured it is at or above what the row drew (`transcript.test.ts` holds the figures). Making it err long
exposed a second cause the geometry had hidden: the measurement pass re-observed its slots only when the displayed rows
changed, so a slot a SCROLL rebound to a row of the height its previous row drew delivered nothing, and the row sat at its
estimate on screen until the next displayed change — two rows drawn 3.4 px through their neighbours 800 ms after a
scroll, on the first round's build, three runs of three. The pane now observes a slot again whenever it is bound under a
key it was not observed under (`observeAgain`). The pool, its capacity and the anchor rule are as they were; the proof's
paging check now holds the anchor row itself to 4 px, because a row measured below the reader moves the transcript's
height and not the reader, and fails on any bound row positioned by its estimate once the pool has settled
(`docs/defects/fixed/a-new-reasoning-row-is-drawn-through-the-row-beneath-it-until-its-first-measurement.md`). Noticed
on the way and recorded, not repaired: the capacity rule's 30 px unit is larger than a row PD-CHAT-003 draws inside a
block — a one-line system notice drew 23.8 px (`docs/defects/fixed/the-pool-capacity-assumes-no-row-is-shorter-than-thirty-pixels.md`, repaired 2026-10-01 below);
and a row that GROWS is positioned by the height its identity drew last until it is measured again, which drew the
planted activity line 21.8 px through the row beneath it for a frame in one run of six when it turned live again
(`docs/defects/fixed/a-row-that-grows-is-drawn-through-the-row-beneath-it-until-it-is-measured-again.md`, repaired 2026-10-01 below) — the proof's new-row
watch records such a pair of rows already drawn and holds only the pairs with a new row to 1 px.

**The capacity unit, 2026-10-01 (R-067, acceptance finding A38) — the capacity rule's 30 px reason falsified, kept beside its
replacement above.** The pool's capacity was counted in REQ-CHAT-057's 30 px minimum row height, which PD-CHAT-003 lifted
off the row's box; for capacity a unit TALLER than the shortest row is the opposite of conservative. `transcript-proof`'s new
stage 3c measured what the note had computed: 400 planted one-line system notices (23.8 px each) in a window resized to
1440x4300 under Xvfb — a 3,890 px viewport, inside `H_max`, showing 164 rows — bound 144 of them through a 154-slot pool and
left the viewport blank from 3,414.5 px down while the pane followed the tail. **The capacity unit moved, not the growth
condition**: the only event that changes the slot count is still a viewport taller than `H_max`, so REQ-UIBENCH-054 holds as
before. The unit is `SHORTEST_ROW_HEIGHT`, 20 px — a row's 4 px top margin, its 1 px border either side and the continuation
bar's 14 px `min-height`, the shortest a row's slot holds whatever it carries (`transcript.test.ts` reads the three from
`shell.css`) — and the pool is **226 slots**. `ROW_MIN_HEIGHT` stays 30 px as the estimate's floor. And the visible span now
sheds its overscan, below and then above, before it cuts a visible row: a viewport shows up to one row more than
`ceil(H ÷ h)` (one partly at either edge), which the rule does not count and the old rail cut first. On the repair the stage
is green — 226 slots, the bound rows covering the viewport with no gap at the tail and in the middle. A larger pool is more
empty containers allocated at construction, which the memory tripwire subtracts away; nothing else this record decided
moved (`docs/defects/fixed/the-pool-capacity-assumes-no-row-is-shorter-than-thirty-pixels.md`; OQ-166 asks whether
PD-CHAT-003's cost paragraph, which describes the capacity arithmetic as keeping 30 px, needs a revision; ruled 2026-10-06,
[R-071](../../../product/requests.md#r-071): [`PD-CHAT-003`](../../../product/directives/pd-chat-003.md#pd-chat-003) revision 2 names the 20 px unit, and the code is unchanged).

**A row that grows, 2026-10-01 (R-067, acceptance finding A37).** "Heights are measured" held for every row the observer had
reached, and a row whose content changed was placed by the height its identity drew last until the observer's delivery
rendered, a frame after the commit: a row that GREW was painted through the row beneath it for that frame. The note saw
21.8 px in one run of six; `transcript-proof`'s geometry stage now asks deterministically, expanding the planted activity
line by a click, and on the build before the repair the first frame after the click placed the row beneath 1,146 px inside
it. **The measurement now also happens at the commit**: after every commit and before the browser paints it, the pane reads
the drawn height of each bound slot whose measurement key has none yet, files it as the observer would, and renders again
inside the commit when it differs from what placed the row (`measureAtCommit`). The observer stays, for a size that changes
under an unchanged key. **Corrected in fix round 1 (2026-10-01), the sentence kept beside its replacement: "the observer
stays, for a size that changes under an unchanged key" did not keep that size off the painted frame** — the observer's render
was a default-lane update, rendered after the paint, so a user row whose image attachment was opened (a native `<details>`,
no commit, no new key) painted 30.7 px through the row beneath it on the first frame in `transcript-proof`'s new attachment
reading. The observer's delivery comes after layout and before the paint, and it now renders synchronously there
(`flushSync`); the reading is 0 px on every frame in four runs of four. Its cost is the same render moved before the paint,
and, where that render rebinds or re-observes a slot, a slot's size deferred to the next frame with Chromium's "loop completed
with undelivered notifications" line in the renderer console — once in the proof's eleven launches
(`docs/defects/fixed/the-observers-synchronous-render-can-leave-a-resize-observer-loop-notification.md`). The identity's last height still places the row for the render that binds it, so a streaming row
is never placed by an estimate; what changed is that the render is not the one painted. The read forces layout of the slots
the update bound or changed, before a paint that would have laid them out anyway, and walks the pool's slots rather than the
rows held (REQ-CHAT-055); what it costs is that a new row's first painted frame carries the second render the delivery used
to cause a frame later, and the append comparison passed in four runs of five on the repair, red in the one taken at a host
load of 4.5 to 5.5. On the repair the stage reads 0 px on all twelve frames after the click and holds the pairs of
rows already drawn, which it had recorded and not held, to 1 px: 0 in three runs of three
(`docs/defects/fixed/a-row-that-grows-is-drawn-through-the-row-beneath-it-until-it-is-measured-again.md`). Nothing else this
record decided moved.


**One observer, and a held gutter, 2026-10-02 (R-062).** The cost recorded above, a slot's size deferred to the next frame
with "ResizeObserver loop completed with undelivered notifications", came in nearly every geometry launch of
`transcript-proof` once the launches were repeated: 34 of 39 on the code before. Its cause was not the one the paragraph
above names. The measurement observer's effect depended on the displayed rows, so React's pending passive effect ran
inside the delivery's own `flushSync`, disconnected the observer that was delivering, and observed every slot again at
the depth just delivered (measured 2026-10-01). **The observer now lives as long as the pane**; a slot that a displayed
change rebinds is observed by the every-commit `observeAgain`, as one a scroll rebinds already was, and a slot whose node
unmounts is unobserved and forgotten (`slotRef`), so a node a later capacity growth mounts in it is observed again. Under heavy load a second cause showed: the
scrollbar appearing inside a delivery's render narrowed every slot by 6 px. That re-keyed every bound row, since the
measurement key carries the width, and it once painted a re-wrapped row 30.7 px through the row beneath it. **The scroller
holds its scrollbar gutter**, so the width the rows are measured at never changes with the bar. `transcript-proof` now fails
on the line in any launch. Nothing else this record decided moved
(`docs/defects/fixed/the-observers-synchronous-render-can-leave-a-resize-observer-loop-notification.md`).

**A delivery held to the committed span, 2026-10-02 (R-062, after verification).** The two repairs above did not remove the
line: on the branch carrying them, the proof's check failed 3 of 5 runs, in the append launches, 20 to 120 ms after the
scripted run ended. The third cause was the one the 2026-10-01 paragraph named ("where that render rebinds or re-observes a slot"): slots are bound by position, so when the
observer's delivery corrected a height above the viewport, its synchronous render moved the bound span (six rows in the
launch traced) and rebound every slot, each changing size inside the delivery at the depth just delivered. **A delivery's
render now binds the span the pool last committed** (`bindRange`); it moves rows and rebinds none, and an ordinary update
after the frame releases the hold and rebinds what it held back. The row that grew is still painted with the row beneath
it moved, which is what the synchronous render is for. Such a delivery came in 3 of 24 append launches, and the line in
none of them (`docs/defects/fixed/the-observers-synchronous-render-can-leave-a-resize-observer-loop-notification.md`).
Nothing else this record decided moved.

**The append comparison under host load, 2026-10-02 (fin7).** fin4's verifiers saw the append comparison red at load
averages of 5 to 14.7 on 4 CPUs (164.1 against 130.0 ms, 110.1 against 90.9, 175.9 against 135.6), once with loaded
launches that ran none of the hold's code, and the stage recorded no load to tell a red by. Each launch now records the
host's load averages and CPU count at its start and end, the verdict prints them, and a red with a launch above the CPU
count runs the four alternating launches once more and is judged on that set, both kept in `append.json`
(`transcript-proof/append-rerun.mjs`, with its test). The slack and the statistic are unchanged. Before relying on it, the
comparison was alternated between dc796f5's build and f2bddcf's, the commit before the hold above, three runs each at load
averages of 0.6 to 4.8: all six passed, the build with the hold reading the loaded side at 78.45 to 102.1 ms against
101.2 to 108.8 empty, and the build without it at 124 to 171.95 against 127 to 155.55, so the reds were not the hold's.
Nothing this record decided moved
(`docs/defects/fixed/transcript-proofs-append-comparison-goes-red-under-host-load.md`).
