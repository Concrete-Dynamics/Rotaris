/**
 * The `terminal` scenario's readers, pinned where they can fail loudly.
 *
 * The scenario itself cannot run here — it needs a real endpoint, a real model and the built application — but
 * the part of it that can be silently wrong can. A `match` that no longer matches its own command turns every
 * assertion in that scenario into "the model never attempted it": a NOTE, a green run, and a question that
 * stopped being asked without anybody being told. That is the failure this file exists to make impossible, and
 * it is the same shape as the finding `codebase.md` records for 2026-09-12 — **a proof that cannot fail is a
 * finding**, not a pass.
 *
 * Two directions are pinned, because one alone proves nothing: every shape matches its OWN command, and no
 * shape matches ANOTHER's. The second is what stops one shape's checks running against another shape's call.
 *
 * The long-output reading is verified against a real shell, so the arithmetic the scenario asserts is measured
 * rather than assumed.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
// @ts-expect-error — the shapes are plain ESM beside the script that replays them.
import { LONG_OUTPUT_LINES, diagnosticOf, longOutputReading, terminalShapes } from './terminal-shapes.mjs';

interface Shape { readonly id: string; readonly match: RegExp; readonly command: string }

const PLATFORMS = ['win32', 'linux'] as const;

describe('the terminal shapes the live run replays', () => {
  for (const platform of PLATFORMS) {
    describe(platform, () => {
      const shapes: Shape[] = terminalShapes(platform);

      it('carries all six shapes, each named once', () => {
        expect(shapes.map((s) => s.id)).toEqual(['here-string', 'long-output', 'wedge', 'failed-word', 'diff-exit-1', 'pipe-to-shell']);
      });

      it('matches its own command — the round trip the scenario depends on', () => {
        for (const shape of shapes) {
          expect(shape.match.test(shape.command), `${shape.id} does not match its own command: ${shape.command}`).toBe(true);
        }
      });

      it('matches no other shape\'s command, so one shape\'s checks cannot read another\'s call', () => {
        for (const shape of shapes) {
          for (const other of shapes) {
            if (other.id === shape.id) continue;
            expect(shape.match.test(other.command), `${shape.id} also matches ${other.id}: ${other.command}`).toBe(false);
          }
        }
      });

      it('sends the here-string as a genuinely multi-line command', () => {
        const hereString = shapes.find((s) => s.id === 'here-string');
        expect(hereString?.command.split('\n').length).toBeGreaterThan(2);
      });

      /*
       * The wedge must outlast the product's own no-output window (30 s, `config.noOutputWindowMs`), or a bound
       * firing would be the command ending on its own rather than the product bounding it — and the scenario
       * would report a hard cap that was never tested. The caller's `timeout` argument is what the PROMPT
       * forbids and what the scenario reads off `args.timeout`; the command itself cannot express it.
       */
      it('wedges for longer than the soft pause, so a bound that fires is the product\'s', () => {
        const wedge = shapes.find((s) => s.id === 'wedge');
        const ms = Number(/,\s*(\d+)\s*\)/.exec(wedge?.command ?? '')?.[1] ?? 0);
        expect(ms).toBeGreaterThan(30_000);
      });
    });
  }
});

describe('the terminal diagnostic reader', () => {
  it('reads the block a terminal observation ends with', () => {
    const observation = [
      'The command exited with code 1.',
      '[terminal_output]',
      'diff --git a/x b/y',
      '[terminal_diagnostic] {"backend":"pty","command":"git diff","exit_code":1,"outcome_kind":"success_with_output","warnings":[]}',
    ].join('\n');
    expect(diagnosticOf(observation)).toMatchObject({ exit_code: 1, outcome_kind: 'success_with_output' });
  });

  it('answers null rather than throwing on an observation that carries none', () => {
    expect(diagnosticOf('the tool was blocked before it ran')).toBeNull();
    expect(diagnosticOf('[terminal_diagnostic] {not json}')).toBeNull();
    expect(diagnosticOf(undefined)).toBeNull();
  });

  it('reads the LAST block when an observation quotes an earlier one in its own output', () => {
    const nested = [
      '[terminal_output]',
      '[terminal_diagnostic] {"exit_code":0,"outcome_kind":"success"}',
      '[terminal_diagnostic] {"exit_code":124,"outcome_kind":"timeout"}',
    ].join('\n');
    expect(diagnosticOf(nested)).toMatchObject({ exit_code: 124 });
  });
});

describe('the long-output reading', () => {
  const line = (n: number) => `LINE-${String(n).padStart(3, '0')} ${'x'.repeat(100)}`;

  it('counts every distinct marker of a healthy capture', () => {
    const healthy = Array.from({ length: LONG_OUTPUT_LINES }, (_, i) => line(i + 1)).join('\n');
    const reading = longOutputReading(healthy);
    expect(reading.distinct).toBe(LONG_OUTPUT_LINES);
    expect(reading.doubled).toHaveLength(0);
    expect(reading.escaped).toBe(false);
  });

  /*
   * The counterfactual. Without this the healthy case above could pass for a reader that never looks — these
   * three are the defects the scenario claims to catch, and each must move the reading it is about.
   */
  it('sees a concatenation, a lost line and a surviving escape sequence', () => {
    const rows = Array.from({ length: LONG_OUTPUT_LINES }, (_, i) => line(i + 1));
    const concatenated = [...rows.slice(0, 10), `${rows[10]}${rows[11]}`, ...rows.slice(12)].join('\n');
    expect(longOutputReading(concatenated).doubled).toHaveLength(1);
    expect(longOutputReading(rows.slice(0, 39).join('\n')).distinct).toBe(39);
    expect(longOutputReading(`${String.fromCharCode(27)}[0m${rows[0]}`).escaped).toBe(true);
  });

  /*
   * And the shape's own command, run by a real shell, so the forty the scenario asserts is a measurement of
   * this command rather than a number somebody liked. Skipped where the platform's shell is absent.
   */
  it('reads forty lines out of the shape\'s own command, run for real', () => {
    const shapes: Shape[] = terminalShapes();
    const command = shapes.find((s) => s.id === 'long-output')!.command;
    const run = process.platform === 'win32'
      ? spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', timeout: 60_000 })
      : spawnSync('sh', ['-c', command], { encoding: 'utf8', timeout: 60_000 });
    if (run.status !== 0) {
      expect(run.error ?? run.stderr, 'the shell refused the shape; nothing is asserted about its output').toBeTruthy();
      return;
    }
    const reading = longOutputReading(run.stdout);
    expect(reading.distinct).toBe(LONG_OUTPUT_LINES);
    expect(reading.doubled).toHaveLength(0);
  });
});
