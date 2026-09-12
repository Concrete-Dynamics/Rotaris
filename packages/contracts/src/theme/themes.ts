export const THEME_NAMES = ['rotaris-dim', 'nocturne', 'high-contrast'] as const;
export type ThemeName = (typeof THEME_NAMES)[number];
export type ThemeTokenGroup = Readonly<Record<`--rt-${string}`, string>>;

export interface ThemeTokens {
  readonly color: ThemeTokenGroup;
  readonly spacing: ThemeTokenGroup;
  readonly radius: ThemeTokenGroup;
  readonly size: ThemeTokenGroup;
  readonly typography: ThemeTokenGroup;
  readonly motion: ThemeTokenGroup;
  readonly elevation: ThemeTokenGroup;
}

export interface Theme {
  readonly name: ThemeName;
  readonly label: string;
  readonly description: string;
  readonly dark: boolean;
  readonly tokens: ThemeTokens;
}

const color = {
  '--rt-bg': 'oklch(21% 0 0)', '--rt-surface': 'oklch(25% 0 0)', '--rt-surface-2': 'oklch(29% 0 0)', '--rt-chrome': 'oklch(23% 0 0)', '--rt-hover': 'oklch(30% 0 0)', '--rt-overlay': 'oklch(12% 0 0 / 0.72)',
  '--rt-border': 'oklch(31% 0 0)', '--rt-border-strong': 'oklch(40% 0 0)', '--rt-border-panel': 'oklch(28% 0 0)', '--rt-focus': 'oklch(83% 0.10 292)', '--rt-divider': 'color-mix(in oklch, var(--rt-text) 9%, transparent)',
  // `--rt-text-disabled` is transcribed from the adopted `docs/design/system/tokens/colors.css` and is
  // NOT an agent's to correct: at 52% it clears 3.22:1 on `--rt-bg` and 2.48:1 on `--rt-hover`, so
  // REQ-SHELL-145's 3:1 disabled floor is met on the page ground and missed on every card, panel and
  // hovered row. `pnpm theme-proof` measures 2.90:1 on a card at every scale (2026-09-12, the first
  // rendered settlement of `docs/design/README.md` §5 item 1, which had named this token as the one
  // specifically at risk). Raising it to 58% would clear every surface and stay under half the enabled
  // ratio — and would be the product drifting from approved design material, which is the owner's
  // call, not this file's. Recorded as OQ-56; two tests pin the shortfall so it cannot be lost.
  '--rt-text': 'oklch(94% 0 0)', '--rt-text-secondary': 'oklch(80% 0 0)', '--rt-text-tertiary': 'oklch(68% 0 0)', '--rt-text-disabled': 'oklch(52% 0 0)',
  '--rt-accent-100': 'oklch(96% 0.030 292)', '--rt-accent-200': 'oklch(91% 0.060 292)', '--rt-accent-300': 'oklch(83% 0.100 292)', '--rt-accent-400': 'oklch(72% 0.135 292)', '--rt-accent-500': 'oklch(59% 0.160 292)', '--rt-accent-600': 'oklch(50% 0.150 292)', '--rt-accent-700': 'oklch(42% 0.125 292)', '--rt-accent-800': 'oklch(33% 0.090 292)', '--rt-accent-900': 'oklch(24% 0.058 292)', '--rt-accent': 'var(--rt-accent-500)', '--rt-accent-tint-07': 'oklch(59% 0.160 292 / 0.09)', '--rt-accent-tint-10': 'oklch(59% 0.160 292 / 0.13)', '--rt-accent-tint-14': 'oklch(59% 0.160 292 / 0.18)',
  '--rt-axis-x-100': 'oklch(96% 0.045 92)', '--rt-axis-x-200': 'oklch(90% 0.088 90)', '--rt-axis-x-300': 'oklch(82% 0.132 88)', '--rt-axis-x-400': 'oklch(74% 0.168 87)', '--rt-axis-x-500': 'oklch(67% 0.190 86)', '--rt-axis-x-600': 'oklch(57% 0.172 84)', '--rt-axis-x-700': 'oklch(46% 0.146 82)', '--rt-axis-x-800': 'oklch(34% 0.106 80)', '--rt-axis-x-900': 'oklch(23% 0.066 78)',
  '--rt-axis-y-100': 'oklch(96% 0.045 165)', '--rt-axis-y-200': 'oklch(89% 0.088 165)', '--rt-axis-y-300': 'oklch(80% 0.136 165)', '--rt-axis-y-400': 'oklch(72% 0.172 165)', '--rt-axis-y-500': 'oklch(65% 0.188 165)', '--rt-axis-y-600': 'oklch(55% 0.168 165)', '--rt-axis-y-700': 'oklch(44% 0.136 165)', '--rt-axis-y-800': 'oklch(33% 0.100 165)', '--rt-axis-y-900': 'oklch(22% 0.066 165)',
  '--rt-axis-z-100': 'var(--rt-accent-100)', '--rt-axis-z-300': 'var(--rt-accent-300)', '--rt-axis-z-500': 'var(--rt-accent-500)', '--rt-axis-z-700': 'var(--rt-accent-700)', '--rt-axis-z-800': 'var(--rt-accent-800)', '--rt-axis-z-900': 'var(--rt-accent-900)',
  '--rt-danger-300': 'oklch(82% 0.120 25)', '--rt-danger-500': 'oklch(64% 0.200 25)', '--rt-danger-700': 'oklch(46% 0.165 25)', '--rt-danger-800': 'oklch(33% 0.115 25)', '--rt-danger': 'var(--rt-danger-500)', '--rt-info-300': 'oklch(84% 0.080 210)', '--rt-info-500': 'oklch(70% 0.130 210)', '--rt-info-700': 'oklch(48% 0.100 210)',
  '--rt-viz-1': 'var(--rt-accent-400)', '--rt-viz-2': 'var(--rt-axis-y-400)', '--rt-viz-3': 'var(--rt-axis-x-400)', '--rt-viz-4': 'oklch(75% 0.100 205)', '--rt-viz-5': 'oklch(74% 0.130 125)', '--rt-viz-6': 'oklch(73% 0.125 350)', '--rt-viz-grid': 'color-mix(in oklch, var(--rt-text) 10%, transparent)',
  '--rt-run': 'var(--rt-axis-y-500)', '--rt-wait': 'var(--rt-axis-x-500)', '--rt-done': 'var(--rt-axis-z-500)', '--rt-fail': 'var(--rt-danger-500)', '--rt-ok': 'var(--rt-axis-y-500)', '--rt-warn': 'var(--rt-axis-x-500)',
  '--rt-diff-add': 'var(--rt-axis-y-300)', '--rt-diff-add-bg': 'oklch(65% 0.188 165 / 0.10)', '--rt-diff-del': 'var(--rt-danger-300)', '--rt-diff-del-bg': 'oklch(64% 0.200 25 / 0.10)', '--rt-diff-meta': 'var(--rt-info-300)',
  '--rt-fill-accent': 'oklch(59% 0.160 292 / 0.17)', '--rt-fill-accent-ink': 'var(--rt-accent-200)', '--rt-fill-x': 'oklch(67% 0.190 86 / 0.16)', '--rt-fill-x-ink': 'var(--rt-axis-x-200)', '--rt-fill-y': 'oklch(65% 0.188 165 / 0.16)', '--rt-fill-y-ink': 'var(--rt-axis-y-200)', '--rt-fill-danger': 'oklch(64% 0.200 25 / 0.16)', '--rt-fill-danger-ink': 'var(--rt-danger-300)',
  '--rt-boundary-strong': 'oklch(60% 0 0)', '--rt-primary-hover': 'oklch(46% 0.140 292)',
} as const satisfies ThemeTokenGroup;

const spacing = {
  '--rt-space-1': '4px', '--rt-space-2': '8px', '--rt-space-3': '12px', '--rt-space-4': '16px', '--rt-space-5': '20px', '--rt-space-6': '24px', '--rt-space-8': '32px', '--rt-space-10': '40px', '--rt-space-12': '48px', '--rt-space-16': '64px', '--rt-space-24': '96px', '--rt-grid-unit': '32px',
} as const satisfies ThemeTokenGroup;
const radius = { '--rt-radius-sm': '5px', '--rt-radius-md': '8px', '--rt-radius-lg': '14px', '--rt-radius-pill': '999px' } as const satisfies ThemeTokenGroup;
// UIR-006: the two control heights, DERIVED from the adopted sheet rather than invented — its `.btn`
// (7 px padding, `--rt-text-sm` at 1.2, a hairline border) resolves to 32 and its `.btn-compact`
// (4 px, `--rt-text-xs`) to 24, and `.input` already declares `min-height: 32px` outright. Naming them
// is what stops a view from reaching for a third: the 2026-09-12 review measured TEN distinct
// interactive heights, with one `Select` drawn at three of them.
const size = { '--rt-rail-width': '68px', '--rt-nav-item-width': '54px', '--rt-status-dot-size': '6px', '--rt-focus-ring-width': '2px', '--rt-hairline-width': '1px', '--rt-notice-rule-width': '3px', '--rt-title-bar-height': '44px', '--rt-status-bar-height': '26px', '--rt-icon-size': '17px', '--rt-rail-label-size': '9px', '--rt-control-height': '32px', '--rt-control-height-compact': '24px', '--rt-prose-measure': '340px', '--rt-label-column': '120px', '--rt-field-min': '140px', '--rt-tick-width': '2px' } as const satisfies ThemeTokenGroup;
// `--rt-label-column` and `--rt-field-min` give a settings form ONE axis: a label column wide enough
// for the longest label in the product's forms, and a field that never shrinks below a readable width
// (UIR-010 — two selects in one card whose left edges differed by exactly the length of their labels,
// and one that stretched to 729.2 px to hold the word "single").
// `--rt-prose-measure` is the ONE width the adopted sheet states for a block of secondary text —
// `system/components.css`'s `.empty-state-hint { max-width: 340px }`. Named so that prose which is
// not an empty-state hint can be bounded by the material's own figure instead of a fresh one: the
// 2026-09-12 review measured engine prose running the full 1236 px of the Requirements view (UIR-011).
const typography = {
  '--rt-font-display': "'Space Grotesk',system-ui,sans-serif", '--rt-font-body': "'Manrope',system-ui,sans-serif", '--rt-font-mono': "'JetBrains Mono','Cascadia Mono',Menlo,Consolas,monospace", '--rt-weight-display': '500', '--rt-weight-body': '400', '--rt-weight-medium': '500',
  '--rt-text-2xs': '10px', '--rt-text-xs': '11px', '--rt-text-sm': '12px', '--rt-text-base': '14px', '--rt-text-md': '16px', '--rt-h6': '11px', '--rt-h5': '16px', '--rt-h4': '20px', '--rt-h3': '24px', '--rt-h2': '32px', '--rt-h1': '44px', '--rt-tracking-tight': '-0.022em', '--rt-tracking-wide': '0.05em', '--rt-tracking-label': '0.075em', '--rt-leading-tight': '1.12', '--rt-leading-body': '1.62',
} as const satisfies ThemeTokenGroup;
const motion = { '--rt-ease': 'cubic-bezier(.4,0,.2,1)', '--rt-ease-out': 'cubic-bezier(0,0,.2,1)', '--rt-ease-in': 'cubic-bezier(.4,0,1,1)', '--rt-duration-fast': '90ms', '--rt-duration': '160ms', '--rt-duration-slow': '240ms', '--rt-shift': '3px', /* REQ-NOTIFY-022 (Part V): the acknowledgement's travel and its two durations are motion tokens of the theme, read at animation start (ADR-0050); the default theme's figures are the requirement's. */ '--rt-ack-travel': '12px', '--rt-ack-enter': '160ms', '--rt-ack-exit': '120ms' } as const satisfies ThemeTokenGroup;
const elevation = { '--rt-shadow-sm': '0 0 0 1px var(--rt-border)', '--rt-shadow-md': '0 0 0 1px var(--rt-border),0 6px 16px oklch(8% 0 0 / 0.44)', '--rt-shadow-lg': '0 0 0 1px var(--rt-border),0 18px 40px oklch(8% 0 0 / 0.54)' } as const satisfies ThemeTokenGroup;

/**
 * Part AM — REQ-SHELL-098: the terminal's ground, ink, cursor, selection and the sixteen ANSI colours as theme tokens
 * (ADR-0047, ADR-0050). Additions to each palette, never a change to an adopted key. The hues ride the language's
 * own: red on danger 25, green on axis Y 165, yellow on axis X 86, blue and magenta either side of the accent's
 * 292, cyan on info 210; the ground sits one level below `--rt-bg` (the mockup's live terminal block draws a deeper
 * ground than the view's). Every value is a direct OKLCH so both the static check below and the grid's run-time
 * resolver can read it. Floors: every ink ≥ 4.5:1 on `--rt-term-bg`, black ≥ 3:1 (it is a grey, never the ground).
 */
const TERM_DIM = {
  '--rt-term-bg': 'oklch(16% 0 0)', '--rt-term-fg': 'oklch(90% 0 0)', '--rt-term-cursor': 'oklch(90% 0 0)', '--rt-term-selection': 'oklch(59% 0.160 292 / 0.35)',
  '--rt-term-black': 'oklch(50% 0 0)', '--rt-term-red': 'oklch(72% 0.180 25)', '--rt-term-green': 'oklch(75% 0.160 165)', '--rt-term-yellow': 'oklch(78% 0.160 86)', '--rt-term-blue': 'oklch(74% 0.130 262)', '--rt-term-magenta': 'oklch(76% 0.140 320)', '--rt-term-cyan': 'oklch(77% 0.110 210)', '--rt-term-white': 'oklch(86% 0 0)',
  '--rt-term-bright-black': 'oklch(64% 0 0)', '--rt-term-bright-red': 'oklch(82% 0.130 25)', '--rt-term-bright-green': 'oklch(85% 0.130 165)', '--rt-term-bright-yellow': 'oklch(88% 0.120 86)', '--rt-term-bright-blue': 'oklch(83% 0.100 262)', '--rt-term-bright-magenta': 'oklch(85% 0.110 320)', '--rt-term-bright-cyan': 'oklch(86% 0.090 210)', '--rt-term-bright-white': 'oklch(97% 0 0)',
} as const satisfies ThemeTokenGroup;
const TERM_NOCTURNE = {
  ...TERM_DIM,
  '--rt-term-bg': 'oklch(11% 0 0)', '--rt-term-black': 'oklch(48% 0 0)', '--rt-term-bright-black': 'oklch(62% 0 0)', '--rt-term-selection': 'oklch(53% 0.160 292 / 0.38)',
} as const satisfies ThemeTokenGroup;
const TERM_HIGH_CONTRAST = {
  '--rt-term-bg': 'oklch(5% 0 0)', '--rt-term-fg': 'oklch(98% 0 0)', '--rt-term-cursor': 'oklch(98% 0 0)', '--rt-term-selection': 'oklch(70% 0.140 292 / 0.45)',
  '--rt-term-black': 'oklch(55% 0 0)', '--rt-term-red': 'oklch(82% 0.150 25)', '--rt-term-green': 'oklch(85% 0.140 165)', '--rt-term-yellow': 'oklch(88% 0.140 86)', '--rt-term-blue': 'oklch(84% 0.110 262)', '--rt-term-magenta': 'oklch(85% 0.120 320)', '--rt-term-cyan': 'oklch(87% 0.100 210)', '--rt-term-white': 'oklch(93% 0 0)',
  '--rt-term-bright-black': 'oklch(70% 0 0)', '--rt-term-bright-red': 'oklch(90% 0.100 25)', '--rt-term-bright-green': 'oklch(92% 0.100 165)', '--rt-term-bright-yellow': 'oklch(94% 0.090 86)', '--rt-term-bright-blue': 'oklch(91% 0.080 262)', '--rt-term-bright-magenta': 'oklch(92% 0.080 320)', '--rt-term-bright-cyan': 'oklch(93% 0.070 210)', '--rt-term-bright-white': 'oklch(99% 0 0)',
} as const satisfies ThemeTokenGroup;
/** The sixteen ANSI names in SGR order 30–37 then 90–97, for the grid's theme mapping and the static check. */
export const TERM_ANSI_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'bright-black', 'bright-red', 'bright-green', 'bright-yellow', 'bright-blue', 'bright-magenta', 'bright-cyan', 'bright-white'] as const;

const shared = { spacing, radius, size, typography, motion, elevation } as const;
const palette = (overrides: Partial<ThemeTokenGroup>): ThemeTokenGroup => ({
  ...color,
  ...overrides,
  ...(overrides['--rt-bg'] === 'oklch(14% 0 0)' ? { '--rt-text-disabled': 'oklch(60% 0 0)' } : {}),
  ...(overrides['--rt-bg'] === 'oklch(14% 0 0)' ? { '--rt-boundary-strong': 'oklch(55% 0 0)' } : {}),
  ...(overrides['--rt-bg'] === 'oklch(8% 0 0)' ? { '--rt-text-disabled': 'oklch(62% 0 0)', '--rt-boundary-strong': 'oklch(70% 0 0)' } : {}),
});

export const THEMES: readonly Theme[] = [
  { name: 'rotaris-dim', label: 'Rotaris Dim', description: 'The default dark theme at moderate contrast, intended for long working sessions.', dark: true, tokens: { color: { ...color, ...TERM_DIM }, ...shared } },
  { name: 'nocturne', label: 'Nocturne', description: 'A darker theme with deeper backgrounds for work in low ambient light.', dark: true, tokens: { color: palette({ '--rt-bg': 'oklch(14% 0 0)', '--rt-surface': 'oklch(18% 0 0)', '--rt-surface-2': 'oklch(22% 0 0)', '--rt-chrome': 'oklch(16% 0 0)', '--rt-hover': 'oklch(24% 0 0)', '--rt-overlay': 'oklch(6% 0 0 / 0.78)', '--rt-border': 'oklch(29% 0 0)', '--rt-border-strong': 'oklch(55% 0 0)', '--rt-border-panel': 'oklch(25% 0 0)', '--rt-text-secondary': 'oklch(83% 0 0)', '--rt-accent-500': 'oklch(53% 0.160 292)', '--rt-accent-600': 'oklch(44% 0.150 292)', '--rt-accent-700': 'oklch(35% 0.125 292)', '--rt-run': 'var(--rt-axis-y-300)', '--rt-wait': 'var(--rt-axis-x-300)', '--rt-done': 'var(--rt-accent-300)', '--rt-fail': 'var(--rt-danger-300)', '--rt-ok': 'var(--rt-axis-y-300)', '--rt-warn': 'var(--rt-axis-x-300)', ...TERM_NOCTURNE }), ...shared } },
  { name: 'high-contrast', label: 'High Contrast', description: 'Contrast well beyond the accessibility floors, for use when the other themes are hard to read.', dark: true, tokens: { color: palette({ '--rt-bg': 'oklch(8% 0 0)', '--rt-surface': 'oklch(12% 0 0)', '--rt-surface-2': 'oklch(17% 0 0)', '--rt-chrome': 'oklch(10% 0 0)', '--rt-hover': 'oklch(21% 0 0)', '--rt-overlay': 'oklch(3% 0 0 / 0.84)', '--rt-border': 'oklch(48% 0 0)', '--rt-border-strong': 'oklch(70% 0 0)', '--rt-border-panel': 'oklch(42% 0 0)', '--rt-focus': 'oklch(94% 0.08 292)', '--rt-text': 'oklch(99% 0 0)', '--rt-text-secondary': 'oklch(92% 0 0)', '--rt-text-tertiary': 'oklch(82% 0 0)', '--rt-text-disabled': 'oklch(55% 0 0)', '--rt-accent-300': 'oklch(91% 0.075 292)', '--rt-accent-500': 'oklch(53% 0.160 292)', '--rt-accent-600': 'oklch(44% 0.150 292)', '--rt-accent-700': 'oklch(35% 0.125 292)', '--rt-axis-x-300': 'oklch(91% 0.105 88)', '--rt-axis-y-300': 'oklch(90% 0.105 165)', '--rt-danger-300': 'oklch(91% 0.095 25)', '--rt-info-300': 'oklch(92% 0.065 210)', '--rt-run': 'var(--rt-axis-y-300)', '--rt-wait': 'var(--rt-axis-x-300)', '--rt-done': 'var(--rt-accent-300)', '--rt-fail': 'var(--rt-danger-300)', '--rt-ok': 'var(--rt-axis-y-300)', '--rt-warn': 'var(--rt-axis-x-300)', ...TERM_HIGH_CONTRAST }), ...shared } },
] as const;

export const DEFAULT_THEME: ThemeName = 'rotaris-dim';
export function isThemeName(value: string): value is ThemeName { return THEME_NAMES.includes(value as ThemeName); }
export function resolveTheme(value: string | null | undefined): Theme { return THEMES.find((theme) => theme.name === value) ?? THEMES[0]!; }

export function themeCustomProperties(theme: Theme): Readonly<Record<string, string>> {
  return Object.assign({}, ...Object.values(theme.tokens));
}
