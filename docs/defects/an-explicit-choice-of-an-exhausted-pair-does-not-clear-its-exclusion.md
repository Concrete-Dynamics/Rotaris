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
[an-entry-model-switch-row-says-it-applies-while-a-ladder-move-keeps-the-root.md](fixed/an-entry-model-switch-row-says-it-applies-while-a-ladder-move-keeps-the-root.md)
(OQ-176); not reproduced in a built app, read from the code.

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
