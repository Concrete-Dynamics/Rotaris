import { describe, expect, it } from 'vitest';
import type { AgentRecord, CommandOutcome, CommandRequest, SessionRecord, TranscriptRow } from '@rotaris/contracts';
import { createCancelOverlayStore, shownSession } from '@rotaris/ui';
import { createSessionActions, type SessionActionDeps } from './session-actions.js';

const agentRecord = (over: Partial<AgentRecord>): AgentRecord => ({ id: 'bg_00000001', name: 'one', parentId: 'bg_0000root', state: 'running', presentationState: 'running', activity: 'TASK: one', activeTools: [], live: true, completedAt: null, ...over } as AgentRecord);

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

describe('PD-ORCH-005 clauses 3 and 15: the stop comes to rest, and the confirmed cancel of the run is final', () => {
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

  it('PD-ORCH-005 clause 16: a child\'s cancel refused by the store or another process\'s lock states the engine\'s words, and "no longer cancellable" only when it states none (REQ-MONITOR-128)', async () => {
    const locked = { code: 'session_locked', message: 'Another process holds this session, so the agent was not cancelled.' } as const;
    const a = actions([{ ok: true, value: { ok: false, refusal: locked } }, { ok: true, value: { ok: false } }, { ok: true, value: { ok: true } }]);
    expect(await a.cancelAgent('bg_000000c1')).toEqual({ ok: false, reason: locked.message });
    expect(await a.cancelAgent('bg_000000c1')).toEqual({ ok: false, reason: 'That agent is no longer cancellable.' });
    expect(await a.cancelAgent('bg_000000c1')).toEqual({ ok: true });
  });

  /*
   * REQ-MONITOR-128 / REQ-MONITOR-296 (the note "cancelling one agent is not shown cancelled until the engine answers"):
   * the agent and its descendants are shown cancelled while the control is still in flight, the prior state again on a
   * refusal, and on an acceptance the overlay is left to the next authoritative read.
   */
  it('REQ-MONITOR-128: a confirmed cancel of one agent is shown cancelled before the engine answers, and restored on its refusal', async () => {
    const parent = agentRecord({ id: 'bg_000000c1', name: 'alpha' });
    const child = agentRecord({ id: 'bg_000000c2', name: 'sub', parentId: 'bg_000000c1' });
    const record = { id: 'S1', agents: [parent, child], resumable: null } as unknown as SessionRecord;
    const cancels = createCancelOverlayStore();
    const seen: (string | undefined)[][] = [];
    const replies: CommandOutcome[] = [{ ok: true, value: { ok: false } }, { ok: true, value: { ok: true } }];
    let n = 0;
    const a = createSessionActions({
      bridge: { command: async () => { seen.push(shownSession(record, cancels.getState())!.agents.map((x) => x.presentationState)); return replies[n++]!; } },
      replica: { getState: () => ({ sessionId: 'S1', follow: () => undefined, session: record }) },
      cancels, now: () => '2026-09-29T10:00:00.000Z',
    });
    expect(await a.cancelAgent('bg_000000c1')).toEqual({ ok: false, reason: 'That agent is no longer cancellable.' });
    expect(seen[0]).toEqual(['cancelled', 'cancelled']);
    expect(shownSession(record, cancels.getState())).toBe(record);
    expect(await a.cancelAgent('bg_000000c1')).toEqual({ ok: true });
    expect(seen[1]).toEqual(['cancelled', 'cancelled']);
    // Accepted: still shown over the record held when the engine answered, until a newer record replaces it.
    expect(shownSession(record, cancels.getState())!.agents.map((x) => x.presentationState)).toEqual(['cancelled', 'cancelled']);
    const next = { ...record, agents: [{ ...parent, presentationState: 'cancelled' }, { ...child, presentationState: 'cancelled' }] } as SessionRecord;
    expect(shownSession(next, cancels.getState())).toBe(next);
  });

  /*
   * REQ-MONITOR-127 / REQ-MONITOR-130 (acceptance A35, the note "the Mission view and a persona window do not show a
   * confirmed run cancel as cancelling"): every surface's confirmed "Cancel the run?" comes here — the Workspace, the Mission
   * view's "Cancel selection" on the run row, a persona window's Cancel on the run's own instance — and the session is shown
   * `cancelling` while the control is in flight, restored on a refusal, and still shown so once the engine accepts.
   */
  it('REQ-MONITOR-127: a confirmed cancel of the run is shown cancelling before the engine answers, and restored on its refusal', async () => {
    const record = { id: 'S1', executionStatus: 'running', runStartedAt: '2026-09-29T09:58:00.000Z', agents: [], resumable: null } as unknown as SessionRecord;
    const cancels = createCancelOverlayStore();
    const seen: string[] = [];
    const replies: CommandOutcome[] = [{ ok: true, value: { ok: false } }, { ok: false, code: 'command.unreachable', headline: 'The application did not answer' }, { ok: true, value: { ok: true } }];
    let n = 0;
    const a = createSessionActions({
      bridge: { command: async () => { seen.push(shownSession(record, cancels.getState())!.executionStatus); return replies[n++]!; } },
      replica: { getState: () => ({ sessionId: 'S1', follow: () => undefined, session: record }) },
      cancels, now: () => '2026-09-29T10:00:00.000Z',
    });
    expect(await a.cancelRun()).toEqual({ ok: false, reason: 'The run is no longer cancellable.' });
    expect(shownSession(record, cancels.getState())).toBe(record);
    expect(await a.cancelRun()).toEqual({ ok: false, reason: 'The application did not answer' });
    expect(shownSession(record, cancels.getState())).toBe(record);
    expect(await a.cancelRun()).toEqual({ ok: true });
    expect(seen).toEqual(['cancelling', 'cancelling', 'cancelling']);
    // Accepted: the engine's records of the run keep reading `running` through the graceful stop, and are shown cancelling.
    expect(shownSession({ ...record }, cancels.getState())!.executionStatus).toBe('cancelling');
  });
});

/*
 * REQ-NOTIFY-045 with REQ-NOTIFY-030 and REQ-NOTIFY-066 (OQ-178): the notice's retry, which had no target until the repair
 * of `docs/defects/fixed/the-retry-run-notice-action-has-no-target.md` — the window logged that and dispatched nothing.
 * Since the repair of `docs/defects/fixed/the-retry-action-reads-the-last-prompt-from-the-resident-window.md` and
 * `docs/defects/fixed/the-retry-action-resubmits-a-prompt-without-its-images.md`, a blank draft is the engine's to retry
 * (`session.retry`, `Sessions.retry` in `packages/engine/src/last-prompt.test.ts`): the window no longer searches its replica.
 */
describe('REQ-NOTIFY-045: a notice\'s retry resubmits the draft, or asks the engine for the session\'s last submitted prompt', () => {
  const row = (index: number, kind: string, body: string): TranscriptRow => ({ index, kind, settled: true, body, at: '2026-10-02T09:00:00.000Z', ts: '09:00:00' });
  function retrying(rows: readonly TranscriptRow[], sessionId: string | null = 'S1', reply: CommandOutcome = { ok: true, value: null }) {
    const sent: CommandRequest[] = [];
    const a = createSessionActions({
      bridge: { command: async (req) => { sent.push(req); return reply; } },
      // `rows` is what the window's replica holds; the retry must not read it (it is the resident window only).
      replica: { getState: () => ({ sessionId, follow: () => undefined, rows }) },
    });
    return { a, sent };
  }
  const history = [row(0, 'user', 'first prompt'), row(1, 'agent', 'an answer'), row(2, 'user', 'the prompt that failed'), row(3, 'system', 'The run failed.')];

  it('a draft is resubmitted to the followed session as the composer would submit it', async () => {
    const { a, sent } = retrying(history);
    expect(await a.retryRun('the draft I kept')).toEqual({ ok: true, resubmitted: 'draft' });
    expect(sent).toEqual([{ kind: 'session.prompt', sessionId: 'S1', prompt: 'the draft I kept' }]);
  });

  it('a blank draft asks the engine to retry the followed session\'s last submitted prompt — the window sends no prompt text of its own', async () => {
    const { a, sent } = retrying(history);
    expect(await a.retryRun('  \n ')).toEqual({ ok: true, resubmitted: 'last-prompt' });
    expect(sent).toEqual([{ kind: 'session.retry', sessionId: 'S1' }]);
    // A prompt the resident window has released is not in the replica at all; the engine still has it.
    const released = retrying([row(6000, 'agent', 'a late answer')]);
    expect(await released.a.retryRun('')).toEqual({ ok: true, resubmitted: 'last-prompt' });
    expect(released.sent).toEqual([{ kind: 'session.retry', sessionId: 'S1' }]);
  });

  it('no session followed is a refusal that sends nothing and starts nothing', async () => {
    const none = retrying(history, null);
    expect(await none.a.retryRun('a draft')).toEqual({ ok: false, reason: 'No session is loaded.' });
    expect(await none.a.retryRun('')).toEqual({ ok: false, reason: 'No session is loaded.' });
    expect(none.sent).toEqual([]);
  });

  it('the engine\'s refusal is the retry\'s reason — nothing to retry, a missing image, a live run', async () => {
    const nothing = retrying([], 'S1', { ok: false, code: 'session.no-prompt', headline: 'The prompt could not be retried', detail: 'The prompt could not be retried: No prompt has been submitted in this session, so there is nothing to retry.' });
    expect(await nothing.a.retryRun('')).toEqual({ ok: false, reason: 'The prompt could not be retried: No prompt has been submitted in this session, so there is nothing to retry.' });
    const image = retrying(history, 'S1', { ok: false, code: 'session.attachment-unavailable', headline: 'The prompt could not be retried', detail: 'The prompt could not be retried: The last prompt was not retried, because its image shot.png could not be read back: Image is no longer available.' });
    expect(await image.a.retryRun('')).toEqual({ ok: false, reason: 'The prompt could not be retried: The last prompt was not retried, because its image shot.png could not be read back: Image is no longer available.' });
    const { a } = retrying(history, 'S1', { ok: false, code: 'session.run-active', headline: 'A run is already active.', detail: 'A run is already active.' });
    expect(await a.retryRun('')).toEqual({ ok: false, reason: 'A run is already active.' });
  });
});
