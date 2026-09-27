/**
 * What `pnpm package` closes on (ADR-0056's evidence, IC-6; first-release-plan.md §4.4). Every line is a statement about
 * the run, so each is held to the steps that ran. The SEAM-FREE line is the regression: it printed after every run,
 * including a run refused before `electron-vite build` touched `out/`
 * (docs/defects/fixed/pnpm-package-announced-a-seam-free-build-it-had-not-made.md).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM beside the scripts that run it.
import { closingLines, reached, STEPS } from './package-verdict.mjs';

const REPORT = 'apps/desktop/release/load-proof.json';
const SEAM_FREE = '[package] `out/` now holds a SEAM-FREE build — run `pnpm build` before any proof or `pnpm app:drive`.';
const DEVELOPMENT = 'DEVELOPMENT PACKAGE: … It is not releasable';
/** The steps `package.mjs` enters, in order, by the names it gives them. */
const STEP_NAMES = [
  'code-intelligence bundle',
  'code-intelligence manifest equals the committed module',
  'the notices file (pnpm notices)',
  'the build identifier (pnpm build-id)',
  `${STEPS.build} (seams compiled out)`,
  'the packaged bundle carries no scriptable seam',
  `${STEPS.builder} --win --dir`,
];
/** A run that entered the first `n` steps. */
const ran = (n: number, extra: Record<string, unknown> = {}) => ({ ok: false, ms: 1, counterfactual: null, steps: STEP_NAMES.slice(0, n).map((name) => ({ name })), ...extra });
const lines = (report: ReturnType<typeof ran>, why?: string) => closingLines({ report, why, reportPath: REPORT }) as { stdout: string[]; stderr: string[] };

describe('the SEAM-FREE line says what `out/` holds only when the build ran', () => {
  it('is not printed for a package refused before electron-vite build: at the bundle, the manifest, the notices step', () => {
    for (const n of [1, 2, 3, 4]) expect(lines(ran(n), 'refused').stdout).not.toContain(SEAM_FREE);
  });

  it('is printed once the build was entered, passed or refused after it', () => {
    expect(lines(ran(5), 'the build failed').stdout).toContain(SEAM_FREE);
    expect(lines(ran(7), 'rule 4 refused').stdout).toContain(SEAM_FREE);
    expect(lines(ran(7, { ok: true })).stdout).toContain(SEAM_FREE);
  });
});

describe('REQ-STARTUP-149: a refusal is a handled error, with `error: …` on stderr', () => {
  it('a refusal names why on stderr; a pass writes nothing there', () => {
    const refused = lines(ran(3), 'notices validation refused (REQ-STARTUP-143)');
    expect(refused.stdout[0]).toBe(`\n[package] REFUSED — notices validation refused (REQ-STARTUP-143) (1 ms) → ${REPORT}`);
    expect(refused.stderr).toEqual(['error: pnpm package refused: notices validation refused (REQ-STARTUP-143)']);
    expect(lines(ran(7, { ok: true })).stderr).toEqual([]);
  });
});

describe('IC-6: a counterfactual that never reached electron-builder is not its evidence', () => {
  it('says NOT EXERCISED when the package ended before electron-builder, and nothing when it was reached', () => {
    const before = lines(ran(3, { counterfactual: 'no-force' }), 'notices validation refused');
    expect(before.stdout.some((l) => l.startsWith('[package] COUNTERFACTUAL no-force NOT EXERCISED'))).toBe(true);
    const at = lines(ran(7, { counterfactual: 'no-force' }), 'rule 1a refused');
    expect(at.stdout.some((l) => l.includes('NOT EXERCISED'))).toBe(false);
    expect(lines(ran(3), 'refused').stdout.some((l) => l.includes('COUNTERFACTUAL'))).toBe(false);
  });

  it('reads a step as reached whether it passed or failed', () => {
    expect(reached(ran(7), STEPS.builder)).toBe(true);
    expect(reached(ran(6), STEPS.builder)).toBe(false);
  });
});

describe('first-release-plan.md §4.4: a development package says what it is, last', () => {
  it('announces itself after every other line when it passed without the notices file', () => {
    const out = lines(ran(7, { ok: true, assets: { notices: 'absent', line: DEVELOPMENT } })).stdout;
    expect(out.at(-1)).toBe(`[package] ${DEVELOPMENT}`);
    expect(lines(ran(7, { ok: true, assets: { notices: 'carried', line: 'notices written and carried' } })).stdout.some((l) => l.includes('notices written'))).toBe(false);
  });
});
