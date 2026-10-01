/**
 * `theme-proof`'s contrast coverage (REQ-SHELL-145, REQ-SHELL-160): the verdict is not given over texts the proof did not
 * measure (`docs/defects/fixed/theme-proofs-contrast-verdict-sets-no-bound-on-the-texts-it-skips.md`). Before the bound,
 * a run whose one surface had all of its own text skipped or gone passed on the shell's texts around it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the verdict is plain ESM beside the proof that runs it.
import { MAX_SKIPPED_SHARE, contrastCoverage, skipKind } from './contrast-coverage.mjs';

type Text = { inSurface: boolean; skip: string | null };
const measured = (n: number, inSurface = true): Text[] => Array.from({ length: n }, () => ({ inSurface, skip: null }));
const skipped = (n: number, why: string, inSurface = true): Text[] => Array.from({ length: n }, () => ({ inSurface, skip: why }));
const shell = [...measured(20, false)];
const OFF = 'no part of it is on screen';
const MOVING = 'the element was animating when the frame was taken';

describe("theme-proof's contrast coverage (REQ-SHELL-145, REQ-SHELL-160)", () => {
  it('passes a run whose every surface had its own text measured and few skipped', () => {
    const verdict = contrastCoverage([{ name: 'view-1', texts: [...shell, ...measured(30)] }, { name: 'view-2', texts: [...shell, ...measured(40), ...skipped(1, 'smaller than two pixels')] }]);
    expect(verdict.failures).toEqual([]);
    expect(verdict.pass).toBe(true);
    expect(verdict.byReason).toEqual({ tiny: 1 });
  });

  it('fails a surface whose own text is gone from the screen, though the shell around it was measured', () => {
    // The off-screen counterfactual: the Workspace view's text is not discovered at all; the rail and the strip are.
    const verdict = contrastCoverage([{ name: 'view-1', texts: [...shell, ...measured(30)] }, { name: 'view-2', texts: [...shell] }]);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toEqual(['view-2: no text inside the surface was measured (0 discovered there, 0 skipped)']);
  });

  it('fails a surface whose own text was all skipped — left animating at capture', () => {
    const verdict = contrastCoverage([{ name: 'view-1', texts: [...shell, ...measured(30)] }, { name: 'view-3', texts: [...shell, ...skipped(12, MOVING)] }]);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures[0]).toMatch(/^view-3: no text inside the surface was measured \(12 discovered there, 12 skipped\)$/);
    expect(verdict.surfaces[1].surface.byReason).toEqual({ animating: 12 });
  });

  it('fails a surface whose share of skipped texts passes the bound, though some were measured', () => {
    // The shell around it is measured in full, so the run stays under its own bound and only the surface's is crossed.
    const verdict = contrastCoverage([{ name: 'settings-04', texts: [...shell, ...shell, ...measured(6), ...skipped(4, OFF)] }]);
    expect(verdict.share).toBeLessThanOrEqual(MAX_SKIPPED_SHARE.overall);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toEqual(['settings-04: 4 of the 10 texts inside the surface were skipped (40.0% > 25%)']);
  });

  it('fails a run whose share of skipped texts overall passes the bound, though every surface stayed under its own', () => {
    // The shell's own texts are skipped: no surface's share moves, the run's does.
    const offShell = skipped(20, OFF, false);
    const verdict = contrastCoverage([{ name: 'view-1', texts: [...offShell, ...measured(30)] }, { name: 'view-2', texts: [...offShell, ...measured(30)] }]);
    expect(verdict.surfaces.every((s: { surface: { skipped: number } }) => s.surface.skipped === 0)).toBe(true);
    expect(verdict.failures).toEqual(['overall: 40 of the 100 texts discovered were skipped (40.0% > 10%)']);
  });

  it('fails a run that read no surface', () => {
    expect(contrastCoverage([]).failures).toEqual(['no surface was read']);
  });

  it('counts the skips by reason, every sentence the proof writes', () => {
    expect(skipKind('smaller than two pixels')).toBe('tiny');
    expect(skipKind(MOVING)).toBe('animating');
    expect(skipKind(OFF)).toBe('offscreen');
    expect(skipKind('less than a glyph of it is on screen (1.2×14.0 of 80.0×14.0 CSS px)')).toBe('sliver');
    expect(skipKind('something new')).toBe('other');
  });

  it('states bounds a verdict can cross: a share, and the surface\'s looser than the run\'s', () => {
    expect(MAX_SKIPPED_SHARE.overall).toBeGreaterThan(0);
    expect(MAX_SKIPPED_SHARE.overall).toBeLessThan(MAX_SKIPPED_SHARE.surface);
    expect(MAX_SKIPPED_SHARE.surface).toBeLessThan(1);
  });
});

describe("theme-proof's contrast verdict reads the coverage (REQ-SHELL-145, REQ-SHELL-160)", () => {
  const scripts = join(import.meta.dirname, '..');
  const proof = readFileSync(join(scripts, 'theme-proof.mjs'), 'utf8');

  it('gates the contrast item on the coverage verdict, not only on the measured texts', () => {
    // The old form: `pass: badText.length === 0 && contrast.length > 0 && incoherentCaptures.length === 0`.
    const pass = /record\.items\.contrast = \{ pass: ([^,]+),/.exec(proof)?.[1] ?? '';
    expect(pass).toContain('coverage.pass');
    expect(proof).toContain('contrastCoverage(coverageSurfaces)');
  });

  it('keeps the off-screen counterfactual that must stay red', () => {
    const manifest = JSON.parse(readFileSync(join(scripts, '..', '..', '..', 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(manifest.scripts['theme-proof:counterfactual:offscreen']).toContain('--counterfactual=offscreen');
    expect(proof).toContain("counterfactual === 'offscreen'");
  });
});
