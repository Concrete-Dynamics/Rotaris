import { contrastRatio } from './colour.js';
import { TERM_ANSI_NAMES, type Theme } from './themes.js';

export interface ContrastViolation { readonly item: string; readonly ratio: number; readonly floor: number; }

function resolved(theme: Theme, key: `--rt-${string}`): string {
  const colors = theme.tokens.color;
  let value = colors[key];
  const seen = new Set<string>();
  while (value?.startsWith('var(')) {
    const alias = /^var\((--rt-[^)]+)\)$/.exec(value)?.[1] as `--rt-${string}` | undefined;
    if (!alias || seen.has(alias)) break;
    seen.add(alias);
    value = colors[alias];
  }
  if (!value?.startsWith('oklch(')) throw new Error(`Theme ${theme.name} has no directly measurable ${key}`);
  return value;
}

export function themeContrastViolations(theme: Theme): readonly ContrastViolation[] {
  const violations: ContrastViolation[] = [];
  const check = (item: string, foreground: `--rt-${string}`, background: `--rt-${string}`, floor: number) => {
    const ratio = contrastRatio(resolved(theme, foreground), resolved(theme, background));
    if (ratio + 1e-6 < floor) violations.push({ item, ratio, floor });
  };
  const checkValues = (item: string, foreground: string, background: string, floor: number) => {
    const ratio = contrastRatio(foreground, background);
    if (ratio + 1e-6 < floor) violations.push({ item, ratio, floor });
  };
  const textBackgrounds = ['--rt-bg', '--rt-surface', '--rt-surface-2', '--rt-chrome', '--rt-hover'] as const;
  const readable = ['--rt-text', '--rt-text-secondary', '--rt-text-tertiary', '--rt-accent-300', '--rt-axis-x-300', '--rt-axis-y-300', '--rt-danger-300', '--rt-info-300'] as const;
  for (const foreground of readable) for (const background of textBackgrounds) check(`${foreground} on ${background}`, foreground, background, 4.5);
  for (const background of ['--rt-bg', '--rt-surface', '--rt-surface-2', '--rt-chrome'] as const) {
    check(`strong boundary on ${background}`, '--rt-boundary-strong', background, 3);
    check(`focus on ${background}`, '--rt-focus', background, 3);
  }
  for (const state of ['--rt-run', '--rt-wait', '--rt-done', '--rt-fail', '--rt-info-300'] as const) for (const background of textBackgrounds) check(`${state} boundary on ${background}`, state, background, 3);
  for (const background of ['--rt-accent-600', '--rt-primary-hover', '--rt-accent-700'] as const) checkValues(`primary label on ${background}`, 'oklch(97% 0.02 292)', resolved(theme, background), 4.5);
  // Part AM — REQ-SHELL-098's terminal tokens (ADR-0047, ADR-0050 note): every ink at the text floor on the terminal
  // ground, black at the boundary floor (it is used as a foreground only over a coloured cell, and as a grey it must
  // still separate from the ground).
  for (const name of TERM_ANSI_NAMES) check(`terminal ${name} on terminal ground`, `--rt-term-${name}`, '--rt-term-bg', name === 'black' ? 3 : 4.5);
  check('terminal foreground on terminal ground', '--rt-term-fg', '--rt-term-bg', 4.5);
  check('terminal cursor on terminal ground', '--rt-term-cursor', '--rt-term-bg', 3);
  // REQ-SHELL-145 measures each token "against every background the token is actually painted on".
  // OQ-56, ruled 2026-09-18: the adopted token rose from 52% to 58%, so the narrow ground-only check
  // below is widened to every background the token is painted on in the same commit as the token.
  for (const background of textBackgrounds) check('disabled text on disabled surface', '--rt-text-disabled', background, 3);
  const enabled = contrastRatio(resolved(theme, '--rt-text'), resolved(theme, '--rt-bg'));
  const disabled = contrastRatio(resolved(theme, '--rt-text-disabled'), resolved(theme, '--rt-bg'));
  if (disabled >= enabled / 2) violations.push({ item: 'disabled text dimness', ratio: disabled, floor: enabled / 2 });
  return violations;
}

export function assertThemeContrast(theme: Theme): void {
  const failures = themeContrastViolations(theme);
  if (failures.length > 0) throw new Error(`${theme.name}: ${failures.map((v) => `${v.item} ${v.ratio.toFixed(2)} < ${v.floor.toFixed(2)}`).join('; ')}`);
}
