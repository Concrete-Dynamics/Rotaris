import type { SearchableOption } from './design-system/searchable-select.js';

/**
 * REQ-MONITOR-194 — every model selector of a session lists a pair the session holds out of quota "rather than hidden,
 * annotated with the reason that the provider reported insufficient quota for it in this session" (spec resolution 21:
 * "from any model selector"). One helper for all of them: the run header's Switch model, the inspector's Model field, the
 * composer's next-run chip and the quota-wait header's chooser (`waitModelOptions`), and the reason the recovery dialog's
 * list writes beside such a pair. An excluded key keeps its place and stays choosable — no `unavailableReason`, which
 * would grey it out — because choosing it explicitly is what clears the exclusion. The keys come from the record's
 * `excludedModels` (or `wait.excluded`, the same list inside a wait). Until 2026-10-02 (fin10) only the wait header
 * annotated them (`docs/defects/fixed/the-other-model-selectors-do-not-annotate-a-pair-held-out-of-quota.md`).
 */

/** REQ-MONITOR-194: the reason an excluded pair is annotated with — "the provider reported insufficient quota for it in this session". */
export const EXCLUDED_MODEL_HINT = 'provider reported insufficient quota in this session';

/**
 * The keys as options, each excluded one carrying `EXCLUDED_MODEL_HINT` as its hint and marked `rechoosable`, in the order
 * given. `rechoosable` because the selector may already show the excluded key — the composer's chip shows the configured
 * entry model, which is the pair held out of quota after its quota answer — and choosing the listed, annotated row there is
 * the explicit choice that clears the exclusion (REQ-MONITOR-194). Until 2026-10-03 the control fired nothing for a choice
 * of its current value, so the chip had to choose another key first
 * (`docs/defects/fixed/the-composers-next-run-chip-cannot-choose-the-excluded-key-it-already-shows.md`).
 */
export function annotatedModelOptions(models: readonly string[], excluded: readonly string[]): SearchableOption[] {
  return models.map((m) => (excluded.includes(m) ? { value: m, label: m, hint: EXCLUDED_MODEL_HINT, rechoosable: true } : { value: m, label: m }));
}
