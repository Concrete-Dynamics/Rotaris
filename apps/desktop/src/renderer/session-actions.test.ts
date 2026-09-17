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
});
