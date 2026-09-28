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
