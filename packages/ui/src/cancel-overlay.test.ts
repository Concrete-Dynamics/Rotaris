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
    const shown = shownSession(s, store.getState().overlays)!;
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
    expect(states(shownSession(unrelated, store.getState().overlays))).toEqual(['alpha:cancelled', 'sub:cancelled', 'done:done', 'beta:running']);
  });

  it('restores the prior state on a refusal: the record itself is shown again', () => {
    const store = createCancelOverlayStore();
    const s = record();
    const token = store.getState().begin(s, alpha.id, AT)!;
    store.getState().refuse(token);
    expect(shownSession(s, store.getState().overlays)).toBe(s);
    expect(store.getState().overlays).toEqual([]);
  });

  it('REQ-MONITOR-296: an accepted cancel is overwritten by the next authoritative read', () => {
    const store = createCancelOverlayStore();
    const s = record();
    const token = store.getState().begin(s, alpha.id, AT)!;
    store.getState().accept(token, s);
    expect(states(shownSession(s, store.getState().overlays))).toEqual(['alpha:cancelled', 'sub:cancelled', 'done:done', 'beta:running']);
    // The engine's republished record is what is shown from then on, whatever it says.
    const authoritative = record({ agents: [agent({ state: 'cancelled', presentationState: 'cancelled', activity: 'TASK: alpha' }), sub, done, beta] });
    expect(shownSession(authoritative, store.getState().overlays)).toBe(authoritative);
    // A later cancel drops the overlay no record covers any longer.
    store.getState().begin(authoritative, beta.id, AT);
    expect(store.getState().overlays.map((o) => o.agentId)).toEqual([beta.id]);
  });

  it('covers only the session it was made against, and shows nothing for an agent the record does not hold', () => {
    const store = createCancelOverlayStore();
    expect(store.getState().begin(record(), 'bg_unknown', AT)).toBeNull();
    expect(store.getState().begin(null, alpha.id, AT)).toBeNull();
    store.getState().begin(record(), alpha.id, AT);
    const other = record({ id: 's2' });
    expect(shownSession(other, store.getState().overlays)).toBe(other);
    expect(shownSession(null, store.getState().overlays)).toBeNull();
  });

  it('PD-ORCH-005 clause 16: a paused child\'s at-rest cancel is shown at once too, and the Continue action\'s count drops with it', () => {
    const pausedAlpha = agent({ state: 'paused', presentationState: 'paused', live: false, activeTools: [], interruption: 'pause' });
    const pausedSub = agent({ id: sub.id, name: 'sub', parentId: alpha.id, depth: 2, state: 'paused', presentationState: 'paused', live: false, activeTools: [], interruption: 'pause' });
    const resting = record({ executionStatus: 'paused', agents: [pausedAlpha, pausedSub, beta], resumable: { iteration: 1, agents: 4 } });
    const store = createCancelOverlayStore();
    store.getState().begin(resting, alpha.id, AT);
    const shown = shownSession(resting, store.getState().overlays)!;
    expect(states(shown)).toEqual(['alpha:cancelled', 'sub:cancelled', 'beta:running']);
    expect(shown.resumable).toEqual({ iteration: 1, agents: 2 });
    expect(resting.resumable).toEqual({ iteration: 1, agents: 4 });
  });
});
