import type { AdoptionDelta, AdoptionOutcome, AdoptionView } from '@rotaris/contracts';

/**
 * Domain 22 (PD-TRACE-001) — the adoption strip's words, pure so a test reads them without drawing (REQ-ADOPT-001,
 * REQ-ADOPT-002, REQ-ADOPT-004, REQ-ADOPT-023). Each control's description says what it does: a run consults a model,
 * a recording consults none, the layout choice writes `rotaris-traceability.json`.
 */
export const RUN_LABEL = 'Run adoption';
export const RERUN_LABEL = 'Re-run adoption';
export const RECORD_LABEL = 'Record current state';
export const LAYOUT_LABEL = 'Write layout file';
export const RUN_DESCRIPTION = 'Detects this project\'s requirements layout, asks the requirements-engineer model to interpret it, validates the answer and records what it found in .rotaris/. Consults a model.';
export const RECORD_DESCRIPTION = 'Records the requirements as they now stand with the adapter already recorded, so the changes listed become the new baseline. Consults no model.';
export const LAYOUT_DESCRIPTION = 'With this set, the next run also writes rotaris-traceability.json at the repository root — only where no such file exists.';
export const RUNNING_SENTENCE = 'Adoption in progress…';
/** At most this many identifiers per list; the rest are counted. */
export const LIST_CAP = 20;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** REQ-ADOPT-001: the state in one sentence. */
export function adoptionSentence(view: AdoptionView): string {
  if (view.state === 'not-adopted') {
    const n = view.detection.candidates.length;
    return n === 0 ? 'Not adopted. No candidate requirements store was found.' : `Not adopted. ${plural(n, 'candidate requirements store', 'candidate requirements stores')} found.`;
  }
  if (view.state === 'unreadable') return `The adoption record cannot be used: ${view.reason}`;
  const { delta, record } = view;
  const changes = delta.newIds.length + delta.changedIds.length + delta.removedIds.length;
  const where = `${record.adapter.idPrefix} requirements in ${record.adapter.storeDir}`;
  return changes === 0 ? `Adopted: ${where}, no change since ${record.recordedAt}.` : `Adopted: ${where}, ${plural(changes, 'change', 'changes')} since ${record.recordedAt}.`;
}

export function capList(ids: readonly string[]): string {
  return ids.length <= LIST_CAP ? ids.join(', ') : `${ids.slice(0, LIST_CAP).join(', ')} and ${ids.length - LIST_CAP} more`;
}

/** REQ-ADOPT-023: new first, then changed, then removed; an empty list is not drawn. */
export function deltaLines(delta: AdoptionDelta): readonly { readonly kind: 'new' | 'changed' | 'removed'; readonly label: string; readonly ids: string }[] {
  return [
    { kind: 'new' as const, label: 'New', list: delta.newIds },
    { kind: 'changed' as const, label: 'Changed', list: delta.changedIds },
    { kind: 'removed' as const, label: 'Removed', list: delta.removedIds },
  ].filter((l) => l.list.length > 0).map((l) => ({ kind: l.kind, label: `${l.label} (${l.list.length})`, ids: capList(l.list) }));
}

/** REQ-ADOPT-004: the outcome that replaces the in-flight line. */
export function outcomeSentence(outcome: AdoptionOutcome): string {
  if (!outcome.ok) return outcome.reason;
  const r = outcome.record;
  const layout = outcome.layoutFile === 'written' ? ' rotaris-traceability.json was written.' : outcome.layoutFile === 'kept' ? ' rotaris-traceability.json already exists and was kept.' : '';
  return `Recorded ${plural(r.requirements.length, `${r.adapter.idPrefix} requirement`, `${r.adapter.idPrefix} requirements`)} in ${plural(r.documents.length, 'document', 'documents')} from ${r.adapter.storeDir}.${layout}`;
}
