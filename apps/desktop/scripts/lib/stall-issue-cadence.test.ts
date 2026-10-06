/**
 * PD-MONITOR-005 revision 2 (OQ-127): the `faults-stall` scenario's reading of the root's `stall` issues, pinned against
 * the two shapes the build has written — one issue per throttled warning (revision 2) and one per evaluation (before it),
 * which the scenario's check passed alike until finacc3's finding F14
 * (`docs/defects/fixed/the-faults-stall-check-does-not-assert-the-stall-issue-throttle.md`).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { stallIssueCadence, stallSilenceSeconds } from './stall-issue-cadence.mjs';

const T0 = Date.parse('2026-10-06T10:00:00.000Z');
/** A `stall` issue as the store holds it, written `atS` seconds after the silence began, stating `silentS`. */
const stall = (atS: number, silentS = Math.floor(atS), actor = 'orchestrator', task = 'root_1', startMs = T0) => ({
  kind: 'stall',
  severity: 'warning',
  actor,
  recorded_at: new Date(startMs + atS * 1000 + 120).toISOString(),
  message: `agent appears stalled: no model event or token for ${silentS} seconds (${actor}, ${task}); the run is still waiting on it.`,
  metadata: JSON.stringify({ task_id: task, silent_seconds: silentS, active_tools: [], recent_tool_calls: [], last_model_event: 'text' }),
});

describe('stallIssueCadence (PD-MONITOR-005 revision 2, REQ-MONITOR-119/120)', () => {
  it('the faults-stall root as revision 2 writes it: one issue at 90 s before the 120 s idle bound reads as one stall, nothing too soon', () => {
    const r = stallIssueCadence([stall(90.4)]);
    expect(r.stalls).toHaveLength(1);
    expect(r.stalls[0].silences).toEqual([90]);
    expect(r.tooSoon).toEqual([]);
  });

  it('before revision 2: an issue at every 5 s evaluation from 90 s to 120 s is six repeats sooner than the throttle', () => {
    const r = stallIssueCadence([90, 95, 100, 105, 110, 115, 120].map((s) => stall(s + 0.3)));
    expect(r.stalls).toHaveLength(1);
    expect(r.tooSoon).toHaveLength(6);
    expect(r.tooSoon[0]).toMatchObject({ previous: 90, next: 95, throttleMs: 84_000 });
  });

  it('a long stall repeating at the throttle passes; a known threshold is used where it is given', () => {
    const issues = [90, 180, 270, 360].map((s) => stall(s + 0.2));
    expect(stallIssueCadence(issues).tooSoon).toEqual([]);
    expect(stallIssueCadence(issues, { thresholdMs: 90_000 }).tooSoon).toEqual([]);
    // A repeat one evaluation early is too soon against the known threshold.
    expect(stallIssueCadence([stall(90.2), stall(175.2)], { thresholdMs: 90_000 }).tooSoon).toHaveLength(1);
  });

  it('the 30 s floor: a 10 s threshold repeats no sooner than 30 s', () => {
    expect(stallIssueCadence([stall(10.1), stall(40.2), stall(70.3)]).tooSoon).toEqual([]);
    expect(stallIssueCadence([stall(10.1), stall(20.2)]).tooSoon).toMatchObject([{ previous: 10, next: 20, throttleMs: 30_000 }]);
  });

  it('two stalls of one agent are two entries, with no throttle between them', () => {
    // A stall at 90 s, a recovery, and a second silence that began 100 s in: its entry 190 s in is not a repeat.
    const second = T0 + 100_000;
    const r = stallIssueCadence([stall(90.2), stall(90.3, 90, 'orchestrator', 'root_1', second)]);
    expect(r.stalls).toHaveLength(2);
    expect(r.tooSoon).toEqual([]);
  });

  it('two agents stalled at once are read apart', () => {
    const r = stallIssueCadence([stall(90.1), stall(91.2, 91, 'build', 'bg_0000000a'), stall(180.2), stall(181.3, 181, 'build', 'bg_0000000a')]);
    expect(r.stalls.map((s: { actor: string }) => s.actor)).toEqual(['orchestrator', 'build']);
    expect(r.tooSoon).toEqual([]);
  });

  it('other kinds are ignored, and a stall issue with no time or silence is set aside unjudged', () => {
    const r = stallIssueCadence([{ kind: 'transient_llm_error', actor: 'orchestrator', recorded_at: new Date(T0).toISOString(), message: 'timed out' }, { kind: 'stall', actor: 'x', recorded_at: 'never', message: 'agent appears stalled: no model event or token for 90 seconds' }]);
    expect(r.stalls).toEqual([]);
    expect(r.unread).toHaveLength(1);
  });

  it('the silence is read from the metadata, else from REQ-ORCH-089\'s words', () => {
    expect(stallSilenceSeconds(stall(95.5))).toBe(95);
    expect(stallSilenceSeconds({ message: 'child appears stalled: no model event or token for 181 seconds (b, t); the run is still waiting on it.', metadata: '{}' })).toBe(181);
    expect(stallSilenceSeconds({ message: 'something else' })).toBeNull();
  });
});
