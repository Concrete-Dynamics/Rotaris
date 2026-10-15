## slice-proof reds on an intent classification timed out at REQ-ORCH-008's bound

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
