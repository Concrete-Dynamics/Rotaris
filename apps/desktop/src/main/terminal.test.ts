import { describe, expect, it } from 'vitest';
import { CHANNEL, CONTRACT_SCHEMA_VERSION, TERMINAL_DELIVERY_BOUND_PER_SECOND, type TerminalFrame } from '@rotaris/contracts';
import { FakeClock } from '@rotaris/kernel';
import { UpdateRelay } from '@rotaris/shell';
import { FrameDeliveryLimiter, relayTerminalCommand } from './terminal.js';

/**
 * Part AL — REQ-MONITOR-306 where it is enforced: at delivery, over any one second, honoured by merging
 * (REQ-SHELL-103) and never by dropping. A fake clock drives the sliding window; a counting sink is the window.
 *
 * Part T2 — the second is ONE budget across every window, not one per window (defect T2-1). Two of the tests below
 * measure ORDER under saturation rather than the bound, and a bound of 2 spent on a frame fanned to both windows
 * would stop them after the first frame; they therefore drive a session (`s3`) only window 1 follows, so each frame
 * costs exactly one of the budget and every sequence they assert is unchanged from what Part AL2 pinned.
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
  relay.subscribe(1, 's3'); // Part T2: a session ONE window follows, for the order tests (see the note at the top).
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

  it('a merged step keeps the stream\'s order: the screen supersedes the deltas before it, the metas keep their places, the deltas after it follow, the latest meta closes', () => {
    const h = harness(2);
    const one = (over: Partial<TerminalFrame> & { streamId: string; seq: number }) => frame({ sessionId: 's3', ...over });
    h.limiter.deliver(one({ streamId: 'fg:a', seq: 1, kind: 'meta', payload: '' }));
    h.limiter.deliver(one({ streamId: 'fg:a', seq: 2, payload: 'A' }));
    // The bound is reached: everything below is merged.
    h.limiter.deliver(one({ streamId: 'fg:a', seq: 3, payload: 'B' }));
    h.limiter.deliver(one({ streamId: 'fg:a', seq: 4, kind: 'meta', payload: '' }));
    h.limiter.deliver(one({ streamId: 'fg:a', seq: 5, kind: 'screen', payload: 'SCREEN' }));
    h.limiter.deliver(one({ streamId: 'fg:a', seq: 6, payload: 'C' }));
    h.limiter.deliver(one({ streamId: 'fg:a', seq: 7, payload: 'D' }));
    h.limiter.deliver(one({ streamId: 'fg:a', seq: 8, kind: 'meta', payload: '', meta: undefined }));
    expect(h.sent[1]!.map((s) => s.frame.seq)).toEqual([1, 2]);
    h.clock.advance(1000);
    // Part AL2: the meta that arrived before the screen keeps its place (it may carry state the screen does not); the
    // delta before the screen is superseded by it. Two frames a second is the bound this harness set.
    expect(h.sent[1]!.slice(2).map((s) => [s.frame.seq, s.frame.kind, s.frame.payload])).toEqual([[4, 'meta', ''], [5, 'screen', 'SCREEN']]);
    h.clock.advance(1000);
    expect(h.sent[1]!.slice(4).map((s) => [s.frame.seq, s.frame.kind, s.frame.payload])).toEqual([[7, 'delta', 'CD'], [8, 'meta', '']]);
    expect(h.limiter.stats(1).pending).toBe(0);
  });

  it('Part AL2 regression (defect AL2-1): a meta between two deltas under saturation goes out between them, never after the merged delta with a lower seq', () => {
    const h = harness(2);
    const one = (over: Partial<TerminalFrame> & { streamId: string; seq: number }) => frame({ sessionId: 's3', ...over });
    h.limiter.deliver(one({ streamId: 'fg:a', seq: 1, kind: 'meta', payload: '' }));
    h.limiter.deliver(one({ streamId: 'fg:a', seq: 2, payload: 'A' }));
    // Saturated from here: a delta, the closing meta (running: false), then one more delta.
    h.limiter.deliver(one({ streamId: 'fg:a', seq: 3, payload: 'B' }));
    h.limiter.deliver(one({ streamId: 'fg:a', seq: 4, kind: 'meta', payload: '' }));
    h.limiter.deliver(one({ streamId: 'fg:a', seq: 5, payload: 'C' }));
    h.clock.advance(1000);
    h.clock.advance(1000);
    const out = h.sent[1]!.map((s) => [s.frame.seq, s.frame.kind, s.frame.payload]);
    expect(out).toEqual([[1, 'meta', ''], [2, 'delta', 'A'], [3, 'delta', 'B'], [4, 'meta', ''], [5, 'delta', 'C']]);
    // The display's own rule (REQ-SHELL-104): a seq at or below the last applied is dropped — the order above is what keeps the meta alive.
    let last = 0;
    for (const [seq] of out) { expect(seq).toBeGreaterThan(last); last = seq as number; }
    expect(h.limiter.stats(1).pending).toBe(0);
  });

  it('Part T2 (defect T2-1): the second is ONE budget across every window — a frame fanned to two windows spends two of it', () => {
    const h = harness(4);
    // Both windows follow `s1` (REQ-MONITOR-243: one session, several windows), so each frame costs two deliveries.
    h.limiter.deliver(frame({ streamId: 'fg:a', seq: 1, payload: 'A' }));
    h.limiter.deliver(frame({ streamId: 'fg:a', seq: 2, payload: 'B' }));
    // The budget of four is spent on two frames; the third is merged at both windows rather than delivered.
    h.limiter.deliver(frame({ streamId: 'fg:a', seq: 3, payload: 'C' }));
    expect(h.sent[1]!.map((s) => s.frame.seq)).toEqual([1, 2]);
    expect(h.sent[2]!.map((s) => s.frame.seq)).toEqual([1, 2]);
    expect(h.limiter.aggregate()).toMatchObject({ windows: 2, delivered: 4, inLastSecond: 4, pending: 2 });
    h.clock.advance(1000);
    for (const id of [1, 2]) expect(h.sent[id]!.map((s) => [s.frame.seq, s.frame.payload])).toEqual([[1, 'A'], [2, 'B'], [3, 'C']]);
    expect(h.limiter.aggregate().pending).toBe(0);
  });

  it('Part T2: the drain goes round the windows, so a window saturating on many streams does not starve the next', () => {
    const h = harness(2);
    // Six streams of a session only window 2 follows spend the budget and queue; one frame of a session only window 1
    // follows arrives behind them. A drain that emptied one window before moving on would leave window 1 with nothing.
    for (let i = 1; i <= 6; i += 1) h.limiter.deliver(frame({ sessionId: 's2', streamId: `bg:${i}`, seq: 1, payload: `x${i}` }));
    h.limiter.deliver(frame({ sessionId: 's3', streamId: 'fg:a', seq: 1, payload: 'mine' }));
    expect(h.sent[1]).toEqual([]);
    h.clock.advance(1000);
    expect(h.sent[1]!.map((s) => s.frame.payload)).toEqual(['mine']);
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

  it('a window whose sink throws is shed from the relay and the limiter; the survivor keeps its frames', () => {
    const clock = new FakeClock();
    const relay = new UpdateRelay();
    const got: TerminalFrame[] = [];
    relay.attach({ id: 1, send: () => { throw new Error('Render frame was disposed before WebFrameMain could be accessed'); } });
    relay.attach({ id: 2, send: (_c, p) => got.push(p as TerminalFrame) });
    relay.subscribe(1, 's1');
    relay.subscribe(2, 's1');
    const limiter = new FrameDeliveryLimiter({ relay, clocks: clock, log: () => undefined });
    limiter.deliver(frame({ streamId: 'fg:a', seq: 1 }));
    expect(got.map((f) => f.seq)).toEqual([1]);
    expect(relay.hasSink(1)).toBe(false);
    expect(limiter.stats(1)).toEqual({ delivered: 0, merged: 0, pending: 0 });
    limiter.deliver(frame({ streamId: 'fg:a', seq: 2 }));
    expect(got.map((f) => f.seq)).toEqual([1, 2]);
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
