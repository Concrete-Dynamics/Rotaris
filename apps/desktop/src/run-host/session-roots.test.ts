import { describe, expect, it } from 'vitest';
import { ProcessEventSchema } from '@rotaris/contracts';
import { withSessionRoot } from './session-roots.js';

/**
 * PD-SHELL-001 revision 3 (OQ-292): `run.result` and `notice.publish` carry the root the run host recorded the session under, so
 * the notice main raises about it can name the session's workspace; a session with no recorded root is stamped with nothing.
 */
describe('withSessionRoot (PD-SHELL-001 revision 3, OQ-292)', () => {
  const roots = new Map([['S-A', '/work/atlas'], ['S-B', '/work/billing']]);
  const result = {
    status: 'completed', session_id: 'S-B', stop_reason: 'answer', summary: 'The run completed.', iterations_completed: 1,
    tokens: { input: 1, output: 1, total: 2 }, cost: { total: '0' }, error: null, execution_status: 'completed', severity: 'information' as const,
  };

  it("stamps a run's result with its session's recorded root, which the event schema accepts", () => {
    const event = withSessionRoot({ kind: 'run.result' as const, sessionId: 'S-B', result }, roots);
    expect(event.workspaceRoot).toBe('/work/billing');
    const parsed = ProcessEventSchema.safeParse(event);
    expect(parsed.success && parsed.data.kind === 'run.result' ? parsed.data.workspaceRoot : parsed.success).toBe('/work/billing');
  });

  it("stamps a run's notice the same way", () => {
    const event = withSessionRoot({ kind: 'notice.publish' as const, severity: 'error' as const, title: 'Run recording failed; completion is unconfirmed', message: '', detail: '', action: 'session.reopen', sessionId: 'S-A', persistent: true }, roots);
    expect(event.workspaceRoot).toBe('/work/atlas');
    expect(ProcessEventSchema.safeParse(event).success).toBe(true);
  });

  it('stamps nothing for a session with no recorded root, or a notice naming no session', () => {
    expect('workspaceRoot' in withSessionRoot({ kind: 'run.result' as const, sessionId: 'S-unknown', result }, roots)).toBe(false);
    expect('workspaceRoot' in withSessionRoot({ kind: 'notice.publish' as const, severity: 'info' as const, title: 't', message: '', detail: '', sessionId: '', persistent: true }, roots)).toBe(false);
  });
});
