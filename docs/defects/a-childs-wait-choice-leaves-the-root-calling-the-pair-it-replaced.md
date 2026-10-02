## A child's wait choice leaves the root calling the pair it replaced

When a child waits on an exhausted pair and the user resolves the wait with "change model now", the run persists the
override for the session (`setEntryModel`'s wait branch: `memory.setOverride` for every waiting pair, then a
`model_override` timeline entry that says "it stands for the rest of the session"). Children spawned afterwards resolve
their model through it (`forChild` calls `memory.effective`). The root does not. Its cell is built through the
overrides only when `rootResilience` rebuilds it (a switch onto another model, or a new run), so a root already running
on the replaced pair keeps calling it. The ladder never consults the overrides on a call (`ladder.ts` reads only
`markExhausted`, `isExhausted` and `exhausted`).

Observed with a probe in `packages/engine/src/run/ladder.test.ts`'s harness, not committed. The catalogue held `a1`
(tier `small_model`) and `c1` (no tier). The root on `a1` delegated in the background. The child's first call on `a1`
failed with insufficient quota, and with no same-tier candidate it waited on `a/a1`. The user chose `c1` there, which
recorded `model_override {provider: a, model: a1, model_key: c1, supersedes: false}`. The requests then went:
child `c1`, child `c1`, summariser `a1`, root `a1`. The root and the summariser called the pair the session had just
recorded as exhausted (`model_exhausted`) and replaced. The scripted client answered them. A real provider would refuse
again, sending the root up the ladder or into a wait of its own on the same pair.

The autopsy reader (`entryModelKeys`) reads such an override as moving the root at once ("an override of the root's own
pair moves it", in `apps/desktop/scripts/lib/autopsy-entry-model.test.ts`). That reading matches the documented intent,
not this behaviour. So over this store the reader prints the root on `c1` while it ran on `a1`. Repairing the run makes
the reader right. Changing the reader to match the run would encode the defect.

Recorded 2026-10-02 (fin5, harness-readers, repair round 3). It was found while weighing the residual of
[the-autopsy-reader-can-print-a-switched-key-a-childs-wait-choice-overrode-before-the-root-ran-on-it.md](the-autopsy-reader-can-print-a-switched-key-a-childs-wait-choice-overrode-before-the-root-ran-on-it.md),
and it is not repaired. Whether the root's live cell should follow a child's wait choice at once, or at its next turn,
is the requirement's to say, not this note's.

## Specs

- REQ-ORCH-091 (a) and (d): exhausted models are "remembered session-wide and excluded from candidates", and a manual
  change "persists the override in session state for the rest of the session". The root and the summariser go on
  calling the replaced pair in the same session.
- REQ-MONITOR-194: a pair recorded out of quota is "neither retried automatically" for the rest of the session. The
  root's next call on it is automatic. It is not a retry of the failed call, so this reading is arguable and the note
  names it rather than ruling it.

## Relevant files

- `packages/engine/src/run/run.ts`: `setEntryModel` (the wait branch writes the override); `rootResilience` (consults
  `memory.effective` only on a rebuild); the `forChild` resilience (consults it for every child).
- `packages/engine/src/run/ladder.ts`: the per-call ladder, which never reads the overrides.
- `packages/engine/src/run/resilience.ts`: `ResilienceMemory.effective` and `setOverride`.
- `packages/engine/src/autopsy.ts` and `apps/desktop/scripts/lib/autopsy-entry-model.mjs`: `entryModelKeys`, which reads
  the intended behaviour.
