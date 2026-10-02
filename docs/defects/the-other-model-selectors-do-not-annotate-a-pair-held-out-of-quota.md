## The other model selectors do not annotate a pair held out of quota

REQ-MONITOR-194 lets a user choose a pair recorded out of quota "explicitly, from any model selector or from the quota-wait
decision surface", and says "it must be listed there rather than hidden, annotated with the reason that the provider
reported insufficient quota for it in this session". Since 2026-10-02 the quota-wait header's chooser does
([the-quota-wait-picker-lists-every-model-without-marking-the-excluded-pairs.md](fixed/the-quota-wait-picker-lists-every-model-without-marking-the-excluded-pairs.md)),
reading the record's `wait.excluded`. The run header's "Switch model…" (`RunHeader.tsx`), the inspector's Model field
(`Inspector.tsx`, which lists REQ-MONITOR-067's withheld models with their reason but not these) and the composer's
next-run model chip (`WorkspaceView.tsx`) list every configured key with no annotation. The excluded pairs reach the record
only inside `wait`, which is null outside a wait, and only from a live run; a session at rest holds them in its timeline
(`model_exhausted`), which no surface reads. Noticed 2026-10-02 (fin8, bundle `fin8-noticed-gaps-4`) while repairing the
quota-wait chooser; not repaired (outside that task). Whether "there" in REQ-MONITOR-194 binds every selector or only the
quota-wait surface is the reading a repair would state; this note takes the first.

## Specs

- REQ-MONITOR-194 — "from any model selector … listed there rather than hidden, annotated"; the run header's, the
  inspector's and the composer's selectors list an excluded pair like any other.
- REQ-MONITOR-067 — the same treatment of a withheld model, which the inspector already gives REQ-MONITOR-067's own.

## Relevant files

- `packages/ui/src/RunHeader.tsx` — the "Switch model…" selector's options.
- `packages/ui/src/Inspector.tsx` — the Model field's options (`withheldModels` beside them).
- `packages/ui/src/WorkspaceView.tsx` — the composer's model chip; `waitModelOptions`, the annotation the wait header uses.
- `packages/engine/src/run/run.ts` — `currentWait`, the only place the record carries the excluded keys.
