/**
 * `docs/architecture/views/README.md` is the router consulted before every change, so it stays a page: what each change
 * did to the views is written at the top of `reconciliation-log.md`, and only the "Last reconciled with the code" date
 * moves in the README. From 2026-09-16 to 2026-10-13 every change wrote its entry under that heading instead, until the
 * README was 2,658 lines (`docs/defects/fixed/the-views-reconciliation-entries-pile-up-in-the-readme-the-log-was-split-from.md`);
 * the move then dropped the maintenance rule's sentence that a view disagreeing with the code is the change's defect,
 * which `CLAUDE.md` states too. This holds both.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const views = join(import.meta.dirname, '..', 'docs', 'architecture', 'views');
const readme = readFileSync(join(views, 'README.md'), 'utf8');

describe('the views README stays a router and keeps its maintenance rule', () => {
  it('holds a dated "Last reconciled" heading and no reconciliation entry under it', () => {
    const at = readme.indexOf('## Last reconciled with the code: **');
    expect(at, 'the dated heading is missing').toBeGreaterThan(0);
    const after = readme.slice(at).split('\n').slice(1);
    const entries = after.filter((line) => line.startsWith('**'));
    expect(entries, 'an entry belongs at the top of reconciliation-log.md').toEqual([]);
  });

  it('carries the maintenance rule, the defect clause included', () => {
    expect(readme).toContain('update the view **in the same commit**');
    expect(readme.replace(/\s+/g, ' ')).toContain('A view that disagrees with the code is a defect of the change that made it so.');
  });
});
