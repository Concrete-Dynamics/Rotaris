import { describe, expect, it } from 'vitest';
import { createReplicaStore } from './index.js';

const session = (seq: number) => ({
  v: 1, sessionId: 's', seq,
  session: { id: 's', executionStatus: 'running', workspaceRoot: 'C:\\ws', createdAt: 'x', updatedAt: 'x', agents: [], pendingApprovals: [], pendingQuestions: [], tokenUsage: { input: 0, output: 0 } },
});
const inc = (seq: number, earliestChanged: number, rows: { index: number; body: string }[]) => ({
  v: 1, sessionId: 's', seq, earliestChanged, rows: rows.map((r) => ({ ...r, kind: 'text', settled: true })), diffs: [], personas: [],
});

describe('ui-core — the apply pipeline, step 0 (REQ-MONITOR-214, REQ-MONITOR-226, ADR-0046)', () => {
  it('an expectation is created by a whole-session update and by nothing else; an increment before one is dropped, not refused', () => {
    const reconciles: string[] = [];
    const store = createReplicaStore({ requestReconcile: (id) => reconciles.push(id) });
    store.getState().follow('s');
    expect(store.getState().applyIncrement(inc(1, 0, [{ index: 0, body: 'a' }]))).toBe('dropped');
    expect(reconciles).toEqual([]);
    expect(store.getState().applySnapshot(session(5))).toBe('reset');
    expect(store.getState().expect).toBe(6);
  });

  it('consecutive numbers apply; a superseded number is discarded; a gap refuses, requests a reconcile at once, and drops until it settles', () => {
    const reconciles: string[] = [];
    const store = createReplicaStore({ requestReconcile: (id) => reconciles.push(id) });
    const a = store.getState();
    a.follow('s');
    a.applySnapshot(session(1));
    expect(a.applyIncrement(inc(2, 0, [{ index: 0, body: 'r0' }]))).toBe('applied');
    expect(a.applyIncrement(inc(3, 1, [{ index: 1, body: 'r1' }]))).toBe('applied');
    expect(store.getState().rows.map((r) => r.body)).toEqual(['r0', 'r1']);
    expect(a.applyIncrement(inc(2, 0, [{ index: 0, body: 'stale' }]))).toBe('superseded');
    expect(store.getState().rows[0]!.body).toBe('r0');
    // seq 4 lost; 5 arrives
    expect(a.applyIncrement(inc(5, 2, [{ index: 2, body: 'r2' }]))).toBe('refused');
    expect(reconciles).toEqual(['s']);
    expect(a.applyIncrement(inc(6, 3, [{ index: 3, body: 'r3' }]))).toBe('dropped');
    // The reconcile response is a snapshot carrying the number it was taken at; the surface resumes from it.
    expect(a.applySnapshot(session(9))).toBe('reset');
    expect(store.getState().reconciling).toBe(false);
    expect(a.applyIncrement(inc(10, 0, [{ index: 0, body: 'fresh' }]))).toBe('applied');
    expect(store.getState().counters).toMatchObject({ applied: 3, reset: 2, superseded: 1, refused: 1, dropped: 1 });
  });

  it('REQ-MONITOR-217: a snapshot REPLACES — a field the new payload does not carry does not survive', () => {
    const store = createReplicaStore({ requestReconcile: () => {} });
    store.getState().follow('s');
    store.getState().applySnapshot({ ...session(1), session: { ...session(1).session, agents: [{ id: 'a', state: 'running', depth: 1 }] } });
    expect(store.getState().session?.agents).toHaveLength(1);
    store.getState().applySnapshot(session(2));
    expect(store.getState().session?.agents).toHaveLength(0);
  });

  it('a payload for a session this surface is not showing is discarded (ADR-0044: the focus-change race is structural)', () => {
    const store = createReplicaStore({ requestReconcile: () => {} });
    store.getState().follow('s');
    store.getState().applySnapshot(session(1));
    expect(store.getState().applyIncrement({ ...inc(2, 0, []), sessionId: 'other' })).toBe('foreign');
  });

  it('an unknown schema version takes the gap path rather than guessing (ADR-0044 versioning)', () => {
    const reconciles: string[] = [];
    const store = createReplicaStore({ requestReconcile: (id) => reconciles.push(id) });
    store.getState().follow('s');
    store.getState().applySnapshot(session(1));
    expect(store.getState().applyIncrement({ ...inc(2, 0, []), v: 99 })).toBe('refused');
    expect(reconciles).toEqual(['s']);
  });
});
