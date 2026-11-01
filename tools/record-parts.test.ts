/**
 * The split record and its archive (`tools/record-parts.mjs`; `docs/README.md`, "The document budget" and "The archive",
 * R-092), over a fixture on disk: a record's parts in order, its archived parts in the archive's mirror of its folder,
 * each live part's archive followed by its continuations, and the record read whole with its archive.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { archiveOrder, archivePartsOf, archivePathOf, partsOf, readRecord, readRecordWithArchive } from './record-parts.mjs';

let root: string;
let index: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'record-parts-'));
  index = join(root, 'docs', 'architecture', 'questions.md');
  mkdirSync(join(root, 'docs', 'architecture', 'questions'), { recursive: true });
  writeFileSync(index, 'index\n');
  writeFileSync(join(root, 'docs', 'architecture', 'questions', '02-b.md'), 'live b\n');
  writeFileSync(join(root, 'docs', 'architecture', 'questions', '01-a.md'), 'live a\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const archived = (name: string, text: string) => {
  mkdirSync(join(root, 'docs', 'archive', 'architecture', 'questions'), { recursive: true });
  writeFileSync(join(root, 'docs', 'archive', 'architecture', 'questions', name), text);
};

describe('record-parts — the parts and the archive', () => {
  it('reads the parts in name order, and the record whole', () => {
    expect(partsOf(index).map((p: string) => basename(p))).toEqual(['01-a.md', '02-b.md']);
    expect(readRecord(index)).toBe('index\n\nlive a\n\nlive b\n');
  });

  it('mirrors a record path into docs/archive/, and nothing already there or outside docs/', () => {
    expect(archivePathOf(join(root, 'docs', 'architecture', 'questions', '01-a.md'))).toBe(join(root, 'docs', 'archive', 'architecture', 'questions', '01-a.md'));
    expect(archivePathOf(join(root, 'docs', 'archive', 'architecture', 'questions', '01-a.md'))).toBeUndefined();
    expect(archivePathOf(join(root, 'tools', 'x.md'))).toBeUndefined();
  });

  it('has no archived parts until something is archived', () => {
    expect(archivePartsOf(index)).toEqual([]);
    expect(readRecordWithArchive(index)).toBe(readRecord(index));
  });

  it('orders the archived parts by live part, each followed by its continuations in number order', () => {
    archived('02-b.md', 'archived b\n');
    archived('01-a-continued-10.md', 'archived a, 10\n');
    archived('01-a.md', 'archived a\n');
    archived('01-a-continued-2.md', 'archived a, 2\n');
    expect(archivePartsOf(index).map((p: string) => basename(p))).toEqual(['01-a.md', '01-a-continued-2.md', '01-a-continued-10.md', '02-b.md']);
    expect(readRecordWithArchive(index)).toBe('index\n\nlive a\n\nlive b\n\narchived a\n\narchived a, 2\n\narchived a, 10\n\narchived b\n');
    expect(['01-a-continued-2.md', '01-a.md'].sort(archiveOrder)).toEqual(['01-a.md', '01-a-continued-2.md']);
  });
});
