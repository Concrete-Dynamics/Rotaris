## An explicit choice of an exhausted pair does not clear its exclusion

REQ-MONITOR-194 lets a user choose a provider-and-model pair recorded as out of quota "explicitly, from any model
selector or from the quota-wait decision surface", and says "Choosing it explicitly clears the recorded exclusion for
that pair, so it is eligible again until a further insufficient-quota response re-records it." Nothing in this build
clears an exclusion. `ResilienceMemory` only adds to `exhausted` (`markExhausted`, and `rehydrate` from every
`model_exhausted` timeline entry), and no timeline entry records a clearing, so a resumed session re-reads every pair
ever exhausted. The two choosing paths do not clear it either: `Run.setEntryModel` outside a wait records the switch and
nothing more, and during a wait it refuses the waiting pair outright ("… is the model that is waiting …; choose a
different one"), where REQ-MONITOR-194 names the quota-wait surface as a place the excluded pair may be chosen. An
exhausted pair therefore stays excluded from every same-tier candidate list (REQ-MONITOR-193) for the rest of the session
however the user chose it. Noticed 2026-10-02 while repairing
[an-entry-model-switch-row-says-it-applies-while-a-ladder-move-keeps-the-root.md](an-entry-model-switch-row-says-it-applies-while-a-ladder-move-keeps-the-root.md)
(OQ-177); not reproduced in a built app, read from the code.

## Outcome — repaired 2026-10-02 (fin8, ladder-overrides, task 2)

- `packages/engine/src/run/resilience.ts`: `ResilienceMemory.clearExhausted`, and `rehydrate` replays a `model_exhausted`
  entry carrying `cleared: true` as taking the exclusion back, in order, so a resume sees the clearing and a later
  insufficient-quota response records the pair again. No new timeline name (the shape `clearOverride`'s entry has).
- `packages/engine/src/run/run.ts`, `setEntryModel`: a choice of a pair recorded out of quota clears it on both paths
  (`clearChosenExclusion`: the memory and the `cleared: true` entry, nothing written for a pair never excluded). In a
  quota wait the waiting pair itself is no longer refused: the exclusion is cleared and the wait resolves as a retry on
  that pair, with no override persisted and a system row saying so; another agent parked on another pair moves to it, as
  a change-model choice moves every parked agent. A rate-limit wait's own pair is not excluded, so choosing it is no
  change of model and is still refused as before (`model_override_rejected`), the wait keeping its timer.

Pinned in `packages/engine/src/run/resilience.test.ts` (clear and rehydrate in order) and in `ladder.test.ts`'s
"REQ-MONITOR-194: an explicit choice of a pair recorded out of quota clears its exclusion" (four cases, all red before):
the waiting pair chosen in a quota wait is retried at once and a further quota response records it anew (`model_exhausted`
excluded, cleared, excluded); a rate-limit wait's own pair is still refused; a pair cleared in a wait is a same-tier
candidate again in the next run (`b1` → `a1` twice, where before the clearing `b1` had no candidate) and is re-recorded;
and a switch of the entry model onto an excluded pair outside a wait clears it durably. Shown in the built app by
`resilience-proof`'s new driven `quota-retry` launch: alpha refused on quota, alpha chosen on the wait surface, retried
(`model_exhausted` excluded, cleared, excluded), refused again, beta chosen, completed — calls
`scripted/alpha, scripted/alpha, scripted-b/beta`; red on a build of the code before (the choice refused, no second wait
within 60 s), green after.

**What is left, read rather than guessed.** REQ-MONITOR-194 says "from any model selector". The composer's "Model for the
next run" (REQ-MONITOR-146) writes the entry persona's model into the configuration (`personas.<entry>.model`), so the
next run receives it as its configured model and cannot tell it from the value the file already held; the build does not
read a composer choice as an explicit choice of an excluded pair, and such a choice clears nothing. The recovery dialog's
model choice (REQ-NOTIFY-074, `Sessions.restartAfterAuthFailure`) is a choice for an authentication failure and is not
wired to the exclusion either. Both are recorded in
[a-model-chosen-for-the-next-run-or-in-the-recovery-dialog-does-not-clear-an-exclusion.md](../a-model-chosen-for-the-next-run-or-in-the-recovery-dialog-does-not-clear-an-exclusion.md),
and the wait surface's picker, which does not list excluded pairs with their reason, in
[the-quota-wait-picker-lists-every-model-without-marking-the-excluded-pairs.md](the-quota-wait-picker-lists-every-model-without-marking-the-excluded-pairs.md) (repaired since, by bundle `fin8-noticed-gaps-4`).

## Specs

- REQ-MONITOR-194 — the clearing of an exclusion by an explicit choice, and that the exclusion "survives a resume".
- REQ-MONITOR-303 — the change-model choice of the quota-wait surface, which lists excluded pairs "rather than hiding
  them". REQ-ORCH-091 (d)'s refusal of a change-model resolution that "cannot be applied" is what the build uses to refuse
  the waiting pair; whether the waiting pair is such a resolution is not stated.

## Relevant files

- `packages/engine/src/run/resilience.ts` — `ResilienceMemory` (`exhausted`, `markExhausted`, `rehydrate`): no removal.
- `packages/engine/src/run/run.ts` — `setEntryModel`: the waiting pair refused; the switch outside a wait leaves the
  memory as it was.
- `packages/engine/src/run/ladder.ts` — `sameTierCandidates(…, memory.exhausted, …)`, the automatic behaviour the
  exclusion governs.
