/**
 * Where the append cost at depth is NOT (REQ-CHAT-055, ADR-0045).
 *
 * `docs/defects/fixed/appending-at-1200-rows-costs-two-to-three-times-an-empty-transcript.md` recorded a driven
 * measurement — 83.9 ms median at 1,200 rows against 36.8 ms on an empty transcript — and, after the two
 * memoisations in `cache.ts`, left one candidate for the remainder: that `projectDisplay` runs whole-state
 * on every render while an incremental form (`{ previous, from }`) exists and the pane does not use it,
 * because no prop carries the replica's `earliestChanged` across the seam.
 *
 * This file measures that candidate directly, and it is **not** the remainder. At 1,200 rows the whole
 * pure-function part of the apply path — the projection, `placements`, and one `measureKey` per displayed
 * row — costs about a millisecond in total, and the incremental projection saves a fraction of that. The
 * gap the proof measures is over forty. Wiring the seam would buy roughly one percent of it.
 *
 * The assertions are ORDER-OF-MAGNITUDE, deliberately: pinning a millisecond figure on a shared machine is
 * a flake generator, and the finding is not "these take 0.9 ms", it is "these cannot account for 47 ms".
 * The bounds are set two orders above what was measured, so only a change that makes one of these terms
 * dominate — which is the thing that would make the next agent's seam change worth taking — can fail them.
 */
import { describe, expect, it } from 'vitest';
import type { TranscriptRow } from '@rotaris/contracts';
import { CAP_DEFAULTS, projectDisplay, type ProjectOptions } from './project.js';
import { placements } from './Row.js';
import { measureKey } from './cache.js';

/** The transcript proof's own S1200 fixture shape: a fold of tool calls, one long output, agent rows. */
function plant(total: number): TranscriptRow[] {
  const longOutput = Array.from({ length: 30 }, (_, i) => `output line ${i + 1}`).join('\n');
  const rows: TranscriptRow[] = [];
  for (let i = 0; i < total; i += 1) {
    const at = new Date(Date.UTC(2026, 8, 6, 9, 0, Math.min(59, i % 60), 0)).toISOString();
    const base = { index: i, at, ts: at.slice(11, 19), persona: 'orchestrator', name: 'orchestrator', settled: true };
    if (i >= 400 && i <= 404) {
      rows.push({ ...base, kind: 'tool', toolName: 'read_file', toolStatus: 'ok', callKey: `call-${i}`, durationMs: 120, startedAt: at, input: JSON.stringify({ path: `file-${i}.md` }), output: `contents of file ${i}` } as unknown as TranscriptRow);
    } else if (i === 420) {
      rows.push({ ...base, kind: 'tool', toolName: 'grep', toolStatus: 'ok', callKey: 'call-long', durationMs: 90, startedAt: at, input: JSON.stringify({ pattern: 'x' }), output: longOutput } as unknown as TranscriptRow);
    } else {
      rows.push({ ...base, kind: i === 200 ? 'user' : 'agent', body: `row ${i} of the fixture` } as unknown as TranscriptRow);
    }
  }
  return rows;
}

const options = (rows: readonly TranscriptRow[]): ProjectOptions => ({
  rows, running: false, groupTools: true, showReasoning: false,
  caps: CAP_DEFAULTS,
  expanded: new Set<string>(), pendingQuestions: [], pendingApprovals: [],
});

/** The median of `runs` timings, after two warm-up calls so the first-call compile is not the sample. */
function medianMs(f: () => void, runs = 21): number {
  f(); f();
  const samples: number[] = [];
  for (let i = 0; i < runs; i += 1) { const t = performance.now(); f(); samples.push(performance.now() - t); }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(runs / 2)]!;
}

describe('REQ-CHAT-055: the pure terms on the apply path do not explain the cost at depth', () => {
  it('the whole pure-function part of an apply at 1,200 rows is about one frame-hundredth, not forty milliseconds', () => {
    const rows = plant(1_200);
    const o = options(rows);
    const display = projectDisplay(o);
    expect(display.length).toBeGreaterThan(1_000);

    const whole = medianMs(() => { projectDisplay(o); });
    const places = medianMs(() => { placements(display); });
    const keys = medianMs(() => { for (const d of display) measureKey(d, 800, false, null); });

    // Measured 2026-09-22 on the development machine: 0.873 / 0.072 / 0.089 ms. The bound is two orders
    // above the sum, because what is being pinned is that these cannot be the 47 ms the proof sees.
    expect(whole + places + keys).toBeLessThan(100);
  });

  it('the incremental projection is cheaper than the whole-state one, and the difference is a rounding error against the gap', () => {
    const rows = plant(1_200);
    const o = options(rows);
    const display = projectDisplay(o);

    const whole = medianMs(() => { projectDisplay(o); });
    const incremental = medianMs(() => { projectDisplay(o, { previous: display, from: 1_199 }); });

    // The incremental form works and is faster — measured 0.276 ms against 0.873 ms. It is kept here so
    // that a change breaking `{ previous, from }` is caught, and so that the SIZE of the prize is on the
    // record: threading `earliestChanged` across the pane's seam is worth well under a millisecond.
    expect(incremental).toBeLessThanOrEqual(whole + 1);
    expect(whole - incremental).toBeLessThan(16.7);
  });

  it('an empty transcript costs what an empty transcript should, so the comparison has a floor', () => {
    const o = options(plant(1));
    expect(medianMs(() => { projectDisplay(o); })).toBeLessThan(16.7);
  });
});
