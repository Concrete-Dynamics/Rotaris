import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTRACT_SCHEMA_VERSION, TERMINAL_COALESCE_FLOOR_MS, TERMINAL_DELIVERY_BOUND_PER_SECOND, type TerminalFrame } from '@rotaris/contracts';
import { FakeClock } from '@rotaris/kernel';
import { UpdateRelay } from '@rotaris/shell';
import { TerminalStreams } from '@rotaris/agent-tools';
import { FrameDeliveryLimiter } from './terminal.js';

/**
 * Part AL — REQ-MONITOR-306 at the aggregate ADR-0021 "The cap is load-bearing" obligation 2 names: forty streams,
 * each armed on every tick so each emits at the 20 ms floor — 50 frames/s per stream, 2,000 frames/s offered, twice
 * the bound. This runs the streams through the REAL registry flush (`TerminalStreams`, its real coalescing floor) and
 * the REAL per-window limiter (`FrameDeliveryLimiter`) on one FakeClock, so the arithmetic is deterministic and the
 * code under test is the shipped code. The fidelity of a real PTY — gapless `seq`, deltas == the PTY bytes, the
 * background stream, the armed echo, the resize, streaming off — is proven against real PowerShell in
 * `agent-tools/.../streams.test.ts`; this is the aggregate-rate half, the synthetic-source fallback the plan sanctions,
 * because forty real shells at full tilt on one host do not finish inside a test budget and contend for the CPU the
 * limiter is being measured on.
 */
const proofDir = process.env['ROTARIS_TERMINAL_PROOF_DIR'];

/** A trivial emulator: the load test measures the FLUSH and the LIMITER, not the parser. */
function fakeEmulatorFactory() {
  return () => {
    let text = '';
    return { get cols() { return 80; }, get rows() { return 24; }, write: async (d: string) => { text += d; }, resize: () => undefined, serialize: () => text, text: () => text, truncated: false, dispose: () => undefined };
  };
}

function peakPerSecond(times: readonly number[]): number {
  let peak = 0;
  let j = 0;
  for (let i = 0; i < times.length; i += 1) {
    while (j < times.length && times[j]! < times[i]! + 1000) j += 1;
    peak = Math.max(peak, j - i);
  }
  return peak;
}

const measurements: Record<string, unknown> = {};
afterAll(() => {
  if (!proofDir) return;
  mkdirSync(proofDir, { recursive: true });
  const file = join(proofDir, 'measurements.json');
  const prior = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : {};
  writeFileSync(file, JSON.stringify({ ...prior, ...measurements }, null, 2));
});

/**
 * Part T2 — REQ-MONITOR-306 under forty streams in TWO windows, which is the arrangement wave 2 could not reach and
 * ADR-0021 "The cap is load-bearing" obligation 3 named as the harness's second unmeasured direction ("the harness
 * modelled one window, while REQ-MONITOR-243 and REQ-STARTUP-163 allow one session in several windows, which
 * multiplies main's per-message relay cost by the window count").
 *
 * The requirement's own words are the assertion: the rate "is bounded in aggregate — across every live stream, of
 * every session, delivered to every window, taken together", 1,000 frames per second, "and a stream shown in more
 * than one window counts once per window, because the cost this bound exists to control is paid per delivery". So a
 * frame fanned to two windows spends TWO of the one budget, and the peak measured over both windows together — not
 * over each — is what has to sit at or under the bound.
 */
describe('Part T2 — REQ-MONITOR-306 across TWO windows: one budget, counted once per delivery', () => {
  it('offers ~2,000 frames/s to two windows and delivers no more than 1,000 in any one second ACROSS BOTH, dropping nothing', () => {
    const STREAMS = 40;
    const SECONDS = 3;
    const clock = new FakeClock();
    const streams = new TerminalStreams({ clocks: clock, emulator: fakeEmulatorFactory(), warn: () => undefined });
    streams.settings = () => ({ enabled: true, intervalMs: 100, bufferKb: 256 });
    const relay = new UpdateRelay();
    const delivered: { window: number; at: number; frame: TerminalFrame }[] = [];
    // REQ-MONITOR-243: one session displayed in two main windows. Both follow it, so every frame is delivered twice.
    for (const id of [1, 2]) relay.attach({ id, send: (_c, p) => delivered.push({ window: id, at: clock.now(), frame: p as TerminalFrame }) });
    relay.subscribe(1, 'sess');
    relay.subscribe(2, 'sess');
    const limiter = new FrameDeliveryLimiter({ relay, clocks: clock, log: () => undefined });
    const offered: number[] = [];
    const bytesOffered: Record<string, string> = {};
    streams.onFrame((f) => { offered.push(clock.now()); if (f.kind === 'delta') bytesOffered[f.streamId] = (bytesOffered[f.streamId] ?? '') + f.payload; limiter.deliver(f); });
    const ids: string[] = [];
    for (let i = 0; i < STREAMS; i += 1) {
      const id = `bg:ts_${String(i).padStart(8, '0')}`;
      ids.push(id);
      streams.begin({ sessionId: 'sess', streamId: id, kind: 'background', displayName: 'x', command: 'c', cols: 80, rows: 24, workspaceRoot: 'w', control: { write: () => true } });
    }
    for (let t = 0; t < SECONDS * 1000; t += 1) {
      for (let i = 0; i < STREAMS; i += 1) { streams.data(ids[i]!, `${i}:${t};`); streams.keystroke(ids[i]!); }
      clock.advance(1);
    }
    for (const id of ids) streams.end(id, { exitCode: 0, finalText: bytesOffered[id] ?? '' });
    clock.advance(6000);

    const offeredPeak = peakPerSecond(offered);
    const aggregatePeak = peakPerSecond(delivered.map((d) => d.at));
    const perWindowPeak = [1, 2].map((w) => peakPerSecond(delivered.filter((d) => d.window === w).map((d) => d.at)));
    expect(offeredPeak).toBeGreaterThan(TERMINAL_DELIVERY_BOUND_PER_SECOND);
    // The aggregate is the requirement's figure. A per-window ledger passes the line below and fails this one.
    expect(aggregatePeak).toBeLessThanOrEqual(TERMINAL_DELIVERY_BOUND_PER_SECOND);
    for (const peak of perWindowPeak) expect(peak).toBeLessThanOrEqual(TERMINAL_DELIVERY_BOUND_PER_SECOND);
    // Nothing dropped and nothing reordered at EITHER window (REQ-SHELL-103), the same claim the one-window test makes.
    for (const w of [1, 2]) {
      const deltas: Record<string, string> = {};
      const lastSeq: Record<string, number> = {};
      const closing: Record<string, string> = {};
      for (const { frame } of delivered.filter((d) => d.window === w)) {
        expect(frame.seq).toBeGreaterThan(lastSeq[frame.streamId] ?? 0);
        lastSeq[frame.streamId] = frame.seq;
        if (frame.kind === 'delta') expect(closing[frame.streamId]).toBeUndefined();
        if (frame.kind === 'delta') deltas[frame.streamId] = (deltas[frame.streamId] ?? '') + frame.payload;
        if (frame.kind === 'screen' && frame.closing) closing[frame.streamId] = frame.payload;
      }
      for (const id of ids) {
        expect(closing[id]).toBe(bytesOffered[id]);
        expect(bytesOffered[id]!.startsWith(deltas[id] ?? '')).toBe(true);
      }
      expect(limiter.stats(w).pending).toBe(0);
    }
    measurements['fortyStreamsTwoWindows'] = {
      streams: STREAMS, windows: 2, seconds: SECONDS, offeredFrames: offered.length, deliveredFrames: delivered.length,
      offeredPeakPerSecond: offeredPeak, aggregateDeliveredPeakPerSecond: aggregatePeak, perWindowDeliveredPeakPerSecond: perWindowPeak,
      bound: TERMINAL_DELIVERY_BOUND_PER_SECOND, merged: limiter.stats(1).merged + limiter.stats(2).merged, source: 'synthetic-through-real-flush-and-limiter',
    };
  });
});

describe('REQ-MONITOR-306 under forty streams at full tilt (ADR-0021 obligation 2), real flush + real limiter', () => {
  it('offers ~2,000 frames/s, delivers no more than 1,000 in any one second per window, and drops nothing', () => {
    const STREAMS = 40;
    const SECONDS = 3;
    const clock = new FakeClock();
    const streams = new TerminalStreams({ clocks: clock, emulator: fakeEmulatorFactory(), warn: () => undefined });
    streams.settings = () => ({ enabled: true, intervalMs: 100, bufferKb: 256 });
    const relay = new UpdateRelay();
    const delivered: { at: number; frame: TerminalFrame }[] = [];
    relay.attach({ id: 1, send: (_c, p) => delivered.push({ at: clock.now(), frame: p as TerminalFrame }) });
    relay.subscribe(1, 'sess');
    const limiter = new FrameDeliveryLimiter({ relay, clocks: clock, log: () => undefined });
    const offered: number[] = [];
    const bytesOffered: Record<string, string> = {};
    streams.onFrame((f) => { offered.push(clock.now()); if (f.kind === 'delta') bytesOffered[f.streamId] = (bytesOffered[f.streamId] ?? '') + f.payload; limiter.deliver(f); });
    const ids: string[] = [];
    for (let i = 0; i < STREAMS; i += 1) {
      const id = `bg:ts_${String(i).padStart(8, '0')}`;
      ids.push(id);
      streams.begin({ sessionId: 'sess', streamId: id, kind: 'background', displayName: 'x', command: 'c', cols: 80, rows: 24, workspaceRoot: 'w', control: { write: () => true } });
    }
    // Every stream produces a byte and arms a flush every millisecond: the floor holds each to one frame per 20 ms.
    for (let t = 0; t < SECONDS * 1000; t += 1) {
      for (let i = 0; i < STREAMS; i += 1) { streams.data(ids[i]!, `${i}:${t};`); streams.keystroke(ids[i]!); }
      clock.advance(1);
    }
    for (const id of ids) streams.end(id, { exitCode: 0, finalText: bytesOffered[id] ?? '' });
    clock.advance(2000);

    const deliveredTimes = delivered.map((d) => d.at);
    const offeredPeak = peakPerSecond(offered);
    const deliveredPeak = peakPerSecond(deliveredTimes);
    expect(offeredPeak).toBeGreaterThan(TERMINAL_DELIVERY_BOUND_PER_SECOND);
    expect(deliveredPeak).toBeLessThanOrEqual(TERMINAL_DELIVERY_BOUND_PER_SECOND);
    // Nothing dropped, nothing reordered (REQ-SHELL-103): the bound is honoured by delivering in LARGER STEPS, not by
    // dropping. Under saturation a closing `screen` supersedes a stream's pending deltas (a full replacement, so no
    // line is shown twice, REQ-SHELL-104), which is why the delivered deltas are a PREFIX of the output and the
    // closing screen carries all of it. Per stream: seq strictly climbs, the delivered deltas prefix the output, and
    // the last delivered frame is the closing screen equal to the whole output.
    const deltas: Record<string, string> = {};
    const lastSeq: Record<string, number> = {};
    const closing: Record<string, string> = {};
    for (const { frame } of delivered) {
      expect(frame.seq).toBeGreaterThan(lastSeq[frame.streamId] ?? 0);
      lastSeq[frame.streamId] = frame.seq;
      if (frame.kind === 'delta') expect(closing[frame.streamId]).toBeUndefined();
      if (frame.kind === 'delta') deltas[frame.streamId] = (deltas[frame.streamId] ?? '') + frame.payload;
      if (frame.kind === 'screen' && frame.closing) closing[frame.streamId] = frame.payload;
    }
    for (const id of ids) {
      expect(closing[id]).toBe(bytesOffered[id]);
      expect(bytesOffered[id]!.startsWith(deltas[id] ?? '')).toBe(true);
    }
    expect(limiter.stats(1).pending).toBe(0);
    expect(limiter.stats(1).merged).toBeGreaterThan(0);
    measurements['fortyStreams'] = {
      streams: STREAMS, seconds: SECONDS, floorMs: TERMINAL_COALESCE_FLOOR_MS, offeredFrames: offered.length, deliveredFrames: delivered.length,
      offeredPeakPerSecond: offeredPeak, deliveredPeakPerSecond: deliveredPeak, bound: TERMINAL_DELIVERY_BOUND_PER_SECOND, merged: limiter.stats(1).merged, source: 'synthetic-through-real-flush-and-limiter',
    };
  });
});

/**
 * Part T2 — ADR-0021 "The cap is load-bearing", OBLIGATION 2, measured rather than argued.
 *
 * The obligation says the aggregate must be bounded by something the product enforces and that the concurrent stream
 * count is not: "`REQ-TOOLS-108` caps concurrent background sessions at `runtime.shell_max_background_sessions`,
 * default 20, minimum 1, and no maximum stated … The licensed aggregate is `stream count × 50 frames/s`, and only one
 * of those two factors is bounded." Part AL closed the DELIVERED half at the limiter and left the PRODUCED half open.
 *
 * This ladder prices the open half. It feeds the limiter at exactly the licensed rate — one frame per stream per
 * coalescing floor, which is the 50 frames/s the forty-stream test above shows the real flush produces — and reports,
 * per rung, what the product delivers and what the surface pays. The bound holds at every rung, because merging
 * absorbs whatever is offered; what climbs is the LAG a byte waits before it reaches a surface, which is the failure
 * mode ADR-0021 consequence 5 names ("the relay fails into unbounded latency, not into loss … whatever diagnostics
 * watches this must watch a rate and a queue depth, not a gap"). The lag is measured per byte, not assumed.
 */
interface LadderRung {
  readonly streams: number; readonly windows: number;
  readonly offeredFrames: number; readonly offeredDeliveriesPerSecond: number; readonly offeredPeakPerSecond: number;
  readonly deliveredFrames: number; readonly deliveredPeakPerSecond: number; readonly mergedFrames: number;
  readonly maxPendingSegments: number; readonly maxLagMs: number; readonly medianLagMs: number; readonly tailFlushMs: number;
}

function ladderRung(streams: number, windows: number, seconds: number): LadderRung {
  const clock = new FakeClock();
  const relay = new UpdateRelay();
  const delivered: { window: number; at: number; frame: TerminalFrame }[] = [];
  for (let w = 1; w <= windows; w += 1) {
    const id = w;
    relay.attach({ id, send: (_c, p) => delivered.push({ window: id, at: clock.now(), frame: p as TerminalFrame }) });
    relay.subscribe(id, 'sess');
  }
  const limiter = new FrameDeliveryLimiter({ relay, clocks: clock, log: () => undefined });
  const ids = Array.from({ length: streams }, (_, i) => `bg:ts_${String(i).padStart(8, '0')}`);
  /** Per stream, each offered chunk with the instant it was offered and the cumulative byte it ends at. */
  const chunks = new Map<string, { at: number; end: number }[]>();
  const cumulative = new Map<string, number>();
  for (const id of ids) { chunks.set(id, []); cumulative.set(id, 0); }
  const offeredAt: number[] = [];
  let maxPending = 0;
  let seq = 0;
  for (let t = 0; t < seconds * 1000; t += TERMINAL_COALESCE_FLOOR_MS) {
    seq += 1;
    for (const id of ids) {
      const payload = `${id}@${t};`;
      const end = cumulative.get(id)! + payload.length;
      cumulative.set(id, end);
      chunks.get(id)!.push({ at: t, end });
      offeredAt.push(t);
      limiter.deliver({ v: CONTRACT_SCHEMA_VERSION, sessionId: 'sess', streamId: id, seq, kind: 'delta', payload });
    }
    maxPending = Math.max(maxPending, limiter.aggregate().pending);
    clock.advance(TERMINAL_COALESCE_FLOOR_MS);
  }
  const lastOfferedAt = seconds * 1000 - TERMINAL_COALESCE_FLOOR_MS;
  for (let i = 0; i < 600 && limiter.aggregate().pending > 0; i += 1) clock.advance(1000);
  // What a byte waited between being offered and reaching window 1's surface.
  const lags: number[] = [];
  const seen = new Map<string, number>();
  const cursor = new Map<string, number>();
  for (const id of ids) { seen.set(id, 0); cursor.set(id, 0); }
  let tailFlushMs = 0;
  for (const d of delivered) {
    if (d.window !== 1 || d.frame.kind !== 'delta') continue;
    const got = seen.get(d.frame.streamId)! + d.frame.payload.length;
    seen.set(d.frame.streamId, got);
    const list = chunks.get(d.frame.streamId)!;
    let at = cursor.get(d.frame.streamId)!;
    while (at < list.length && list[at]!.end <= got) { lags.push(d.at - list[at]!.at); at += 1; }
    cursor.set(d.frame.streamId, at);
    tailFlushMs = Math.max(tailFlushMs, d.at - lastOfferedAt);
  }
  // Nothing dropped at any window (REQ-SHELL-103): every stream's delivered deltas carry every byte offered.
  for (let w = 1; w <= windows; w += 1) {
    const got = new Map<string, number>();
    for (const d of delivered) if (d.window === w && d.frame.kind === 'delta') got.set(d.frame.streamId, (got.get(d.frame.streamId) ?? 0) + d.frame.payload.length);
    for (const id of ids) expect(got.get(id) ?? 0).toBe(cumulative.get(id));
  }
  let maxLag = 0;
  for (const lag of lags) if (lag > maxLag) maxLag = lag;
  const sorted = [...lags].sort((a, b) => a - b);
  return {
    streams, windows, offeredFrames: offeredAt.length, offeredDeliveriesPerSecond: streams * (1000 / TERMINAL_COALESCE_FLOOR_MS) * windows,
    offeredPeakPerSecond: peakPerSecond(offeredAt), deliveredFrames: delivered.length, deliveredPeakPerSecond: peakPerSecond(delivered.map((d) => d.at)),
    mergedFrames: limiter.aggregate().merged, maxPendingSegments: maxPending, maxLagMs: maxLag, medianLagMs: sorted[Math.floor(sorted.length / 2)] ?? 0, tailFlushMs,
  };
}

describe('Part T2 — ADR-0021 obligation 2: what an unbounded background-session count costs, priced', () => {
  it('holds REQ-MONITOR-306 at every rung of the stream count, drops nothing, and reports the lag that climbs instead', () => {
    const rungs = [
      ladderRung(20, 1, 3), ladderRung(40, 1, 3), ladderRung(40, 2, 3),
      ladderRung(100, 1, 3), ladderRung(400, 1, 3), ladderRung(400, 2, 3), ladderRung(1000, 1, 3), ladderRung(3000, 1, 3),
    ];
    for (const r of rungs) expect(r.deliveredPeakPerSecond).toBeLessThanOrEqual(TERMINAL_DELIVERY_BOUND_PER_SECOND);
    // Above the bound a sweep of the pending streams no longer fits in one second, so a stream waits `streams / bound`
    // seconds for its turn and the surface's staleness grows with the count — which is obligation 2's open half, the
    // count having no stated maximum. The crossing is asserted rather than described: three thousand streams, three
    // times the bound, must show a lag past the one second every rung at or under the bound stays inside.
    const atBound = rungs.find((r) => r.streams === 1000 && r.windows === 1)!;
    const pastBound = rungs.find((r) => r.streams === 3000)!;
    expect(atBound.maxLagMs).toBeLessThanOrEqual(1100);
    expect(pastBound.maxLagMs).toBeGreaterThan(2000);
    // The SHIPPED concurrency — REQ-MONITOR-285's twenty agents plus REQ-TOOLS-108's twenty background sessions, one
    // window — must leave the surface under a second behind. That is the claim ADR-0021 makes for the defaults, and it
    // is the rung where the bound still has room; the rungs above it are where the key's missing maximum shows.
    const shipped = rungs.find((r) => r.streams === 40 && r.windows === 1)!;
    expect(shipped.maxLagMs).toBeLessThan(1000);
    measurements['obligation2'] = {
      licensedFramesPerSecondPerStream: 1000 / TERMINAL_COALESCE_FLOOR_MS, bound: TERMINAL_DELIVERY_BOUND_PER_SECOND,
      key: { name: 'runtime.shell_max_background_sessions', default: 20, minimum: 1, maximum: null },
      source: 'synthetic at the licensed rate through the real limiter', rungs,
    };
  });
});
