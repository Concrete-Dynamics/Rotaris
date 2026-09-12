/**
 * The adopted-language baseline is a ratchet, and a ratchet has two directions. Both are
 * pinned here: a new literal fails, and a paid-off one fails until the baseline records the
 * payment. The tree scan that produces the counts is `pnpm lint`'s own business.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { baselineDocument, compareDebt } from './ui-language-debt.mjs';

const KEY = 'packages/ui/src/shell.css|css-metric|gap:12';
const OTHER = 'packages/ui/src/shell.css|css-metric|padding:8';

describe('UI-language debt baseline', () => {
  it('passes a measurement that sits exactly at the baseline', () => {
    expect(compareDebt({ [KEY]: 3 }, { [KEY]: 3 })).toEqual({ growth: [], stale: [] });
  });

  it('fails a count above the baseline', () => {
    const { growth, stale } = compareDebt({ [KEY]: 4 }, { [KEY]: 3 });
    expect(growth).toEqual([{ key: KEY, count: 4, allowed: 3 }]);
    expect(stale).toEqual([]);
  });

  it('fails an entry the baseline never reserved at all', () => {
    const { growth } = compareDebt({ [OTHER]: 1 }, { [KEY]: 3 });
    expect(growth).toEqual([{ key: OTHER, count: 1, allowed: 0 }]);
  });

  it('fails a reduction too, so the allowance cannot be re-spent elsewhere', () => {
    const { growth, stale } = compareDebt({ [KEY]: 1 }, { [KEY]: 3 });
    expect(growth).toEqual([]);
    expect(stale).toEqual([{ key: KEY, count: 1, allowed: 3 }]);
  });

  it('fails a baseline entry the code no longer holds at all', () => {
    const { stale } = compareDebt({}, { [KEY]: 3 });
    expect(stale).toEqual([{ key: KEY, count: 0, allowed: 3 }]);
  });

  it('reports both directions at once when a file pays one debt and takes another', () => {
    const { growth, stale } = compareDebt({ [OTHER]: 2 }, { [KEY]: 1 });
    expect(growth).toEqual([{ key: OTHER, count: 2, allowed: 0 }]);
    expect(stale).toEqual([{ key: KEY, count: 0, allowed: 1 }]);
  });

  it('writes a baseline sorted by key, so a diff reads as a burn-down', () => {
    expect(baselineDocument({ b: 1, a: 2 })).toEqual({ version: 1, debt: { a: 2, b: 1 } });
    expect(Object.keys(baselineDocument({ b: 1, a: 2 }).debt)).toEqual(['a', 'b']);
  });

  it('agrees with the committed baseline, which is the file `pnpm lint` reads', async () => {
    const committed = (await import('./ui-language-baseline.json', { with: { type: 'json' } })).default;
    expect(committed.version).toBe(1);
    expect(compareDebt(committed.debt, committed.debt)).toEqual({ growth: [], stale: [] });
    expect(Object.keys(committed.debt)).toEqual([...Object.keys(committed.debt)].sort((a, b) => a.localeCompare(b)));
  });
});
