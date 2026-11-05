/**
 * The folder indexes of the record (card 13b951ad, 2026-11-05; `tools/folder-indexes.mjs`).
 *
 * A folder of `docs/` that holds many peer documents and no index of its own cannot be traversed — an agent sees the
 * filenames and nothing saying what the folder is, which order they run in, or where their list lives. The indexes
 * shipped on 2026-11-05 are `docs/architecture/{adr,proposals,spikes}/README.md`,
 * `docs/spec/resolutions/README.md`, `docs/research/README.md` and
 * `docs/design/system/{components,guidelines}/README.md`; `docs/archive/README.md` gained the table of its own
 * subfolders, since nothing inside `docs/archive/` is hand-written and its index had to be the page that already is.
 *
 * This holds the three properties the module states over the tree as it stands, so an index that goes stale fails
 * here rather than in a reader's hands, and exercises the rule itself over a scratch tree. It is a test rather than a
 * `pnpm lint` stage on purpose: the gate is a fixed chain every branch pays for, and a folder index is checked where
 * it changes.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { INDEXED_FOLDERS, MIN_ENTRIES, MIN_FOLDERS, isPartsFolder, missingIndexes, owesIndex, recordsOffTheIndex, unlistedChildren } from './folder-indexes.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/** A scratch tree for one case, removed when the case ends. */
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'folder-indexes-'));
  created.push(dir);
  return dir;
};
/** @type {string[]} */
const created = [];
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** `n` Markdown files named to sort, in `dir`. */
const fill = (dir, n) => {
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i += 1) writeFileSync(join(dir, `${String(i).padStart(2, '0')}-part.md`), '# part\n');
};

describe('every folder of the record that owes an index has one', () => {
  it('names no folder of the record without an index', () => {
    expect(missingIndexes(root)).toEqual([]);
  });

  it('the folders the card named are covered by the rule, not exempt from it', () => {
    // The rule is what the case above holds; this pins that it reaches the folders the indexes were written for,
    // rather than those folders happening to sit under a threshold that excuses them.
    const owed = missingIndexes(root);
    for (const folder of ['docs/architecture/adr', 'docs/architecture/spikes', 'docs/spec/resolutions', 'docs/research', 'docs/design/system/components']) {
      expect(owed, folder).not.toContain(folder);
    }
  });
});

describe('the declared folders list their children', () => {
  it('names every child of every declared folder', () => {
    expect(unlistedChildren(root)).toEqual([]);
  });

  it('declares every folder of peer documents the card named', () => {
    for (const folder of ['docs/architecture/proposals', 'docs/architecture/spikes', 'docs/spec/resolutions', 'docs/design/system/components', 'docs/design/system/guidelines']) {
      expect(INDEXED_FOLDERS, folder).toContain(folder);
    }
  });
});

describe('every ADR is reachable from an index', () => {
  it('names each record in §7 of the architecture README or in the folder\'s own index', () => {
    expect(recordsOffTheIndex(root)).toEqual([]);
  });
});

describe('the rule itself', () => {
  /** A scratch repository: `<dir>/docs/`, with its own index so `docs/` is never the answer being tested. */
  const docsOf = (dir) => {
    const docs = join(dir, 'docs');
    mkdirSync(docs, { recursive: true });
    writeFileSync(join(docs, 'README.md'), '# The record\n');
    return docs;
  };

  it('a folder with enough documents owes an index, and one with fewer does not', () => {
    const dir = scratch();
    const docs = docsOf(dir);
    fill(join(docs, 'many'), MIN_ENTRIES);
    fill(join(docs, 'few'), MIN_ENTRIES - 1);
    expect(owesIndex(join(docs, 'many'))).toBe(true);
    expect(owesIndex(join(docs, 'few'))).toBe(false);
    expect(missingIndexes(dir)).toEqual(['docs/many']);
  });

  it('a folder that already carries a README owes none', () => {
    const dir = scratch();
    const docs = docsOf(dir);
    fill(join(docs, 'indexed'), MIN_ENTRIES);
    writeFileSync(join(docs, 'indexed', 'README.md'), '# The index\n');
    expect(owesIndex(join(docs, 'indexed'))).toBe(false);
    expect(missingIndexes(dir)).toEqual([]);
  });

  it('the parts folder of a split owes none: the document it came from indexes it', () => {
    const dir = scratch();
    const docs = docsOf(dir);
    writeFileSync(join(docs, 'doc.md'), '# doc\n');
    fill(join(docs, 'doc'), MIN_ENTRIES + 2);
    expect(isPartsFolder(join(docs, 'doc'))).toBe(true);
    expect(owesIndex(join(docs, 'doc'))).toBe(false);
    expect(missingIndexes(dir)).toEqual([]);
  });

  it('a folder of subfolders alone owes an index once it holds enough of them', () => {
    const dir = scratch();
    const docs = docsOf(dir);
    for (let i = 0; i < MIN_FOLDERS; i += 1) mkdirSync(join(docs, 'families', `f${i}`), { recursive: true });
    expect(owesIndex(join(docs, 'families'))).toBe(true);
    expect(missingIndexes(dir)).toEqual(['docs/families']);
  });

  it('a folder under the archive is not asked for an index of its own', () => {
    const dir = scratch();
    const docs = docsOf(dir);
    fill(join(docs, 'archive', 'defects'), MIN_ENTRIES);
    fill(join(docs, 'live'), MIN_ENTRIES);
    expect(missingIndexes(dir)).toEqual(['docs/live']);
  });

  it('reports a child the declared index does not name, and passes one it does', () => {
    const dir = scratch();
    const pack = join(dir, 'pack');
    fill(pack, 2);
    writeFileSync(join(pack, 'README.md'), '# The pack\n\n- `00-part.md` — named.\n');
    expect(unlistedChildren(dir, ['pack'])).toEqual([{ folder: 'pack', child: '01-part.md' }]);
    writeFileSync(join(pack, 'README.md'), '# The pack\n\n- `00-part.md` and `01-part.md` — both named.\n');
    expect(unlistedChildren(dir, ['pack'])).toEqual([]);
  });

  it('a declared folder with no index at all is one problem, naming the index', () => {
    const dir = scratch();
    mkdirSync(join(dir, 'pack'), { recursive: true });
    expect(unlistedChildren(dir, ['pack'])).toEqual([{ folder: 'pack', child: 'README.md' }]);
  });
});
