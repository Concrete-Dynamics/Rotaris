import { describe, expect, it } from 'vitest';
import type { ReportInput } from './notices.js';
import type { FallbackOutcome } from './auth-fallback.js';
import {
  AUTHENTICATION_FAILED, authenticationFailureNotice, genericFailureNotice, PROVIDER_LIMIT_REACHED, quotaFailureNotice, RUN_FAILED,
  RunFailurePublisher, runEndingPublication, SESSION_AND_DRAFT_KEPT, unfocusedFailureNotice, type AuthenticationRecoveryOutcome, type RunEnding,
} from './run-failure-notice.js';

const ending = (over: Partial<RunEnding> = {}): RunEnding => ({ error: null, status: 'completed', execution_status: 'completed', summary: 'The run completed.', severity: 'success', ...over });
const failed = (error: string | null, over: Partial<RunEnding> = {}): RunEnding => ending({ error, status: 'failed', execution_status: 'failed', summary: 'The run failed: agent_session_aborted', severity: 'error', ...over });

describe('main/run-failure-notice — REQ-NOTIFY-064\'s generic notice and the other classes\' words', () => {
  it('REQ-NOTIFY-064/065: the generic notice states the run failed and that the session and the draft were kept, the failure as detail, the workspace action', () => {
    expect(genericFailureNotice('S1', 'scripted failure (HTTP 400)')).toEqual({
      severity: 'error', title: RUN_FAILED, message: SESSION_AND_DRAFT_KEPT, detail: 'scripted failure (HTTP 400)', persistent: true,
      action: { label: 'Back to the workspace', action: { kind: 'open-view', view: 'workspace' } }, sessionId: 'S1',
    });
    expect(RUN_FAILED).toBe('The run failed');
    expect(SESSION_AND_DRAFT_KEPT).toBe('The session and the draft were kept.');
  });

  it('the authentication class keeps the generic shape under its own title and names the recovery dialog', () => {
    const n = authenticationFailureNotice('S1', 'HTTP 401');
    expect(n).toMatchObject({ severity: 'error', title: AUTHENTICATION_FAILED, detail: 'HTTP 401', persistent: true, sessionId: 'S1', action: { action: { kind: 'open-view', view: 'workspace' } } });
    expect(n.message).toBe('The session and the draft were kept. Choose another model or re-authenticate in the recovery dialog.');
  });

  it('REQ-NOTIFY-063: the quota class names the limit and offers the model settings', () => {
    expect(quotaFailureNotice('S1', 'HTTP 429')).toEqual({ severity: 'error', title: PROVIDER_LIMIT_REACHED, detail: 'HTTP 429\n\nChoose another model, or retry once the provider resets.', persistent: true, action: { label: 'Open Models settings', action: { kind: 'open-settings', category: 'models' } }, sessionId: 'S1' });
  });

  it('REQ-NOTIFY-032: the unfocused failure is a persistent warning naming the session, the failure text exactly as detail, focusing the session', () => {
    expect(unfocusedFailureNotice('S2', '  HTTP 401\n  Incorrect API key  ')).toEqual({
      severity: 'warning', title: 'Session S2 failed', message: 'The session on screen is unaffected. Open the failed session to see its recovery.',
      detail: '  HTTP 401\n  Incorrect API key  ', persistent: true, action: { label: 'Open the session', action: { kind: 'focus-session', sessionId: 'S2' } }, sessionId: 'S2',
    });
  });
});

describe('main/run-failure-notice — runEndingPublication: REQ-NOTIFY-060 classifies a FAILED run', () => {
  it('a failed run is a failure of its class; one with no failure text is generic, its summary the detail', () => {
    expect(runEndingPublication('S1', failed('HTTP 401 Unauthorized'))).toEqual({ kind: 'failure', failureClass: 'authentication', failure: 'HTTP 401 Unauthorized' });
    expect(runEndingPublication('S1', failed('HTTP 429 Too Many Requests'))).toEqual({ kind: 'failure', failureClass: 'quota', failure: 'HTTP 429 Too Many Requests' });
    expect(runEndingPublication('S1', failed('scripted failure (HTTP 400)'))).toEqual({ kind: 'failure', failureClass: 'generic', failure: 'scripted failure (HTTP 400)' });
    expect(runEndingPublication('S1', failed(null))).toEqual({ kind: 'failure', failureClass: 'generic', failure: 'The run failed: agent_session_aborted' });
    expect(runEndingPublication('S1', failed('x', { status: 'error', execution_status: 'aborted' }))).toMatchObject({ kind: 'failure' });
  });

  it('REQ-EVENTS-088: a run whose persistence is unconfirmed was already reported', () => {
    expect(runEndingPublication('S1', failed('HTTP 401', { persistence: { last_event_ordinal: 4 } }))).toEqual({ kind: 'reported' });
  });

  it('a run that ended otherwise keeps its summary, or REQ-NOTIFY-063\'s notice where it ended on a limit (REQ-NOTIFY-093)', () => {
    expect(runEndingPublication('S1', ending())).toEqual({ kind: 'notice', notice: { severity: 'info', title: 'The run completed.' } });
    expect(runEndingPublication('S1', ending({ error: 'a task was abandoned', severity: 'warning', summary: 'Completed with a task abandoned' }))).toEqual({ kind: 'notice', notice: { severity: 'warning', title: 'Completed with a task abandoned', detail: 'a task was abandoned' } });
    expect(runEndingPublication('S1', ending({ status: 'cancelled', execution_status: 'cancelled', error: 'the quota wait was cancelled: HTTP 429' }))).toEqual({ kind: 'notice', notice: quotaFailureNotice('S1', 'the quota wait was cancelled: HTTP 429') });
  });
});

describe('main/run-failure-notice — RunFailurePublisher: the class publication waits for the focus (REQ-NOTIFY-030/032)', () => {
  // The automatic fallback (REQ-NOTIFY-070, `auth-fallback.ts`) answers `dialog` unless a case says otherwise, so the cases
  // below that are about the dialog read as they did before the fallback was asked first.
  function harness(focused: Set<string>, recovery: (sid: string) => AuthenticationRecoveryOutcome = () => ({ opened: true }), automatic: (sid: string) => FallbackOutcome = () => ({ kind: 'dialog', reason: 'no usable fallback' })) {
    const reported: ReportInput[] = [];
    const recovered: string[] = [];
    const order: string[] = [];
    const publisher = new RunFailurePublisher({
      isFocused: (sid) => focused.has(sid),
      report: (n) => { reported.push(n); order.push(`notice:${n.title}`); },
      fallBack: async (sid) => { const r = automatic(sid); order.push(`fallback:${r.kind}`); return r; },
      recoverAuthentication: async (sid) => { recovered.push(sid); order.push('dialog'); return recovery(sid); },
      closePrompts: () => { order.push('prompts-closed'); },
      log: () => undefined,
    });
    return { publisher, reported, recovered, order };
  }

  it('a focused session\'s failure publishes its class at once: the generic and quota notices, or the dialog beside the authentication notice', async () => {
    const h = harness(new Set(['S1']));
    await h.publisher.failed('S1', 'generic', 'HTTP 400');
    await h.publisher.failed('S1', 'quota', 'HTTP 429');
    await h.publisher.failed('S1', 'authentication', 'HTTP 401');
    expect(h.reported).toEqual([genericFailureNotice('S1', 'HTTP 400'), quotaFailureNotice('S1', 'HTTP 429'), authenticationFailureNotice('S1', 'HTTP 401')]);
    expect(h.recovered).toEqual(['S1']);
    expect(h.publisher.holds('S1')).toBe(false);
  });

  it('REQ-NOTIFY-070 ahead of REQ-NOTIFY-072: the automatic fallback is asked first; a restart publishes nothing more and opens no dialog', async () => {
    const restarted = harness(new Set(['S1']), undefined, () => ({ kind: 'restarted', restart: { failed: { provider: 'a', model: 'a1', key: 'a1' }, fallback: { provider: 'f', model: 'f1', key: 'f1' } } }));
    await restarted.publisher.failed('S1', 'authentication', 'HTTP 401');
    expect(restarted.order).toEqual(['fallback:restarted']);
    expect(restarted.reported).toEqual([]);
    expect(restarted.recovered).toEqual([]);
    // No usable fallback, or a second failure: the dialog opens, every prompt is closed (REQ-NOTIFY-079), and the class's notice stands beside it.
    const dialog = harness(new Set(['S1']));
    await dialog.publisher.failed('S1', 'authentication', 'HTTP 401');
    expect(dialog.order).toEqual(['fallback:dialog', 'dialog', 'prompts-closed', `notice:${AUTHENTICATION_FAILED}`]);
    // REQ-NOTIFY-069's preconditions, or a restart that could not begin: the generic notice, and no dialog.
    const generic = harness(new Set(['S1']), undefined, () => ({ kind: 'generic', reason: 'the restart could not begin' }));
    await generic.publisher.failed('S1', 'authentication', 'HTTP 401');
    expect(generic.reported).toEqual([genericFailureNotice('S1', 'HTTP 401')]);
    expect(generic.recovered).toEqual([]);
    // Superseded by a run of the session that is active again: nothing.
    const stale = harness(new Set(['S1']), undefined, () => ({ kind: 'stale', reason: 'A run is already active.' }));
    await stale.publisher.failed('S1', 'authentication', 'HTTP 401');
    expect(stale.order).toEqual(['fallback:stale']);
    // A dialog that could not open closes no prompt.
    const unopened = harness(new Set(['S1']), () => ({ opened: false, reason: 'the run host did not answer' }));
    await unopened.publisher.failed('S1', 'authentication', 'HTTP 401');
    expect(unopened.order).toEqual(['fallback:dialog', 'dialog', `notice:${RUN_FAILED}`]);
  });

  it('REQ-NOTIFY-032 with REQ-NOTIFY-070: an unfocused session\'s first failure is not restarted until it is focused', async () => {
    const focused = new Set<string>();
    const h = harness(focused, undefined, () => ({ kind: 'restarted', restart: { failed: { provider: 'a', model: 'a1', key: 'a1' }, fallback: { provider: 'f', model: 'f1', key: 'f1' } } }));
    await h.publisher.failed('S2', 'authentication', 'HTTP 401');
    expect(h.order).toEqual([`notice:Session S2 failed`]);
    focused.add('S2');
    await h.publisher.focused('S2');
    expect(h.order).toEqual([`notice:Session S2 failed`, 'fallback:restarted']);
  });

  it('REQ-NOTIFY-069: an authentication failure whose dialog cannot open takes the generic notice; a superseded one raises nothing', async () => {
    const refused = harness(new Set(['S1']), () => ({ opened: false, reason: 'no prompt is recorded' }));
    await refused.publisher.failed('S1', 'authentication', 'HTTP 401');
    expect(refused.reported).toEqual([genericFailureNotice('S1', 'HTTP 401')]);
    const stale = harness(new Set(['S1']), () => ({ opened: false, reason: 'A run is already active.', stale: true }));
    await stale.publisher.failed('S1', 'authentication', 'HTTP 401');
    expect(stale.reported).toEqual([]);
  });

  it('REQ-NOTIFY-032: an unfocused session\'s failure raises only the warning — no dialog — and the class arrives when it is focused', async () => {
    const focused = new Set(['S1']);
    const h = harness(focused);
    await h.publisher.failed('S2', 'authentication', 'HTTP 401');
    expect(h.reported).toEqual([unfocusedFailureNotice('S2', 'HTTP 401')]);
    expect(h.recovered).toEqual([]);
    expect(h.publisher.holds('S2')).toBe(true);
    // Focusing another session publishes nothing of S2's.
    await h.publisher.focused('S1');
    expect(h.recovered).toEqual([]);
    focused.add('S2');
    await h.publisher.focused('S2');
    expect(h.recovered).toEqual(['S2']);
    expect(h.reported).toEqual([unfocusedFailureNotice('S2', 'HTTP 401'), authenticationFailureNotice('S2', 'HTTP 401')]);
    // Once only.
    await h.publisher.focused('S2');
    expect(h.recovered).toEqual(['S2']);
    expect(h.reported).toHaveLength(2);
  });

  it('every class waits for the focus, and a later ending of the session supersedes what was held', async () => {
    const h = harness(new Set());
    await h.publisher.failed('S2', 'generic', 'HTTP 400');
    await h.publisher.focused('S2');
    expect(h.reported).toEqual([unfocusedFailureNotice('S2', 'HTTP 400'), genericFailureNotice('S2', 'HTTP 400')]);
    await h.publisher.failed('S3', 'authentication', 'HTTP 401');
    h.publisher.ended('S3');
    expect(h.publisher.holds('S3')).toBe(false);
    await h.publisher.focused('S3');
    expect(h.recovered).toEqual([]);
  });
});
