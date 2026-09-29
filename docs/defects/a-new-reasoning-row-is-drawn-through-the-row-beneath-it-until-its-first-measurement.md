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
(`fixed/appending-at-1200-rows-costs-two-to-three-times-an-empty-transcript.md`); recorded, not repaired — it is outside that round.
