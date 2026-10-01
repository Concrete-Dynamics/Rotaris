## A new reasoning row is drawn through the row beneath it until its first measurement

A reasoning row that has just been appended at the tail — collapsed, live, drawn as its one-line summary — is positioned
by the pane's estimate until the `ResizeObserver` delivers its first measurement, and the estimate is short: the row draws
3.4 px taller than the height the offset table allotted it, so for that frame it overlaps the row below it by 3.4 px.
`transcript-proof`'s geometry stage caught it once (2026-09-29, the first run of the CPU-profile round on `main`'s product
at `fa377e6`, before that round changed anything): its 3,300 ms appointment landed 33 ms after the scripted `think` step's
row appeared and read `worstOverlapPx 3.4` for the pair `think:…` / `row:28`; every later sample of the same launch read
0 px, the row having been measured by then. The next run passed, and the proof aborts at the geometry stage on such a
sample, before the append comparison — a run that reaches no verdict at all.

`pool.ts`'s estimate reasons that "a wrong estimate below the viewport is never seen". At the tail, while the pane is
following, a new row is inside the viewport, so a short estimate is seen for the frame or two before its measurement lands.
`docs/defects/fixed/live-rows-are-never-measured.md` repaired the case where a live row was NEVER measured and stayed drawn
through its neighbour; this is the first frame of every such row, before any measurement can exist.

## Specs

`REQ-CHAT-058` — row heights are measured rather than assumed; the first frame of a new row is assumed, necessarily, and
the assumption is visibly short for a collapsed reasoning row. Whether one frame of overlap at the tail contradicts the
requirement, or only the geometry stage's assertion that no sample ever sees an overlap (its bound is 1 px at every
sample), is not settled here: the stage was written for the persistent overlap, and it now fails a run on the transient one
whenever an appointment lands inside that frame.

## Relevant files

- `packages/ui/src/transcript/pool.ts` — `estimateHeight`: a collapsed reasoning row estimates `ROW_MIN_HEIGHT` (30 px) plus
  its role lines; the summary line it draws measured about 33.4 px here.
- `packages/ui/src/transcript/TranscriptPane.tsx` — the measurement pass (`ResizeObserver`) and the table it feeds.
- `apps/desktop/scripts/transcript-proof.mjs` — stage 3b, the appointments every 300 ms from 3,300 ms and the `≤ 1 px` bound.

Noticed 2026-09-29 while taking REQ-CHAT-055's CPU-profile round
(`appending-at-1200-rows-costs-two-to-three-times-an-empty-transcript.md`, beside this note); recorded, not repaired — it is outside that round.

## Outcome

Repaired 2026-09-30 under R-067, in two rounds; the first round's diagnosis was falsified and is kept here beside the one
that replaced it. The Specs section's "REQ-CHAT-058 — row heights are measured rather than assumed" quotes `pool.ts`'s
own summary of ADR-0045, not the requirement's text (REQ-CHAT-058 bounds the retained measurements and renderings). What
a row drawn through its neighbour contradicts is PD-CHAT-003's "no row MAY be drawn so tightly that its content lines
touch", read through ADR-0045's measured offset table.

**First round (2026-09-29, commit `753f611`) — falsified.** It read the 3.4 px as the block gap: "a one-line row that
STARTS A BLOCK is drawn 12 px below its neighbour (`.row--block-start`, PD-CHAT-003) where a row inside a block sits 4 px
below it, and `estimateHeight` modelled neither", and "the new-row watch caught `row:28`, a one-line agent message, doing
the same to `row:29`". It added the 8 px of a block start to the estimate and recorded "`perFrame` all 0 in three runs
of three" after it. The verifier's runs of the same build read 3.4 px on `row:28` / `row:29` again in two runs of four:
`row:28` is `row row--agent row--streaming`, a row INSIDE a block, so the block gap never applied to it, and the three
clean runs had been the timing of a watch that caught the overlap in some runs and not others. "The estimate may be
coarse, but never short of a one-line row" was not true of the code it was written beside.

**What the rows draw, measured.** A planted transcript of every row kind, read in the built app at a 740 px viewport
(slot heights, which carry the gap above each row), against the estimate before this round:

| Row | Drawn | Estimated before | Short by |
|---|---|---|---|
| one-line agent message inside a block | 33.4 px | 30 | 3.4 |
| one-line agent message starting a block | 41.4 px | 38 | 3.4 |
| one-line user message inside a block / starting one | 41.4 / 49.4 px | 30 / 38 | 11.4 |
| one-line system notice inside a block / starting one | 23.8 / 31.8 px | 30 / 38 | — |
| collapsed reasoning row starting a block | 33.4 px | 38 | — |
| six-line user message starting a block | 146.6 px | 128 | 18.6 |
| two-item Markdown list starting a block | 68.9 px | 56 | 12.9 |
| a 399-character paragraph, seven drawn lines | 150.1 px | 120 | 30.1 |
| a sixteen-segment activity line, six drawn lines | 130.6 px | 92 | 38.6 |

An agent message is Markdown (REQ-CHAT-056), and every `.md` block keeps its 8 px bottom margin inside the row; a user
row carries 8 px of padding above and below (PD-CHAT-003 keeps it its surface); a drawn line of `--rt-text-sm` is 19.44 px
where the estimate counted 18; the viewport's width lost the row's own 46 px inline box (margins, padding, border) before
the gutter, and an activity line wraps whole segments, not characters.

**A second cause, found by the repair.** With the estimate made to err long, `transcript-proof`'s paging check failed in
three runs of three: after a scroll, rows the pool had rebound sat at their estimate while on screen. The measurement pass
re-observed its slots only when the DISPLAYED rows changed; a scroll rebinds slots without changing them, and a
`ResizeObserver` delivers a size only when it changes, so a slot rebound to a row that draws the height its previous row
drew delivered nothing. Read on the first round's build with this round's proof: `row:230` and `row:231` drawing 33.4 px
into their 30 px estimate 800 ms after the scroll, in three runs of three — the same overlap, lasting until the next
displayed change rather than one frame.

**What changed (this round).** `estimateBox` (`packages/ui/src/transcript/pool.ts`) builds the estimate from the parts
of the row's box the stylesheet draws: `ROW_MIN_HEIGHT` (the row gap, the border and one line, with 4.5 px to spare), the
8 px of a block start (the first round's term, kept), `USER_PADDING`, `markdownHeight` (each non-blank line a block with
its margin, a heading its top margin besides), `TEXT_LINE` at 19.5 px, `ROW_INLINE` off the width, an activity line laid
out segment by segment, and an effective advance of 7.2 px so a wrapped prediction errs long. For every row in the table
above the estimate is now at or above what it drew. `readHeight` is the pane's height reader, pure and tested. The pane
observes a slot again whenever it is bound under a measurement key it was not observed under (`observeAgain`), and the
comment that said re-observing on a displayed change was enough is kept beside that, marked falsified.

**Pinned by** `packages/ui/src/transcript/transcript.test.ts`: "no row kind is estimated short of what the built app
drew" (the table's figures; its first case, the one-line agent message inside a block at 33.4 px, fails on both earlier
builds at 30), "a slot rebound under a new measurement key is observed again", "the pane's height reader takes the
measurement, then the identity's last height, then the estimate at the row's own block start" — the first failing on
the first round's code at `expected 30 to be greater than or equal to 33.4`, the other two naming functions that code did
not have (the third, run against a stand-in that reads no block start, fails on its 8 px) — the rewritten "a one-line
row estimates content height" (an agent message is the unit and its paragraph's 8 px, not the unit), and the block-start
case kept from the first round. And by `transcript-proof`: stage 3b's new-row
watch now reads twelve frames after EVERY key the pool binds for the first time after the session is drawn (the prompt's
user row, the run's notices, its reasoning row, its answer), not after the reasoning row alone, and holds every
overlapping pair with a new row on either side to 1 px; stage 3's paging check
fails on any bound row whose allotted height is not what it draws, after the scroll and after the page, and holds the
anchor row itself to 4 px (its "the transcript grew exactly as much as the reader moved" is kept beside that, marked
falsified: a row measured below the reader changes the height without moving the reader). The first round's build under
this proof: the paging check red three runs of three (`row:230`, `row:231` drawing 33.4 px into 30). This round's build,
whole proof, ten runs of ten green (2026-09-30, as root under Xvfb, Node 24, load average between 0.7 and 5.6 at the
start of a run, another workflow's agents on the host): the new-row watch read 27 to 30 frames after the five keys the
run binds (`row:25`, `row:26`, the reasoning row, `row:28`, `row:29`) and 0 px on every one; the geometry stage's
appointments 0 px; the paging check's anchor row `row:208` 0.4 px from where the reader's own scroll put it, and no bound
row positioned by its estimate after the scroll or after the page. The transcript's height and the reader's scroll still
differ by 4.1 px there: a row bound for a frame in the pool's bottom overscan, measured below the reader.

**Not this note's, found by its watch.** Before the watch held only the pairs with a new row, it went red once on the
first round's build and once in six runs of this round's at 21.8 px on `group:tool:live-0` / `row:24` — two rows
already drawn, the planted activity line turning live again and positioned by the height it drew settled. Recorded, not
repaired: [`a-row-that-grows-is-drawn-through-the-row-beneath-it-until-it-is-measured-again.md`](a-row-that-grows-is-drawn-through-the-row-beneath-it-until-it-is-measured-again.md) (repaired 2026-10-01).
The watch records such pairs as `otherOverlaps`; there were none in the ten runs above. Not shown: Windows or macOS
fonts (the line height and the effective advance are this host's, the box terms the stylesheet's), a live run, and the
neighbouring transcript proofs.
