import { describe, expect, it } from 'vitest';
import type { ColumnToken, ReqId } from '@rotaris/contracts';
import { releaseGate, rootReleasable } from './gate.js';
import { answerPaths, assertBlockerKind, blockerFlags, cardBlocker, optionLabel } from './blockers.js';

/**
 * The release gate and the blocker chain (REQ-TRACE-455..462) over a synthetic dependency map, and the blocker
 * answer paths (REQ-TRACE-446..454).
 */
const cols = (m: Record<string, ColumnToken>) => new Map(Object.entries(m));
const deps = (m: Record<string, ReqId[]>) => new Map(Object.entries(m));

describe('releaseGate', () => {
  it('REQ-TRACE-455: not held when every dependency is done', () => {
    const p = releaseGate({ id: 'REQ-3', depends: deps({ 'REQ-3': ['REQ-1'] }), columns: cols({ 'REQ-1': 'done', 'REQ-3': 'backlog' }) });
    expect(p.heldBy).toEqual([]);
    expect(p.root).toBeNull();
    expect(rootReleasable(p)).toEqual({ releasable: false, statement: 'REQ-3 is not held by any dependency.' });
  });
  it('REQ-TRACE-459/460: the transitive closure, topologically ordered, stable, with the root named before anything happens', () => {
    const p = releaseGate({ id: 'REQ-10', depends: deps({ 'REQ-10': ['REQ-9', 'REQ-2'], 'REQ-9': ['REQ-2', 'REQ-3'], 'REQ-3': ['REQ-2'] }), columns: cols({ 'REQ-10': 'backlog', 'REQ-9': 'backlog', 'REQ-3': 'backlog', 'REQ-2': 'backlog' }) });
    expect(p.heldBy.map((h) => h.id)).toEqual(['REQ-2', 'REQ-9']);
    expect(p.heldBy[0]!.reason).toBe('REQ-2 is not yet delivered (backlog).');
    expect(p.chain).toEqual(['REQ-2', 'REQ-3', 'REQ-9']);
    expect(p.root).toBe('REQ-2');
    expect(rootReleasable(p)).toEqual({ releasable: true, root: 'REQ-2' });
    // Identical on every read (REQ-TRACE-459).
    expect(releaseGate({ id: 'REQ-10', depends: deps({ 'REQ-10': ['REQ-2', 'REQ-9'], 'REQ-9': ['REQ-3', 'REQ-2'], 'REQ-3': ['REQ-2'] }), columns: cols({ 'REQ-10': 'backlog', 'REQ-9': 'backlog', 'REQ-3': 'backlog', 'REQ-2': 'backlog' }) }).chain).toEqual(['REQ-2', 'REQ-3', 'REQ-9']);
  });
  it('REQ-TRACE-461: a cycle is a loop to break, an unknown target is flagged, a root already released is reported rather than re-released', () => {
    const cycle = releaseGate({ id: 'REQ-1', depends: deps({ 'REQ-1': ['REQ-2'], 'REQ-2': ['REQ-3'], 'REQ-3': ['REQ-2'] }), columns: cols({ 'REQ-1': 'backlog', 'REQ-2': 'backlog', 'REQ-3': 'backlog' }) });
    expect(cycle.cycle).toEqual(['REQ-2', 'REQ-3']);
    expect(cycle.root).toBeNull();
    expect(rootReleasable(cycle)).toMatchObject({ releasable: false });
    expect((rootReleasable(cycle) as { statement: string }).statement).toMatch(/is a loop \(REQ-2 → REQ-3\); break it somewhere/);
    const unknown = releaseGate({ id: 'REQ-1', depends: deps({ 'REQ-1': ['REQ-77'] }), columns: cols({ 'REQ-1': 'backlog' }) });
    expect(unknown.unknown).toEqual(['REQ-77']);
    expect(unknown.heldBy[0]!.kind).toBe('unknown');
    expect((rootReleasable(unknown) as { statement: string }).statement).toMatch(/REQ-77, which is not in this requirement store/);
    const released = releaseGate({ id: 'REQ-1', depends: deps({ 'REQ-1': ['REQ-2'] }), columns: cols({ 'REQ-1': 'backlog', 'REQ-2': 'running' }) });
    expect(released.rootState).toBe('running');
    expect((rootReleasable(released) as { statement: string }).statement).toBe("REQ-2, the chain's root, is already running; no second release is issued.");
  });
});

describe('blockers (REQ-TRACE-446..454)', () => {
  it('REQ-TRACE-449: options outrank identifiers outrank run failure outrank clear; resume is always answerable', () => {
    expect(answerPaths({ kind: 'run-failure', options: [{ key: 'retry-later' }], blockingIds: ['REQ-1'] })).toEqual(['choose', 'resume']);
    expect(answerPaths({ kind: 'run-failure', options: [], blockingIds: ['REQ-1'] })).toEqual(['navigate', 'resume']);
    expect(answerPaths({ kind: 'run-failure', options: [], blockingIds: [] })).toEqual(['inspect', 'resume']);
    expect(answerPaths({ kind: 'stated', options: [], blockingIds: [] })).toEqual(['resume']);
    expect(answerPaths({ kind: 'decision', options: [], blockingIds: [] })).toEqual(['resume']);
  });
  it('REQ-TRACE-446: a sixth kind fails the lookup at once', () => {
    expect(() => assertBlockerKind('weather')).toThrow(/unknown blocker kind 'weather'/);
    expect(() => cardBlocker({ kind: 'weather' as never, reason: 'x', options: [], blockingIds: [], runUnit: null, raisedAt: 't' })).toThrow();
  });
  it('REQ-TRACE-450/452: navigable with identifiers, side by side for a conflict, option labels title-cased from the key when the engine gave none', () => {
    expect(blockerFlags({ kind: 'conflict', blockingIds: ['REQ-2'] })).toEqual({ navigable: true, sideBySide: true });
    expect(blockerFlags({ kind: 'stated', blockingIds: [] })).toEqual({ navigable: false, sideBySide: false });
    expect(optionLabel({ key: 'keep-both' })).toBe('Keep Both');
    expect(optionLabel({ key: 'keep-both', label: 'Keep both as written' })).toBe('Keep both as written');
  });
});
