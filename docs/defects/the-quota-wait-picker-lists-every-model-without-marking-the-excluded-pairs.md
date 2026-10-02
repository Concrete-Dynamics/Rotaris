## The quota-wait picker lists every model without marking the excluded pairs

REQ-MONITOR-303's "change model now" opens "a model picker offering the fallback candidates of REQ-MONITOR-193, listing
excluded pairs with their reason rather than hiding them (REQ-MONITOR-194)", and REQ-MONITOR-194 asks that a pair recorded
out of quota be listed "rather than hidden, annotated with the reason that the provider reported insufficient quota for it in
this session". The wait header's picker (`WaitHeader` in `packages/ui/src/WorkspaceView.tsx`, its "Change model") offers
every configured model key (`models`, the configuration snapshot's keys, alphabetical; the REQ-NOTIFY-074 list by its own
comment) with no annotation: a pair the session recorded out of quota is listed like any other, and nothing on the surface
says which pairs those are or why. The session record carries nothing the surface could read it from: the excluded pairs
live in the run's `ResilienceMemory.exhausted`, and the published `wait` carries only the waiting pair and REQ-NOTIFY-088's
`exhausted` flag. The list itself is neither REQ-MONITOR-193's (same tier, declaration order, less the excluded pairs) nor
REQ-NOTIFY-074's (other providers first, the failed model left out), which REQ-NOTIFY-263 names for the same control.

Found by the fourth triage of 2026-10-02 (`unbundled.candidatesToRecord`) and recorded first by plan fin8's
ladder-overrides bundle under this same name, while it made an explicit choice of an excluded pair clear its exclusion
(`ResilienceMemory.clearExhausted`); recorded here, under the same name so the two become one note, by bundle
`fin8-noticed-gaps-4` before its repair.

## Specs

- REQ-MONITOR-303 — the picker offers REQ-MONITOR-193's candidates and lists the excluded pairs with their reason.
- REQ-MONITOR-194 — an excluded pair is listed in any model selector and on the quota-wait surface, annotated with the
  insufficient-quota reason; choosing it clears the exclusion.
- REQ-MONITOR-193 — the candidates: the same-tier configured models, less the excluded ones, in declaration order.
- REQ-NOTIFY-263 / REQ-NOTIFY-074 — name REQ-NOTIFY-074's list for the same control; which list the picker offers is a
  question the two passages answer differently.

## Relevant files

- `packages/ui/src/WorkspaceView.tsx` — `WaitHeader`: the picker's options.
- `packages/contracts/src/channels.ts` — `SessionRecord['wait']`: the waiting pair and `exhausted`, no excluded pairs.
- `packages/engine/src/run/resilience.ts` — `ResilienceMemory.exhausted`, the session's excluded pairs.
- `packages/engine/src/run/run.ts` — `currentWait`, what the record publishes of the wait.
