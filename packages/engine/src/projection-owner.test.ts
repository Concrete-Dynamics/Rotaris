import { describe, expect, it } from 'vitest';
import { asSessionId, FakeClock } from '@rotaris/kernel';
import type { SessionSnapshot, TranscriptIncrement } from '@rotaris/contracts';
import { ProjectionOwner, SequenceCounters, type Publisher } from './index.js';
import type { WireEvent } from './events.js';

/**
 * ADR-0043 (Part R, the twenty-eighth defect): a commit that changes the whole-session record — a child event, a tool
 * event — publishes it; a commit that changes nothing a surface reads from the record does not.
 */
describe('ProjectionOwner — the record is published when the ledger or the tool ring changed it', () => {
  const build = () => {
    const snapshots: SessionSnapshot[] = [];
    const increments: TranscriptIncrement[] = [];
    const publisher: Publisher = { snapshot: (p) => { snapshots.push(p); }, increment: (p) => { increments.push(p); } };
    const clock = new FakeClock();
    const owner = new ProjectionOwner({ sessionId: asSessionId('s1'), seq: new SequenceCounters(), timers: clock, publisher, readSession: () => ({ id: 's1' }) as unknown as SessionSnapshot['session'], readResident: () => [] });
    const event = (kind: string): WireEvent => ({ event: kind as WireEvent['event'], session_id: 's1', timestamp: '2026-09-05T10:00:00.000Z', schema_version: 1 } as WireEvent);
    return { owner, snapshots, increments, event, clock };
  };
  it('a child spawn, a child transition, a tool start and a tool finish each publish the record — coalesced to one per 80 ms tick; a permission decision does not; a save publishes at once', () => {
    const { owner, snapshots, event, clock } = build();
    for (const kind of ['child.spawn', 'child.transition', 'tool.start', 'tool.finish']) { owner.onCommitted({ kind: 'event', ordinal: 1, events: [{ ordinal: 1, event: event(kind), line: '' }] }); clock.advance(80); }
    expect(snapshots.length).toBe(4);
    owner.onCommitted({ kind: 'event', ordinal: 5, events: [{ ordinal: 5, event: event('permission.decision'), line: '' }] });
    clock.advance(200);
    expect(snapshots.length).toBe(4);
    // A burst of tool events within one tick is one read and one publication.
    for (let i = 0; i < 6; i += 1) owner.onCommitted({ kind: 'event', ordinal: 10 + i, events: [{ ordinal: 10 + i, event: event(i % 2 === 0 ? 'tool.start' : 'tool.finish'), line: '' }] });
    expect(snapshots.length).toBe(4);
    clock.advance(80);
    expect(snapshots.length).toBe(5);
    // A save publishes at once and clears a pending record tick.
    owner.onCommitted({ kind: 'event', ordinal: 20, events: [{ ordinal: 20, event: event('child.transition'), line: '' }] });
    owner.onCommitted({ kind: 'save' });
    expect(snapshots.length).toBe(6);
    clock.advance(200);
    expect(snapshots.length).toBe(6);
    // The numbers stay one series (REQ-MONITOR-214).
    expect(snapshots.map((s) => s.seq)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
