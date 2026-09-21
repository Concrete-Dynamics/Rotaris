import { describe, expect, it } from 'vitest';
import { FakeClock, millis } from '@rotaris/kernel';
import { CHANNEL, CONTRACT_SCHEMA_VERSION } from '@rotaris/contracts';
import { PRIMARY_VIEWS, STARTUP_VIEW } from '@rotaris/contracts';
import { ProcessLink, UpdateRelay, type MessagePortLike } from './index.js';

describe('shell — the seven views (REQ-SHELL-023, -026, -027)', () => {
  it('are exactly seven, in the fixed order, with the fixed labels, and Overview is the startup view', () => {
    expect(PRIMARY_VIEWS.map((v) => v.label)).toEqual(['Overview', 'Workspace', 'Mission', 'Requirements', 'Git', 'Library', 'Settings']);
    expect(PRIMARY_VIEWS[3]!.id).toBe('requirements');
    expect(STARTUP_VIEW).toBe('overview');
  });
});

describe('shell — the relay (ADR-0044, ADR-0013)', () => {
  it('fans one publication out to every subscriber of that session, payload and number untouched, and counts messages', () => {
    const relay = new UpdateRelay();
    const got: Record<number, unknown[]> = { 1: [], 2: [], 3: [] };
    for (const id of [1, 2, 3]) relay.attach({ id, send: (_c, p) => got[id]!.push(p) });
    relay.subscribe(1, 's');
    relay.subscribe(2, 's');
    const payload = { v: 1, sessionId: 's', seq: 7 };
    expect(relay.relaySequenced(CHANNEL.sessionSnapshot, payload)).toBe(2);
    expect(got[1]![0]).toBe(payload);
    expect(got[2]![0]).toBe(payload);
    expect(got[3]).toEqual([]);
    expect(relay.counters[CHANNEL.sessionSnapshot]).toBe(1);
  });
  it('Part AL: names the subscribers of a session for a delivery main bounds itself (channel 3), and counts it', () => {
    const relay = new UpdateRelay();
    for (const id of [1, 2, 3]) relay.attach({ id, send: () => undefined });
    relay.subscribe(1, 's');
    relay.subscribe(3, 's');
    relay.subscribe(3, 't');
    expect(relay.subscribersOf('s').map((s) => s.id)).toEqual([1, 3]);
    expect(relay.subscribersOf('none')).toEqual([]);
    relay.detach(3);
    expect(relay.subscribersOf('s').map((s) => s.id)).toEqual([1]);
    expect(relay.hasSink(3)).toBe(false);
    relay.count(CHANNEL.terminalFrames, 2);
    expect(relay.counters[CHANNEL.terminalFrames]).toBe(2);
  });
  it('a dead sink is shed, not thrown: the survivors still get the publication (REQ-MONITOR-226 intent)', () => {
    const relay = new UpdateRelay();
    const got: unknown[] = [];
    relay.attach({ id: 1, send: () => { throw new Error('Render frame was disposed before WebFrameMain could be accessed'); } });
    relay.attach({ id: 2, send: (_c, p) => got.push(p) });
    relay.subscribe(1, 's');
    relay.subscribe(2, 's');
    const payload = { v: 1, sessionId: 's', seq: 7 };
    expect(relay.relaySequenced(CHANNEL.sessionSnapshot, payload)).toBe(1);
    expect(got[0]).toBe(payload);
    expect(relay.hasSink(1)).toBe(false);
    expect(relay.subscribersOf('s').map((s) => s.id)).toEqual([2]);
    // The next publication reaches the survivor with no throw.
    expect(relay.relaySequenced(CHANNEL.sessionSnapshot, { ...payload, seq: 8 })).toBe(1);
  });
  it('broadcast sheds a dead sink and keeps delivering to the rest', () => {
    const relay = new UpdateRelay();
    const got: unknown[] = [];
    relay.attach({ id: 1, send: () => { throw new Error('Render frame was disposed before WebFrameMain could be accessed'); } });
    relay.attach({ id: 2, send: (_c, p) => got.push(p) });
    expect(() => relay.broadcast(CHANNEL.noticeCurrent, { v: 1 })).not.toThrow();
    expect(got).toHaveLength(1);
    expect(relay.hasSink(1)).toBe(false);
    expect(relay.hasSink(2)).toBe(true);
  });
});

describe('shell — the process link (ADR-0002 consequence 11)', () => {
  function pair(): { a: MessagePortLike; b: MessagePortLike } {
    const la = new Set<(m: unknown) => void>();
    const lb = new Set<(m: unknown) => void>();
    return {
      a: { postMessage: (m) => { for (const f of lb) f(m); }, onMessage: (f) => { la.add(f); return () => la.delete(f); } },
      b: { postMessage: (m) => { for (const f of la) f(m); }, onMessage: (f) => { lb.add(f); return () => lb.delete(f); } },
    };
  }
  it('correlates a reply to its request', async () => {
    const clock = new FakeClock();
    const { a, b } = pair();
    b.onMessage((m) => { const e = m as { id: number }; b.postMessage({ v: CONTRACT_SCHEMA_VERSION, id: e.id, reply: { kind: 'pong' } }); });
    const link = new ProcessLink(a, clock);
    await expect(link.request({ kind: 'ping' }, millis(1000))).resolves.toEqual({ kind: 'pong' });
    link.close();
  });
  it('every request is bounded: an unanswered one rejects at the deadline rather than hanging', async () => {
    const clock = new FakeClock();
    const { a } = pair();
    const link = new ProcessLink(a, clock);
    const p = link.request({ kind: 'ping' }, millis(2000));
    clock.advance(2000);
    await expect(p).rejects.toThrow(/within 2000 ms/);
    link.close();
  });
  it('a throwing event listener does not break dispatch to the rest', async () => {
    const clock = new FakeClock();
    const { a, b } = pair();
    const link = new ProcessLink(a, clock);
    const got: unknown[] = [];
    link.onEvent(() => { throw new Error('a dead sink threw'); });
    link.onEvent((e) => { got.push(e); });
    b.postMessage({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'log', level: 'info', message: 'hello' } });
    await Promise.resolve();
    expect(got).toHaveLength(1);
    link.close();
  });
});
