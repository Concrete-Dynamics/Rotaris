import { describe, expect, it } from 'vitest';
import { ProcessEventSchema } from '@rotaris/contracts';
import { reportNoticeEvent, runNoticeEvent, runResultEvent, withSessionRoot } from './session-roots.js';

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

/*
 * The events `host.ts` sends for the engine's `onRunResult`, `notice` and `report` ports are built by these three, each stamped
 * on its one line: the run host itself (`createRunHost`) needs a utility process's parent port and is reached by no test, so
 * until 2026-10-14 the stamp's use in `host.ts` was shown by notice-proof 6c/6d alone (fin44's review of `fin44-notice-reach`).
 */
describe('the events the run host sends about a session carry its recorded root (PD-SHELL-001 revision 3, OQ-292, OQ-293)', () => {
  const roots = new Map([['S-A', '/work/atlas']]);
  const result = {
    status: 'completed', session_id: 'S-A', stop_reason: 'answer', summary: 'The run completed.', iterations_completed: 1,
    tokens: { input: 1, output: 1, total: 2 }, cost: { total: '0' }, error: null, execution_status: 'completed', severity: 'information' as const,
  };

  it("the run's result", () => {
    const event = runResultEvent('S-A', result, roots);
    expect(event).toMatchObject({ kind: 'run.result', sessionId: 'S-A', workspaceRoot: '/work/atlas' });
    expect(ProcessEventSchema.safeParse(event).success).toBe(true);
    expect('workspaceRoot' in runResultEvent('S-unknown', result, roots)).toBe(false);
  });

  it("the engine's run notice: headline as title, prose as message, its action and key kept, and the root", () => {
    const event = runNoticeEvent({ severity: 'warning', headline: 'Workspace hooks need review', detail: '2 hooks declared by this workspace', action: 'hooks.review', key: 'hooks.review:/work/atlas:f00d', sessionId: 'S-A' }, roots);
    expect(event).toEqual({
      kind: 'notice.publish', severity: 'warning', title: 'Workspace hooks need review', message: '2 hooks declared by this workspace', detail: '',
      action: 'hooks.review', key: 'hooks.review:/work/atlas:f00d', sessionId: 'S-A', persistent: true, workspaceRoot: '/work/atlas',
    });
    expect(ProcessEventSchema.safeParse(event).success).toBe(true);
    expect(runNoticeEvent({ severity: 'info', headline: 'h', detail: 'd' }, roots)).toEqual({ kind: 'notice.publish', severity: 'info', title: 'h', message: 'd', detail: '', sessionId: '', persistent: true });
  });

  it("the control arms' failure report: its copyable detail kept, and the root", () => {
    const event = reportNoticeEvent({ severity: 'error', title: 'Run recording failed; completion is unconfirmed', message: 'm', detail: 'trace', sessionId: 'S-A' }, roots);
    expect(event).toEqual({ kind: 'notice.publish', severity: 'error', title: 'Run recording failed; completion is unconfirmed', message: 'm', detail: 'trace', sessionId: 'S-A', persistent: true, workspaceRoot: '/work/atlas' });
    expect(ProcessEventSchema.safeParse(event).success).toBe(true);
  });
});
