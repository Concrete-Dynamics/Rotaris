# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only — Eighth execution — 2026-10-02, an explicit choice clears an exclusion (REQ-MONITOR-194)

Part 13 of 18 of [ADR-0027](../0027-the-model-client-implementation.md), which indexes every part.

## Eighth execution — 2026-10-02, an explicit choice clears an exclusion (REQ-MONITOR-194)

*The repair of [`an-explicit-choice-of-an-exhausted-pair-does-not-clear-its-exclusion.md`](../../../defects/fixed/an-explicit-choice-of-an-exhausted-pair-does-not-clear-its-exclusion.md).
Found a defect in the third execution's mechanism: the memory could only add an exclusion.*

The third execution's memory recorded a pair out of quota for the rest of the session and nothing took it back, though
REQ-MONITOR-194 says an explicit choice of the pair "clears the recorded exclusion for that pair, so it is eligible again
until a further insufficient-quota response re-records it", and names the quota-wait surface as a place it may be chosen,
where the build refused the waiting pair as a change-model resolution that "cannot be applied" (REQ-ORCH-091 d). The
memory gains `clearExhausted`, persisted as a `model_exhausted` entry carrying `cleared: true` — the shape the sixth
execution gave a taken-back pin, so no timeline name is added — and `rehydrate` replays the entries in order. `setEntryModel`
clears the chosen pair on a switch and in a wait; in a quota wait the waiting pair itself resolves the wait as a retry on it,
with no override persisted. A rate-limit wait's own pair is not excluded and stays refused. Measured in
`packages/engine/src/run/ladder.test.ts` and in the built app by `resilience-proof`'s `quota-retry` launch (driven: alpha
chosen on the wait surface, retried, refused again and re-recorded, beta chosen; red on a build of the code before, the
choice refused). The composer's "Model for the next run" and the recovery dialog's choice do not reach the exclusion, said
so in [the note it left open](../../../defects/fixed/a-model-chosen-for-the-next-run-or-in-the-recovery-dialog-does-not-clear-an-exclusion.md)
(since fin10 both do: the eleventh execution).
