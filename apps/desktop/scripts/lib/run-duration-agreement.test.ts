/**
 * REQ-CHAT-158, REQ-MONITOR-107 (acceptance K1): the live run's reading of the run header against the inspector's run-level
 * row, decided here on the logs the K1 runs left, so the live check fails on the shape it exists to catch.
 */
import { describe, expect, it } from 'vitest';
import { DURATION_PROBES, headerSeconds, rowSeconds, runDurationReading, runDurationVerdict } from './run-duration-agreement.mjs';

const log = (header: string, seconds: string, name: string, meta: string, frozen = '1') => [
  'run: something before',
  `capture: probe ${DURATION_PROBES[0]} → ${JSON.stringify([{ text: header, fontSize: '12px', data: { 'data-testid': 'run-timing', 'data-seconds': seconds, 'data-frozen': frozen } }])}`,
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

  // Acceptance L4 (docs/defects/fixed/the-k1-duration-check-is-asserted-on-a-run-that-never-reached-a-terminal-state.md): the
  // probes of `terminal` in pack 2026-10-14T15-58-45-917Z, taken after the wait ran out, verbatim. A live header counts the
  // model call in flight (REQ-CHAT-158) and the row counts from spawn (REQ-MONITOR-107): two figures by design, so the
  // agreement is not read until the header is frozen at a terminal state.
  const liveCapture = [
    '[main 2026-10-14T16:23:31.956Z] info    capture: wait for result timed out after 550000 ms',
    '[main 2026-10-14T16:23:34.960Z] info    capture: probe [data-testid="run-timing"] → [{"text":"1:00","fontSize":"11px","data":{"data-testid":"run-timing","data-seconds":"60","data-frozen":"0"}}]',
    '[main 2026-10-14T16:23:34.961Z] info    capture: probe [data-testid="inspector-name"] → [{"text":"orchestrator","fontSize":"14px","data":{"data-testid":"inspector-name"}}]',
    '[main 2026-10-14T16:23:34.962Z] info    capture: probe [data-testid="inspector-meta"] → [{"text":"running · 9m 13s · 9 tool calls","fontSize":"11px","data":{"data-testid":"inspector-meta"}}]',
  ].join('\n');

  it('notes, never fails, a capture of a run that is not terminal (L4)', () => {
    const reading = runDurationReading(liveCapture, 'orchestrator');
    expect(reading).toMatchObject({ frozen: '0', headerSeconds: 60, rowSeconds: 553, runLevel: true, agree: false });
    expect(runDurationVerdict(reading)).toEqual({ verdict: 'note', reason: 'not-terminal' });
    // Agreeing figures on a live header are not a pass either: nothing was measured.
    expect(runDurationVerdict(runDurationReading(log('0:07', '7', 'orchestrator', 'running · 7s · 1 tool calls', '0'), 'orchestrator')).verdict).toBe('note');
    // A header that carries no frozen mark has not said it is terminal.
    const unmarked = log('2:13', '133', 'orchestrator', 'done · 2m 13s · 31 tool calls').replace(',"data-frozen":"1"', '');
    expect(runDurationVerdict(runDurationReading(unmarked, 'orchestrator')).verdict).toBe('note');
  });

  it('asserts a frozen header: K1\'s pair fails, one figure passes, another agent is noted, a missing probe fails', () => {
    expect(runDurationVerdict(runDurationReading(log('2:13', '133', 'orchestrator', 'done · 2m 14s · 31 tool calls'), 'orchestrator'))).toEqual({ verdict: 'fail' });
    expect(runDurationVerdict(runDurationReading(log('2:13', '133', 'orchestrator', 'done · 2m 13s · 31 tool calls'), 'orchestrator'))).toEqual({ verdict: 'pass' });
    expect(runDurationVerdict(runDurationReading(log('2:13', '133', 'Helper', 'done · 2m 13s · 3 tool calls'), 'orchestrator'))).toEqual({ verdict: 'note', reason: 'another-agent' });
    expect(runDurationVerdict(runDurationReading('captured /x.png', 'orchestrator'))).toEqual({ verdict: 'fail' });
  });
});
