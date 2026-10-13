/**
 * `docs/spec/README.md` states how many identifiers each domain defines and how many are withdrawn, and the totals that
 * follow from them. The generated artifact counts the same definitions, so this reads both: every row of the domain
 * table against the artifact's count for its prefix, and the status line's figures against the sums. REQ-TOOLS-193
 * (OQ-61, 2026-09-18) and REQ-MCP-118 (ESC-32, 2026-09-06) were minted and never counted, so the README read 4,398 where
 * the corpus defines 4,400 (`docs/defects/fixed/the-spec-readme-counts-4398-identifiers-where-the-corpus-defines-4400.md`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REQ } from '@rotaris/kernel';

const readme = readFileSync(join(import.meta.dirname, '..', '..', 'docs', 'spec', 'README.md'), 'utf8');

interface Row { readonly prefix: string; readonly reqs: number; readonly withdrawn: number; readonly retired: boolean }

const rows: Row[] = [...readme.matchAll(/^\| \d\d \| \[[^\]]+\]\([^)]+\) \| `REQ-([A-Z]+)` \| (\d+) \| (\d+) \| ([^|]+)\|$/gm)].map((m) => ({
  prefix: m[1],
  reqs: Number(m[2]),
  withdrawn: Number(m[3]),
  retired: m[4].includes('retired'),
}));

const corpus = new Map<string, { reqs: number; withdrawn: number }>();
for (const sym of Object.values(REQ)) {
  const entry = corpus.get(sym.domain) ?? { reqs: 0, withdrawn: 0 };
  entry.reqs += 1;
  if (sym.withdrawn) entry.withdrawn += 1;
  corpus.set(sym.domain, entry);
}

const sum = (xs: readonly Row[], key: 'reqs' | 'withdrawn'): number => xs.reduce((n, r) => n + r[key], 0);
const figures = (): number[] => {
  const line = /^- Requirements: ([\s\S]*?)\n {2}Every figure here counts identifiers/m.exec(readme);
  if (!line) throw new Error('docs/spec/README.md has no "- Requirements:" status line');
  return [...line[1].matchAll(/\*\*([\d,]+)\*\*/g)].map((m) => Number(m[1].replace(/,/g, '')));
};

describe('docs/spec/README.md counts what the corpus defines', () => {
  it('has one table row per domain the artifact holds', () => {
    expect(rows.map((r) => r.prefix).sort()).toEqual([...corpus.keys()].sort());
  });

  it.each(rows.map((r) => [r.prefix, r] as const))('REQ-%s: the row states the artifact\'s count and withdrawn count', (prefix, row) => {
    expect({ reqs: row.reqs, withdrawn: row.withdrawn }).toEqual(corpus.get(prefix));
  });

  it('the status line\'s shipping, retired and overall figures are the table\'s sums', () => {
    const shipping = rows.filter((r) => !r.retired);
    const retired = rows.filter((r) => r.retired);
    const [ship, shipWithdrawn, live, retiredReqs, retiredWithdrawn, all, allWithdrawn] = figures();
    expect({ ship, shipWithdrawn, live, retiredReqs, retiredWithdrawn, all, allWithdrawn }).toEqual({
      ship: sum(shipping, 'reqs'),
      shipWithdrawn: sum(shipping, 'withdrawn'),
      live: sum(shipping, 'reqs') - sum(shipping, 'withdrawn'),
      retiredReqs: sum(retired, 'reqs'),
      retiredWithdrawn: sum(retired, 'withdrawn'),
      all: Object.keys(REQ).length,
      allWithdrawn: sum(rows, 'withdrawn'),
    });
  });
});
