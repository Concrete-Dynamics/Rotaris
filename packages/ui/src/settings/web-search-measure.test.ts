import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * C3 and C7 on the guided `Set up web search` card (UI review of PR #76, 2026-11-09).
 *
 * The review measured the card's key field at **1003.36 px** at 1400×900 (603 px at 1000×680) — the card's whole
 * content width, for a value a short key fills — while `--rt-field-min` is **140 px**; and its prose at the same
 * 1003.36 px, about **82 characters per line**, against `--rt-prose-measure`'s **340 px** (UIR-010, UIR-011's
 * classes). The scope select beside the field already carried the idiom (`width: max-content`).
 *
 * These cases read `shell.css`, as `layout-regression.test.ts` and `overview-view.test.ts` do: the numbers are what
 * the stylesheet decides, and a rule that keeps the tokens but drifts from them turns these red.
 */
const css = readFileSync(new URL('../shell.css', import.meta.url), 'utf8');

/** The rule bodies exactly this selector gives, joined (the helper `layout-regression.test.ts` uses). */
function rule(selector: string): string {
  return [...css.matchAll(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]+)\\}`, 'g'))]
    .map((match) => match[1] ?? '').join(' ');
}

describe('C3 — the guided card\'s key field is sized from the token, never from the pane', () => {
  it('holds `--rt-field-min` as its floor and `max-content` as its width, as the scope select beside it does', () => {
    const field = rule('[data-mcp-websearch-setup] .settings__key-field');
    expect(field).toContain('width: max-content');
    expect(field).toContain('min-width: var(--rt-field-min)');
    // No literal governs the width a second time: the token is the only floor, the sheet's `.input` the ceiling.
    expect(field).not.toMatch(/\d+px/);
    // The idiom is the codebase's, not this card's invention — the scope select carries the same two declarations.
    expect(rule('.settings__select')).toContain('width: max-content');
  });

  it('ships no key-field width of its own in the JSX, so the stylesheet is the one place the field is sized', () => {
    const source = readFileSync(new URL('./McpSettings.tsx', import.meta.url), 'utf8');
    expect(source).toContain('className="input settings__key-field"');
  });
});

describe('C7 — the guided card\'s prose holds `--rt-prose-measure`, and its code does not', () => {
  it('caps the card\'s paragraphs and hint lines at the measure token, wrapping a path that cannot break', () => {
    const prose = rule('[data-mcp-websearch-setup] :is(p, .settings__hint):not(.mono)');
    expect(prose).toContain('max-width: var(--rt-prose-measure)');
    // REQ-CONFIG-437's path line is one unbroken token; bounded to 340 px it must still wrap inside its box rather
    // than pay out (the guide's §6 give-way rule, and `@mcp`'s existing `overflow-wrap: anywhere`).
    expect(prose).toContain('overflow-wrap: anywhere');
    expect(prose).not.toMatch(/\d+px/);
  });

  it('excludes the stanza and the probe detail — code and a mono line keep their width', () => {
    const source = readFileSync(new URL('./McpSettings.tsx', import.meta.url), 'utf8');
    // The stanza REQ-CONFIG-437 hands over is a `<pre>`, which the prose selector does not name.
    expect(source).toContain('<pre className="mono" data-websearch-stanza>');
    // The probe's own detail is a mono line, excluded by the `:not(.mono)` half of the selector.
    expect(source).toContain('data-websearch-health-detail');
    expect(source).toMatch(/className="text-tertiary settings__hint mono" data-websearch-health-detail/);
    expect(rule('[data-mcp-websearch-setup] :is(p, .settings__hint):not(.mono)')).not.toContain('.mono) { max-width');
  });
});
