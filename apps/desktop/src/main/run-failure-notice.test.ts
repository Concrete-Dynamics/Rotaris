import { describe, expect, it } from 'vitest';
import { createNoticeStore, type ReportInput } from './notices.js';
import type { FallbackOutcome } from './auth-fallback.js';
import {
  AUTHENTICATION_FAILED, authenticationFailureNotice, genericFailureNotice, PROVIDER_LIMIT_REACHED, quotaFailureNotice, RUN_FAILED,
  RunFailurePublisher, runEndingPublication, SESSION_AND_DRAFT_KEPT, unfocusedEndingNotice, unfocusedFailureNotice, type AuthenticationRecoveryOutcome, type RunEnding,
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
    expect(unfocusedFailureNotice('S2', '  HTTP 401\n  Incorrect API key  ', '/work/atlas')).toEqual({
      severity: 'warning', title: 'Session S2 failed', message: 'The session on screen is unaffected. Open the failed session to see its recovery.',
      detail: '  HTTP 401\n  Incorrect API key  ', persistent: true, action: { label: 'Open the session', action: { kind: 'focus-session', sessionId: 'S2', workspace: '/work/atlas' } }, sessionId: 'S2',
    });
  });

  // PD-SHELL-001 revision 3 (OQ-292): the action carries the workspace the run host recorded the session under; with none
  // recorded the notice carries no action rather than one that guesses a window.
  it('PD-SHELL-001 revision 3: "Open the session" carries the session\'s workspace, and is absent where none is known', () => {
    expect(unfocusedFailureNotice('S2', 'HTTP 500', '/work/atlas').action?.action).toEqual({ kind: 'focus-session', sessionId: 'S2', workspace: '/work/atlas' });
    expect(unfocusedEndingNotice('S2', 'completed', '/work/atlas').action?.action).toEqual({ kind: 'focus-session', sessionId: 'S2', workspace: '/work/atlas' });
    expect('action' in unfocusedFailureNotice('S2', 'HTTP 500', undefined)).toBe(false);
    expect('action' in unfocusedEndingNotice('S2', 'completed', undefined)).toBe(false);
    expect(unfocusedFailureNotice('S2', 'HTTP 500', undefined)).toMatchObject({ severity: 'warning', title: 'Session S2 failed', persistent: true, sessionId: 'S2' });
  });
});

describe('main/run-failure-notice — REQ-NOTIFY-031: a run other than the focused one ends otherwise than failed', () => {
  it('a persistent notice naming the session and the state it reached, `success` for completed and `info` otherwise, focusing the session', () => {
    expect(unfocusedEndingNotice('S2', 'completed', '/work/atlas')).toEqual({
      severity: 'success', title: 'Session S2 completed', message: 'The session on screen is unaffected. Open the finished session to review it.',
      persistent: true, action: { label: 'Open the session', action: { kind: 'focus-session', sessionId: 'S2', workspace: '/work/atlas' } }, sessionId: 'S2',
    });
    expect(unfocusedEndingNotice('S3', 'stopped', '/work/atlas')).toMatchObject({ severity: 'info', title: 'Session S3 stopped', persistent: true, sessionId: 'S3' });
    // The state is the normalised vocabulary (REQ-NOTIFY-048/049): a raw persisted status is never rendered.
    expect(unfocusedEndingNotice('S4', 'paused_message_limit', '/work/atlas')).toMatchObject({ severity: 'info', title: 'Session S4 paused' });
    expect(unfocusedEndingNotice('S5', 'awaiting_plan_decision', '/work/atlas')).toMatchObject({ severity: 'info', title: 'Session S5 paused' });
    expect(unfocusedEndingNotice('S6', 'interrupted', '/work/atlas')).toMatchObject({ severity: 'info', title: 'Session S6 idle' });
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
    expect(runEndingPublication('S1', ending({ status: 'cancelled', execution_status: 'cancelled', error: 'the quota wait was cancelled: HTTP 429' }))).toEqual({ kind: 'notice', notice: quotaFailureNotice('S1', 'the quota wait was cancelled: HTTP 429'), quota: 'the quota wait was cancelled: HTTP 429' });
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
      clearForRunStart: (sid) => { order.push(`run-start:${sid}`); },
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
    // REQ-NOTIFY-058: the restart is a run of the session starting, and clears the session's notice as one does.
    expect(restarted.order).toEqual(['fallback:restarted', 'run-start:S1']);
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
    expect(h.order).toEqual([`notice:Session S2 failed`, 'fallback:restarted', 'run-start:S2']);
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
    expect(h.reported).toEqual([unfocusedFailureNotice('S2', 'HTTP 401', undefined)]);
    expect(h.recovered).toEqual([]);
    expect(h.publisher.holds('S2')).toBe(true);
    // Focusing another session publishes nothing of S2's.
    await h.publisher.focused('S1');
    expect(h.recovered).toEqual([]);
    focused.add('S2');
    await h.publisher.focused('S2');
    expect(h.recovered).toEqual(['S2']);
    expect(h.reported).toEqual([unfocusedFailureNotice('S2', 'HTTP 401', undefined), authenticationFailureNotice('S2', 'HTTP 401')]);
    // Once only.
    await h.publisher.focused('S2');
    expect(h.recovered).toEqual(['S2']);
    expect(h.reported).toHaveLength(2);
  });

  // PD-SHELL-001 revision 3 (OQ-292): the run's result names the root the run host recorded the session under, and the publisher
  // passes it into the action of the notice it raises for a session not on screen.
  it('PD-SHELL-001 revision 3: the publisher carries the run\'s recorded workspace into "Open the session"', async () => {
    const h = harness(new Set());
    await h.publisher.failed('S2', 'generic', 'HTTP 500', '/work/atlas');
    h.publisher.endedOtherwise('S3', { severity: 'info', title: 'The run completed.' }, 'completed', undefined, '/work/billing');
    expect(h.reported.map((n) => n.action?.action)).toEqual([
      { kind: 'focus-session', sessionId: 'S2', workspace: '/work/atlas' },
      { kind: 'focus-session', sessionId: 'S3', workspace: '/work/billing' },
    ]);
  });

  it('REQ-NOTIFY-031: a focused session\'s non-failure ending publishes its own notice; an unfocused one\'s raises the notice naming the session in its place', async () => {
    const h = harness(new Set(['S1']));
    const own = { severity: 'info' as const, title: 'The run completed.' };
    h.publisher.endedOtherwise('S1', own, 'completed');
    h.publisher.endedOtherwise('S2', own, 'completed');
    h.publisher.endedOtherwise('S3', { severity: 'warning', title: 'Completed with a task abandoned', detail: 'a task was abandoned' }, 'stopped');
    expect(h.reported).toEqual([own, unfocusedEndingNotice('S2', 'completed', undefined), unfocusedEndingNotice('S3', 'stopped', undefined)]);
    expect(h.recovered).toEqual([]);
  });

  it('REQ-NOTIFY-093 with REQ-NOTIFY-030/031: an unfocused run that ended on a limit raises 031\'s notice and holds REQ-NOTIFY-063\'s for the focus', async () => {
    const focused = new Set(['S1']);
    const h = harness(focused);
    const failure = 'the quota wait was cancelled: HTTP 429';
    const publication = runEndingPublication('S2', ending({ status: 'cancelled', execution_status: 'stopped', error: failure }));
    if (publication.kind !== 'notice') throw new Error('expected a notice');
    h.publisher.endedOtherwise('S2', publication.notice, 'stopped', publication.quota);
    // While S2 is not on screen: REQ-NOTIFY-031's info notice naming it, and nothing else.
    expect(h.reported).toEqual([unfocusedEndingNotice('S2', 'stopped', undefined)]);
    expect(h.reported[0]?.severity).toBe('info');
    expect(h.publisher.holds('S2')).toBe(true);
    // Focusing another session publishes nothing of S2's.
    await h.publisher.focused('S1');
    expect(h.reported).toHaveLength(1);
    // Focusing S2 brings REQ-NOTIFY-063's notice and its model-settings action, once.
    focused.add('S2');
    await h.publisher.focused('S2');
    expect(h.reported).toEqual([unfocusedEndingNotice('S2', 'stopped', undefined), quotaFailureNotice('S2', failure)]);
    await h.publisher.focused('S2');
    expect(h.reported).toHaveLength(2);
    expect(h.recovered).toEqual([]);
    // A focused session's limit ending raises REQ-NOTIFY-063's notice at once and holds nothing.
    h.publisher.endedOtherwise('S1', quotaFailureNotice('S1', failure), 'stopped', failure);
    expect(h.reported.at(-1)).toEqual(quotaFailureNotice('S1', failure));
    expect(h.publisher.holds('S1')).toBe(false);
    // A later ending of the unfocused session supersedes the held quota notice.
    h.publisher.endedOtherwise('S3', quotaFailureNotice('S3', failure), 'stopped', failure);
    expect(h.publisher.holds('S3')).toBe(true);
    h.publisher.ended('S3');
    h.publisher.endedOtherwise('S3', { severity: 'info', title: 'The run completed.' }, 'completed');
    expect(h.publisher.holds('S3')).toBe(false);
    focused.add('S3');
    await h.publisher.focused('S3');
    expect(h.reported.filter((n) => n.sessionId === 'S3')).toEqual([unfocusedEndingNotice('S3', 'stopped', undefined), unfocusedEndingNotice('S3', 'completed', undefined)]);
  });

  it('every class waits for the focus, and a later ending of the session supersedes what was held', async () => {
    const h = harness(new Set());
    await h.publisher.failed('S2', 'generic', 'HTTP 400');
    await h.publisher.focused('S2');
    expect(h.reported).toEqual([unfocusedFailureNotice('S2', 'HTTP 400', undefined), genericFailureNotice('S2', 'HTTP 400')]);
    await h.publisher.failed('S3', 'authentication', 'HTTP 401');
    h.publisher.ended('S3');
    expect(h.publisher.holds('S3')).toBe(false);
    await h.publisher.focused('S3');
    expect(h.recovered).toEqual([]);
  });
});

/*
 * docs/defects/fixed/a-run-that-fails-before-its-window-subscribes-raises-the-background-failure-warning-about-the-session-on-screen.md:
 * resilience-proof's auth-fallback-plan left REQ-NOTIFY-032's warning on screen beside the prompt of REQ-NOTIFY-071, because
 * the held class's publication was the restart, which reports nothing and cleared nothing. Driven here through the one
 * notice store main has, so what is checked is the notice on screen.
 */
describe('main/run-failure-notice — REQ-NOTIFY-032 with REQ-NOTIFY-058/070: two notices about one failure are never on screen at once', () => {
  const restart = { kind: 'restarted', restart: { failed: { provider: 'a', model: 'a1', key: 'a1' }, fallback: { provider: 'f', model: 'f1', key: 'f1' } } } as const;
  function wired(focused: Set<string>, automatic: FallbackOutcome) {
    const store = createNoticeStore({ broadcast: () => undefined, pushAcknowledgement: () => undefined, record: async () => true, log: () => undefined, focusedSession: () => null });
    const publisher = new RunFailurePublisher({
      isFocused: (sid) => focused.has(sid),
      report: (n) => { void store.report(n); },
      fallBack: async () => automatic,
      recoverAuthentication: async () => ({ opened: true }),
      closePrompts: () => undefined,
      clearForRunStart: (sid) => { void store.clearForRunStart(sid); },
      log: () => undefined,
    });
    return { store, publisher };
  }

  it('a held first authentication failure that restarts on the fallback when focused leaves no warning standing', async () => {
    const focused = new Set<string>();
    const h = wired(focused, restart);
    await h.publisher.failed('S2', 'authentication', 'HTTP 401');
    await h.store.settled();
    expect(h.store.current()?.title).toBe('Session S2 failed');
    focused.add('S2');
    await h.publisher.focused('S2');
    await h.store.settled();
    // The restart's acknowledgement and the non-modal prompt are the failure's report now; the warning is gone.
    expect(h.store.current()).toBeNull();
  });

  it('a restart clears only the restarted session\'s notice and an unscoped one, never another session\'s (REQ-NOTIFY-029)', async () => {
    const h = wired(new Set(['S1']), restart);
    await h.store.report({ severity: 'warning', title: 'Session S9 failed', sessionId: 'S9' });
    await h.publisher.failed('S1', 'authentication', 'HTTP 401');
    await h.store.settled();
    expect(h.store.current()?.title).toBe('Session S9 failed');
  });

  it('every other held class still replaces the warning with its own notice when focused', async () => {
    const focused = new Set<string>();
    const h = wired(focused, { kind: 'dialog', reason: 'no usable fallback' });
    await h.publisher.failed('S2', 'authentication', 'HTTP 401');
    focused.add('S2');
    await h.publisher.focused('S2');
    await h.store.settled();
    expect(h.store.current()?.title).toBe(AUTHENTICATION_FAILED);
  });
});
