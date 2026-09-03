import { describe, expect, it } from 'vitest';
import { asSessionId, FakeClock, millis } from '@rotaris/kernel';
import type { WireEvent } from '../events.js';
import { BUFFER_CAP, EventBus } from './event-bus.js';

const S = asSessionId('S1');
const ev = (n: number): WireEvent => ({ event: 'usage.update', session_id: S, timestamp: 't', schema_version: 1, n });

function bus(clock: FakeClock, warn: string[] = []) {
  return { bus: new EventBus({ timers: clock.timers, warn: (m) => warn.push(m) }), warn };
}

describe('engine/run — the wire bus (ADR-0010 channel 2)', () => {
  it('REQ-EVENTS-075: nothing reaches a consumer of another session; publishing with none registered does nothing; empty id rejected', async () => {
    const clock = new FakeClock();
    const { bus: b } = bus(clock);
    const got: string[] = [];
    b.attach(asSessionId('S2'), { mode: 'blocking', deliver: (e) => { got.push(String(e['n'])); } });
    await b.forward(S, ev(1), 'l');
    expect(got).toEqual([]);
    expect(b.attach(asSessionId(''), { mode: 'blocking', deliver: () => undefined })).toBeUndefined();
  });
  it('REQ-EVENTS-165: a blocking consumer holds the run until it takes the event; past 5 s it is detached with one warning and the run proceeds', async () => {
    const clock = new FakeClock();
    const { bus: b, warn } = bus(clock);
    let release!: () => void;
    const slow = new Promise<void>((r) => { release = r; });
    b.attach(S, { mode: 'blocking', deliver: () => slow });
    let proceeded = false;
    const f = b.forward(S, ev(1), 'l').then(() => { proceeded = true; });
    await Promise.resolve();
    expect(proceeded).toBe(false);
    clock.advance(4_999);
    await Promise.resolve();
    expect(proceeded).toBe(false);
    clock.advance(1);
    await f;
    expect(proceeded).toBe(true);
    expect(warn.length).toBe(1);
    expect(warn[0]).toContain('detached');
    expect(b.consumers(S)).toBe(0);
    release();
    // The detached consumer gets nothing further.
    await b.forward(S, ev(2), 'l');
    expect(b.consumers(S)).toBe(0);
  });
  it('a blocking consumer that answers promptly never trips the bound, and a throwing one loses the event for itself only (REQ-EVENTS-074)', async () => {
    const clock = new FakeClock();
    const { bus: b, warn } = bus(clock);
    const got: number[] = [];
    b.attach(S, { mode: 'blocking', deliver: (e) => { got.push(e['n'] as number); } });
    b.attach(S, { mode: 'blocking', deliver: () => { throw new Error('bad consumer'); } });
    await b.forward(S, ev(1), 'l');
    await b.forward(S, ev(2), 'l');
    expect(got).toEqual([1, 2]);
    expect(warn.filter((w) => w.includes('bad consumer')).length).toBe(2);
    expect(b.consumers(S)).toBe(2);
  });
  it('REQ-EVENTS-164: a buffered consumer never blocks, holds 1024, discards beyond with a count that only rises', async () => {
    const clock = new FakeClock();
    const { bus: b } = bus(clock);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const got: number[] = [];
    b.attach(S, { mode: 'buffered', deliver: async (e) => { await gate; got.push(e['n'] as number); } });
    for (let i = 1; i <= BUFFER_CAP + 5; i++) await b.forward(S, ev(i), 'l');
    // The first event is in flight (taken off the queue), the queue holds the cap, and the overflow is discarded.
    expect(b.discarded(S)).toBe(4);
    release();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(got.length).toBe(BUFFER_CAP + 1);
    expect(got[0]).toBe(1);
    expect(b.discarded(S)).toBe(4);
  });
  it('REQ-SESSION-094: detaching the session leaves a straggler with no destination', async () => {
    const clock = new FakeClock();
    const { bus: b } = bus(clock);
    const got: number[] = [];
    b.attach(S, { mode: 'blocking', deliver: (e) => { got.push(e['n'] as number); } });
    await b.forward(S, ev(1), 'l');
    b.detachSession(S);
    await b.forward(S, ev(2), 'l');
    expect(got).toEqual([1]);
    expect(b.consumers(S)).toBe(0);
    expect(millis(0)).toBe(0);
  });
});
