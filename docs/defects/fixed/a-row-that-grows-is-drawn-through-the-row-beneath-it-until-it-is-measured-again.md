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
[`a-new-reasoning-row-is-drawn-through-the-row-beneath-it-until-its-first-measurement.md`](a-new-reasoning-row-is-drawn-through-the-row-beneath-it-until-its-first-measurement.md).

## Outcome

**Repaired 2026-10-01 under R-067** (acceptance finding A37). Neither of the two trades this note named: the identity's
last height still positions the row for the render that binds it — so a streaming row is placed by what it drew, never by
an estimate — but that render is no longer the one painted. After every commit, before the browser paints it, the pane
reads the drawn height of each bound slot whose measurement key has no measurement yet (a row first bound, or a row whose
content changed), files it as the observer would, and when it differs from what the identity drew last renders again
inside the same commit (`measureAtCommit` in `packages/ui/src/transcript/pool.ts`, the layout effect after the
re-observing one in `TranscriptPane.tsx`). The observer stays and still delivers changes under an unchanged key; for a key
the commit has measured it delivers the same height and asks for nothing. **Corrected in fix round 1, kept beside its
replacement: "the observer stays and still delivers changes under an unchanged key" was true and was not a repair** — see
"Fix round 1" below: until then a row that grew under an unchanged key was still drawn through the row beneath it for a frame. The read is a forced layout of the slots the
update bound or changed, which the browser would have laid out before that paint anyway, and the pass walks the pool's
slots, not the transcript's rows (REQ-CHAT-055).

**Pinned by** `transcript.test.ts`, "PD-CHAT-003 / ADR-0045: a row that grows is measured at the commit, so the row beneath
it is placed below what it draws": the table places the row beneath a grown row at the identity's last height (52.9 px
for a row that draws 74.7 px — this note's figures), the commit's pass reads exactly the unmeasured key, and the table its
render builds places the row beneath at 74.7 px; red on the code before (the pass did not exist).

**Shown in the built app** by `transcript-proof`'s geometry stage (`--only=geometry`, as root under Xvfb, Node 24), in two
readings. The note's own window — a pair of rows already drawn on the frames after a new row is bound, `otherOverlaps` —
is now HELD to 1 px rather than recorded, and read 0 in every run below. Because that window opens in some runs only, the
stage now also asks the question deterministically: once the run has settled it EXPANDS the planted activity line by a
click and reads the boxes on each of the twelve frames after it. **On the build before the repair** the first frame placed
`row:24` by the line's collapsed 52.9 px while the line drew 1,198.9 px: **1,146 px** of overlap on frame 0, none from
frame 1, one run of one. **On the repair:** 0 px on all twelve frames, and 0 `otherOverlaps`, in three runs of three of the
stage and in the whole proof's run beside them.

**What it costs, measured.** The commit's pass renders a second time inside the commit wherever the observer's delivery
used to render a frame later, so a new row's first painted frame now carries both renders. REQ-CHAT-055's append comparison
(`--only=append`, Xvfb, as root, Node 24) passed in the whole proof run (every update 118.4 ms empty against 122.0 loaded)
and in three of four runs of the stage alone after it; the fourth went red at a host load of 4.5 to 5.5, with another
workflow's test suite running, at 112.95 against 136 ms, one frame of slack being 16.7 ms. The one run of the stage on the
build before this repair, at a load of 3.9, read 96.3 against 101.2 ms. The synchronous work per update (`sync`) read 5.3 to
9.0 ms a side. Absolute figures here move with the host's load more than with either build; no run on this shared host was
quiet throughout.

**Fix round 1, 2026-10-01 — a row that grows under an UNCHANGED key.** The verifier found that the repair above covered a
row whose measurement key changed and nothing else. A row can grow while its key stays measured, and then no commit runs
and `measureAtCommit` has nothing to read: a user row's image attachment opened (`Row.tsx`'s native `<details>`, which
grows the row with no React commit), the image it reveals loading, and a row whose block start moves its top margin from
4 to 12 px (the pane builds the key with no `place`, so the key does not change). The only path left was the observer,
whose `setMeasuredVersion` was a default-lane update rendered after the frame was painted — the row drawn through the row
beneath it for that frame, this note's symptom. **Repaired:** the observer's delivery comes after layout and before the
paint, and it now renders synchronously there (`flushSync(() => setMeasuredVersion(...))` in `TranscriptPane.tsx`), so
the frame is painted with the row beneath placed below what the row draws. The slot is absolutely positioned, so a row's
top margin is inside the slot's box and a margin change is a size change the observer reports.

**Shown in the built app** by a new reading in `transcript-proof`'s geometry stage: the planted run carries a user row with
an image attachment (`row:25`, its file never written, so it projects unavailable and opening it reveals the reason line)
and a row beneath it; the stage clicks the attachment's `<summary>` and reads the boxes on each of twelve frames, each read
from a task posted inside the frame's animation callback, which runs after that frame is painted (a callback alone runs
before the frame's layout and observer delivery, and reads what was not yet shown). Its guards hold that the row grew by
more than 1 px under the key it had before the click. **On a build of the code before this round** (`c352280`): the row
grew 103.4 → 134.1 px and painted frame 0 drew it **30.7 px** through `row:26`, 0 from frame 1 — red, one run of one.
**On the repair:** 0 px on all twelve frames in three runs of `--only=geometry` and in the whole proof's run, which passed
(every update 120.65 ms empty against 99.35 loaded; row appends 118.45 against 92.3; capacity green under a 1600x4400
screen), and the append comparison alone passed twice more, at host loads of 0.7 to 1.8 (123.9 against 101.35 ms and
124.7 against 106.65). No unit test pins it: the change is when React renders relative to the browser's paint, which the repository's
node-environment tests cannot observe, so the proof stage is the test that fails without it. The block-start margin case
is covered by the same path and was not driven separately.

**What it costs.** A delivery that changes a height now renders before the paint instead of after it — the same render,
moved earlier. For a row the commit already measured the delivery changes nothing and renders nothing, so streaming and
appends are not charged it. A render inside a delivery that rebinds or re-observes a slot leaves that slot's size to the
next frame and Chromium writes "ResizeObserver loop completed with undelivered notifications" to the renderer console:
once in the whole proof's eleven launches, in the geometry launch as its session was first drawn. Recorded in
[`../the-observers-synchronous-render-can-leave-a-resize-observer-loop-notification.md`](../the-observers-synchronous-render-can-leave-a-resize-observer-loop-notification.md).

**Not shown:** a streaming message growing by a chunk at the tail in the built app (the unit test covers the mechanism it
shares; no proof drives a chunked stream with a row beneath it), Windows or macOS, and a live run.

