import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareCodePoints, sortCodePoints } from './order.js';

/** REQ-MCP-117 / ADR-0034: one comparator, code-point order, and no locale collation anywhere in the domain. */
describe('compareCodePoints', () => {
  it('orders by code point, shorter prefix first, case-sensitive', () => {
    expect(sortCodePoints(['b', 'B', 'a', 'A', 'ab', 'a'])).toEqual(['A', 'B', 'a', 'a', 'ab', 'b']);
    expect(compareCodePoints('abc', 'ab')).toBe(1);
    expect(compareCodePoints('ab', 'abc')).toBe(-1);
    expect(compareCodePoints('', '')).toBe(0);
  });
  it('differs from UTF-16 code-unit order for an astral character (the emoji tool name)', () => {
    const emoji = '\u{1F600}';
    const pua = '';
    expect([emoji, pua].sort()).toEqual([emoji, pua]);
    expect(sortCodePoints([emoji, pua])).toEqual([pua, emoji]);
    expect(compareCodePoints(emoji, pua)).toBe(1);
  });
  it('is not locale-dependent: accents and case sort by scalar value only', () => {
    expect(sortCodePoints(['é', 'e', 'z'])).toEqual(['e', 'z', 'é']);
  });
});

describe('no localeCompare in packages/mcp or the configuration pipeline (REQ-MCP-117)', () => {
  const here = resolve(fileURLToPath(import.meta.url), '..');
  const roots = [here, resolve(here, '..', '..', 'config', 'src', 'mcp'), resolve(here, '..', '..', 'config', 'src', 'sections', 'mcp-servers.ts')];
  const files: string[] = [];
  const walk = (p: string) => {
    let st;
    try { st = statSync(p); } catch { return; }
    if (st.isDirectory()) { for (const e of readdirSync(p)) walk(join(p, e)); }
    else if (/\.tsx?$/.test(p) && !p.endsWith('order.test.ts')) files.push(p);
  };
  for (const r of roots) walk(r);
  it('scans at least the mcp package', () => { expect(files.length).toBeGreaterThan(3); });
  for (const f of files) it(`${f.split(/[\/]/).slice(-2).join('/')} uses no localeCompare or Intl.Collator`, () => {
    const text = readFileSync(f, 'utf8');
    expect(/localeCompare|Intl\.Collator/.test(text)).toBe(false);
  });
});
