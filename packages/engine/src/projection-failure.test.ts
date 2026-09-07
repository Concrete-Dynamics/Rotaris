import { describe, expect, it } from 'vitest';
import { asSessionId, FakeClock } from '@rotaris/kernel';
import type { SessionRecord, SessionSnapshot, TranscriptIncrement, TranscriptRow } from '@rotaris/contracts';
import { ProjectionOwner, SequenceCounters } from './index.js';

describe('OQ-42 durable projection boundary', () => {
  it('restores committed row text, cancels pending updates and serves the frozen state on reattach', () => {
    const clock = new FakeClock();
    const snapshots: SessionSnapshot[] = [];
    const increments: TranscriptIncrement[] = [];
    const row: TranscriptRow = { index: 0, kind: 'agent', settled: false, body: 'saved', at: '2026-09-07T00:00:00Z', ts: '00:00:00' };
    let unreadable = false;
    const owner = new ProjectionOwner({
      sessionId: asSessionId('s1'), seq: new SequenceCounters(), timers: clock,
      publisher: { snapshot: (p) => { snapshots.push(p); }, increment: (p) => { increments.push(p); } },
      readSession: () => { if (unreadable) throw new Error('store unavailable'); return { id: 's1' } as unknown as SessionRecord; },
      readResident: () => [row],
    });
    owner.grow(0, 'ephemeral');
    clock.advance(50);
    expect(increments.at(-1)!.rows[0]!.body).toBe('ephemeral');
    owner.grow(0, 'pending');
    unreadable = true;
    owner.freezeAtDurableBoundary();
    expect(increments.at(-1)!.rows[0]!.body).toBe('saved');
    const count = increments.length;
    owner.grow(0, 'late');
    owner.flushPending();
    clock.advance(1000);
    expect(increments.length).toBe(count);
    owner.attach();
    expect(increments.at(-1)!.rows[0]!.body).toBe('saved');
    expect(snapshots.at(-1)!.session).toEqual({ id: 's1' });
  });
});
