/**
 * Every `docs/defects/…` path `live-run.mjs` cites — in a NOTE line it prints or in a comment beside a check — names a note
 * that exists. `tools/check-record-links.mjs` reads the record's Markdown links and no script, so a note moved to
 * `docs/defects/fixed/` left the live run's pointers behind (finding D7 of the default live run at 1763f7f:
 * `docs/defects/fixed/live-runs-notes-cite-defect-notes-at-paths-they-no-longer-have.md`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = resolve(import.meta.dirname, '..', '..', '..', '..');
const script = join(repo, 'apps', 'desktop', 'scripts', 'live-run.mjs');

describe('the defect notes live-run.mjs cites', () => {
  it('every one exists at the path cited', () => {
    const text = readFileSync(script, 'utf8');
    const cited = [...new Set([...text.matchAll(/docs\/defects\/[A-Za-z0-9_./-]+?\.md/g)].map((m) => m[0]))];
    expect(cited.length).toBeGreaterThan(0);
    expect(cited.filter((path) => !existsSync(join(repo, path)))).toEqual([]);
  });
});
