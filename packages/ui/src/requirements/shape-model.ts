import type { CriterionClaim, ShapeAcceptOutcome, ShapeDrift, ShapeExportOutcome, ShapeView, SurveyPreview } from '@rotaris/contracts';
import { countNoun } from '@rotaris/kernel';
import { capList } from './adoption-model.js';

/**
 * PD-TRACE-002 — the survey strip's words, pure so a test reads them without drawing. Each control's description says
 * what it does: a survey consults a model and records nothing until its preview is accepted; a recording and an export
 * consult none.
 */
export const SURVEY_LABEL = 'Survey this repository';
export const RESURVEY_LABEL = 'Survey again';
export const SHAPE_RECORD_LABEL = 'Record current state';
export const EXPORT_LABEL = 'Export to repository';
export const ACCEPT_LABEL = 'Accept shape';
export const ANSWER_LABEL = 'Send correction';
export const DISCARD_LABEL = 'Discard';
export const SURVEY_DESCRIPTION = 'An agent reads this repository with the requirements-engineer model and proposes how its requirements are written. It can only read. Nothing is recorded until you accept the preview.';
export const SHAPE_RECORD_DESCRIPTION = 'Takes the requirements as they now stand as the new baseline, so the changes and the drift listed are cleared. Consults no model.';
export const EXPORT_DESCRIPTION = 'Writes the shape to rotaris-requirements-shape.json at the repository root, to be committed, so every clone reads these requirements without a survey. Consults no model.';
export const SURVEYING_SENTENCE = 'Surveying the repository… the agent reads and proposes; nothing is written.';
export const ANSWER_PLACEHOLDER = 'What the shape missed or got wrong, in your own words.';

/** The state in one sentence (REQ-ADOPT-001). */
export function shapeSentence(view: ShapeView): string {
  if (view.state === 'none') {
    if (view.native) return 'These requirements are read by the built-in layout.';
    const n = view.detection.candidates.length;
    return n === 0 ? 'No requirements are read yet. A survey finds how this repository writes them.' : `No requirements are read yet. ${countNoun(n, 'likely requirements store')} found; a survey proposes the shape.`;
  }
  if (view.state === 'unreadable') return `The ${view.origin === 'repository' ? 'repository\'s shape file' : 'recorded shape'} cannot be used: ${view.reason}`;
  const where = view.shape.stores.map((s) => s.dir).join(', ');
  const from = view.origin === 'repository' ? ', shape from the repository' : '';
  const delta = view.delta;
  const changes = delta === undefined ? 0 : delta.newIds.length + delta.changedIds.length + delta.removedIds.length;
  const fresh = delta === undefined || delta.newIds.length === 0 ? '' : ` New: ${delta.newIds.slice(0, 5).join(', ')}${delta.newIds.length > 5 ? ` and ${delta.newIds.length - 5} more` : ''}.`;
  const watch = view.watching ? '' : ' Not watching for changes: Re-evaluate reads the board.';
  return `${countNoun(view.count, 'requirement')} read from ${where}${from}${changes === 0 ? '' : `, ${countNoun(changes, 'change')} since ${view.record?.acceptedAt ?? 'the record'}`}.${fresh}${watch}`;
}

export function driftCount(d: ShapeDrift): number {
  return d.mentionedCount + d.emptyCount + d.duplicates + d.malformed;
}

/** Clause 11: the drift, stated once, with its counts and files. */
export function driftSentence(d: ShapeDrift): string | null {
  if (driftCount(d) === 0) return null;
  const parts: string[] = [];
  if (d.mentionedCount > 0) parts.push(`${countNoun(d.mentionedCount, 'identifier')} mentioned and not read as a requirement (${capList(d.mentionedOnly.slice(0, 5))}${d.mentionedCount > 5 ? ', …' : ''})`);
  if (d.emptyCount > 0) parts.push(`${countNoun(d.emptyCount, 'document')} now yielding no requirement (${d.emptyDocuments.slice(0, 3).join(', ')}${d.emptyCount > 3 ? ', …' : ''})`);
  if (d.duplicates > 0) parts.push(`${countNoun(d.duplicates, 'identifier')} defined a second time`);
  if (d.malformed > 0) parts.push(`${countNoun(d.malformed, 'definition line')} whose identifier the shape rejects`);
  return `The documents no longer fit the shape as they did when it was accepted: ${parts.join('; ')}. The cards still read are kept.`;
}

export function previewLead(p: SurveyPreview): string {
  const stores = p.stores.map((s) => `${s.dir} (${countNoun(s.requirements, 'requirement')} in ${countNoun(s.documents, 'document')}${s.withStatus > 0 ? `, ${s.withStatus} with a status` : ''}${s.withCriteria > 0 ? `, ${s.withCriteria} with acceptance criteria` : ''})`).join('; ');
  return `Proposed: ${countNoun(p.count, 'requirement')} from ${stores}. Nothing is recorded until you accept.`;
}

export function previewWrites(p: SurveyPreview): string {
  const status = p.shape.stores.some((s) => s.status !== undefined);
  const criteria = p.shape.stores.some((s) => s.criteria);
  if (!status && !criteria) return 'These documents have no place for a status or acceptance criteria, so the board will write nothing into them.';
  const what = [status ? 'a status word' : '', criteria ? 'a criterion\'s tick' : ''].filter((x) => x !== '').join(' and ');
  return `Accepted, the board writes ${what} into these documents when a requirement moves or is accepted, and nothing else.`;
}

export function acceptSentence(o: ShapeAcceptOutcome): string {
  return o.ok ? `Recorded ${countNoun(o.record.requirements.length, 'requirement')} in ${countNoun(o.record.documents.length, 'document')}.` : o.reason;
}
export function exportSentence(o: ShapeExportOutcome): string {
  return o.ok ? `${o.path} was ${o.written} at the repository root. Commit it to share the shape.` : o.reason;
}

/** Clause 7: what accepting does with the criteria, said before it is taken. */
export function criteriaAcceptSentence(criteria: readonly CriterionClaim[] | undefined): string | null {
  if (criteria === undefined || criteria.length === 0) return null;
  const open = criteria.filter((c) => !c.checked);
  const met = open.filter((c) => c.claim === 'met').length;
  const unmet = open.filter((c) => c.claim === 'unmet').length;
  const unstated = open.filter((c) => c.claim === 'unstated').length;
  if (open.length === 0) return 'Every acceptance criterion is already ticked in the document.';
  const left = unmet + unstated;
  return `Accepting ticks ${countNoun(met, 'criterion', 'criteria')} the agent reported met${left === 0 ? '' : `; ${countNoun(left, 'criterion', 'criteria')} ${left === 1 ? 'stays' : 'stay'} unticked (${[unmet > 0 ? `${unmet} reported unmet` : '', unstated > 0 ? `${unstated} not reported` : ''].filter((x) => x !== '').join(', ')})`}.`;
}

export const CLAIM_WORD: Readonly<Record<CriterionClaim['claim'], string>> = Object.freeze({ met: 'reported met', unmet: 'reported unmet', unstated: 'not reported' });
