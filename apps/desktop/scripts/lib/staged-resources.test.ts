/**
 * `settings-proof` stages the About page's two files (REQ-SHELL-140's build identifier, REQ-SHELL-142's licence bundle)
 * in `apps/desktop/resources/`, a directory the build also writes (first-release-plan.md §4.4). What is pinned: the
 * directory is left exactly as found — a real file comes back byte for byte, a fixture never outlives the proof —
 * including when the proof is killed mid-way and the next run repairs it, and a real writer's file, or its removal of
 * the proof's, between that kill and the next run is never undone.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — plain ESM beside the scripts that run it.
import { produce, put, restore, stage } from './staged-resources.mjs';

let work: string;
let dir: string;
let stash: string;
const NAMES = ['build-id.txt', 'THIRD-PARTY-LICENSES.txt'];
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'rotaris-staged-'));
  dir = join(work, 'resources');
  stash = join(work, 'stash');
  mkdirSync(join(dir, 'code-intelligence'), { recursive: true });
});
afterEach(() => { rmSync(work, { recursive: true, force: true }); });
const listing = () => readdirSync(dir).sort();
const read = (name: string) => readFileSync(join(dir, name), 'utf8');
/** A real writer's rewrite: new content or not, a later modification time than anything the proof wrote. */
const generate = (name: string, text: string) => {
  const at = join(dir, name);
  const floor = existsSync(at) ? statSync(at).mtimeMs / 1000 : Date.now() / 1000;
  writeFileSync(at, text);
  utimesSync(at, floor + 5, floor + 5);
};

describe('the directory is left as the proof found it', () => {
  it('a real file is moved aside for the absent branch, and comes back over the fixture', () => {
    writeFileSync(join(dir, 'THIRD-PARTY-LICENSES.txt'), 'the real, generated notices');
    stage(dir, stash, NAMES);
    expect(listing()).toEqual(['code-intelligence']);
    put(dir, stash, 'THIRD-PARTY-LICENSES.txt', 'a fixture');
    put(dir, stash, 'build-id.txt', 'fixture-id\n');
    expect(restore(dir, stash)).toEqual(['build-id.txt: removed; nothing was there before', 'THIRD-PARTY-LICENSES.txt: the file that was there is back']);
    expect(listing()).toEqual(['THIRD-PARTY-LICENSES.txt', 'code-intelligence']);
    expect(read('THIRD-PARTY-LICENSES.txt')).toBe('the real, generated notices');
    expect(existsSync(stash)).toBe(false);
  });

  it('what a real writer wrote on the proof\'s behalf is the proof\'s, and goes', () => {
    writeFileSync(join(dir, 'build-id.txt'), 'OLD-commit\n');
    stage(dir, stash, NAMES);
    expect(produce(dir, stash, 'build-id.txt', () => { writeFileSync(join(dir, 'build-id.txt'), 'HEAD-dirty\n'); return 0; })).toBe(0);
    restore(dir, stash);
    expect(read('build-id.txt')).toBe('OLD-commit\n');
  });

  it('a proof killed after writing its fixtures is repaired by the next run', () => {
    writeFileSync(join(dir, 'build-id.txt'), 'abc-real\n');
    stage(dir, stash, NAMES);
    put(dir, stash, 'build-id.txt', 'fixture-id\n');
    put(dir, stash, 'THIRD-PARTY-LICENSES.txt', 'a fixture');
    // No restore: the process died. The next run restores before it stages anything.
    restore(dir, stash);
    expect(listing()).toEqual(['build-id.txt', 'code-intelligence']);
    expect(read('build-id.txt')).toBe('abc-real\n');
  });

  it('a proof killed mid-write: what the writer left is the proof\'s', () => {
    writeFileSync(join(dir, 'build-id.txt'), 'abc-real\n');
    stage(dir, stash, NAMES);
    expect(() => produce(dir, stash, 'build-id.txt', () => { writeFileSync(join(dir, 'build-id.txt'), 'half'); throw new Error('killed'); })).toThrow('killed');
    restore(dir, stash);
    expect(read('build-id.txt')).toBe('abc-real\n');
  });

  it('a proof killed after moving a file aside, before declaring it, still gets the file back', () => {
    writeFileSync(join(dir, 'build-id.txt'), 'abc-real\n');
    mkdirSync(stash);
    // The state `stage` passes through between its move and its ledger write.
    writeFileSync(join(stash, 'build-id.txt'), 'abc-real\n');
    rmSync(join(dir, 'build-id.txt'));
    writeFileSync(join(stash, 'owned.json'), JSON.stringify({}));
    expect(restore(dir, stash)).toEqual(['build-id.txt: the file that was there is back']);
    expect(read('build-id.txt')).toBe('abc-real\n');
    expect(existsSync(stash)).toBe(false);
  });

  it('staging twice keeps the first real file, and a name never staged cannot be written', () => {
    writeFileSync(join(dir, 'build-id.txt'), 'abc-real\n');
    stage(dir, stash, NAMES);
    put(dir, stash, 'build-id.txt', 'fixture-id\n');
    stage(dir, stash, NAMES);
    restore(dir, stash);
    expect(read('build-id.txt')).toBe('abc-real\n');
    expect(() => put(dir, stash, 'build-id.txt', 'x')).toThrow(/was not staged/);
    expect(read('build-id.txt')).toBe('abc-real\n');
  });

  it('with no stash there is nothing to restore', () => {
    expect(restore(dir, stash)).toEqual([]);
    expect(listing()).toEqual(['code-intelligence']);
  });
});

describe('a real file generated after an interrupted proof is newer than anything it moved aside', () => {
  it('keeps what `pnpm build-id` and `pnpm notices` wrote since, and drops the stale files moved aside', () => {
    // The gate review's sequence: a real OLD identifier staged, the proof's own written, the process SIGKILLed; then a
    // newer `pnpm build-id` and a passing `pnpm notices` run before the next proof starts.
    writeFileSync(join(dir, 'build-id.txt'), 'OLD-commit\n');
    stage(dir, stash, NAMES);
    produce(dir, stash, 'build-id.txt', () => writeFileSync(join(dir, 'build-id.txt'), 'HEAD-dirty\n'));
    put(dir, stash, 'THIRD-PARTY-LICENSES.txt', 'a fixture');
    generate('build-id.txt', 'NEW-commit\n');
    generate('THIRD-PARTY-LICENSES.txt', 'the real, generated notices');
    expect(restore(dir, stash)).toEqual([
      'build-id.txt: a file written since the proof took the name stands there; kept, and the older one moved aside dropped',
      'THIRD-PARTY-LICENSES.txt: a file written since the proof took the name stands there; kept',
    ]);
    expect(read('build-id.txt')).toBe('NEW-commit\n');
    expect(read('THIRD-PARTY-LICENSES.txt')).toBe('the real, generated notices');
    expect(existsSync(stash)).toBe(false);
  });

  it('the same bytes rewritten by a real writer are still its file, not the proof\'s', () => {
    writeFileSync(join(dir, 'build-id.txt'), 'OLD-commit\n');
    stage(dir, stash, NAMES);
    put(dir, stash, 'build-id.txt', 'HEAD\n');
    generate('build-id.txt', 'HEAD\n');
    restore(dir, stash);
    expect(read('build-id.txt')).toBe('HEAD\n');
  });

  it('a writer that removed the proof\'s file since leaves the name empty: the older file is not put back', () => {
    // The second round's sequence: a real notices file from an earlier passing run staged, the fixture written, the
    // process killed; then `pnpm notices` refuses, removing the file it finds (the fixture), before the next proof.
    writeFileSync(join(dir, 'THIRD-PARTY-LICENSES.txt'), 'OLD notices from an earlier passing run');
    stage(dir, stash, NAMES);
    put(dir, stash, 'THIRD-PARTY-LICENSES.txt', 'a fixture');
    rmSync(join(dir, 'THIRD-PARTY-LICENSES.txt'));
    expect(restore(dir, stash)).toEqual([
      'build-id.txt: removed; nothing was there before',
      'THIRD-PARTY-LICENSES.txt: the file the proof wrote was removed since by another writer; left absent, and the older one moved aside dropped',
    ]);
    expect(listing()).toEqual(['code-intelligence']);
    expect(existsSync(stash)).toBe(false);
  });

  it('a ledger write killed before its rename leaves the previous ledger whole, and its partial file is no staged name', () => {
    writeFileSync(join(dir, 'build-id.txt'), 'abc-real\n');
    stage(dir, stash, NAMES);
    put(dir, stash, 'build-id.txt', 'FIXTURE\n');
    // The state a kill leaves part-way through the next ledger write: the whole ledger beside a truncated successor.
    const whole = readFileSync(join(stash, 'owned.json'), 'utf8');
    writeFileSync(join(stash, 'owned.json.next'), whole.slice(0, 9));
    expect(JSON.parse(whole)).toHaveProperty(['build-id.txt', 'sha256']);
    restore(dir, stash);
    expect(read('build-id.txt')).toBe('abc-real\n');
    expect(listing()).toEqual(['build-id.txt', 'code-intelligence']);
    expect(existsSync(stash)).toBe(false);
  });

  it('a file appearing under a name the proof took and never wrote is someone else\'s', () => {
    stage(dir, stash, NAMES);
    generate('THIRD-PARTY-LICENSES.txt', 'the real, generated notices');
    restore(dir, stash);
    expect(read('THIRD-PARTY-LICENSES.txt')).toBe('the real, generated notices');
    expect(listing()).toEqual(['THIRD-PARTY-LICENSES.txt', 'code-intelligence']);
  });
});
