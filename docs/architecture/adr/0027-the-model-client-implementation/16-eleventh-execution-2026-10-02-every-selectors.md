# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only — Eleventh execution — 2026-10-02, every selector's choice clears an exclusion (REQ-MONITOR-194, REQ-MONITOR-146, REQ-NOTIFY-074)

Part 16 of 18 of [ADR-0027](../0027-the-model-client-implementation.md), which indexes every part.

## Eleventh execution — 2026-10-02, every selector's choice clears an exclusion (REQ-MONITOR-194, REQ-MONITOR-146, REQ-NOTIFY-074)

*The repair of [`a-model-chosen-for-the-next-run-or-in-the-recovery-dialog-does-not-clear-an-exclusion.md`](../../../defects/fixed/a-model-chosen-for-the-next-run-or-in-the-recovery-dialog-does-not-clear-an-exclusion.md)
(fin10). Completes the eighth execution's mechanism for the two selectors outside a run.*

The eighth execution cleared an exclusion on the run's own two paths. The composer's "Model for the next run" wrote the
configuration alone, so the engine could not tell its choice from the value the file held, and the recovery dialog pinned
without clearing; with the ninth execution's pre-call read, a pair chosen there was then not called at all. The composer's
choice now reaches the engine as a session-scoped command, `session.chooseNextModel`, sent after the configuration write;
`Sessions.chooseNextModel` resolves the key through the side-effect-free `restingCatalogue` port and clears the pair in the
session's memory and a resting read's, with the same `model_exhausted` `cleared: true` entry. The dialog clears beside its pin
and restores the exclusion (`restored: true`) when the restart cannot begin. Measured in `ladder.test.ts` (four cases, red
with the clearing disabled) and by `resilience-proof`'s driven `next-run-choice` launch (red on a build of the code before:
no `cleared` entry; after: the further prompt on `scripted/alpha`).
