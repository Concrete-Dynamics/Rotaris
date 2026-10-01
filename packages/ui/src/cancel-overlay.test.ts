import { describe, expect, it } from 'vitest';
import type { AgentRecord, SessionRecord } from '@rotaris/contracts';
import { cancelledByUser, createCancelOverlayStore, shownSession } from './cancel-overlay.js';

/**
 * REQ-MONITOR-128 / REQ-MONITOR-296 — the optimistic cancel of one agent (the note "cancelling one agent is not shown
 * cancelled until the engine answers"). What is shown is `shownSession` over the replica's record; the store holds the
 * overlays between the confirmation and the authoritative read.
 */
const AT = '2026-09-29T10:00:00.000Z';
const agent = (over: Partial<AgentRecord>): AgentRecord => ({
  id: 'bg_00000001', name: 'alpha', givenName: 'alpha', persona: 'coding-agent', state: 'running', presentationState: 'running', parentId: 'bg_0000root', dependencies: [], activity: 'TASK: alpha', model: 'm',
  depth: 1, background: true, category: '', spawnedAt: '2026-09-29T09:59:00.000Z', completedAt: null, toolCalls: 1, delegationTask: 'TASK: alpha', reasoning: 'medium', contextUsed: 0, contextLimit: 1000,
  grantedTools: [], calledTools: [], activeTools: ['read_file'], delegationSessionId: null, inheritedContext: '', live: true, grantedMcp: {}, mcpServers: [], compressions: 0, interruption: null, ...over,
} as AgentRecord);
const alpha = agent({});
const sub = agent({ id: 'bg_00000002', name: 'sub', parentId: alpha.id, depth: 2 });
const done = agent({ id: 'bg_00000003', name: 'done', parentId: alpha.id, depth: 2, state: 'succeeded', presentationState: 'done', completedAt: '2026-09-29T09:59:30.000Z', activity: 'TASK: done' });
const beta = agent({ id: 'bg_00000004', name: 'beta' });
const record = (over: Partial<SessionRecord> = {}): SessionRecord => ({ id: 's1', executionStatus: 'running', agents: [alpha, sub, done, beta], resumable: null, ...over } as SessionRecord);
const states = (s: SessionRecord | null) => s?.agents.map((a) => `${a.name}:${a.presentationState}`);

describe('REQ-MONITOR-128: a confirmed cancel of one agent is shown at once', () => {
  it('shows the agent and each unfinished descendant cancelled, with an activity line saying the user cancelled them', () => {
    const store = createCancelOverlayStore();
    const s = record();
    expect(store.getState().begin(s, alpha.id, AT)).not.toBeNull();
    const shown = shownSession(s, store.getState())!;
    expect(states(shown)).toEqual(['alpha:cancelled', 'sub:cancelled', 'done:done', 'beta:running']);
    expect(shown.agents[0]).toMatchObject({ state: 'cancelled', activity: cancelledByUser('alpha', true), activeTools: [], live: false, completedAt: AT });
    expect(shown.agents[1]!.activity).toBe('Cancelled with alpha, which the user cancelled.');
    expect(shown.agents[0]!.activity).toBe('The user cancelled this agent.');
    // A finished descendant and an unrelated agent are shown as they are.
    expect(shown.agents[2]).toBe(done);
    expect(shown.agents[3]).toBe(beta);
  });

  it('holds while the engine has not answered, over any publication in flight that does not yet show the cancel', () => {
    const store = createCancelOverlayStore();
    store.getState().begin(record(), alpha.id, AT);
    const unrelated = record({ executionStatus: 'running' });
    expect(states(shownSession(unrelated, store.getState()))).toEqual(['alpha:cancelled', 'sub:cancelled', 'done:done', 'beta:running']);
  });

  it('restores the prior state on a refusal: the record itself is shown again', () => {
    const store = createCancelOverlayStore();
    const s = record();
    const token = store.getState().begin(s, alpha.id, AT)!;
    store.getState().refuse(token);
    expect(shownSession(s, store.getState())).toBe(s);
    expect(store.getState().overlays).toEqual([]);
  });

  it('REQ-MONITOR-296: an accepted cancel is overwritten by the next authoritative read', () => {
    const store = createCancelOverlayStore();
    const s = record();
    const token = store.getState().begin(s, alpha.id, AT)!;
    store.getState().accept(token, s);
    expect(states(shownSession(s, store.getState()))).toEqual(['alpha:cancelled', 'sub:cancelled', 'done:done', 'beta:running']);
    // The engine's republished record is what is shown from then on, whatever it says.
    const authoritative = record({ agents: [agent({ state: 'cancelled', presentationState: 'cancelled', activity: 'TASK: alpha' }), sub, done, beta] });
    expect(shownSession(authoritative, store.getState())).toBe(authoritative);
    // A later cancel leaves the accepted overlay inert: it covers no record taken after the acceptance.
    store.getState().witness(authoritative);
    store.getState().begin(authoritative, beta.id, AT);
    expect(states(shownSession(authoritative, store.getState()))).toEqual(['alpha:cancelled', 'sub:running', 'done:done', 'beta:cancelled']);
    expect(shownSession(authoritative, store.getState())!.agents[0]).toBe(authoritative.agents[0]);
  });

  it('REQ-MONITOR-296 / REQ-SHELL-076: an accepted cancel still covers a reader drawing a record older than the one the engine answered over', () => {
    // A persona window draws a copy coalesced up to 120 ms behind the replica; the engine publishes and answers inside it.
    const store = createCancelOverlayStore();
    const before = record();
    const atConfirm = record();
    store.getState().witness(before);
    store.getState().witness(atConfirm);
    const token = store.getState().begin(atConfirm, alpha.id, AT)!;
    const engineRecord = record({ agents: [agent({ state: 'cancelled', presentationState: 'cancelled', activity: 'TASK: alpha' }), agent({ id: sub.id, name: 'sub', parentId: alpha.id, depth: 2, state: 'cancelled', presentationState: 'cancelled' }), done, beta] });
    store.getState().witness(engineRecord);
    store.getState().accept(token, engineRecord);
    // The lagging reader still draws `before` or `atConfirm`: shown cancelled, never `running` again.
    for (const lagging of [before, atConfirm]) {
      expect(states(shownSession(lagging, store.getState()))).toEqual(['alpha:cancelled', 'sub:cancelled', 'done:done', 'beta:running']);
    }
    // The engine's record is shown as it is, and so is every record taken after the acceptance.
    expect(shownSession(engineRecord, store.getState())).toBe(engineRecord);
    const later = record();
    store.getState().witness(later);
    expect(shownSession(later, store.getState())).toBe(later);
    // A record the store never witnessed is not covered once the engine has answered.
    const unseen = record();
    expect(shownSession(unseen, store.getState())).toBe(unseen);
  });

  it('numbers a record once, in the order the replica took it', () => {
    const store = createCancelOverlayStore();
    const a = record();
    const b = record();
    store.getState().witness(a);
    store.getState().witness(b);
    store.getState().witness(a);
    store.getState().witness(null);
    expect(store.getState().orderOf(a)).toBeLessThan(store.getState().orderOf(b)!);
    expect(store.getState().orderOf(record())).toBeUndefined();
  });

  it('covers only the session it was made against, and shows nothing for an agent the record does not hold', () => {
    const store = createCancelOverlayStore();
    expect(store.getState().begin(record(), 'bg_unknown', AT)).toBeNull();
    expect(store.getState().begin(null, alpha.id, AT)).toBeNull();
    store.getState().begin(record(), alpha.id, AT);
    const other = record({ id: 's2' });
    expect(shownSession(other, store.getState())).toBe(other);
    expect(shownSession(null, store.getState())).toBeNull();
  });

  it('PD-ORCH-005 clause 16: a paused child\'s at-rest cancel is shown at once too, and the Continue action\'s count drops with it', () => {
    const pausedAlpha = agent({ state: 'paused', presentationState: 'paused', live: false, activeTools: [], interruption: 'pause' });
    const pausedSub = agent({ id: sub.id, name: 'sub', parentId: alpha.id, depth: 2, state: 'paused', presentationState: 'paused', live: false, activeTools: [], interruption: 'pause' });
    const resting = record({ executionStatus: 'paused', agents: [pausedAlpha, pausedSub, beta], resumable: { iteration: 1, agents: 4 } });
    const store = createCancelOverlayStore();
    store.getState().begin(resting, alpha.id, AT);
    const shown = shownSession(resting, store.getState())!;
    expect(states(shown)).toEqual(['alpha:cancelled', 'sub:cancelled', 'beta:running']);
    expect(shown.resumable).toEqual({ iteration: 1, agents: 2 });
    expect(resting.resumable).toEqual({ iteration: 1, agents: 4 });
  });
});

/**
 * REQ-MONITOR-127 / REQ-MONITOR-130 / REQ-MONITOR-296 — the optimistic cancel of the whole run (acceptance A35, the note "the
 * Mission view and a persona window do not show a confirmed run cancel as cancelling"). On confirmation the session's status
 * is shown `cancelling`; a refusal restores the record's own; an accepted cancel is shown until the run's record leaves the
 * active statuses, because the engine writes no `cancelling` for the explicit cancel and its records keep reading `running`
 * through the graceful stop (OQ-158).
 */
describe('REQ-MONITOR-127: a confirmed cancel of the run is shown cancelling at once', () => {
  const RUN = '2026-09-29T09:58:00.000Z';
  it('shows the session cancelling from the confirmation, and no agent cancelled by it', () => {
    const store = createCancelOverlayStore();
    const s = record({ runStartedAt: RUN });
    expect(store.getState().beginRun(s, AT)).not.toBeNull();
    const shown = shownSession(s, store.getState())!;
    expect(shown.executionStatus).toBe('cancelling');
    expect(states(shown)).toEqual(states(s));
    expect(s.executionStatus).toBe('running');
  });

  it('a refusal restores the record\'s own status (REQ-MONITOR-296)', () => {
    const store = createCancelOverlayStore();
    const s = record({ runStartedAt: RUN });
    const token = store.getState().beginRun(s, AT)!;
    store.getState().refuse(token);
    expect(shownSession(s, store.getState())).toBe(s);
  });

  it('accepted: shown over every active record of that run, and overwritten by its final read or another run\'s record', () => {
    const store = createCancelOverlayStore();
    const s = record({ runStartedAt: RUN });
    const token = store.getState().beginRun(s, AT)!;
    store.getState().accept(token, s);
    // The engine's next record of the same run still reads `running` (or `waiting`) through the graceful stop.
    const later = record({ runStartedAt: RUN, executionStatus: 'waiting', updatedAt: '2026-09-29T10:00:05.000Z' });
    expect(shownSession(later, store.getState())!.executionStatus).toBe('cancelling');
    // The final read: the run's record at rest is shown as the engine wrote it.
    const ended = record({ runStartedAt: RUN, executionStatus: 'stopped' });
    expect(shownSession(ended, store.getState())).toBe(ended);
    // A later run of the session is never shown cancelling by this cancel.
    const next = record({ runStartedAt: '2026-09-29T10:01:00.000Z' });
    expect(shownSession(next, store.getState())).toBe(next);
    expect(shownSession(record({ id: 's2', runStartedAt: RUN }), store.getState())!.executionStatus).toBe('running');
  });

  it('is begun only against a held session whose run is active', () => {
    const store = createCancelOverlayStore();
    expect(store.getState().beginRun(null, AT)).toBeNull();
    expect(store.getState().beginRun(record({ runStartedAt: RUN, executionStatus: 'completed' }), AT)).toBeNull();
    expect(store.getState().beginRun(record({ runStartedAt: null }), AT)).toBeNull();
  });

  it('lays over one agent\'s cancel without disturbing it', () => {
    const store = createCancelOverlayStore();
    const s = record({ runStartedAt: RUN });
    store.getState().begin(s, alpha.id, AT);
    store.getState().beginRun(s, AT);
    const shown = shownSession(s, store.getState())!;
    expect(shown.executionStatus).toBe('cancelling');
    expect(states(shown)).toEqual(['alpha:cancelled', 'sub:cancelled', 'done:done', 'beta:running']);
  });
});
