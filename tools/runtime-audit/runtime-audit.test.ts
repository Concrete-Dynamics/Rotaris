/**
 * The shipped runtime's audit (R-091; `docs/architecture/hardening.md` §3.5, the Scorecard's Vulnerabilities): Electron
 * is a devDependency the production audit cannot see, so `pnpm deps:audit:runtime` reads the whole tree's report and
 * fails CI's gate on the runtime's high and critical advisories alone (`runtime-audit.mjs`). This pins:
 * - the selection: the runtime's advisories at or above the level, the build tools' left to the report-only step, an
 *   unknown severity counted, and a report that is not one refused rather than read as clean;
 * - the pin itself: `apps/desktop/package.json` and the lockfile hold one exact Electron, at or above the version that
 *   fixed every advisory the readings in `docs/architecture/dependency-alerts/` record against it (44.3.0 sat inside
 *   GHSA-jr5w-w6x2-84p9, high, `<44.9.1`, with the gate green, 2026-11-01);
 * - `ci.yml`'s gate runs it, blocking, after the install and before `pnpm check`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { describeFinding, runtimeFindings, SHIPPED_RUNTIME } from './runtime-audit.mjs';

const root = join(import.meta.dirname, '..', '..');

/** A `pnpm audit --json` report in pnpm 11.9.0's shape, trimmed from the one read at `ad1a6698` on 2026-11-04. */
function report(advisories: Array<Record<string, unknown>>): unknown {
  return {
    actions: [],
    advisories: Object.fromEntries(advisories.map((a, i) => [String(1000 + i), a])),
    muted: [],
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } },
  };
}

function advisory(module_name: string, severity: string, ghsa: string, version: string, vulnerable: string, patched: string) {
  return {
    module_name,
    severity,
    github_advisory_id: ghsa,
    vulnerable_versions: vulnerable,
    patched_versions: patched,
    title: `${module_name} ${ghsa}`,
    findings: [{ version, paths: [`apps__desktop>${module_name}`] }],
  };
}

const AT_44_3_0 = report([
  advisory('electron', 'moderate', 'GHSA-x562-297c-g43g', '44.3.0', '>=44.0.0-alpha.1 <44.5.0', '>=44.5.0'),
  advisory('electron', 'low', 'GHSA-3qxv-5xgr-q7w9', '44.3.0', '>=44.0.0-alpha.1 <44.4.3', '>=44.4.3'),
  advisory('electron', 'high', 'GHSA-jr5w-w6x2-84p9', '44.3.0', '>=44.0.0-alpha.1 <44.9.1', '>=44.9.1'),
  advisory('undici', 'high', 'GHSA-xjj6-f33q-929c', '6.28.1', '>=6.23.0 <6.29.1', '>=6.29.1'),
  advisory('minimatch', 'moderate', 'GHSA-g3hv-75wg-m249', '10.2.6', '>=7.0.0 <11.0.1', '>=11.0.1'),
]);

describe('runtimeFindings: the shipped runtime among the whole tree\'s advisories', () => {
  it('keeps the runtime\'s high advisory and leaves the build tools\' to the report-only step', () => {
    const found = runtimeFindings(AT_44_3_0);
    expect(found.map((f) => [f.module, f.severity, f.ghsa, f.versions])).toEqual([
      ['electron', 'high', 'GHSA-jr5w-w6x2-84p9', ['44.3.0']],
    ]);
    expect(describeFinding(found[0]!)).toBe(
      'electron 44.3.0: high GHSA-jr5w-w6x2-84p9 (>=44.0.0-alpha.1 <44.9.1; fixed in >=44.9.1) electron GHSA-jr5w-w6x2-84p9',
    );
  });

  it('reads every severity at or above the level it is given', () => {
    expect(runtimeFindings(AT_44_3_0, { level: 'low' }).map((f) => f.ghsa)).toEqual([
      'GHSA-3qxv-5xgr-q7w9',
      'GHSA-jr5w-w6x2-84p9',
      'GHSA-x562-297c-g43g',
    ]);
    expect(runtimeFindings(AT_44_3_0, { level: 'critical' })).toEqual([]);
  });

  it('counts a critical advisory and one of a severity it does not know', () => {
    const found = runtimeFindings(
      report([
        advisory('electron', 'critical', 'GHSA-aaaa-aaaa-aaaa', '44.10.0', '<45.0.0', '>=45.0.0'),
        advisory('electron', 'severe', 'GHSA-bbbb-bbbb-bbbb', '44.10.0', '<45.0.0', '>=45.0.0'),
      ]),
    );
    expect(found.map((f) => f.severity)).toEqual(['critical', 'severe']);
  });

  it('finds nothing in a report with no runtime advisory', () => {
    expect(runtimeFindings(report([advisory('undici', 'critical', 'GHSA-xjj6-f33q-929c', '6.28.1', '<6.29.1', '>=6.29.1')]))).toEqual([]);
    expect(runtimeFindings(report([]))).toEqual([]);
  });

  it('refuses what is not an audit report, rather than reading it as clean', () => {
    for (const notAReport of [null, undefined, '', [], {}, { error: { code: 'ERR_PNPM_AUDIT_BAD_RESPONSE' } }, { advisories: [] }]) {
      expect(() => runtimeFindings(notAReport), JSON.stringify(notAReport)).toThrow(/not an audit report/);
    }
    expect(() => runtimeFindings(report([]), { level: 'urgent' })).toThrow(/unknown audit level/);
  });

  it('names Electron as the shipped runtime', () => {
    expect(SHIPPED_RUNTIME).toEqual(['electron']);
  });
});

/** `a >= b` for plain `x.y.z` versions. */
function atLeast(a: string, b: string): boolean {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return true;
}

describe('the Electron pin: outside every advisory the readings record against it', () => {
  // The fixed version of each Electron advisory `docs/architecture/dependency-alerts/` records: the one the R-081 lane
  // patched (`2026-10-22-lane-electron.md`) and the four the whole tree's report listed at 44.3.0
  // (`2026-11-01-audit-gate.md` §3, `2026-11-04-lane-electron-44-10.md`).
  const FIXED_IN: Record<string, string> = {
    'GHSA-fw47-9c62-h3vw': '44.3.0',
    'GHSA-3qxv-5xgr-q7w9': '44.4.3',
    'GHSA-h3v5-h239-pg29': '44.4.3',
    'GHSA-x562-297c-g43g': '44.5.0',
    'GHSA-jr5w-w6x2-84p9': '44.9.1',
  };
  const desktop = JSON.parse(readFileSync(join(root, 'apps', 'desktop', 'package.json'), 'utf8')) as {
    devDependencies: Record<string, string>;
  };
  const pinned = desktop.devDependencies['electron'] ?? '';
  const lock = parse(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8')) as {
    importers: Record<string, { devDependencies?: Record<string, { specifier: string; version: string }> }>;
  };

  it('is one exact version, the one the lockfile resolves', () => {
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
    expect(lock.importers['apps/desktop']?.devDependencies?.['electron']).toEqual({ specifier: pinned, version: pinned });
  });

  it('is at or above the version that fixed each recorded advisory', () => {
    const inside = Object.entries(FIXED_IN)
      .filter(([, fixed]) => !atLeast(pinned, fixed))
      .map(([ghsa, fixed]) => `${ghsa} (fixed in ${fixed})`);
    expect(inside, `electron ${pinned}`).toEqual([]);
  });

  it('records each advisory it checks in a dependency-alerts reading', () => {
    const dir = join(root, 'docs', 'architecture', 'dependency-alerts');
    const readings = readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    expect(Object.keys(FIXED_IN).filter((ghsa) => !readings.includes(ghsa))).toEqual([]);
  });
});

describe('ci.yml: the shipped runtime\'s audit', () => {
  type Step = { run?: string; 'continue-on-error'?: boolean };
  const ci = parse(readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8')) as { jobs: Record<string, { steps?: Step[] }> };
  const scripts = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;

  it('defines deps:audit:runtime as the whole tree\'s report read by this module', () => {
    expect(scripts['deps:audit:runtime']).toBe('pnpm audit --json | node tools/runtime-audit/cli.mjs');
  });

  it('runs it in the gate job, blocking, after the install and before pnpm check', () => {
    const runs = (ci.jobs['gate']?.steps ?? []).map((s) => ({ run: s.run?.trim(), soft: s['continue-on-error'] === true }));
    const install = runs.findIndex((s) => s.run === 'pnpm install --frozen-lockfile');
    const audit = runs.findIndex((s) => s.run === 'pnpm deps:audit:runtime');
    const check = runs.findIndex((s) => s.run === 'pnpm check');
    expect(install).toBeGreaterThanOrEqual(0);
    expect(audit).toBeGreaterThan(install);
    expect(check).toBeGreaterThan(audit);
    expect(runs[audit]?.soft).toBe(false);
  });
});
