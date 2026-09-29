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
 * rather than assumed. So is the `failed-word` shape's command, whose printed line the PD-TOOLS-003 guard depends
 * on, and `outputOf` is pinned to read that printed output and never the command the diagnostic repeats.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
// @ts-expect-error — the shapes are plain ESM beside the script that replays them.
import { LONG_OUTPUT_LINES, diagnosticOf, hereStringLinesReturned, longOutputReading, outputOf, terminalShapes } from './terminal-shapes.mjs';

interface Shape { readonly id: string; readonly match: RegExp; readonly command: string }

const PLATFORMS = ['win32', 'linux'] as const;

describe('the terminal shapes the live run replays', () => {
  for (const platform of PLATFORMS) {
    describe(platform, () => {
      const shapes: Shape[] = terminalShapes(platform);

      it('carries every shape of its platform, each named once', () => {
        // Live-run L1's `unexpandable` is POSIX only: PowerShell has no such expansion.
        expect(shapes.map((s) => s.id)).toEqual(platform === 'win32'
          ? ['here-string', 'long-output', 'wedge', 'failed-word', 'diff-exit-1', 'pipe-to-shell']
          : ['here-string', 'long-output', 'unexpandable', 'wedge', 'failed-word', 'diff-exit-1', 'pipe-to-shell']);
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

describe('the terminal output reader', () => {
  const observe = (command: string, printed: string) => [
    'The command exited with code 0.',
    '[terminal_output]',
    printed,
    `[terminal_diagnostic] ${JSON.stringify({ command, exit_code: 0, outcome_kind: 'success', warnings: [] })}`,
  ].join('\n');

  /*
   * The reason it exists: the diagnostic repeats the command, so a pattern taken from the command matches the
   * whole result even when the command printed nothing — and a check reading the whole result cannot fail.
   */
  it('reads what the command printed, never the command the diagnostic repeats', () => {
    const command = "node -e \"console.log('failed to connect to the docker API')\"";
    expect(outputOf(observe(command, 'failed to connect to the docker API'))).toBe('failed to connect to the docker API');
    expect(outputOf(observe(command, '(no output)'))).toBe('(no output)');
    expect(observe(command, '(no output)')).toMatch(/failed to connect to the docker API/);
  });

  it('keeps every printed line, a quoted observation included, and answers null where there is no section', () => {
    const quoting = observe('cat log', ['a', '[terminal_output]', 'b', '[terminal_diagnostic] {"exit_code":1}'].join('\n'));
    expect(outputOf(quoting)).toBe(['a', '[terminal_output]', 'b', '[terminal_diagnostic] {"exit_code":1}'].join('\n'));
    expect(outputOf('the tool was blocked before it ran')).toBeNull();
    expect(outputOf(undefined)).toBeNull();
  });
});

describe('the here-string check', () => {
  const observe = (platform: 'win32' | 'linux', printed: string) => {
    const command = terminalShapes(platform).find((s) => s.id === 'here-string')!.command;
    return [
      'The command exited with code 0.',
      '[terminal_output]',
      printed,
      `[terminal_diagnostic] ${JSON.stringify({ command, exit_code: 0, outcome_kind: 'success', warnings: [] })}`,
    ].join('\n');
  };

  /*
   * The defect: the command carries both words and the diagnostic repeats the command, so a check over the whole
   * result passed for a shell that printed nothing. This is the observation it passed on, and it must fail now.
   */
  it('fails an observation whose output is (no output), although the diagnostic repeats both words', () => {
    for (const platform of PLATFORMS) {
      const observation = observe(platform, '(no output)');
      expect(observation).toMatch(/alpha-one/);
      expect(observation).toMatch(/beta-two/);
      expect(hereStringLinesReturned(observation), `${platform}: a no-output observation passed`).toBe(false);
    }
  });

  it('passes only when both lines were printed, and fails on one line or no output section at all', () => {
    for (const platform of PLATFORMS) {
      expect(hereStringLinesReturned(observe(platform, 'alpha-one\nbeta-two'))).toBe(true);
      expect(hereStringLinesReturned(observe(platform, 'alpha-one'))).toBe(false);
    }
    expect(hereStringLinesReturned('the tool was blocked before it ran')).toBe(false);
    expect(hereStringLinesReturned(undefined)).toBe(false);
  });
});

describe('the docker line the failed-word shape replays', () => {
  /*
   * PD-TOOLS-003's guard asserts that this line does NOT warn, which is only a guard while the command prints the
   * record's line in lower case and exits 0. Run for real, as the long-output shape is, so that is measured.
   */
  it('prints run 2e21e324\'s docker line in lower case and exits 0, run for real', () => {
    const shapes: Shape[] = terminalShapes();
    const command = shapes.find((s) => s.id === 'failed-word')!.command;
    const run = process.platform === 'win32'
      ? spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', timeout: 60_000 })
      : spawnSync('sh', ['-c', command], { encoding: 'utf8', timeout: 60_000 });
    expect(run.status, String(run.error ?? run.stderr)).toBe(0);
    expect(run.stdout.trim()).toBe('failed to connect to the docker API');
  });
});

describe('the bash-ism the unexpandable shape replays (live-run L1)', () => {
  /*
   * The shape is a guard only while it carries the input that failed: an expansion the host's `/bin/sh` cannot
   * perform. Measured where that shell is dash, as it was on the live run's host; a `/bin/sh` that is bash expands
   * it, and there the shape asks nothing of the wrapper's guard.
   */
  const dash = process.platform !== 'win32' && existsSync('/bin/sh') && realpathSync('/bin/sh').endsWith('dash');
  it.skipIf(!dash)('fails to expand under a dash /bin/sh, after printing its first line, run for real', () => {
    const shapes: Shape[] = terminalShapes();
    const command = shapes.find((s) => s.id === 'unexpandable')!.command;
    const run = spawnSync('/bin/sh', ['-c', command], { encoding: 'utf8', timeout: 60_000 });
    expect(run.stdout.trim()).toBe('ran');
    expect(run.stderr).toMatch(/Bad substitution/);
    expect(run.status).not.toBe(0);
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
