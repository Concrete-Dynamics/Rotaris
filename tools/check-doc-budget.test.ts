import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { MAX_BYTES, MAX_LINES, measure, sizeOf, verdict } from './check-doc-budget.mjs';

const size = (lines: number, bytes = lines * 10) => ({ lines, bytes });

describe('check-doc-budget (docs/README.md, "The document budget")', () => {
  it('holds 500 lines and 32 KiB', () => {
    expect(MAX_LINES).toBe(500);
    expect(MAX_BYTES).toBe(32 * 1024);
  });

  it('counts lines the way an editor shows them, a final newline adding none', () => {
    expect(sizeOf('')).toEqual({ lines: 0, bytes: 0 });
    expect(sizeOf('a\nb\n')).toEqual({ lines: 2, bytes: 4 });
    expect(sizeOf('a\nb')).toEqual({ lines: 2, bytes: 3 });
    expect(sizeOf('é\n').bytes).toBe(3);
  });

  it('fails a file over either bound that the baseline does not list', () => {
    const sizes = new Map([
      ['docs/a.md', size(500, MAX_BYTES)],
      ['docs/long.md', size(501)],
      ['docs/wide.md', size(100, MAX_BYTES + 1)],
    ]);
    expect(verdict(sizes, []).over).toEqual(['docs/long.md', 'docs/wide.md']);
  });

  it('passes a listed file still over the budget, and fails one back within it until its line goes', () => {
    const sizes = new Map([
      ['docs/debt.md', size(900)],
      ['docs/paid.md', size(200)],
    ]);
    expect(verdict(sizes, ['docs/debt.md', 'docs/paid.md'])).toEqual({ over: [], paid: ['docs/paid.md'], gone: [], debt: ['docs/debt.md'] });
  });

  it('reports a listed file that no longer exists without failing on it', () => {
    expect(verdict(new Map(), ['docs/removed.md'])).toEqual({ over: [], paid: [], gone: ['docs/removed.md'], debt: [] });
  });
});

describe('check-doc-budget — the archive is under the budget too (R-092)', () => {
  it('measures a file under docs/archive/ like any other record file', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-budget-'));
    try {
      mkdirSync(join(root, 'docs', 'archive', 'architecture'), { recursive: true });
      writeFileSync(join(root, 'docs', 'archive', 'architecture', 'part.md'), 'x\n'.repeat(MAX_LINES + 1));
      const sizes = measure(root);
      expect(sizes.get('docs/archive/architecture/part.md')).toEqual({ lines: MAX_LINES + 1, bytes: 2 * (MAX_LINES + 1) });
      expect(verdict(sizes, []).over).toEqual(['docs/archive/architecture/part.md']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
