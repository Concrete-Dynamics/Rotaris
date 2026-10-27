# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only — Twelfth execution — 2026-10-03, every selector annotates a pair held out of quota (REQ-MONITOR-194, REQ-NOTIFY-074)

Part 17 of 18 of [ADR-0027](../0027-the-model-client-implementation.md), which indexes every part.

## Twelfth execution — 2026-10-03, every selector annotates a pair held out of quota (REQ-MONITOR-194, REQ-NOTIFY-074)

*The repair of [`the-other-model-selectors-do-not-annotate-a-pair-held-out-of-quota.md`](../../../defects/fixed/the-other-model-selectors-do-not-annotate-a-pair-held-out-of-quota.md)
(fin10).*

The exclusion reached a surface only inside the record's `wait`, so only the quota-wait chooser annotated it. The record now
carries `excludedModels` outside a wait too — the run's memory, else the memory a resting read rehydrates (taken where the
timeline holds a `model_exhausted` entry as well as a `model_override`) — and the run header's switch, the inspector's Model
field and the composer's chip annotate each such key through one helper, still choosable; the recovery dialog's facts mark
the pair `excluded` and its list writes the reason. Measured in `ladder.test.ts` and `excluded-model-selectors.test.ts`
(red before) and by `resilience-proof`'s driven `next-run-choice` launch, which opens three of the four selectors while alpha
is held out of quota and reads alpha annotated and choosable in each; the dialog has no launch that opens it so.
