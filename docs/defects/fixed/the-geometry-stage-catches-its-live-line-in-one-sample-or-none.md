## The geometry stage catches its live line in one sample, or in none

`transcript-proof`'s geometry launch (stage 3b) resumes the planted `SLIVE` session and appends a scripted run so that
something is LIVE while twenty-six samples read the pool's boxes; its guard requires at least one sample to catch a
live activity line, because the state the stage exists to measure is a live row's height. The scripted run is
`think,read,answer`, and a plain answer ends a run, so the run ends at `think` — about 2.35 s after the session opens
in every recorded launch — while the first sample is an appointment at 3,000 ms after the seams start. The live window
closes at almost exactly the first sample's instant: in six recorded runs on 2026-09-28 the one and only live sample
was the first, and in the seventh none was, and the proof aborted before its append comparison with "no sample caught
a live line, so the state this repairs was never drawn".

The stage was decidable by a margin of one sample on a fast host, and by none on a slightly faster one.

## Specs

None contradicted. The proof is evidence for `docs/defects/fixed/live-rows-are-never-measured.md`'s repair and for
REQ-CHAT-058's "heights are measured rather than assumed"; the defect is the harness's appointment, not the product's.

## Relevant files

- `apps/desktop/scripts/transcript-proof.mjs` — the geometry stage's `SAMPLE_AT` and its `live` guard.
- `apps/desktop/src/main/capture/seams.ts` — `ROTARIS_CAPTURE_EVAL_AT`'s `>>selector@~ms` form, which the repair uses.

## Repaired — 2026-09-28 under R-062

The first sample is no longer an appointment: it is taken the moment a live activity line exists
(`<expression>>>.activity__now@~8000` — the `~` form `ROTARIS_CAPTURE_EVAL_AT` already had), giving up at 8 s and then
reading whatever is there, so the guard fails honestly when nothing was ever live. The twenty-five samples after it keep
their appointments, which is what watches the line wrap, stream and settle. Found while REQ-CHAT-055's measurement round
ran the whole proof seven times in one morning; recorded and repaired in that round's change.

## The repair above was a race too — fix round 1 of R-062, 2026-09-28

**The diagnosis above is falsified, and kept.** The live line the stage catches was never the scripted run's: that run
ends at `think` within milliseconds of starting (`run SLIVE ended completed` 12–19 ms after its orchestrator call in
the three logs read for it). Every live sample in every recorded run — runs 1b, 2, 4, 5b, 7 and 8 — reads the PLANTED running call
(`running ×6 · 5 ok · 1 running … ⤷ bash`, its elapsed time counted from 2026-09-06). A probe sampling the built app
every 50 ms (a throwaway copy of the proof, deleted after; its logs kept beside the work) timed the only two windows in
which that call presents as live, on main's pane and on this branch's alike:

| window | what opens it | what closes it | measured |
| --- | --- | --- | --- |
| first draw | the session opened from the browser, its record still marked running | the view learning no run is live — REQ-CHAT-049 then draws a still-running row with no live timer | one to three 50 ms samples |
| run start | the scripted run starting (`running` true again) | stale detection settling the planted call (ADR-0002) | one to three 50 ms samples |

The 3,000 ms appointment had been catching the second window by luck; the `>>.activity__now@~8000` wait that replaced it
caught the first by luck — the main process's poll matched, and the read ran as a separate script 10–16 ms later,
after the window had closed in three runs of three on the fix round's build (the stage aborted each time with "no
sample caught a live line").

**Repaired:** the first sample now watches from inside the renderer, one animation frame at a time, and reads the boxes
on the frame after it first sees a live line if the line is still live, giving up at 8 s (`LIVE_FIRST` in
`transcript-proof.mjs`). A window that spans two frames cannot be missed; each window measured was caught by at least one 50 ms sample, and
whether both always span two frames is what the fix round's proof runs test (the defect note on REQ-CHAT-055's append
comparison carries their figures).
Still recorded, not repaired: the stage's liveness rests on two windows the product closes as soon as it can, not on a
live row the scripted run holds open; a scripted step that keeps a tool call running would make it independent of them.
