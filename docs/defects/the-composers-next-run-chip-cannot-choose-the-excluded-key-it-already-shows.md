## The composer's next-run chip cannot choose the excluded key it already shows

REQ-MONITOR-194 lets a user choose a pair held out of quota "from any model selector", and the choice clears the exclusion.
Since fin10 the composer's next-run chip annotates such a key and its choice reaches the engine (`session.chooseNextModel`).
But the chip is a native select, whose change event fires only when the value changes: when the chip already shows the
excluded key (the configured entry model, when that is the pair held out of quota), choosing that key again fires nothing, so nothing is sent and the exclusion stands. At rest neither the run header's switch nor the inspector's Model
field is live, so the only way to clear it from the chip is to choose another key and then the excluded one, which writes the
configuration twice. During a run the key stays choosable from the run header, the inspector and the wait's picker, which
clear it.

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
