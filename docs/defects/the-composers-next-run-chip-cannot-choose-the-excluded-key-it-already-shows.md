## The composer's next-run chip cannot choose the excluded key it already shows

REQ-MONITOR-194 lets a user choose a pair held out of quota "from any model selector", and the choice clears the exclusion.
Since fin10 the composer's next-run chip annotates such a key and its choice reaches the engine (`session.chooseNextModel`).
But the chip is a native select, whose change event fires only when the value changes: when the chip already shows the
excluded key (the configured entry model, when that is the pair held out of quota), choosing that key again fires nothing, so nothing is sent and the exclusion stands. At rest neither the run header's switch nor the inspector's Model
field is live, so the only way to clear it from the chip is to choose another key and then the excluded one, which writes the
configuration twice. During a run the key stays choosable from the run header and the wait's picker, which clear it.

**Amended 2026-10-03 (fin11's triage, before the repair).** The sentence above said the key stays choosable from the
inspector during a run too. It does not when the inspector shows the excluded key — and it does show it, the configured key,
while the root runs on the same-tier candidate
([`the-inspector-names-the-configured-model-while-the-root-runs-on-a-same-tier-candidate.md`](the-inspector-names-the-configured-model-while-the-root-runs-on-a-same-tier-candidate.md)):
its handler drops a choice equal to its current value (`v !== currentModel`), and the searchable select fires nothing for one.
Also, the chip is no native select since the searchable picker (`DesignSearchableSelect`): the same-value suppression is the
control's own (`searchable-select.tsx`'s `choose`, "Value discipline is the native select's").

The remedy the repair takes is a reading of REQ-MONITOR-194's "choose … explicitly, from any model selector", with no new
affordance: the excluded key is already listed and annotated in the selector, so a click on that listed option when it is
already the selector's value is that explicit choice, and only the control's same-value suppression stands in the way. A
distinct "use it again" affordance would be an invention the design material does not draw (`docs/design/README.md` §2, §7);
the mockup draws no exclusion at all.

Recorded by fin10's first repair round (2026-10-03) from the verifier's optional finding; the fixed note
[`fixed/a-model-chosen-for-the-next-run-or-in-the-recovery-dialog-does-not-clear-an-exclusion.md`](fixed/a-model-chosen-for-the-next-run-or-in-the-recovery-dialog-does-not-clear-an-exclusion.md)
states the limit, and `resilience-proof`'s `next-run-choice` scenario chooses beta first for that reason. Not repaired: the
remedy is a surface choice (re-selection of an annotated key firing a choice, or a distinct "use it again" affordance beside
the annotation) that the design material does not settle. Size S once chosen.

## Specs

- REQ-MONITOR-194: "A user may still choose an excluded pair explicitly, from any model selector … Choosing it explicitly
  clears the recorded exclusion for that pair".

## Relevant files

- `packages/ui/src/WorkspaceView.tsx` — the composer's next-run chip (`onSetNextModel` on the select's change).
- `apps/desktop/src/renderer/session-actions.ts` — `setNextModel`, which sends `session.chooseNextModel` after the write.
- `apps/desktop/scripts/resilience-proof.mjs` — `next-run-choice`, which chooses another key first.
- `packages/ui/src/design-system/searchable-select.tsx` — `choose`: `onChange` only for a value other than the current one.
- `packages/ui/src/model-options.ts` — `annotatedModelOptions`, which marks an excluded key with its reason.
- `packages/ui/src/Inspector.tsx` — the Model field's own `v !== currentModel` guard.
