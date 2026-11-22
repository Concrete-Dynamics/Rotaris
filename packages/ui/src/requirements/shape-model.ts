import type { CriterionClaim, ProgressReport, ShapeAcceptOutcome, ShapeDrift, ShapeExportOutcome, ShapeView, SurveyPreview } from '@rotaris/contracts';
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

/**
 * REQ-ADOPT-026 (R-123, the owner, 2026-11-21: "the user needs to see where its at and how far it progressed"). A survey
 * reports through the board's progress protocol — `reading` while the script drafts a shape, then `adopting` with one
 * item per step the agent takes, labelled by its action (`read <path>`, `list <path>`, `grep …`, `propose`, `finish`),
 * at a position out of the step bound (REQ-TRACE-212, REQ-TRACE-213). Folded here into the survey's own stages, so the
 * strip says where the survey stands rather than only that it runs. Pure: the strip draws it, the test reads it.
 */
export type SurveyStage = 'draft' | 'read' | 'propose' | 'preview';
export const SURVEY_STAGES: readonly { readonly key: SurveyStage; readonly label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'read', label: 'Read' },
  { key: 'propose', label: 'Propose' },
  { key: 'preview', label: 'Preview' },
];
export interface SurveyProgress {
  readonly stage: SurveyStage;
  /** Reading actions the agent has taken (list, read, grep). */
  readonly reads: number;
  /** Proposals the agent has made; the first is followed by at most three repairs (REQ-ADOPT-038). */
  readonly proposals: number;
  /** The last step's position and the step bound, where a step was reported. */
  readonly step: number;
  readonly total: number;
  /** The step in progress, in words. */
  readonly action: string;
  readonly path: string | undefined;
}
/** REQ-ADOPT-038: a first proposal and at most three repairs. */
export const SURVEY_PROPOSALS_MAX = 4;
const READING_ACTIONS = new Set(['read', 'list', 'grep']);

export function surveyProgressOf(reports: readonly ProgressReport[], continuing: boolean): SurveyProgress {
  let stage: SurveyStage = continuing ? 'propose' : 'draft';
  let reads = 0;
  let proposals = 0;
  let step = 0;
  let total = 0;
  let action = continuing ? 'Reading your correction' : 'Starting';
  let path: string | undefined;
  for (const r of reports) {
    if (r.kind === 'phase') {
      if (r.phase === 'reading') { stage = 'draft'; action = 'Drafting a shape from what the detection found'; path = undefined; }
      if (r.phase === 'adopting') { if (stage === 'draft') stage = 'read'; action = 'Asking the agent'; path = undefined; }
      continue;
    }
    if (r.phase !== 'adopting') continue;
    step = r.position;
    total = r.total;
    const space = r.label.indexOf(' ');
    const verb = space === -1 ? r.label : r.label.slice(0, space);
    path = space === -1 ? undefined : r.label.slice(space + 1);
    if (READING_ACTIONS.has(verb)) {
      reads += 1;
      if (stage === 'draft') stage = 'read';
      action = verb === 'read' ? 'Reading' : verb === 'list' ? 'Listing' : 'Searching';
    } else if (verb === 'propose') {
      proposals += 1;
      stage = 'propose';
      action = `Testing proposal ${proposals} of at most ${SURVEY_PROPOSALS_MAX}`;
      path = undefined;
    } else if (verb === 'finish') {
      // A finish can be refused (nothing valid to finish with), so the stage stays where it is: the preview is
      // reached when the survey's answer arrives, and then the strip draws the preview itself.
      action = 'Finishing';
      path = undefined;
    } else {
      action = 'Thinking';
    }
  }
  return { stage, reads, proposals, step, total, action, path };
}

/** The elapsed time as m:ss, for the strip's clock. */
export function elapsedClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The figures beside the stages, in one line: what has been read, which proposal, which step. */
export function surveyFigures(p: SurveyProgress): string {
  const parts: string[] = [];
  if (p.reads > 0) parts.push(countNoun(p.reads, 'reading action'));
  if (p.proposals > 0) parts.push(`proposal ${p.proposals} of at most ${SURVEY_PROPOSALS_MAX}`);
  if (p.step > 0) parts.push(`step ${p.step} of at most ${p.total}`);
  return parts.join(' · ');
}
