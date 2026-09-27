import { describe, expect, it } from 'vitest';
import type { CommandOutcome, CommandRequest } from '@rotaris/contracts';
import { createSessionActions, type SessionActionDeps } from './session-actions.js';

/**
 * The first tests of renderer code, and they exist because the actions stopped being closures over two module-scope
 * globals. Both dependencies are plain objects here: no window, no preload, no main process, no React.
 *
 * What is worth pinning is the refusal discipline, which is the part a surface depends on and the part that was
 * already wrong once: whose words a refusal carries, and what happens when no session is followed.
 */
function actions(replies: CommandOutcome[], sessionId: string | null = 'S1') {
  const sent: CommandRequest[] = [];
  const followed: (string | null)[] = [];
  const deps: SessionActionDeps = {
    bridge: {
      command: async (req) => {
        sent.push(req);
        return replies[sent.length - 1] ?? { ok: false, code: 'test.exhausted', headline: 'no reply was scripted' };
      },
    },
    replica: { getState: () => ({ sessionId, follow: (id) => { followed.push(id); } }) },
  };
  return { ...createSessionActions(deps), sent, followed };
}

describe('the gestures against the followed session', () => {
  it('names no session rather than sending a control for one', async () => {
    const a = actions([], null);
    expect(await a.stopRun(false)).toEqual({ ok: false, reason: 'No run is active.' });
    expect(await a.continueSession()).toEqual({ ok: false, reason: 'No session is loaded.' });
    expect(await a.planEdit('take the other branch')).toEqual({ ok: false, reason: 'No session is loaded.' });
    expect(await a.answerQuestions('R1', {})).toEqual({ delivered: false });
    a.cancelQuestions('R1');
    expect(a.sent).toEqual([]);
  });

  it('prefers the engine\'s own words to the caller\'s sentence when a control is refused', async () => {
    const a = actions([{ ok: true, value: { ok: false, refusal: { code: 'no-context', message: 'No agent context is live.' } } }]);
    expect(await a.control('forceCompression', {}, 'Compression is unavailable for this run.'))
      .toEqual({ ok: false, reason: 'No agent context is live.' });
  });

  it('falls back to the caller\'s sentence only when the reply states none', async () => {
    const a = actions([{ ok: true, value: { ok: false } }]);
    expect(await a.control('forceCompression', {}, 'Compression is unavailable for this run.'))
      .toEqual({ ok: false, reason: 'Compression is unavailable for this run.' });
  });

  it('prefers a refusal\'s detail to its headline, and never throws out of one', async () => {
    const a = actions([{ ok: false, code: 'session.gone', headline: 'The run could not be cancelled', detail: 'That session has already finished.' }]);
    expect(await a.stopRun(true)).toEqual({ ok: false, reason: 'That session has already finished.' });
  });

  it('starts a session when none is followed, then follows and subscribes to it', async () => {
    const a = actions([
      { ok: true, value: { sessionId: 'S2' } },
      { ok: true, value: {} },
    ], null);
    expect(await a.submitPrompt('build the thing', [])).toEqual({ ok: true });
    expect(a.followed).toEqual(['S2']);
    expect(a.sent.map((r) => r.kind)).toEqual(['session.start', 'session.subscribe']);
    expect(a.sent[0]).toMatchObject({ kind: 'session.start', prompt: 'build the thing' });
    // REQ-CHAT-011: an empty attachment list is an ABSENT field, not an empty array.
    expect(a.sent[0]).not.toHaveProperty('attachments');
  });

  it('prompts the session already followed rather than starting a second one', async () => {
    const a = actions([{ ok: true, value: {} }]);
    expect(await a.submitPrompt('and again', [])).toEqual({ ok: true });
    expect(a.followed).toEqual([]);
    expect(a.sent).toEqual([{ kind: 'session.prompt', sessionId: 'S1', prompt: 'and again' }]);
  });

  it('writes the permission mode before telling the run, and stops at a refused write', async () => {
    const a = actions([{ ok: false, code: 'config.unreadable', headline: 'The configuration could not be read' }]);
    expect(await a.setMode('autonomous')).toEqual({ ok: false, reason: 'The configuration could not be read' });
    expect(a.sent.map((r) => r.kind)).toEqual(['config.setField']);
  });

  // REQ-CHAT-101/102: the answers cross as two flat maps keyed by step id, because the control's value space has no
  // record of records; `delivered` is the waiting call's own answer and is never softened into an optimistic true.
  it('splits every step\'s answer into a selected map and a freeform map', async () => {
    const a = actions([{ ok: true, value: { ok: true } }]);
    expect(await a.answerQuestions('R1', {
      q1: { selected_option: 'yes', freeform_text: null },
      q2: { selected_option: null, freeform_text: 'the third way' },
    })).toEqual({ delivered: true });
    expect(a.sent[0]).toEqual({
      kind: 'session.control',
      request: { op: 'answerQuestion', sessionId: 'S1', args: { requestId: 'R1', selected: { q1: 'yes', q2: null }, freeform: { q1: null, q2: 'the third way' } } },
    });
  });

  it('reports a delivered:false when the answers reached nobody', async () => {
    const a = actions([{ ok: true, value: { ok: false } }]);
    expect(await a.answerQuestions('R1', { q1: { selected_option: 'yes', freeform_text: null } })).toEqual({ delivered: false });
  });

  /**
   * R0-2: `bridge.command` rejects when main's handler throws or the channel is gone
   * (`ipcRenderer.invoke`) — every gesture below answers with the cause instead, because the
   * caller is a click handler and a throw there is a wedged, silent composer.
   */
  function refusingActions(sessionId: string | null = 'S1') {
    const sent: CommandRequest[] = [];
    const deps: SessionActionDeps = {
      bridge: {
        command: async (req) => { sent.push(req); throw new Error('no reply to session.start within 10000 ms'); },
      },
      replica: { getState: () => ({ sessionId, follow: () => undefined }) },
    };
    return { ...createSessionActions(deps), sent };
  }

  it('never throws when the application does not answer', async () => {
    const a = refusingActions(null);
    await expect(a.submitPrompt('build the thing', [])).resolves.toEqual({ ok: false, reason: 'no reply to session.start within 10000 ms' });
    const b = refusingActions('S1');
    await expect(b.submitPrompt('and again', [])).resolves.toEqual({ ok: false, reason: 'no reply to session.start within 10000 ms' });
    await expect(b.stopRun(false)).resolves.toEqual({ ok: false, reason: 'no reply to session.start within 10000 ms' });
    await expect(b.continueSession()).resolves.toEqual({ ok: false, reason: 'no reply to session.start within 10000 ms' });
    await expect(b.control('forceCompression', {}, 'Compression is unavailable for this run.')).resolves.toEqual({ ok: false, reason: 'no reply to session.start within 10000 ms' });
    await expect(b.planEdit('take the other branch')).resolves.toEqual({ ok: false, reason: 'no reply to session.start within 10000 ms' });
    await expect(b.planDecision('approve', '')).resolves.toEqual({ ok: false, reason: 'no reply to session.start within 10000 ms' });
    await expect(b.setMode('ask')).resolves.toEqual({ ok: false, reason: 'no reply to session.start within 10000 ms' });
    await expect(b.setRunStartMode('plan')).resolves.toEqual({ ok: false, reason: 'no reply to session.start within 10000 ms' });
    await expect(b.answerQuestions('R1', { q1: { selected_option: 'yes', freeform_text: null } })).resolves.toEqual({ delivered: false });
  });
});

describe('PD-ORCH-005 clause 6: the Continue action', () => {
  it('resumes by default: the command carries no decline', async () => {
    const a = actions([{ ok: true, value: { resumed: true, messageLimit: null } }]);
    expect(await a.continueSession()).toEqual({ ok: true });
    expect(a.sent).toEqual([{ kind: 'session.continue', sessionId: 'S1', action: 'continue' }]);
  });

  it('"continue without them" carries the decline to the run host', async () => {
    const a = actions([{ ok: true, value: { resumed: true, messageLimit: null } }]);
    expect(await a.continueSession('continue', { withoutPaused: true })).toEqual({ ok: true });
    expect(a.sent).toEqual([{ kind: 'session.continue', sessionId: 'S1', action: 'continue', withoutPaused: true }]);
  });
});

describe('PD-ORCH-005 clause 3: the stop comes to rest, and the confirmed cancel of the run is final (OQ-69)', () => {
  it('the stop is the `cancel` control, graceful and then forced — the run comes to rest and its agents resume on a continue', async () => {
    const a = actions([{ ok: true, value: { ok: true } }, { ok: true, value: { ok: true } }]);
    expect(await a.stopRun(false)).toEqual({ ok: true });
    expect(await a.stopRun(true)).toEqual({ ok: true });
    expect(a.sent).toEqual([
      { kind: 'session.control', request: { op: 'cancel', sessionId: 'S1', args: { force: false } } },
      { kind: 'session.control', request: { op: 'cancel', sessionId: 'S1', args: { force: true } } },
    ]);
  });

  it('the run\'s cancel is the reserved run id\'s cancellation (REQ-MONITOR-009), never the stop, and a refusal says the run is no longer cancellable (REQ-MONITOR-127)', async () => {
    const a = actions([{ ok: true, value: { ok: true } }, { ok: true, value: { ok: false } }]);
    expect(await a.cancelRun()).toEqual({ ok: true });
    expect(await a.cancelRun()).toEqual({ ok: false, reason: 'The run is no longer cancellable.' });
    expect(a.sent).toEqual([
      { kind: 'session.control', request: { op: 'cancelAgent', sessionId: 'S1', args: { agentId: 'run' } } },
      { kind: 'session.control', request: { op: 'cancelAgent', sessionId: 'S1', args: { agentId: 'run' } } },
    ]);
    expect(await actions([], null).cancelRun()).toEqual({ ok: false, reason: 'No run is active.' });
  });
});
