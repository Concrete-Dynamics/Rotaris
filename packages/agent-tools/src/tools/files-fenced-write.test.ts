/**
 * The fenced write has no check-then-write gap (REQ-TOOLS-129, REQ-TOOLS-132, REQ-SANDBOX-001; R-091, `hardening.md` §3.4
 * row 5, bundle D3). The fence resolves a path to its real path and the write then goes to that path; a directory on it that
 * is swapped for a link between the two must not carry the write outside the root.
 *
 * The swap is placed exactly, through the writer's step seam (`WriteSeams.onStep`): a directory inside the root is moved
 * aside and a link to a directory outside put in its place — a junction on Windows, which needs no privilege, and a
 * directory symlink elsewhere (the existing tests' shape).
 */
import { existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import { checkFence, type FenceConfig } from './fence.js';
import { atomicWrite, FileToolState, haetEditTool, haetReadTool, PathChangedError, readFileTool, sha256, writeFileTool, type WriteStep } from './files.js';
import type { ToolContext } from './types.js';

let base: string;
let root: string;
let outside: string;
let fence: FenceConfig;
const clock = new FakeClock();
const ctx = (): ToolContext => ({ workspaceRoot: root, sessionId: 's', agentName: 'a', persona: 'p', monotonic: clock, wall: clock, signal: new AbortController().signal, warn: () => undefined });

beforeEach(() => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), 'rotaris-fenced-write-')));
  root = join(base, 'ws');
  outside = join(base, 'elsewhere');
  mkdirSync(join(root, 'sub'), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(root, 'sub', 'f.txt'), 'inside\n');
  writeFileSync(join(outside, 'f.txt'), 'outside\n');
  fence = { workspaceRoot: root, allowOutsideWorkspace: false, additionalReadOnlyRoots: [] };
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

/** `root/<name>` moved aside and replaced by a link to `outside`: what an attacker does between the check and the write. */
function swapForLink(name: string): void {
  renameSync(join(root, name), join(base, `${name}-aside`));
  symlinkSync(outside, join(root, name), process.platform === 'win32' ? 'junction' : 'dir');
}

/** A seam that swaps `root/<name>` for a link at `step`, once. */
function swapAt(step: WriteStep, name = 'sub'): { onStep: (s: WriteStep) => void } {
  let done = false;
  return { onStep: (s) => { if (s === step && !done) { done = true; swapForLink(name); } } };
}

const outsideNames = (): string[] => readdirSync(outside).sort();

describe('atomicWrite writes through the object the fence checked (REQ-TOOLS-129, REQ-TOOLS-132)', () => {
  it('a plain write is unchanged: the content replaces the file whole and no temporary file is left', () => {
    const v = checkFence(fence, 'sub/f.txt', 'write');
    if (!v.ok) throw new Error(v.message);
    expect(atomicWrite(v.resolved, 'new\n')).toBeUndefined();
    expect(readFileSync(join(root, 'sub', 'f.txt'), 'utf8')).toBe('new\n');
    expect(readdirSync(join(root, 'sub'))).toEqual(['f.txt']);
  });

  it('a create into directories that are not there yet makes them and names the first one, as before', () => {
    const v = checkFence(fence, 'a/b/c.txt', 'write');
    if (!v.ok) throw new Error(v.message);
    expect(atomicWrite(v.resolved, 'c\n')).toBe(join(root, 'a'));
    expect(readFileSync(join(root, 'a', 'b', 'c.txt'), 'utf8')).toBe('c\n');
  });

  for (const step of ['checked', 'opened', 'written'] as const) {
    it(`a directory swapped for a link to outside the root at '${step}' is refused, and nothing is left outside`, () => {
      const v = checkFence(fence, 'sub/f.txt', 'write');
      if (!v.ok) throw new Error(v.message);
      let thrown: unknown;
      try {
        atomicWrite(v.resolved, 'escaped\n', swapAt(step));
      } catch (e) {
        thrown = e;
      }
      if (step === 'opened' && process.platform === 'win32') {
        // Windows will not move a directory that holds an open file: the swap itself is refused, and the write with it.
        expect((thrown as NodeJS.ErrnoException).code).toBe('EPERM');
        expect(readFileSync(join(root, 'sub', 'f.txt'), 'utf8')).toBe('inside\n');
      } else {
        expect(thrown).toBeInstanceOf(PathChangedError);
        expect((thrown as PathChangedError).found).toBe(join(outside, 'f.txt'));
        expect(readFileSync(join(base, 'sub-aside', 'f.txt'), 'utf8')).toBe('inside\n');
      }
      expect(readFileSync(join(outside, 'f.txt'), 'utf8')).toBe('outside\n');
      expect(outsideNames()).toEqual(['f.txt']);
    });
  }

  it('a swap in the one window Node leaves, after the last verification, takes the temporary file away: the rename finds nothing and the write is refused', () => {
    const v = checkFence(fence, 'sub/f.txt', 'write');
    if (!v.ok) throw new Error(v.message);
    let thrown: unknown;
    try {
      atomicWrite(v.resolved, 'escaped\n', swapAt('verified'));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(PathChangedError);
    expect((thrown as PathChangedError).found).toBe(join(outside, 'f.txt'));
    expect(readFileSync(join(outside, 'f.txt'), 'utf8')).toBe('outside\n');
    expect(outsideNames()).toEqual(['f.txt']);
    expect(readFileSync(join(base, 'sub-aside', 'f.txt'), 'utf8')).toBe('inside\n');
  });

  it('a hard link to the temporary file made at its name through the swapped path is found after the rename: refused, and the file removed from outside', () => {
    const v = checkFence(fence, 'sub/f.txt', 'write');
    if (!v.ok) throw new Error(v.message);
    const seams = {
      onStep: (s: WriteStep) => {
        if (s !== 'verified') return;
        swapForLink('sub');
        const tmp = readdirSync(join(base, 'sub-aside')).find((n) => n.startsWith('.f.txt.tmp-')) as string;
        linkSync(join(base, 'sub-aside', tmp), join(outside, tmp));
      },
    };
    let thrown: unknown;
    try {
      atomicWrite(v.resolved, 'escaped\n', seams);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(PathChangedError);
    expect((thrown as PathChangedError).found).toBe(join(outside, 'f.txt'));
    // The rename replaced the outside file before the swap could be seen: the replacement is taken back, the replaced file is not restored.
    expect(outsideNames()).toEqual([]);
    expect(readFileSync(join(base, 'sub-aside', 'f.txt'), 'utf8')).toBe('inside\n');
  });

  it('a swap after the rename is no refusal: the write reached the object the fence checked', () => {
    const v = checkFence(fence, 'sub/f.txt', 'write');
    if (!v.ok) throw new Error(v.message);
    expect(atomicWrite(v.resolved, 'written\n', swapAt('renamed'))).toBeUndefined();
    expect(readFileSync(join(base, 'sub-aside', 'f.txt'), 'utf8')).toBe('written\n');
    expect(readFileSync(join(outside, 'f.txt'), 'utf8')).toBe('outside\n');
  });

  it('a create whose existing parent is swapped before its directories are made leaves no directory outside', () => {
    const v = checkFence(fence, 'sub/new/deep/g.txt', 'write');
    if (!v.ok) throw new Error(v.message);
    expect(() => atomicWrite(v.resolved, 'g\n', swapAt('checked'))).toThrow(PathChangedError);
    expect(outsideNames()).toEqual(['f.txt']);
  });
});

describe('the file tools refuse a write whose path changed after the fence (REQ-TOOLS-129, REQ-TOOLS-132, REQ-TOOLS-135, REQ-TOOLS-189)', () => {
  const read = async (state: FileToolState, path: string) => readFileTool(state, fence).execute({ path, offset: 1, limit: 2000, grep_context: 3 }, ctx());

  it('write_file overwrite: the fence\'s fixed message, nothing outside, no undo entry', async () => {
    const state = new FileToolState();
    await read(state, 'sub/f.txt');
    const w = writeFileTool(state, fence, swapAt('checked'));
    const r = await w.execute({ operation: 'overwrite', path: 'sub/f.txt', content: 'escaped\n', replace_all: false }, ctx());
    expect(r).toMatchObject({ isError: true, text: `Path '${join(outside, 'f.txt')}' is outside workspace root '${root}'` });
    expect(readFileSync(join(outside, 'f.txt'), 'utf8')).toBe('outside\n');
    expect(outsideNames()).toEqual(['f.txt']);
    expect(state.popUndo(join(root, 'sub', 'f.txt'))).toBeUndefined();
  });

  it('write_file create: refused before the rename, no file and no directory outside', async () => {
    const w = writeFileTool(new FileToolState(), fence, swapAt('written'));
    const r = await w.execute({ operation: 'create', path: 'sub/n/g.txt', content: 'g\n', replace_all: false }, ctx());
    expect(r).toMatchObject({ isError: true, text: `Path '${join(outside, 'n', 'g.txt')}' is outside workspace root '${root}'` });
    expect(outsideNames()).toEqual(['f.txt']);
  });

  it('a swap to another directory inside the root is refused too: the written object must be the checked one', async () => {
    mkdirSync(join(root, 'other'));
    const state = new FileToolState();
    await read(state, 'sub/f.txt');
    const seams = { onStep: (s: WriteStep) => { if (s === 'written') { renameSync(join(root, 'sub'), join(base, 'sub-aside')); symlinkSync(join(root, 'other'), join(root, 'sub'), process.platform === 'win32' ? 'junction' : 'dir'); } } };
    const r = await writeFileTool(state, fence, seams).execute({ operation: 'overwrite', path: 'sub/f.txt', content: 'moved\n', replace_all: false }, ctx());
    expect(r).toMatchObject({ isError: true, text: `sub/f.txt changed while it was being written: it now resolves to '${join(root, 'other', 'f.txt')}'. Nothing was written; read it again before retrying.` });
    expect(readdirSync(join(root, 'other'))).toEqual([]);
  });

  it('haet_edit: refused, nothing outside, and no undo entry pushed for a write that did not happen', async () => {
    const state = new FileToolState();
    await haetReadTool(state, fence).execute({ path: 'sub/f.txt', offset: 1, limit: 2000, grep_context: 3 }, ctx());
    const hash = sha256('inside\n');
    const r = await haetEditTool(state, fence, 'haet_edit', swapAt('written')).execute({ path: 'sub/f.txt', content_hash: hash, old_string: 'inside', new_string: 'escaped', replace_all: false }, ctx());
    expect(r).toMatchObject({ isError: true, text: `Path '${join(outside, 'f.txt')}' is outside workspace root '${root}'` });
    expect(readFileSync(join(outside, 'f.txt'), 'utf8')).toBe('outside\n');
    expect(outsideNames()).toEqual(['f.txt']);
    expect(state.popUndo(join(root, 'sub', 'f.txt'))).toBeUndefined();
  });

  it('write_file undo: a refused restore keeps its entry, and the undo succeeds once the path is back', async () => {
    const state = new FileToolState();
    await read(state, 'sub/f.txt');
    let swap = false;
    const seams = { onStep: (s: WriteStep) => { if (swap && s === 'checked') { swap = false; swapForLink('sub'); } } };
    const w = writeFileTool(state, fence, seams);
    expect(await w.execute({ operation: 'overwrite', path: 'sub/f.txt', content: 'second\n', replace_all: false }, ctx())).toMatchObject({ isError: false });
    swap = true;
    expect(await w.execute({ operation: 'undo', path: 'sub/f.txt', replace_all: false }, ctx())).toMatchObject({ isError: true, text: `Path '${join(outside, 'f.txt')}' is outside workspace root '${root}'` });
    expect(readFileSync(join(outside, 'f.txt'), 'utf8')).toBe('outside\n');
    rmSync(join(root, 'sub'), { recursive: false, force: true });
    renameSync(join(base, 'sub-aside'), join(root, 'sub'));
    expect(await w.execute({ operation: 'undo', path: 'sub/f.txt', replace_all: false }, ctx())).toMatchObject({ isError: false });
    expect(readFileSync(join(root, 'sub', 'f.txt'), 'utf8')).toBe('inside\n');
  });

  it('write_file undo of a create: a parent swapped before the removal removes nothing outside', async () => {
    const state = new FileToolState();
    writeFileSync(join(outside, 'g.txt'), 'g\n');
    let swap = false;
    const seams = { onStep: (s: WriteStep) => { if (swap && s === 'checked') { swap = false; swapForLink('sub'); } } };
    const w = writeFileTool(state, fence, seams);
    expect(await w.execute({ operation: 'create', path: 'sub/g.txt', content: 'g\n', replace_all: false }, ctx())).toMatchObject({ isError: false });
    swap = true;
    expect(await w.execute({ operation: 'undo', path: 'sub/g.txt', replace_all: false }, ctx())).toMatchObject({ isError: true, text: `Path '${join(outside, 'g.txt')}' is outside workspace root '${root}'` });
    expect(existsSync(join(outside, 'g.txt'))).toBe(true);
  });
});
