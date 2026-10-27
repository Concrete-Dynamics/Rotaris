# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only — Sixth execution — 2026-10-02, the session-wide override taken by a second writer (REQ-NOTIFY-070, REQ-SESSION-026)

Part 11 of 18 of [ADR-0027](../0027-the-model-client-implementation.md), which indexes every part.

## Sixth execution — 2026-10-02, the session-wide override taken by a second writer (REQ-NOTIFY-070, REQ-SESSION-026)

*The 401 note's part A ([`a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md`](../../../defects/fixed/a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md)).
Found nothing wrong with the mechanism; it gained a writer and a way to take a pin back.*

The third execution's session-wide memory (`ResilienceMemory`, persisted as `model_override` timeline entries and replayed
by `rehydrate`) had one writer: the user's choice during a wait. REQ-NOTIFY-070's authentication recovery is a second:
`Sessions.restartOnFallback` pins `fallback_model` keyed by the pair whose call failed authentication (`Run.failedEntryModel`,
the root cell's model at the failure) and writes the same entry with `cause: authentication`, so the pin outlives the
failed run and a reload exactly as a wait's choice does. REQ-NOTIFY-070's "where the restart cannot begin" and
REQ-NOTIFY-078's re-pinned primary need the pin taken back, which the memory could not express: `clearOverride` and an
entry carrying `cleared: true`, which `rehydrate` and the autopsy reader replay in order. No new timeline name
(`model_override` is among OQ-157's twenty-eight). Measured in the built app by `resilience-proof`'s `auth-fallback`
scenario: `scripted/alpha` refused with a 401, the override recorded `{provider: scripted, model: alpha, model_key: beta,
cause: authentication}`, the restart's one call on `scripted-b/beta`, the session `completed`; and in
`packages/engine/src/run/ladder.test.ts` — the pin honoured by a later prompt and by a fresh process, a fallback that
fails too not tried again, a restart that cannot begin taken back durably. *Corrected 2026-10-02 (the repair round):* the
first build wrote the system row "The run restarts on the fallback …" before `prompt`'s refusals, so a restart that could
not begin left that row standing beside the generic notice; the row is now written only once the restart has begun
(`promptHeld`'s `beginning` hook), and the "cannot begin" case asserts that no row claims a restart. *Corrected again
2026-10-02 (the third repair round):* `Run.failedEntryModel` was recorded only by an iteration's failed turn, so a session in
plan mode (`runtime.run_start_mode: plan`, REQ-ORCH-152/153), whose first turn is the plan cycle's, was never restarted
on the fallback — `restartOnFallback` refused it as "no model call failing" and the generic notice was published (the
verifier's reproduction in the built app). The run's last failure and the failed model are now recorded together in one
place for every root turn (`Run.recordRootModelFailure`, called by `iterate` and by `parkAtPlanGate`); the restarted plan
cycle runs on the fallback and parks at the gate. Pinned by the REQ-ORCH-153 case in `ladder.test.ts` (red before) and
shown by `auth-fallback`'s plan-mode launch. *Corrected again 2026-10-02 (the fourth repair round):* "the restarted plan
cycle runs on the fallback" held for a first cycle alone. The repair above also made a **revise** cycle's failed turn
restartable, and the restart re-submitted the last user row, so the revise came back as a fresh cycle from the original
prompt with its changes and the plan it revised dropped (the verifier's reproduction). The pin was right; what the
restart launched was not. A restart now relaunches what the failed run was launched to do
(`Sessions.relaunchAfterAuthFailure`): a run a plan decision launched as the same decision, any other by re-submitting
the prompt. The recovery dialog's restart (`Sessions.restartAfterAuthFailure`, merged beside this the same day) is a third
writer of the session-wide override (`cause: authentication`, by the user's choice) and shares the relaunch. Pinned by the
REQ-ORCH-154 cases in `ladder.test.ts` (red before) and shown by `resilience-proof`'s `auth-fallback-revise` (red on a
build of the code before, green after).
