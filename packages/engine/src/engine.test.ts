import { describe, expect, it } from 'vitest';
import { asSessionId, FakeClock, millis, mintWorkspaceId } from '@rotaris/kernel';
import { RefusalLease, SequenceCounters } from './index.js';

describe('engine — the refusal lease (ADR-0058 step 3b, IC-1 E3b)', () => {
  it('refuses while held, and re-admits by itself after the lease expires with nothing to release it', () => {
    const clock = new FakeClock();
    const lease = new RefusalLease(clock);
    const id = mintWorkspaceId('00000000000000000000000000000001');
    lease.refuse(id, millis(30_000));
    expect(lease.isRefusing(id)).toBe(true);
    clock.advance(29_999);
    expect(lease.isRefusing(id)).toBe(true);
    clock.advance(1);
    expect(lease.isRefusing(id)).toBe(false);
  });
  it('renewal extends only a lease that exists', () => {
    const clock = new FakeClock();
    const lease = new RefusalLease(clock);
    const id = mintWorkspaceId('00000000000000000000000000000002');
    expect(lease.renew(id, millis(10))).toBe(false);
    lease.refuse(id, millis(10));
    clock.advance(9);
    expect(lease.renew(id, millis(10))).toBe(true);
    clock.advance(9);
    expect(lease.isRefusing(id)).toBe(true);
  });
});

describe('engine — the sequence counter (REQ-MONITOR-214)', () => {
  it('starts at 1 per session, rises by exactly one per stamp, and sessions do not share', () => {
    const c = new SequenceCounters();
    const a = asSessionId('a');
    const b = asSessionId('b');
    expect(c.stamp(a)).toBe(1);
    expect(c.stamp(a)).toBe(2);
    expect(c.stamp(b)).toBe(1);
    expect(c.peek(a)).toBe(3);
  });
});
