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
([`the-inspector-names-the-configured-model-while-the-root-runs-on-a-same-tier-candidate.md`](the-inspector-names-the-configured-model-while-the-root-runs-on-a-same-tier-candidate.md), repaired since: the inspector names the live key, beta, during a run):
its handler drops a choice equal to its current value (`v !== currentModel`), and the searchable select fires nothing for one.
Also, the chip is no native select since the searchable picker (`DesignSearchableSelect`): the same-value suppression is the
control's own (`searchable-select.tsx`'s `choose`, "Value discipline is the native select's").

The remedy the repair takes is a reading of REQ-MONITOR-194's "choose … explicitly, from any model selector", with no new
affordance: the excluded key is already listed and annotated in the selector, so a click on that listed option when it is
already the selector's value is that explicit choice, and only the control's same-value suppression stands in the way. A
distinct "use it again" affordance would be an invention the design material does not draw (`docs/design/README.md` §2, §7);
the mockup draws no exclusion at all.

Recorded by fin10's first repair round (2026-10-03) from the verifier's optional finding; the fixed note
[`a-model-chosen-for-the-next-run-or-in-the-recovery-dialog-does-not-clear-an-exclusion.md`](a-model-chosen-for-the-next-run-or-in-the-recovery-dialog-does-not-clear-an-exclusion.md)
states the limit, and `resilience-proof`'s `next-run-choice` scenario chooses beta first for that reason. Not repaired: the
remedy is a surface choice (re-selection of an annotated key firing a choice, or a distinct "use it again" affordance beside
the annotation) that the design material does not settle. Size S once chosen.

## Outcome — repaired 2026-10-03 (fin11)

- **The control fires a choice of its current value for a row marked `rechoosable`.** `SearchableOption.rechoosable` and
  `choiceFires` in `packages/ui/src/design-system/searchable-select.tsx`: opt-in per option, so every other row and every
  other searchable selector keeps the same-value suppression. No affordance was added and nothing was redrawn: the row is
  the one already listed and annotated (the design material draws no exclusion; `pnpm mockup`'s source was read for it and
  holds none).
- **Every excluded key is marked.** `annotatedModelOptions` (`packages/ui/src/model-options.ts`) gives each key the session
  holds out of quota `rechoosable: true` beside its hint, so the composer's chip, the inspector's Model field, the run
  header's switch and the wait's chooser all take it; the chip's handler already sent any non-empty value
  (`setNextModel`: the configuration write, then `session.chooseNextModel`, which clears the exclusion). The inspector's own
  guard now lets the shown key through when it is excluded (`Inspector.tsx`), the case left when the root waits on that pair
  with no candidate (since the companion repair it names the live key, so after a move it shows the candidate and the
  excluded key is another row).
- **A consequence, accepted.** The chip's same-value re-choice goes through `setNextModel`, whose configuration write sets
  `personas.<entry>.model` even when the entry model was inherited from a slot or the global scope, so it pins an explicit
  value there. The choose-another-then-back sequence it replaces wrote the same field twice, so nothing is worse than before;
  the triage accepted it.
- **Pinned** by `design-system.test.ts` ("fires a choice of the current value only for a row marked rechoosable …") and two
  cases in `packages/ui/src/excluded-model-selectors.test.ts` (the chip and the inspector: the shown excluded key is sent
  once, the shown plain key sends nothing); the chip case fails without the `rechoosable` mark, the inspector case without
  either half.
- **Shown** by `resilience-proof`'s `next-run-choice` (`--only=next-run-choice --skip-build` after `pnpm build`, as root under
  Xvfb, Node 24, load 1.0 to 1.2), which now chooses alpha directly in the chip that shows it (`chipValue: "alpha"`): a
  `model_exhausted` `cleared: true` entry for alpha and the further prompt on `scripted/alpha`. Before the repair the same
  scenario failed at "alpha's exclusion cleared did not hold within 30000 ms" (load 1.0 to 1.7).

## Specs

- REQ-MONITOR-194: "A user may still choose an excluded pair explicitly, from any model selector … Choosing it explicitly
  clears the recorded exclusion for that pair".

## Relevant files

- `packages/ui/src/WorkspaceView.tsx` — the composer's next-run chip (`onSetNextModel` on the select's change).
- `apps/desktop/src/renderer/session-actions.ts` — `setNextModel`, which sends `session.chooseNextModel` after the write.
- `apps/desktop/scripts/resilience-proof.mjs` — `next-run-choice`, which chose another key first as found (it now chooses the
  shown key directly).
- `packages/ui/src/design-system/searchable-select.tsx` — `choose`: `onChange` only for a value other than the current one.
- `packages/ui/src/model-options.ts` — `annotatedModelOptions`, which marks an excluded key with its reason.
- `packages/ui/src/Inspector.tsx` — the Model field's own `v !== currentModel` guard.
