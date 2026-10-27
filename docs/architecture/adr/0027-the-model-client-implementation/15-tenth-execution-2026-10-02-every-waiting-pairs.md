# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only — Tenth execution — 2026-10-02, every waiting pair's override persisted (REQ-ORCH-091 d, REQ-SESSION-026/196)

Part 15 of 18 of [ADR-0027](../0027-the-model-client-implementation.md), which indexes every part.

## Tenth execution — 2026-10-02, every waiting pair's override persisted (REQ-ORCH-091 d, REQ-SESSION-026/196)

*The repair of [`a-wait-choice-persists-the-override-for-the-shown-wait-alone.md`](../../../defects/fixed/a-wait-choice-persists-the-override-for-the-shown-wait-alone.md)
(fin10). Found a defect in the third execution's mechanism.*

The third execution said the override is persisted "so a later run of the session never returns to an exhausted model and
keeps the chosen one". One choice resolves every parked agent (`WaitRegistry.resolveWithModel`) and overrode every waiting pair
in the memory, but only the shown wait's pair was written (and none on the quota-retry path), so a reload kept one override of
several. That reason is kept beside its replacement: `Run.overrideWaitingPairs` writes one `model_override` entry per waiting
pair the choice overrides, each with its own agent's placement against a pending entry switch. No reader changed: both
autopsy readers already replay each entry by its pair. Measured in `ladder.test.ts` with two agents parked at once (red
before: one entry) and by `resilience-proof`'s `two-waits` launch with a resuming relaunch (red before: one entry; after, two,
and the relaunch on gamma throughout).
