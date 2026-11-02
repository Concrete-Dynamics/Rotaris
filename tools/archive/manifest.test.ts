/**
 * The archive's own guard (`tools/archive/manifest.mjs`, R-092): every run of the migration writes one hash per archived
 * entry to `docs/archive/manifest.json`, and `--check` names each entry the archive no longer matches it on. Over a
 * fixture archive: an archived open-question part (an opening and two anchored entries), a repaired defect note (no
 * anchor, one entry) and the archive's hand-written README, which is no entry.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { commit, plan } from './migrate.mjs';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { MANIFEST, entriesOf, hashOf, manifestProblems } from './manifest.mjs';

const PART = 'docs/archive/architecture/open-questions/01-part.md';
// The notes' folder is joined, so the link gate does not read a fixture's note as a pointer to one in the record.
const NOTES = ['docs', 'archive', 'defects'].join('/');
const NOTE = `${NOTES}/a-repaired-note.md`;

const PART_TEXT = [
  '# Archived open questions — part',
  '',
  'What this file holds.',
  '',
  '<a id="oq-1"></a>',
  '',
  '**OQ-1 — the first.** Ruled 2026-10-01.',
  '',
  '<a id="oq-2"></a>',
  '',
  '**OQ-2 — the second.** Closed 2026-10-02.',
  '',
].join('\n');
const NOTE_TEXT = '# A repaired note\n\nWhat it was, and the outcome.\n';

const FIXTURE: Record<string, string> = {
  'docs/README.md': '# The record\n\n## The archive\n\nWhat moves there.\n',
  'docs/archive/README.md': '# The archive\n\nWritten by hand.\n',
  [PART]: PART_TEXT,
  [NOTE]: NOTE_TEXT,
};

let root: string;

const write = (path: string, text: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const migrate = () => commit(plan(root).changed);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'archive-manifest-'));
  for (const [path, text] of Object.entries(FIXTURE)) write(path, text);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the archive\'s manifest', () => {
  it('splits a file at its column-0 anchors, keeps its opening as an entry, and takes a file without one whole', () => {
    expect(entriesOf('p.md', PART_TEXT).map(([key]: [string]) => key)).toEqual(['p.md', 'p.md#oq-1', 'p.md#oq-2']);
    expect(entriesOf('n.md', NOTE_TEXT)).toEqual([['n.md', NOTE_TEXT]]);
    expect(entriesOf('d.md', '<a id="x"></a>\none\n<a id="x"></a>\ntwo\n').map(([key]: [string]) => key)).toEqual(['d.md#x', 'd.md#x~2']);
  });

  it('is written by a run, one hash per entry, the README and the manifest itself left out', () => {
    expect(manifestProblems(root)).toEqual([`${MANIFEST} is missing while the archive holds 4 entries`]);
    migrate();
    const entries = JSON.parse(read(MANIFEST)).entries;
    expect(Object.keys(entries)).toEqual([
      'architecture/open-questions/01-part.md',
      'architecture/open-questions/01-part.md#oq-1',
      'architecture/open-questions/01-part.md#oq-2',
      'defects/a-repaired-note.md',
    ]);
    expect(entries['defects/a-repaired-note.md']).toBe(hashOf(NOTE_TEXT));
    expect(manifestProblems(root)).toEqual([]);
    expect(plan(root).changed.size).toBe(0);
  });

  it('is red on a hand edit, naming the entry, and green once the edit is undone or a re-run takes it', () => {
    migrate();
    write(PART, PART_TEXT.replace('Closed 2026-10-02.', 'Closed 2026-10-03.'));
    expect(manifestProblems(root)).toEqual([
      'docs/archive/architecture/open-questions/01-part.md#oq-2 was edited by hand (its hash differs from the manifest\'s)',
    ]);
    write(PART, PART_TEXT);
    expect(manifestProblems(root)).toEqual([]);
    write(PART, PART_TEXT.replace('Closed 2026-10-02.', 'Closed 2026-10-03.'));
    migrate();
    expect(manifestProblems(root)).toEqual([]);
  });

  it('is red on an entry added or removed by hand, until a re-run registers the archive as it stands', () => {
    migrate();
    write(`${NOTES}/another-note.md`, '# Another note\n');
    write(PART, PART_TEXT.replace(/<a id="oq-2"><\/a>[\s\S]*$/, ''));
    expect(manifestProblems(root)).toEqual([
      `${NOTES}/another-note.md is not in the manifest (written by hand, not by the script)`,
      'docs/archive/architecture/open-questions/01-part.md#oq-2 is in the manifest and no longer in the archive (removed by hand)',
    ]);
    migrate();
    expect(manifestProblems(root)).toEqual([]);
  });

  it('reads a checkout\'s CRLF line endings as no edit, and an unreadable manifest as a red', () => {
    migrate();
    write(NOTE, NOTE_TEXT.replace(/\n/g, '\r\n'));
    expect(manifestProblems(root)).toEqual([]);
    write(MANIFEST, '{ not json');
    expect(manifestProblems(root)[0]).toMatch(/^docs\/archive\/manifest\.json does not parse/);
  });

  it('writes nothing for a tree with no archive', () => {
    rmSync(join(root, 'docs', 'archive'), { recursive: true });
    expect(plan(root).changed.size).toBe(0);
    expect(manifestProblems(root)).toEqual([]);
  });
});
