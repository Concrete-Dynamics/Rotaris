import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CODE_INTELLIGENCE_MARKER_SEGMENTS } from '@rotaris/config';
import { observeReach, snapshotChanges, snapshotTree, WriteJournal } from './observe.js';
import { errorObservation, observation } from './types.js';

/**
 * OQ-245 (XE1, ruled 2026-10-13 under R-072): the files a cross-file code-intelligence EDIT call changed are learned by
 * looking at what it can reach before and after it (docs/defects/fixed/a-cross-file-code-intelligence-edit-is-reported-by-its-argument-path-alone.md).
 */
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rotaris-observe-'));
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'src', 'a.ts'), 'export const total = 1;\n');
  writeFileSync(join(root, 'src', 'b.ts'), 'import { total } from "./a";\n');
  writeFileSync(join(root, 'docs', 'api.md'), '# total\n');
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('snapshotTree and snapshotChanges (OQ-245)', () => {
  it('a change, a creation and a removal are each a changed path, in code-point order; an untouched file is not', async () => {
    const before = (await snapshotTree(root, ''))!;
    writeFileSync(join(root, 'src', 'a.ts'), 'export const sum = 1;\n');
    writeFileSync(join(root, 'src', 'c.ts'), 'new\n');
    unlinkSync(join(root, 'docs', 'api.md'));
    const after = (await snapshotTree(root, ''))!;
    expect(snapshotChanges(before, after)).toEqual(['docs/api.md', 'src/a.ts', 'src/c.ts']);
  });

  it('a file rewritten with the same size and its modification time put back is still seen, by its status-change time', async () => {
    const file = join(root, 'src', 'b.ts');
    const { atime, mtime } = statSync(file);
    const before = (await snapshotTree(root, ''))!;
    await new Promise((r) => { setImmediate(r); });
    writeFileSync(file, 'import { TOTAL } from "./a";\n');
    utimesSync(file, atime, mtime);
    expect(statSync(file).size).toBe(Number(before.get('src/b.ts')!.split(':')[0]));
    expect(snapshotChanges(before, (await snapshotTree(root, ''))!)).toEqual(['src/b.ts']);
  });

  it('the ignored directories are not walked: the hard-coded components, the runtime\'s marker directory, the product\'s, and the workspace .gitignore', async () => {
    const marker = CODE_INTELLIGENCE_MARKER_SEGMENTS[0] as string;
    for (const dir of ['node_modules', '.git', '.rotaris', marker, 'generated']) mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, '.gitignore'), 'generated/\n');
    const before = (await snapshotTree(root, ''))!;
    for (const dir of ['node_modules', '.git', '.rotaris', marker, 'generated']) writeFileSync(join(root, dir, 'cache.json'), '{}');
    const after = (await snapshotTree(root, ''))!;
    expect(snapshotChanges(before, after)).toEqual([]);
    expect([...after.keys()].some((p) => p.includes('cache.json'))).toBe(false);
  });

  it('a base narrows the walk to a directory or one file; a base outside the root, or a tree past the limit, cannot be observed', async () => {
    expect([...(await snapshotTree(root, 'src'))!.keys()].sort()).toEqual(['src/a.ts', 'src/b.ts']);
    expect([...(await snapshotTree(root, 'docs/api.md'))!.keys()]).toEqual(['docs/api.md']);
    expect((await snapshotTree(root, 'missing'))!.size).toBe(0);
    expect(await snapshotTree(root, '../elsewhere')).toBeNull();
    expect(await snapshotTree(root, '', 2)).toBeNull();
  });

  // The walk is asynchronous, so the run host's event loop moves while it runs: a callback queued before it starts runs before
  // it ends. With the synchronous walk it ran after, whatever the tree held
  // (docs/defects/fixed/a-cross-file-edit-calls-tree-walk-blocks-the-run-hosts-event-loop.md).
  it('the walk yields to the event loop while it reads the tree', async () => {
    let yielded = false;
    setImmediate(() => { yielded = true; });
    const snapshot = await snapshotTree(root, '');
    expect(yielded).toBe(true);
    expect([...snapshot!.keys()].sort()).toEqual(['docs/api.md', 'src/a.ts', 'src/b.ts']);
  });
});

describe('observeReach (OQ-245)', () => {
  it('a call that writes two files and then errs carries both on its observation, the error kept', async () => {
    const obs = await observeReach({ root, reach: { base: '' }, journal: new WriteJournal(), agent: 'refactorer' }, async () => {
      writeFileSync(join(root, 'src', 'a.ts'), 'export const sum = 1;\n');
      writeFileSync(join(root, 'src', 'b.ts'), 'import { sum } from "./a";\n');
      return errorObservation('Error: could not write docs/api.md', { failureKind: 'tool_error' });
    });
    expect(obs).toMatchObject({ isError: true, text: 'Error: could not write docs/api.md', failureKind: 'tool_error', observedPaths: ['src/a.ts', 'src/b.ts'] });
  });

  it('what another agent\'s file tools wrote meanwhile is left out; the caller\'s own writes and a terminal\'s are not', async () => {
    const journal = new WriteJournal();
    journal.note('sibling', [join(root, 'docs', 'api.md')]); // before the mark: not in the window
    const obs = await observeReach({ root, reach: { base: '' }, journal, agent: 'refactorer' }, async () => {
      writeFileSync(join(root, 'src', 'a.ts'), 'export const sum = 1;\n');
      writeFileSync(join(root, 'docs', 'notes.md'), 'sibling\n');
      journal.note('sibling', [join(root, 'docs', 'notes.md')]);
      writeFileSync(join(root, 'docs', 'api.md'), '# sum\n');
      return observation("Successfully renamed 'total' to 'sum' (2 changes applied)");
    });
    expect(obs.observedPaths).toEqual(['docs/api.md', 'src/a.ts']);
  });

  it('a sibling\'s write noted against the real path is left out when the root is given through a symbolic link (fin36)', async () => {
    // docs/defects/fixed/a-siblings-native-write-is-not-subtracted-from-an-observation-taken-through-a-symlinked-workspace.md:
    // the native tools note against `realPathOf(root)`, the MCP executor passed the root unresolved.
    const link = `${root}-link`;
    symlinkSync(root, link, process.platform === 'win32' ? 'junction' : 'dir');
    try {
      const journal = new WriteJournal();
      const obs = await observeReach({ root: link, reach: { base: '' }, journal, agent: 'refactorer' }, async () => {
        writeFileSync(join(root, 'src', 'a.ts'), 'export const sum = 1;\n');
        writeFileSync(join(root, 'docs', 'notes.md'), 'sibling\n');
        journal.note('sibling', [join(realpathSync(root), 'docs', 'notes.md')]);
        return observation('ok');
      });
      expect(obs.observedPaths).toEqual(['src/a.ts']);
    } finally {
      // `unlinkSync`, not `rmSync`: Node 24.11's `rmSync` refuses a Windows junction ("Path is a directory").
      unlinkSync(link);
    }
  });

  it('a reach of null observes nothing; a walk that cannot be completed marks the observation unobserved, whatever the call returned', async () => {
    const plain = await observeReach({ root, reach: null, journal: new WriteJournal(), agent: 'a' }, async () => observation('ok'));
    expect(plain).toEqual(observation('ok'));
    const unbounded = await observeReach({ root, reach: { base: '' }, journal: new WriteJournal(), agent: 'a', limit: 1 }, async () => observation('Replaced 1 occurrence(s) in 1 file(s)'));
    expect(unbounded.observedPaths).toBeUndefined();
    expect(unbounded.unobserved).toBe(true);
    // The fin35 review: an erred call the walk could not observe had written files part-way, and read as refused.
    const erred = await observeReach({ root, reach: { base: '' }, journal: new WriteJournal(), agent: 'a', limit: 1 }, async () => errorObservation('Error: could not write docs/api.md', { failureKind: 'tool_error' }));
    expect(erred).toMatchObject({ isError: true, unobserved: true });
    expect(erred.observedPaths).toBeUndefined();
    // Observed, the mark is absent.
    const seen = await observeReach({ root, reach: { base: '' }, journal: new WriteJournal(), agent: 'a' }, async () => observation('ok'));
    expect(seen.unobserved).toBeUndefined();
  });
});
