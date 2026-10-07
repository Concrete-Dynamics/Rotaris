import { describe, expect, it } from 'vitest';
import { analysisTimedOutAfter, zeroProposalDetail } from './improvement-notice.js';

/**
 * PD-CONFIG-003 revision 2 (OQ-223) with REQ-NOTIFY-100: a post-run analysis that reached its limit says so. Before, its
 * empty artifact — REQ-LIBRARY-023's `collector timed out after <t> seconds` — read "Nothing was proposed in <id>.", like a
 * review that looked and found nothing
 * (`docs/defects/fixed/a-timed-out-improvement-analysis-reads-as-one-that-found-nothing.md`).
 */
describe("the zero-proposal notice's detail (REQ-LIBRARY-124, REQ-LIBRARY-023, REQ-NOTIFY-100)", () => {
  it("reads REQ-LIBRARY-023's timeout note, and nothing else, as a timeout", () => {
    expect(analysisTimedOutAfter('collector timed out after 60 seconds')).toBe(60);
    expect(analysisTimedOutAfter('collector timed out after 120 seconds; the provider never answered')).toBe(120);
    expect(analysisTimedOutAfter('collector crashed: boom')).toBeNull();
    expect(analysisTimedOutAfter('')).toBeNull();
    expect(analysisTimedOutAfter(null)).toBeNull();
  });

  it('a post-run analysis that timed out states its limit and names the control', () => {
    expect(zeroProposalDetail({ artifact_id: 'imp-1', source_kind: 'post_run', notes: 'collector timed out after 60 seconds' }))
      .toBe('The review of this run reached its 60-second limit before it proposed anything. Settings › Runtime › Improvement analysis timeout allows it longer.');
  });

  it('every other empty artifact, and the retrospective whatever its notes, keeps "Nothing was proposed in <id>."', () => {
    expect(zeroProposalDetail({ artifact_id: 'imp-2', source_kind: 'post_run', notes: null })).toBe('Nothing was proposed in imp-2.');
    expect(zeroProposalDetail({ artifact_id: 'imp-3', source_kind: 'post_run', notes: 'collector crashed: boom' })).toBe('Nothing was proposed in imp-3.');
    expect(zeroProposalDetail({ artifact_id: 'imp-4', source_kind: 'retrospective', notes: 'collector timed out after 120 seconds' })).toBe('Nothing was proposed in imp-4.');
  });
});
