/**
 * `docs/defects/README.md` fixes a defect note's shape: a `## <name>` title, a description, a `## Specs` section and a
 * `## Relevant files` section. This reads every note, open (`docs/defects/`) or repaired (`docs/archive/defects/`, since
 * 2026-11-01, R-092; until then the retired `fixed/` folder), for the two sections a reader looks for first.
 * One repaired note had neither, as created in `90c492f`
 * (`docs/archive/defects/two-fixed-defect-notes-miss-the-schema-or-their-repair.md`).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const docs = join(import.meta.dirname, '..', 'docs');
const open = join(docs, 'defects');
const archived = join(docs, 'archive', 'defects');
const notes = [
  ...readdirSync(open).filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => join(open, f)),
  ...(existsSync(archived) ? readdirSync(archived).filter((f) => f.endsWith('.md')).map((f) => join(archived, f)) : []),
];

describe('defect notes follow docs/defects/README.md', () => {
  it('finds the notes', () => {
    expect(notes.length).toBeGreaterThan(600);
  });

  it('every note opens with a "## " title and carries "## Specs" and "## Relevant files"', () => {
    const missing = notes.flatMap((note) => {
      const text = readFileSync(note, 'utf8');
      const gaps = [
        ...(/^## \S/.test(text) ? [] : ['the "## " title']),
        ...(/^## Specs\b/m.test(text) ? [] : ['## Specs']),
        ...(/^## Relevant files\b/m.test(text) ? [] : ['## Relevant files']),
      ];
      return gaps.length ? [`${note.slice(docs.length + 1).split('\\').join('/')}: ${gaps.join(', ')}`] : [];
    });
    expect(missing).toEqual([]);
  });
});
