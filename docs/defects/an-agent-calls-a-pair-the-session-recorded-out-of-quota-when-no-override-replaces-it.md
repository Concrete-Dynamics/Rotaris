## An agent calls a pair the session recorded out of quota when no override replaces it

REQ-MONITOR-194 says a pair recorded out of quota is, for the rest of the session, "neither retried automatically nor
offered as an automatic fallback candidate". The ladder excludes it from the same-tier candidates (`sameTierCandidates`
reads `ResilienceMemory.exhausted`) but never consults the exclusion before a call: an agent whose cell is on the pair calls
it again, and only the provider's next insufficient-quota answer sends it to the same-tier rule or a wait. Two cases reach
it. Another agent of the run on the same pair: in `ladder.test.ts`'s harness a root on `a1` delegated, its child's call on
`a1` failed on quota (`model_exhausted {a, a1}`), and the root's next call still went to `a1` before any choice was made.
And a later run of the session: the memory is rehydrated, but the new root's cell is built on the configured pair, so its
first call goes to the excluded pair. The scripted client answered those calls; a real provider would refuse them, so the
agent waits on a pair the session already knew to be out of quota. Noticed 2026-10-02 (fin8, ladder-overrides) while
repairing [a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md](fixed/a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md),
which covers the case where an override replaces the pair; not repaired. Whether a call on an excluded pair the user never
replaced counts as an automatic retry (the call is not a repetition of the failed one) is arguable, as that note's Specs
section says of its own case.

## Specs

- REQ-MONITOR-194: "neither retried automatically" for the rest of the session, surviving a resume.
- REQ-ORCH-091 (a): exhausted models are "remembered session-wide and excluded from candidates".

## Relevant files

- `packages/engine/src/run/ladder.ts` — `resilientStep`: the exclusion read only after a failed call.
- `packages/engine/src/run/run.ts` — `rootResilience` and the `forChild` cell: built on the configured or the agent's own
  pair, through the overrides only.
