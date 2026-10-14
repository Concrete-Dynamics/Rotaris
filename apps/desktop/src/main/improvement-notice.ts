import {
  COLLECTOR_CRASHED_PREFIX,
  COLLECTOR_PARSE_FAILED_PREFIX,
  COLLECTOR_TIMED_OUT_PREFIX,
  type AnalysisPass,
} from '@rotaris/contracts';

/**
 * The notice an improvement pass posts for an artifact with no proposals (REQ-LIBRARY-124), and the failure wording the two
 * passes share with a job that ended without an artifact.
 *
 * - **PD-LIBRARY-005** (OQ-285, ruled under R-072): an empty artifact whose notes begin REQ-LIBRARY-023's `collector crashed: `
 *   or REQ-LIBRARY-022's `collector parse failed: ` never reached a usable answer, so its pass posts its own failure warning,
 *   with no action, carrying the recorded reason and naming the artifact that holds no proposals. Both passes.
 * - **PD-CONFIG-003 revision 2** (OQ-223, the R-072 consortium's IT1) with REQ-NOTIFY-100: a post-run analysis whose notes say
 *   `collector timed out after <t> seconds` reached its limit, and its info notice's detail says so, naming the control that
 *   moves it. PD-LIBRARY-005 gives a timed-out retrospective its own limit sentence, naming no control: its bound,
 *   `retrospective_timeout`, has none (PD-LIBRARY-002).
 * - Every other empty artifact keeps its pass's zero-proposal info notice and "Nothing was proposed in <id>.".
 *
 * Before PD-LIBRARY-005 a crashed or unparseable collector read as a pass that looked and found nothing
 * (`docs/defects/fixed/a-crashed-improvement-collector-reads-as-an-analysis-that-found-nothing.md`).
 */

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TIMED_OUT = new RegExp(`^${escaped(COLLECTOR_TIMED_OUT_PREFIX)}(\\d+(?:\\.\\d+)?) seconds\\b`);

/** The limit, in seconds, an empty artifact's notes say the analysis reached; null for notes of any other kind. */
export function analysisTimedOutAfter(notes: string | null | undefined): number | null {
  const m = TIMED_OUT.exec(notes ?? '');
  return m ? Number(m[1]) : null;
}

/** The failure warning's title for a pass: REQ-LIBRARY-124's sibling wording, PD-LIBRARY-002 (c)'s for a retrospective. */
export function passFailureTitle(pass: AnalysisPass): string {
  return pass === 'retrospective' ? 'The retrospective could not be completed' : 'The completed run could not be reviewed for improvements';
}

/**
 * The failure warning's detail: the run it belonged to (the history, for a retrospective, which names no run) and the reason,
 * ending in a single period. A reason that is a refusal's sentence already ends in its own terminal punctuation, and gains no
 * second mark (`PD-LIBRARY-002` revision 5, OQ-300). A post-run pass always reviews a session, but one handed none says "The
 * completed run", its title's words, rather than "Session undefined" (fin44's review of `fin44-improvement-failures`).
 */
export function passFailureDetail(pass: AnalysisPass, sessionId: string | null | undefined, reason: string): string {
  const closed = /[.!?]$/.test(reason) ? reason : `${reason}.`;
  if (pass === 'retrospective') return `This workspace's own history was not reviewed: ${closed}`;
  return sessionId === undefined || sessionId === null || sessionId === ''
    ? `The completed run was not reviewed for improvements: ${closed}`
    : `Session ${sessionId} was not reviewed for improvements: ${closed}`;
}

/** PD-LIBRARY-005's reason for a failed collector, from its stored notes; null when the notes record no such failure. */
export function collectorFailureReason(notes: string | null | undefined): string | null {
  const text = notes ?? '';
  if (text.startsWith(COLLECTOR_CRASHED_PREFIX)) return `the analysis call failed (${text.slice(COLLECTOR_CRASHED_PREFIX.length)})`;
  if (text.startsWith(COLLECTOR_PARSE_FAILED_PREFIX)) return `the model's answer could not be read (${text.slice(COLLECTOR_PARSE_FAILED_PREFIX.length)})`;
  return null;
}

export interface EmptyArtifactNotice {
  readonly level: 'info' | 'warning';
  readonly title: string;
  readonly detail: string;
}

/** The notice an artifact with no proposals posts; `sessionId` is the run the post-run pass reviewed (none for a retrospective). */
export function emptyArtifactNotice(
  artifact: { readonly artifact_id: string; readonly source_kind: string; readonly notes: string | null },
  sessionId: string | null | undefined,
): EmptyArtifactNotice {
  const pass: AnalysisPass = artifact.source_kind === 'retrospective' ? 'retrospective' : 'post_run';
  const reason = collectorFailureReason(artifact.notes);
  if (reason !== null) {
    return { level: 'warning', title: passFailureTitle(pass), detail: `${passFailureDetail(pass, sessionId, reason)} ${artifact.artifact_id} holds no proposals.` };
  }
  const title = pass === 'retrospective' ? 'The retrospective found nothing to propose' : 'Improvement analysis complete — no proposals';
  const limit = analysisTimedOutAfter(artifact.notes);
  if (limit === null) return { level: 'info', title, detail: `Nothing was proposed in ${artifact.artifact_id}.` };
  return {
    level: 'info',
    title,
    detail: pass === 'retrospective'
      ? `The retrospective reached its ${limit}-second limit before it proposed anything.`
      : `The review of this run reached its ${limit}-second limit before it proposed anything. Settings › Runtime › Improvement analysis timeout allows it longer.`,
  };
}
