import { oklchToSrgb, parseOklch, srgbToHex, TERM_ANSI_NAMES } from '@rotaris/contracts';
import { useEffect, useState } from 'react';

/**
 * Part AM — REQ-SHELL-098 / ADR-0050: the grid takes its colours from the theme's `--rt-term-*` tokens and nothing
 * else. xterm wants colour strings it can parse (hex, rgb) while the tokens are OKLCH text on the document root, so
 * this file resolves the token to a hex value at apply time and again on every theme change. No literal colour
 * appears here (`tools/check-theme-colours.mjs` fails the lint on one); the values are the theme's.
 */
export interface TerminalColours {
  readonly background: string;
  readonly foreground: string;
  readonly cursor: string;
  readonly cursorAccent: string;
  readonly selectionBackground: string;
  readonly selectionInactiveBackground: string;
  readonly black: string; readonly red: string; readonly green: string; readonly yellow: string;
  readonly blue: string; readonly magenta: string; readonly cyan: string; readonly white: string;
  readonly brightBlack: string; readonly brightRed: string; readonly brightGreen: string; readonly brightYellow: string;
  readonly brightBlue: string; readonly brightMagenta: string; readonly brightCyan: string; readonly brightWhite: string;
}

export interface TerminalFont { readonly family: string; readonly sizePx: number }

/** The computed value of one custom property on the root — `var()` references already substituted. */
export function readToken(root: Element, name: string): string {
  return getComputedStyle(root).getPropertyValue(name).trim();
}

/** An OKLCH token as `#rrggbb` or `#rrggbbaa`; any other syntax through the engine's own colour parser. */
export function toHex(css: string): string | null {
  const text = css.trim();
  if (text === '') return null;
  if (/^oklch\(/i.test(text)) {
    try {
      const colour = parseOklch(text);
      const hex = srgbToHex(oklchToSrgb(colour));
      return colour.alpha === undefined ? hex : `${hex}${Math.round(colour.alpha * 255).toString(16).padStart(2, '0')}`;
    } catch { /* fall through to the engine */ }
  }
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(text)) return text.toLowerCase();
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
  const context = canvas?.getContext('2d') ?? null;
  if (!context) return null;
  context.fillStyle = text;
  const normalised = String(context.fillStyle);
  if (/^#[0-9a-f]{6}$/i.test(normalised)) return normalised.toLowerCase();
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(normalised);
  if (!rgba) return null;
  const byte = (v: string) => Math.round(Number(v)).toString(16).padStart(2, '0');
  const alpha = rgba[4] === undefined ? '' : Math.round(Number(rgba[4]) * 255).toString(16).padStart(2, '0');
  return `#${byte(rgba[1]!)}${byte(rgba[2]!)}${byte(rgba[3]!)}${alpha}`;
}

const ANSI_KEYS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'] as const;

/** REQ-SHELL-098: the sixteen ANSI colours, the ground, the ink, the cursor and the selection colour, from the tokens. */
export function resolveTerminalColours(root: Element): TerminalColours {
  const token = (name: string): string => {
    const hex = toHex(readToken(root, name));
    if (hex === null) throw new Error(`Terminal token ${name} is not declared on the document root`);
    return hex;
  };
  const background = token('--rt-term-bg');
  const foreground = token('--rt-term-fg');
  const ansi = Object.fromEntries(ANSI_KEYS.map((key, i) => [key, token(`--rt-term-${TERM_ANSI_NAMES[i]!}`)])) as Record<(typeof ANSI_KEYS)[number], string>;
  return {
    background, foreground,
    // ADR-0047 consequence 1, stated: xterm's own cursor is themed to the ground so it paints nothing visible, and the
    // grid draws REQ-SHELL-098's cursor itself (filled while armed, hollow while read-only, only under the three
    // conditions). A library upgrade that starts ignoring `cursor` would show a second cursor — the proof samples it.
    cursor: background, cursorAccent: foreground,
    selectionBackground: token('--rt-term-selection'), selectionInactiveBackground: token('--rt-term-selection'),
    ...ansi,
  };
}

/** REQ-SHELL-100: cell size derives from the theme's monospace face. */
export function resolveTerminalFont(root: Element): TerminalFont {
  const family = readToken(root, '--rt-font-mono') || 'monospace';
  const size = Number.parseFloat(readToken(root, '--rt-text-sm'));
  return { family, sizePx: Number.isFinite(size) && size > 0 ? size : 12 };
}

/**
 * A counter that advances whenever the document root's theme changes (`applyTheme` writes `data-theme` and the
 * custom properties in one synchronous update). The grid re-resolves its colours and re-measures its cell on it.
 */
export function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const root = document.documentElement;
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((m) => m.attributeName === 'data-theme' || m.attributeName === 'style')) setVersion((v) => v + 1);
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    return () => observer.disconnect();
  }, []);
  return version;
}
