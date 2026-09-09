import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TERMINAL_COALESCE_FLOOR_MS, TERMINAL_DELIVERY_BOUND_PER_SECOND, type TerminalFrame } from '@rotaris/contracts';
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
