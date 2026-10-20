/**
 * `pnpm live-run --app-log-level` takes only the thresholds the run's readings survive
 * (`docs/defects/fixed/a-live-run-at-app-log-level-warning-or-error-misreads-its-missing-info-lines-as-outcomes.md`): `debug`
 * and `info`, in any casing. `warning` and `error` drop the `info` lines every scenario reads, so they are refused before any
 * launch, saying why. No product code runs here.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the module is plain ESM beside the scripts that run it.
import { READABLE_LEVELS, appLogLevelRefusal } from './app-log-level.mjs';

const script = join(import.meta.dirname, '..', 'live-run.mjs');

describe('--app-log-level takes only a threshold the live run can read under (PD-MONITOR-002)', () => {
  it('debug and info pass, in any casing, and so does the flag left out', () => {
    expect(READABLE_LEVELS).toEqual(['debug', 'info']);
    for (const value of [null, undefined, 'debug', 'DEBUG', 'info', 'Info']) expect(appLogLevelRefusal(value), String(value)).toBeNull();
  });

  it('warning and error are refused, saying the run reads the info lines they drop', () => {
    for (const value of ['warning', 'WARNING', 'error', 'Error']) {
      const refusal = appLogLevelRefusal(value);
      expect(refusal, value).toMatch(new RegExp(`^--app-log-level=${value}: refused\\. `));
      expect(refusal).toContain('read the application log\'s info lines');
      expect(refusal).toContain('A live run takes debug or info');
    }
  });

  it('a word PD-MONITOR-002 does not know is refused as before', () => {
    expect(appLogLevelRefusal('warn')).toBe('--app-log-level=warn: expected debug or info (PD-MONITOR-002\'s other two, warning and error, drop the info lines the run reads)');
    expect(appLogLevelRefusal('verbose')).toMatch(/^--app-log-level=verbose: expected debug or info/);
  });

  it('live-run.mjs refuses through it before anything else runs, and its USAGE names the two it takes', () => {
    const text = readFileSync(script, 'utf8');
    expect(text).toMatch(/const appLogRefusal = appLogLevelRefusal\(APP_LOG_LEVEL\);\nif \(appLogRefusal !== null\) \{\n {2}console\.error\(appLogRefusal\);\n {2}process\.exit\(2\);\n\}/);
    expect(text).not.toMatch(/\^\(\?:debug\|info\|warning\|error\)\$/);
    expect(text).toMatch(/--app-log-level=<lvl> {6}the application log's threshold, ROTARIS_APP_LOG_LEVEL \(debug\|info;/);
  });

  it('the script itself exits 2 on --app-log-level=warning with the refusal, before it reads an endpoint or builds', () => {
    // The parse sits above every endpoint, key and build step, so no registry, network or display is needed to reach it.
    const r = spawnSync(process.execPath, [script, '--app-log-level=warning'], { encoding: 'utf8', timeout: 60_000 });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--app-log-level=warning: refused\./);
  }, 70_000);
});
