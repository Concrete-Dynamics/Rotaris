import { contrastRatio, oklchToSrgb, parseOklch, raiseLightness, srgbToHex, type Theme } from '@rotaris/contracts';
import { assertDistinctRoleColours } from '../theme.js';
import type { SlashRegistry } from './types.js';

/**
 * REQ-CHAT-027 — live highlighting of the leading `/name` token while the user types a single-line slash command.
 *
 * Three states, differing in BOTH colour and weight: `resolved` (the token exactly names a registered command) in the
 * readable accent shade, bold; `partial` (a prefix of at least one registered name, not an exact name) in that shade
 * blended toward the surface behind it, not bold; `unknown` (no command matches) in the `fail` state colour, bold.
 * Weight therefore tells partial from the other two without colour. Argument text is drawn in the secondary text
 * colour. Multi-line text and the `/ ` escape receive no highlighting (`null`).
 *
 * Availability plays no part: a command that is registered but unavailable is still a resolved name.
 */
export type SlashTokenState = 'resolved' | 'partial' | 'unknown';

export function slashTokenState(text: string, registry: SlashRegistry): SlashTokenState | null {
  if (!text.startsWith('/') || text.includes('\n') || text.includes('\r')) return null;
  if (text.length > 1 && /\s/.test(text.charAt(1))) return null;
  const name = (/^\/(\S*)/.exec(text)?.[1] ?? '').toLowerCase();
  if (registry.lookup(name) !== undefined) return 'resolved';
  return registry.list().some((c) => c.name.startsWith(name)) ? 'partial' : 'unknown';
}

/** The two spans the overlay draws: the `/name` token and everything after it (whitespace included, so the text mirrors the field exactly). */
export function slashTokenSplit(text: string): { readonly token: string; readonly rest: string } {
  const match = /^(\/\S*)([\s\S]*)$/.exec(text);
  return match ? { token: match[1]!, rest: match[2]! } : { token: '', rest: text };
}

/** The four colours REQ-CHAT-027 names, each already corrected to clear 4.5:1 on the surface it is painted on. */
export interface SlashRoleColours {
  readonly resolved: string;
  readonly partial: string;
  readonly unknown: string;
  readonly argument: string;
  /** The surface the four were measured against — the composer input's own ground. */
  readonly surface: string;
}

/** A theme token, aliases followed until a measurable OKLCH literal is reached (the same walk `static-contrast.ts` makes). */
function resolvedToken(theme: Theme, key: `--rt-${string}`): string {
  const colours = theme.tokens.color;
  let value = colours[key];
  const seen = new Set<string>();
  while (value?.startsWith('var(')) {
    const alias = /^var\((--rt-[^)]+)\)$/.exec(value)?.[1] as `--rt-${string}` | undefined;
    if (!alias || seen.has(alias)) break;
    seen.add(alias);
    value = colours[alias];
  }
  if (!value?.startsWith('oklch(')) throw new Error(`Theme ${theme.name} has no directly measurable ${key}`);
  return value;
}

/** Five decimals of a percent for lightness: enough that the settle step above a floor is representable in the string. */
const formatOklch = (l: number, c: number, h: number): string => `oklch(${Math.round(l * 10_000_000) / 100_000}% ${Math.round(c * 1000) / 1000} ${h})`;

/**
 * REQ-CHAT-027's "blended toward the surface behind it": a mix in OKLCH — lightness and chroma move toward the
 * surface's, the hue stays the accent's, so the result reads as the accent washed out rather than as another hue.
 */
export function blendToward(colour: string, surface: string, amount: number): string {
  const a = parseOklch(colour);
  const b = parseOklch(surface);
  return formatOklch(a.l + (b.l - a.l) * amount, a.c + (b.c - a.c) * amount, a.h);
}

/** The mirror image of `raiseLightness` for a light surface: hue and chroma kept, lightness lowered until the floor is reached. */
export function lowerLightness(colour: string, floor: number, against: string): string {
  const parsed = parseOklch(colour);
  if (contrastRatio(parsed, against) >= floor) return colour;
  let low = 0.02;
  let high = parsed.l;
  for (let i = 0; i < 24; i += 1) {
    const middle = (low + high) / 2;
    if (contrastRatio({ ...parsed, l: middle }, against) >= floor) low = middle;
    else high = middle;
  }
  return formatOklch(low, parsed.c, parsed.h);
}

/**
 * REQ-CHAT-027: "lightened or darkened until it reaches a contrast ratio of at least 4.5:1" — the direction is the theme's.
 *
 * **Defect forty-six, found on this part's first execution (ADR-0050's note):** `raiseLightness` bisects to the floor and
 * then ROUNDS the lightness to a thousandth of a percent, and the rounding can fall on the dark side of the floor — the
 * default theme's partial shade came back at 4.49997:1, which `themeContrastViolations`' own 1e-6 tolerance would
 * report as a violation. The corrector is `contracts`' and is not this part's to edit; the settle step below walks the
 * lightness one thousandth of a percent further from the surface until the measured ratio clears the floor, so nothing
 * this module returns is a hair short of what it claims. The same guard covers `lowerLightness`, whose rounding can
 * err the same way in the other direction.
 */
export function ensureContrast(colour: string, surface: string, dark: boolean, floor = 4.5): string {
  const corrected = dark ? raiseLightness(colour, floor, surface) : lowerLightness(colour, floor, surface);
  let settled = parseOklch(corrected);
  for (let i = 0; i < 200 && contrastRatio(settled, surface) < floor; i += 1) settled = { ...settled, l: settled.l + (dark ? 0.00001 : -0.00001) };
  return settled.l === parseOklch(corrected).l ? corrected : formatOklch(settled.l, settled.c, settled.h);
}

const rendered = (colour: string): string => srgbToHex(oklchToSrgb(parseOklch(colour)));

/**
 * REQ-CHAT-027's four roles from exactly the theme roles it names: resolved from the readable accent shade
 * (`--rt-accent-300`, `docs/design/README.md` §1.2), partial from that shade blended toward the surface, unknown from the
 * `fail` state colour (`--rt-fail`), argument from the secondary text colour (`--rt-text-secondary`). The surface is the
 * composer input's own ground — the design's `.input` paints on `--rt-bg`. Each is then lightened (a dark theme) or
 * darkened (a light one) until it clears 4.5:1, and no two may render to the same colour; where the correction has made
 * two coincide, the partial shade is stepped further from the accent until they differ, which keeps it at or above the
 * floor because every step moves it further from the surface.
 */
export function slashRoleColours(theme: Theme, surfaceKey: `--rt-${string}` = '--rt-bg'): SlashRoleColours {
  const surface = resolvedToken(theme, surfaceKey);
  const accent = resolvedToken(theme, '--rt-accent-300');
  const fail = resolvedToken(theme, '--rt-fail');
  const secondary = resolvedToken(theme, '--rt-text-secondary');
  const resolved = ensureContrast(accent, surface, theme.dark);
  const unknown = ensureContrast(fail, surface, theme.dark);
  const argument = ensureContrast(secondary, surface, theme.dark);
  let amount = 0.5;
  let partial = ensureContrast(blendToward(accent, surface, amount), surface, theme.dark);
  const taken = () => new Set([resolved, unknown, argument].map(rendered));
  for (let i = 0; i < 20 && taken().has(rendered(partial)); i += 1) {
    // Step the blend back toward the accent (less washed out) and, failing that, past it; every candidate is re-floored.
    amount = Math.max(0, amount - 0.05);
    const base = parseOklch(blendToward(accent, surface, amount));
    partial = ensureContrast(formatOklch(Math.min(0.98, base.l + (theme.dark ? 0.02 * i : -0.02 * i)), base.c, base.h), surface, theme.dark);
  }
  assertDistinctRoleColours([resolved, partial, unknown, argument].map(rendered));
  return { resolved, partial, unknown, argument, surface };
}

/** The contrast each role actually clears on its surface — measured, for the tests and the proof, never assumed. */
export function slashRoleContrast(colours: SlashRoleColours): Readonly<Record<'resolved' | 'partial' | 'unknown' | 'argument', number>> {
  return {
    resolved: contrastRatio(colours.resolved, colours.surface),
    partial: contrastRatio(colours.partial, colours.surface),
    unknown: contrastRatio(colours.unknown, colours.surface),
    argument: contrastRatio(colours.argument, colours.surface),
  };
}
