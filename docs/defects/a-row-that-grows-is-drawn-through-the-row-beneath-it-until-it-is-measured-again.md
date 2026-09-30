## A row that grows is drawn through the row beneath it until it is measured again

A displayed row whose content changes gets a new measurement key, and until the measurement pass delivers the new height
the offset table positions it by the height its identity drew last (`lastByIdentity` in `TranscriptPane.tsx`, read by
`readHeight` in `pool.ts`) — ahead of any estimate. When the new content draws TALLER than the old, the row is drawn
through the row beneath it for the frame or frames before that delivery renders.

Seen in `transcript-proof`'s geometry stage, 2026-09-30, on the planted activity line `group:tool:live-0` and the row
beneath it, `row:24`: **21.8 px** of overlap on one frame, in one run of six on the repaired build of
`fixed/a-new-reasoning-row-is-drawn-through-the-row-beneath-it-until-its-first-measurement.md` and in one run of one on
the build before it. The fixture's planted running call makes the activity line live while the session is first drawn,
settled once the view learns no run is live, and live again for a moment when the scripted run starts, until stale
detection settles the call (the proof's own comment on its first sample describes these two windows). Live, the line
draws 74.7 px with its `⤷` preview line; settled, 52.9 px — the 21.8 px of the overlap exactly. A per-frame trace of the
same fixture (a scratch launch, deleted afterwards) ran clean: it read the live height measured in the FIRST live window
and reused in the second. The failing runs are therefore, by inference and not by a trace of one, those in which the
first window ends before its measurement is filed, so that the second is positioned by the settled 52.9 px — the
identity's last height — while it draws 74.7 px.

The same path serves a streaming message, which grows by a chunk at a time: positioned by the height it drew before the
chunk, it is drawn through whatever lies beneath it for the frame after each chunk that adds a line. At the tail nothing
usually does, which may be why this has not been seen there.

Recorded, not repaired. `lastByIdentity` exists so that a streaming row is positioned by what it actually drew rather
than by an estimate (a row shifting everything below it twice per chunk was the defect it repaired), so replacing it by
the estimate, or by the larger of the two, trades this one-frame overlap for that jitter; which is right is not settled
here. `transcript-proof`'s new-row watch records such a pair as `otherOverlaps` on the frames it reads and does not hold
it; its appointments still hold every pair to 1 px, and catch this when one lands on the frame.

## Specs

PD-CHAT-003: "no row MAY be drawn so tightly that its content lines touch" — a row drawn through its neighbour is past
touching. ADR-0045's offset table is the mechanism that is short for the frame. REQ-CHAT-058 bounds the measurements and
renderings retained and is not what is contradicted.

## Relevant files

- `packages/ui/src/transcript/pool.ts` — `readHeight`: the measurement, else the identity's last height, else the estimate.
- `packages/ui/src/transcript/TranscriptPane.tsx` — the measurement pass that files `lastByIdentity`, and the table built from it.
- `apps/desktop/scripts/transcript-proof.mjs` — stage 3b: `NEW_ROWS`' `otherOverlaps`, and the planted live activity line (`plantLiveRun`).

Noticed 2026-09-30 while repairing
[`a-new-reasoning-row-is-drawn-through-the-row-beneath-it-until-its-first-measurement.md`](fixed/a-new-reasoning-row-is-drawn-through-the-row-beneath-it-until-its-first-measurement.md).
