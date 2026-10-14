import { describe, expect, it } from 'vitest';
import { HOOKS_REVIEW_HEADLINE, hooksReviewNotice, hooksReviewOpenReport } from './hooks-review-notice.js';

/** REQ-HOOKS-101's sentence for one withheld hook, with the reinstatement clause it may gain. */
const SKIPPED = "Skipped 1 hook declared by this workspace's .rotaris/agents.yaml: workspace hooks run shell commands and this workspace has not been reviewed and trusted yet. Review the hooks in Rotaris to allow them to run. Your own 2 configured hooks still run.";

describe('the unreviewed-hooks notice names its project (OQ-293, REQ-NOTIFY-224, REQ-NOTIFY-005, REQ-HOOKS-101)', () => {
  it('titles the notice with the headline followed by the project folder\'s name (PD-WORKSPACE-005\'s naming rule)', () => {
    expect(hooksReviewNotice('/home/u/work/atlas-billing', SKIPPED).title).toBe(`${HOOKS_REVIEW_HEADLINE}: atlas-billing`);
    expect(hooksReviewNotice('C:\\Users\\u\\work\\atlas-billing', SKIPPED).title).toBe('Workspace hooks need review: atlas-billing');
  });

  it('names a drive or filesystem root by the root itself, never the bare drive letter', () => {
    expect(hooksReviewNotice('C:\\', SKIPPED).title).toBe('Workspace hooks need review: C:\\');
    expect(hooksReviewNotice('/', SKIPPED).title).toBe('Workspace hooks need review: /');
    expect(hooksReviewNotice('C:\\', SKIPPED).detail).toBe('Project folder: C:\\');
  });

  it('carries REQ-HOOKS-101\'s text unchanged in the message row and the project folder in the detail area', () => {
    const n = hooksReviewNotice('/w/one', SKIPPED);
    expect(n.message).toBe(SKIPPED);
    expect(n.detail).toBe('Project folder: /w/one');
  });

  it('offers one action, the review of the workspace whose hooks it counts, in the root\'s own spelling (ESC-34)', () => {
    expect(hooksReviewNotice('C:\\ws\\alpha', SKIPPED).action).toEqual({ label: 'Review hooks', action: { kind: 'open-hook-review', workspace: 'C:\\ws\\alpha' } });
  });

  it('raises the open slot\'s notice once per workspace and hook set, at warning, with the composer\'s words', () => {
    const r = hooksReviewOpenReport('/w/one', { workspace: '/w/one', fingerprint: 'f'.repeat(64), notice: SKIPPED });
    expect(r).toEqual({
      severity: 'warning', key: `hooks.review:/w/one:${'f'.repeat(64)}`,
      title: 'Workspace hooks need review: one', message: SKIPPED, detail: 'Project folder: /w/one',
      action: { label: 'Review hooks', action: { kind: 'open-hook-review', workspace: '/w/one' } },
    });
  });
});
