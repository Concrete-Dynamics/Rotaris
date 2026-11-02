## slice-proof reds on an intent classification timed out at REQ-ORCH-008's bound

**Outcome (2026-10-15, fin47, as OQ-332's ruling names it): repaired in the harness; the product is unchanged.**
`intentVerdict` (`apps/desktop/scripts/lib/live-answers.mjs`) marks `timedOut` only the classifier's own reason, "(fallback:
the classification call timed out after 12 s)", on REQ-ORCH-007's fallback category `moderate_feature`, with the bound and the
time from the run's first model request to the intent line (`elapsedMs`; 11,979 ms on the F8 log). A timeout at another bound,
one that lands on another category, a model's text or an endpoint's failure headline that mentions a timeout, and every other
fallback are no such verdict. `intentOutcome` gives a first timed-out fallback the one extra ask an answer outside the set gets;
the two share it, so a second problem of either kind is the red, naming both, and any other fallback or a missing intent line
stays a red at once, first or second. `slice-proof.mjs`'s intents stage prints a `NOTE` for it (the bound, the elapsed time, and
that the proof records no model traffic, so the cut reasoning's length is the live run's intent NOTE to read), keeps the attempt
as `intents-<n>.attempt-1.log` and `.png`, lists it under `results.intents[].earlier` with its reason, problem, bound and elapsed
time, and on `--resume` clears the attempt files with the others. Pinned by `apps/desktop/scripts/lib/live-answers.test.ts`'s
"OQ-332 (F8)" cases and its describe "scenario 3b asks once more on one fallback at the 12 s bound", red on the code before
(4 of 23 cases failed there), and a source-shape case on the proof's NOTE and `earlier` entries. OQ-114's 2026-10-04 addendum
carries a dated sentence. Not driven against the live endpoint by this repair (the orchestrator's slice-proof run is the evidence).

`apps/desktop/scripts/slice-proof.mjs`'s intents stage (scenario 3b) treats every classifier fallback as a red at once
(`intentOutcome` in `apps/desktop/scripts/lib/live-answers.mjs`: "A fallback (REQ-ORCH-007) and a missing intent line are the
product's and stay reds at once"). A fallback taken because the classification call reached REQ-ORCH-008's 12 s bound is the
product's specified answer, not a fault: REQ-ORCH-007 says a timeout MUST produce the fallback, and OQ-114's ruling of
2026-10-06 (kept by OQ-258 and OQ-332) keeps the bound at 12 s for this release. A self-hosted reasoning endpoint that is slow
on one call therefore makes the proof red with nothing wrong in the product. An answer outside the accepted set already gets one
more ask (finacc3 A2-03); a timed-out fallback, the same kind of one sampled outcome, gets none.

Seen 2026-10-15 in fin46's final acceptance sweep at `3c03287` (finding F8 of its autopsy): `slice-proof`'s first run went red at
02:44:26 UTC, load 0.70 then 0.56, "intents-3: the classifier fell back … timed out after 12 s"; the lone re-run passed
(02:58:03). Red evidence `.proof/slice-proof-reds/2026-10-15T02-44-26-820Z-intents/red.json`.

The repair OQ-332's ruling (2026-10-15, under R-072) names: `intentVerdict` marks a fallback whose line says it timed out
(`timedOut: true`); the first such verdict asks the prompt once more, the first attempt's log kept as
`intents-<n>.attempt-1.log` and listed under `earlier` with the fallback's reason; a second timed-out verdict is red, naming
both. Every other fallback (unparseable, unmapped, setup) and a missing intent line stay red at once, and a timeout and an
answer outside the set share the one extra ask: the second problem of either kind is red.

## Specs

The proof contradicts REQ-ORCH-007 and REQ-ORCH-008 (the bound and its fallback, OQ-114 as ruled), reading a specified outcome
as a fault. The product is not at fault.

## Relevant files

- `apps/desktop/scripts/lib/live-answers.mjs` — `intentVerdict` and `intentOutcome`, which decide a red or one more ask.
- `apps/desktop/scripts/lib/live-answers.test.ts` — the cases that pin them.
- `apps/desktop/scripts/slice-proof.mjs` — the intents stage (about lines 407 to 438), its comment and the module header.
