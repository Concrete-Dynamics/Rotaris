import { describe, expect, it } from 'vitest';
import { CHANNEL, CONTRACT_SCHEMA_VERSION, TERMINAL_DELIVERY_BOUND_PER_SECOND, type TerminalFrame } from '@rotaris/contracts';
import { FakeClock } from '@rotaris/kernel';
import { UpdateRelay } from '@rotaris/shell';
import { FrameDeliveryLimiter, relayTerminalCommand } from './terminal.js';

/**
 * Part AL — REQ-MONITOR-306 where it is enforced: at delivery, per window, over any one second, honoured by merging
 * (REQ-SHELL-103) and never by dropping. A fake clock drives the sliding window; a counting sink is the window.
 */
function frame(over: Partial<TerminalFrame> & { streamId: string; seq: number }): TerminalFrame {
  return { v: CONTRACT_SCHEMA_VERSION, sessionId: 's1', kind: 'delta', payload: `p${over.seq}`, ...over };
}
function harness(bound = TERMINAL_DELIVERY_BOUND_PER_SECOND) {
  const clock = new FakeClock();
  const relay = new UpdateRelay();
  const sent: Record<number, { at: number; frame: TerminalFrame }[]> = { 1: [], 2: [] };
  for (const id of [1, 2]) relay.attach({ id, send: (c, p) => { expect(c).toBe(CHANNEL.terminalFrames); sent[id]!.push({ at: clock.now(), frame: p as TerminalFrame }); } });
  relay.subscribe(1, 's1');
  relay.subscribe(2, 's1');
  relay.subscribe(2, 's2');
  const limiter = new FrameDeliveryLimiter({ relay, clocks: clock, log: () => undefined, bound });
  return { clock, relay, sent, limiter };
}
/** The most deliveries any one-second window holds. */
function peakPerSecond(times: readonly number[]): number {
  let peak = 0;
  for (let i = 0; i < times.length; i += 1) {
    let j = i;
    while (j < times.length && times[j]! < times[i]! + 1000) j += 1;
    peak = Math.max(peak, j - i);
  }
  return peak;
}

describe('FrameDeliveryLimiter — REQ-MONITOR-306 at the point of delivery, per window', () => {
  it('routes a frame to every window subscribed to its session, counting once per window, and counts channel 3', () => {
    const h = harness();
    expect(h.limiter.deliver(frame({ streamId: 'fg:a', seq: 1 }))).toBe(2);
    expect(h.limiter.deliver(frame({ streamId: 'fg:b', seq: 1, sessionId: 's2' }))).toBe(1);
    expect(h.sent[1]!.map((s) => s.frame.streamId)).toEqual(['fg:a']);
    expect(h.sent[2]!.map((s) => s.frame.streamId)).toEqual(['fg:a', 'fg:b']);
    expect(h.relay.counters[CHANNEL.terminalFrames]).toBe(3);
  });

  it('40 streams at full tilt never exceed the bound in any one second at either window, and nothing is dropped', () => {
    const h = harness();
    const bytes: Record<string, string> = {};
    // 40 streams × 50 frames/s (the floor) for three seconds = 2,000 frames/s offered, twice the bound.
    for (let t = 0; t < 3000; t += 20) {
      for (let s = 0; s < 40; s += 1) {
        const id = `bg:ts_${String(s).padStart(8, '0')}`;
        const f = frame({ streamId: id, seq: t / 20 + 1, payload: `${id}@${t};` });
        bytes[id] = (bytes[id] ?? '') + f.payload;
        h.limiter.deliver(f);
      }
      h.clock.advance(20);
    }
    h.clock.advance(3000);
    for (const id of [1, 2]) {
      const times = h.sent[id]!.map((s) => s.at);
      expect(peakPerSecond(times)).toBeLessThanOrEqual(TERMINAL_DELIVERY_BOUND_PER_SECOND);
      const delivered: Record<string, string> = {};
      const lastSeq: Record<string, number> = {};
      for (const { frame: f } of h.sent[id]!) {
        delivered[f.streamId] = (delivered[f.streamId] ?? '') + f.payload;
        expect(f.seq).toBeGreaterThan(lastSeq[f.streamId] ?? 0);
        lastSeq[f.streamId] = f.seq;
      }
      expect(delivered).toEqual(bytes);
      expect(h.sent[id]!.length).toBeLessThan(6000);
      expect(h.limiter.stats(id).merged).toBeGreaterThan(0);
      expect(h.limiter.stats(id).pending).toBe(0);
    }
  });

  it('a merged step keeps the stream\'s order: the screen supersedes the deltas before it, the deltas after it follow, the latest meta closes', () => {
    const h = harness(2);
    h.limiter.deliver(frame({ streamId: 'fg:a', seq: 1, kind: 'meta', payload: '' }));
    h.limiter.deliver(frame({ streamId: 'fg:a', seq: 2, payload: 'A' }));
    // The bound is reached: everything below is merged.
    h.limiter.deliver(frame({ streamId: 'fg:a', seq: 3, payload: 'B' }));
    h.limiter.deliver(frame({ streamId: 'fg:a', seq: 4, kind: 'meta', payload: '' }));
    h.limiter.deliver(frame({ streamId: 'fg:a', seq: 5, kind: 'screen', payload: 'SCREEN' }));
    h.limiter.deliver(frame({ streamId: 'fg:a', seq: 6, payload: 'C' }));
    h.limiter.deliver(frame({ streamId: 'fg:a', seq: 7, payload: 'D' }));
    h.limiter.deliver(frame({ streamId: 'fg:a', seq: 8, kind: 'meta', payload: '', meta: undefined }));
    expect(h.sent[1]!.map((s) => s.frame.seq)).toEqual([1, 2]);
    h.clock.advance(1000);
    expect(h.sent[1]!.slice(2).map((s) => [s.frame.seq, s.frame.kind, s.frame.payload])).toEqual([[5, 'screen', 'SCREEN'], [7, 'delta', 'CD']]);
    h.clock.advance(1000);
    expect(h.sent[1]!.slice(4).map((s) => [s.frame.seq, s.frame.kind])).toEqual([[8, 'meta']]);
    expect(h.limiter.stats(1).pending).toBe(0);
  });

  it('a window that went away is forgotten rather than drained into', () => {
    const h = harness(1);
    h.limiter.deliver(frame({ streamId: 'fg:a', seq: 1 }));
    h.limiter.deliver(frame({ streamId: 'fg:a', seq: 2 }));
    h.relay.detach(1);
    h.clock.advance(1000);
    expect(h.sent[1]!.map((s) => s.frame.seq)).toEqual([1]);
    expect(h.limiter.stats(1)).toEqual({ delivered: 0, merged: 0, pending: 0 });
  });
});

describe('relayTerminalCommand — shape for shape to the run host', () => {
  it('answers the streams list, acks a control, and turns a refusal into the outcome with its code', async () => {
    const asked: unknown[] = [];
    const link = { request: async (r: unknown) => { asked.push(r); const k = (r as { kind: string }).kind; return k === 'terminal.streams' ? { kind: 'terminal.streams' as const, streams: [] } : k === 'terminal.kill' ? { kind: 'refused' as const, code: 'terminal.no-kill-capability', headline: 'no' } : { kind: 'ack' as const }; } };
    expect(await relayTerminalCommand({ kind: 'terminal.streams', sessionId: 's1' }, link, () => undefined)).toEqual({ ok: true, value: [] });
    expect(await relayTerminalCommand({ kind: 'terminal.sendKeys', streamId: 'fg:a', keys: [{ kind: 'text', text: 'ls' }, { kind: 'named', key: 'ENTER' }] }, link, () => undefined)).toEqual({ ok: true });
    expect(await relayTerminalCommand({ kind: 'terminal.kill', streamId: 'fg:a' }, link, () => undefined)).toEqual({ ok: false, code: 'terminal.no-kill-capability', headline: 'no' });
    expect(asked).toHaveLength(3);
    expect(asked[1]).toEqual({ kind: 'terminal.sendKeys', streamId: 'fg:a', keys: [{ kind: 'text', text: 'ls' }, { kind: 'named', key: 'ENTER' }] });
  });
});
