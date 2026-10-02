## The quota-wait picker lists every model without marking the excluded pairs

REQ-MONITOR-303's "change model now" opens "a model picker offering the fallback candidates of REQ-MONITOR-193, listing
excluded pairs with their reason rather than hiding them (REQ-MONITOR-194)", and REQ-MONITOR-194 asks that an excluded
pair be "listed there rather than hidden, annotated with the reason that the provider reported insufficient quota for it in
this session". The wait header's picker (`WaitHeader` in `packages/ui/src/WorkspaceView.tsx`) offers every configured
model key (`models`, the REQ-NOTIFY-074 list its own comment names), with no tier filter and no annotation: an excluded
pair is listed like any other, and nothing on the surface says which pairs the session recorded out of quota or why. The
session record carries no list of excluded pairs for the surface to read (`ResilienceMemory.exhausted` lives in the run
host). Seen 2026-10-02 (fin8, ladder-overrides) while repairing
[an-explicit-choice-of-an-exhausted-pair-does-not-clear-its-exclusion.md](fixed/an-explicit-choice-of-an-exhausted-pair-does-not-clear-its-exclusion.md),
which made choosing an excluded pair there clear its exclusion; the triage of 2026-10-02 had listed it as a candidate to
record. Not repaired: a surface change, and REQ-NOTIFY-263/089 (which the build follows: the change-model list is
REQ-NOTIFY-074's) may read differently from REQ-MONITOR-303 on which models the picker offers.

## Specs

- REQ-MONITOR-303: the picker offers REQ-MONITOR-193's candidates and lists excluded pairs with their reason.
- REQ-MONITOR-194: an excluded pair is listed, annotated with the insufficient-quota reason.
- REQ-MONITOR-193: the candidates are the same-tier configured models less the excluded ones, in declaration order.

## Relevant files

- `packages/ui/src/WorkspaceView.tsx` — `WaitHeader`: the picker's options.
- `packages/contracts` (`SessionRecord['wait']`) — carries the wait's own pair and `exhausted`, no list of excluded pairs.
- `packages/engine/src/run/resilience.ts` — `ResilienceMemory.exhausted`, the session's excluded pairs.
