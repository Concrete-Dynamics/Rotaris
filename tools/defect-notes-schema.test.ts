/**
 * `docs/defects/README.md` fixes a defect note's shape: a `## <name>` title, a description, a `## Specs` section and a
 * `## Relevant files` section. This reads every note, open or fixed, for the two sections a reader looks for first.
 * One fixed note had neither, as created in `90c492f`
 * (`docs/defects/fixed/two-fixed-defect-notes-miss-the-schema-or-their-repair.md`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const defects = join(import.meta.dirname, '..', 'docs', 'defects');
const notes = [
  ...readdirSync(defects).filter((f) => f.endsWith('.md') && f !== 'README.md'),
  ...readdirSync(join(defects, 'fixed')).filter((f) => f.endsWith('.md')).map((f) => `fixed/${f}`),
];

describe('defect notes follow docs/defects/README.md', () => {
  it('finds the notes', () => {
    expect(notes.length).toBeGreaterThan(600);
  });

  it('every note opens with a "## " title and carries "## Specs" and "## Relevant files"', () => {
    const missing = notes.flatMap((note) => {
      const text = readFileSync(join(defects, note), 'utf8');
      const gaps = [
        ...(/^## \S/.test(text) ? [] : ['the "## " title']),
        ...(/^## Specs\b/m.test(text) ? [] : ['## Specs']),
        ...(/^## Relevant files\b/m.test(text) ? [] : ['## Relevant files']),
      ];
      return gaps.length ? [`${note}: ${gaps.join(', ')}`] : [];
    });
    expect(missing).toEqual([]);
  });
});
