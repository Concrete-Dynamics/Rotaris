## The other model selectors do not annotate a pair held out of quota

REQ-MONITOR-194 lets a user choose a pair recorded out of quota "explicitly, from any model selector or from the quota-wait
decision surface", and says "it must be listed there rather than hidden, annotated with the reason that the provider
reported insufficient quota for it in this session". Since 2026-10-02 the quota-wait header's chooser does
([the-quota-wait-picker-lists-every-model-without-marking-the-excluded-pairs.md](the-quota-wait-picker-lists-every-model-without-marking-the-excluded-pairs.md)),
reading the record's `wait.excluded`. The run header's "Switch model…" (`RunHeader.tsx`), the inspector's Model field
(`Inspector.tsx`, which lists REQ-MONITOR-067's withheld models with their reason but not these) and the composer's
next-run model chip (`WorkspaceView.tsx`) list every configured key with no annotation. The excluded pairs reach the record
only inside `wait`, which is null outside a wait, and only from a live run; a session at rest holds them in its timeline
(`model_exhausted`), which no surface reads. Noticed 2026-10-02 (fin8, bundle `fin8-noticed-gaps-4`) while repairing the
quota-wait chooser; not repaired (outside that task). Whether "there" in REQ-MONITOR-194 binds every selector or only the
quota-wait surface is the reading a repair would state; this note takes the first.

*Amended 2026-10-02 (fin10, the sixth triage):* a fourth selector lists every model with no annotation as well — the
authentication recovery dialog's model list (REQ-NOTIFY-074, `packages/ui/src/AuthRecoveryDialog.tsx`, drawn from
`Sessions.authRecoveryFacts` through main's `auth-recovery.ts`), which this note did not name. It runs in its own modal
window and reads its payload, not the session record, so the excluded pairs have to reach it on the payload. The reading
"from any model selector" is spec resolution 21's too (`docs/spec/resolutions/02-run-monitoring-steering.md`), so it binds
all four.

## Outcome — repaired 2026-10-03 (fin10, quota-exclusions-and-choices, task 2)

- **The record** carries the session's excluded keys outside a wait: `SessionRecord.excludedModels`
  (`packages/contracts/src/channels.ts`), from the live run's memory (`Run.excludedModelKeys`, which `currentWait` now reads
  too) or, for a session no run of this process has started, from the memory its timeline rehydrates through the
  `restingCatalogue` read (`Sessions.restingReadOf`, whose condition now takes a `model_exhausted` entry as well as a
  `model_override`). An explicit choice that clears a pair (the first note of this task) drops it at the next read.
- **The four selectors** annotate it, still choosable, through one helper beside the wait header's
  (`annotatedModelOptions` and `EXCLUDED_MODEL_HINT`, moved to `packages/ui/src/model-options.ts`): the run header's Switch
  model, the inspector's Model field (beside REQ-MONITOR-067's withheld models, which stay unavailable) and the composer's
  next-run chip read `excludedModels`; the recovery dialog's list reads `excluded: true` on its payload's models
  (`Sessions.authRecoveryFacts`, the protocol's `session.authRecovery` reply and `AuthRecoveryPayloadSchema`), writes the
  reason beside the pair and names the option by its label, described by the reason.
- Pinned in `packages/engine/src/run/ladder.test.ts` ("REQ-MONITOR-194: the record names the keys the session holds out of
  quota, in a run, after it and after a reload", two cases, red with the reading disabled: during and after a run with no
  wait shown, in a fresh process at rest through the catalogue port alone, gone after the composer's choice; the dialog's
  facts) and `packages/ui/src/excluded-model-selectors.test.ts` (each selector's rows, red on the surfaces before).
- Shown in the built app by `resilience-proof`'s driven `next-run-choice` launch, which opens each selector while alpha is
  held out of quota and reads its rows: the composer's chip at rest, the run header's switch and the inspector's Model field
  during a run held on beta, each listing alpha with "provider reported insufficient quota in this session", not greyed out
  (`next-run-choice-chip.png`, `-run-header.png`, `-inspector.png`). The recovery dialog's list is pinned by the unit test
  alone: no launch here opens that dialog with a pair held out of quota.

## Specs

- REQ-MONITOR-194 — "from any model selector … listed there rather than hidden, annotated"; the run header's, the
  inspector's and the composer's selectors list an excluded pair like any other.
- REQ-MONITOR-067 — the same treatment of a withheld model, which the inspector already gives REQ-MONITOR-067's own.
- REQ-NOTIFY-074 — the recovery dialog's model list, a model selector too.

## Relevant files

- `packages/ui/src/RunHeader.tsx` — the "Switch model…" selector's options.
- `packages/ui/src/Inspector.tsx` — the Model field's options (`withheldModels` beside them).
- `packages/ui/src/WorkspaceView.tsx` — the composer's model chip; `waitModelOptions`, the annotation the wait header uses.
- `packages/ui/src/AuthRecoveryDialog.tsx` — the recovery dialog's model list (REQ-NOTIFY-074), the fourth selector.
- `packages/engine/src/run/run.ts` — `currentWait`, the only place the record carries the excluded keys.
