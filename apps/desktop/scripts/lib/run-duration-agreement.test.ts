/**
 * REQ-CHAT-158, REQ-MONITOR-107 (acceptance K1): the live run's reading of the run header against the inspector's run-level
 * row, decided here on the logs the K1 runs left, so the live check fails on the shape it exists to catch.
 */
import { describe, expect, it } from 'vitest';
import { DURATION_PROBES, headerSeconds, rowSeconds, runDurationReading } from './run-duration-agreement.mjs';

const log = (header: string, seconds: string, name: string, meta: string) => [
  'run: something before',
  `capture: probe ${DURATION_PROBES[0]} → ${JSON.stringify([{ text: header, fontSize: '12px', data: { 'data-testid': 'run-timing', 'data-seconds': seconds, 'data-frozen': '1' } }])}`,
  `capture: probe ${DURATION_PROBES[1]} → ${JSON.stringify([{ text: name, fontSize: '12px', data: { 'data-testid': 'inspector-name' } }])}`,
  `capture: probe ${DURATION_PROBES[2]} → ${JSON.stringify([{ text: meta, fontSize: '12px', data: { 'data-testid': 'inspector-meta' } }])}`,
  'captured /x.png',
].join('\n');

describe('run-duration-agreement (K1): the header and the run-level row read one duration', () => {
  it('reads the two shapes into whole seconds', () => {
    expect(headerSeconds('2:13')).toBe(133);
    expect(headerSeconds('1:02:05')).toBe(3725);
    expect(headerSeconds('')).toBeNull();
    expect(rowSeconds('done · 2m 13s · 31 tool calls')).toBe(133);
    expect(rowSeconds('done · 21s · 5 tool calls')).toBe(21);
    expect(rowSeconds('paused · — · 2 tool calls')).toBeNull();
  });

  it('fails the pair K1 saw ("2:13" beside "2m 14s") and passes one figure', () => {
    expect(runDurationReading(log('2:13', '133', 'orchestrator', 'done · 2m 14s · 31 tool calls'), 'orchestrator').agree).toBe(false);
    expect(runDurationReading(log('0:20', '20', 'orchestrator', 'done · 21s · 5 tool calls'), 'orchestrator').agree).toBe(false);
    expect(runDurationReading(log('2:13', '133', 'orchestrator', 'done · 2m 13s · 31 tool calls'), 'orchestrator')).toMatchObject({ agree: true, headerSeconds: 133, dataSeconds: 133, rowSeconds: 133, runLevel: true });
  });

  it('never passes when the inspector shows another agent or a probe found nothing', () => {
    expect(runDurationReading(log('2:13', '133', 'Helper', 'done · 2m 13s · 3 tool calls'), 'orchestrator')).toMatchObject({ agree: false, runLevel: false });
    expect(runDurationReading('captured /x.png', 'orchestrator')).toMatchObject({ agree: false, header: null, meta: null });
  });
});
