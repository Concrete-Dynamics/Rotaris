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
`fin8-noticed-gaps-4` before its repair. The two copies became this one at that bundle's merge of `origin/main` d0012a2:
the ladder-overrides copy (open, the same finding and requirements; it added that the record carried no list of excluded
pairs, which this text says, and that REQ-NOTIFY-263/089 may read differently from REQ-MONITOR-303, which OQ-186 asks) was
removed and its one link repointed here.

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

## Outcome

Repaired 2026-10-02 (fin8, bundle `fin8-noticed-gaps-4`) in the part both requirements decide; which list the picker
offers is raised, not ruled (OQ-186).

- The record's `wait` carries `excluded` (`packages/contracts/src/channels.ts`): the configured model keys whose pair the
  session's memory holds out of quota, in declaration order (`excludedModelKeys`, `packages/engine/src/run/resilience.ts`),
  read by `Run.currentWait` at every snapshot.
- The wait header's "Change model" chooser lists each such key in place, with "provider reported insufficient quota in this
  session" as its hint (the design system's secondary row text, `--rt-text-tertiary` at `--rt-text-2xs`, the mockup's
  tertiary qualifier), and leaves it choosable — not greyed out as an unavailable model is — since an explicit choice of it
  is what clears the exclusion (`waitModelOptions` and `EXCLUDED_MODEL_HINT`, `packages/ui/src/WorkspaceView.tsx`).
- The list itself is unchanged: every configured key, the waiting one included, alphabetical. REQ-MONITOR-303 asks for
  REQ-MONITOR-193's same-tier candidates and REQ-NOTIFY-263 for REQ-NOTIFY-074's list; OQ-186 asks which.
- The clearing on an explicit choice is the run's (`setEntryModel`): plan fin8's ladder-overrides bundle made it clear the
  chosen pair's exclusion (`ResilienceMemory.clearExhausted`) and resolve a quota wait on its own excluded pair as a retry
  on it, pinned by its `ladder.test.ts` cases and `resilience-proof`'s `quota-retry`. This repair was built first on
  `origin/main` 4ae715a, where that choice cleared nothing and the waiting pair was refused as "the model that is waiting";
  it reached this branch at its merge of `origin/main` d0012a2, so the annotated pair the chooser offers now does what its
  annotation implies when chosen.

Pinned by `packages/engine/src/run/resilience.test.ts` (`excludedModelKeys`: declaration order, each once, a discovered
model and an unknown pair naming nothing), `packages/engine/src/run/ladder.test.ts` (an indefinite quota wait's record
names `excluded: ['a1']`, red before the field existed) and `packages/ui/src/ui.test.ts` (`waitModelOptions`: the
excluded keys carry the hint and no `unavailableReason`, the others none, no key added). Shown by
`resilience-proof`'s driven `override` scenario, which now opens the chooser, reads its rows and photographs it
(`override-picker.png`): `alpha`, the pair the scripted quota answer put out of quota, is drawn with "provider reported
insufficient quota in this session" beside its name and is not `aria-disabled`; `beta` carries no annotation; the run then completes on
beta as before (2026-10-02, load 1.6, `--only=override,quota-wait`, no failures). The `quota-wait` scenario is a
rate-limit wait, which puts no pair out of quota, so its chooser has nothing to annotate and it is not driven.

Recorded beside it: the run header's and the inspector's model selectors and the composer's next-run chip annotate no
excluded pair either, which REQ-MONITOR-194 asks of "any model selector"
([the-other-model-selectors-do-not-annotate-a-pair-held-out-of-quota.md](../the-other-model-selectors-do-not-annotate-a-pair-held-out-of-quota.md)).
