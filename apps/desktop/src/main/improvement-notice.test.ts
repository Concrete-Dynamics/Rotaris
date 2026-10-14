import { describe, expect, it } from 'vitest';
import { analysisTimedOutAfter, emptyArtifactNotice, passFailureDetail, passFailureTitle } from './improvement-notice.js';

/**
 * PD-CONFIG-003 revision 2 (OQ-223) with REQ-NOTIFY-100: a post-run analysis that reached its limit says so. Before, its
 * empty artifact — REQ-LIBRARY-023's `collector timed out after <t> seconds` — read "Nothing was proposed in <id>.", like a
 * review that looked and found nothing
 * (`docs/defects/fixed/a-timed-out-improvement-analysis-reads-as-one-that-found-nothing.md`).
 *
 * PD-LIBRARY-005 (OQ-285): an empty artifact whose collector crashed or whose answer could not be parsed is its pass's failure
 * warning, for both passes, and a timed-out retrospective states its limit. Before, both read as the zero-proposal info notice
 * with "Nothing was proposed in <id>." (`docs/defects/fixed/a-crashed-improvement-collector-reads-as-an-analysis-that-found-nothing.md`).
 */
const postRun = (notes: string | null, artifact_id = 'impart_00000001') => ({ artifact_id, source_kind: 'post_run', notes });
const retrospective = (notes: string | null, artifact_id = 'impart_00000002') => ({ artifact_id, source_kind: 'retrospective', notes });

describe("the empty artifact's notice (REQ-LIBRARY-124, REQ-LIBRARY-022/023, REQ-NOTIFY-100, PD-LIBRARY-005)", () => {
  it("reads REQ-LIBRARY-023's timeout note, and nothing else, as a timeout", () => {
    expect(analysisTimedOutAfter('collector timed out after 60 seconds')).toBe(60);
    expect(analysisTimedOutAfter('collector timed out after 120 seconds; the provider never answered')).toBe(120);
    expect(analysisTimedOutAfter('collector crashed: boom')).toBeNull();
    expect(analysisTimedOutAfter('')).toBeNull();
    expect(analysisTimedOutAfter(null)).toBeNull();
  });

  it('the two passes share their failure title and detail with a job that produced no artifact', () => {
    expect(passFailureTitle('post_run')).toBe('The completed run could not be reviewed for improvements');
    expect(passFailureTitle('retrospective')).toBe('The retrospective could not be completed');
    expect(passFailureDetail('post_run', 'session-1', 'boom')).toBe('Session session-1 was not reviewed for improvements: boom.');
    expect(passFailureDetail('retrospective', undefined, 'boom')).toBe("This workspace's own history was not reviewed: boom.");
  });

  /*
   * PD-LIBRARY-002 revision 5 (OQ-300): a reason that is a refusal's sentence ends in its own period, and the warning ends in a
   * single one (docs/defects/fixed/a-retrospectives-failure-warning-ends-in-a-doubled-period-when-its-reason-ends-in-one.md).
   */
  it('adds the closing period only to a reason that does not already end in terminal punctuation, for both passes', () => {
    const refused = 'the analyst could not start — Provider authentication required: Authenticate at least one configured provider before running a retrospective.';
    expect(passFailureDetail('retrospective', null, refused)).toBe(`This workspace's own history was not reviewed: ${refused}`);
    expect(passFailureDetail('post_run', 'session-1', 'it stopped!')).toBe('Session session-1 was not reviewed for improvements: it stopped!');
    expect(passFailureDetail('post_run', 'session-1', 'did it answer?')).toBe('Session session-1 was not reviewed for improvements: did it answer?');
    expect(passFailureDetail('retrospective', null, 'the analysis call failed (Unauthorized)')).toBe("This workspace's own history was not reviewed: the analysis call failed (Unauthorized).");
  });

  describe('the post-run pass', () => {
    it('a crashed collector is the failure warning, its reason and the artifact that holds no proposals, with no action', () => {
      expect(emptyArtifactNotice(postRun('collector crashed: Unauthorized'), 'session-1')).toEqual({
        level: 'warning',
        title: 'The completed run could not be reviewed for improvements',
        detail: 'Session session-1 was not reviewed for improvements: the analysis call failed (Unauthorized). impart_00000001 holds no proposals.',
      });
    });

    it("a collector whose answer could not be parsed is the failure warning, naming the parser's error", () => {
      expect(emptyArtifactNotice(postRun('collector parse failed: collector output is invalid JSON: Unexpected token'), 'session-1')).toEqual({
        level: 'warning',
        title: 'The completed run could not be reviewed for improvements',
        detail: "Session session-1 was not reviewed for improvements: the model's answer could not be read (collector output is invalid JSON: Unexpected token). impart_00000001 holds no proposals.",
      });
    });

    it('a timed-out analysis keeps the info notice, states its limit and names the control (PD-CONFIG-003 revision 2, unchanged)', () => {
      expect(emptyArtifactNotice(postRun('collector timed out after 60 seconds'), 'session-1')).toEqual({
        level: 'info',
        title: 'Improvement analysis complete — no proposals',
        detail: 'The review of this run reached its 60-second limit before it proposed anything. Settings › Runtime › Improvement analysis timeout allows it longer.',
      });
    });

    it('a clean empty result keeps the info notice and "Nothing was proposed in <id>."', () => {
      expect(emptyArtifactNotice(postRun(null), 'session-1')).toEqual({ level: 'info', title: 'Improvement analysis complete — no proposals', detail: 'Nothing was proposed in impart_00000001.' });
      expect(emptyArtifactNotice(postRun('Suppressed duplicate proposals already covered by: impart_0000000a.'), 'session-1'))
        .toEqual({ level: 'info', title: 'Improvement analysis complete — no proposals', detail: 'Nothing was proposed in impart_00000001.' });
    });
  });

  describe('the retrospective', () => {
    it('a crashed collector is the failure warning, naming no run', () => {
      expect(emptyArtifactNotice(retrospective('collector crashed: Unauthorized'), undefined)).toEqual({
        level: 'warning',
        title: 'The retrospective could not be completed',
        detail: "This workspace's own history was not reviewed: the analysis call failed (Unauthorized). impart_00000002 holds no proposals.",
      });
    });

    it("a collector whose answer could not be parsed is the failure warning, naming the parser's error", () => {
      expect(emptyArtifactNotice(retrospective('collector parse failed: collector output proposals must be a list'), undefined)).toEqual({
        level: 'warning',
        title: 'The retrospective could not be completed',
        detail: "This workspace's own history was not reviewed: the model's answer could not be read (collector output proposals must be a list). impart_00000002 holds no proposals.",
      });
    });

    it('a timed-out retrospective keeps the info notice and states its limit, naming no control', () => {
      expect(emptyArtifactNotice(retrospective('collector timed out after 120 seconds'), undefined)).toEqual({
        level: 'info',
        title: 'The retrospective found nothing to propose',
        detail: 'The retrospective reached its 120-second limit before it proposed anything.',
      });
    });

    it('a clean empty result keeps the info notice and "Nothing was proposed in <id>."', () => {
      expect(emptyArtifactNotice(retrospective(null), undefined)).toEqual({ level: 'info', title: 'The retrospective found nothing to propose', detail: 'Nothing was proposed in impart_00000002.' });
      expect(emptyArtifactNotice(retrospective('Suppressed duplicate proposals already covered by: impart_0000000a.'), undefined))
        .toEqual({ level: 'info', title: 'The retrospective found nothing to propose', detail: 'Nothing was proposed in impart_00000002.' });
    });
  });

  it('a prefix met anywhere but at the start of the notes is not the case (REQ-LIBRARY-022/023 write it first)', () => {
    expect(emptyArtifactNotice(postRun('the model said: collector crashed: no'), 'session-1').level).toBe('info');
  });
});
