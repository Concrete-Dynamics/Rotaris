/**
 * `settings-proof` stages the About page's two assets in `apps/desktop/resources/`, a directory the build also writes
 * (first-release-plan.md §4.4). What is pinned: the directory is left exactly as found — a real file comes back byte for
 * byte, a fixture never outlives the proof — including when the proof is killed mid-way and the next run repairs it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — plain ESM beside the scripts that run it.
import { put, restore, stage } from './staged-resources.mjs';

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

describe('the directory is left as the proof found it', () => {
  it('a real file is moved aside for the absent branch, and comes back over the fixture', () => {
    writeFileSync(join(dir, 'THIRD-PARTY-LICENSES.txt'), 'the real, generated notices');
    stage(dir, stash, NAMES);
    expect(listing()).toEqual(['code-intelligence']);
    put(dir, stash, 'THIRD-PARTY-LICENSES.txt', 'a fixture');
    put(dir, stash, 'build-id.txt', 'fixture-id\n');
    expect(restore(dir, stash)).toEqual(['build-id.txt: removed; nothing was there before', 'THIRD-PARTY-LICENSES.txt: the file that was there is back']);
    expect(listing()).toEqual(['THIRD-PARTY-LICENSES.txt', 'code-intelligence']);
    expect(readFileSync(join(dir, 'THIRD-PARTY-LICENSES.txt'), 'utf8')).toBe('the real, generated notices');
    expect(existsSync(stash)).toBe(false);
  });

  it('a proof killed after writing its fixtures is repaired by the next run', () => {
    writeFileSync(join(dir, 'build-id.txt'), 'abc-real\n');
    stage(dir, stash, NAMES);
    put(dir, stash, 'build-id.txt', 'fixture-id\n');
    put(dir, stash, 'THIRD-PARTY-LICENSES.txt', 'a fixture');
    // No restore: the process died. The next run restores before it stages anything.
    restore(dir, stash);
    expect(listing()).toEqual(['build-id.txt', 'code-intelligence']);
    expect(readFileSync(join(dir, 'build-id.txt'), 'utf8')).toBe('abc-real\n');
  });

  it('a proof killed after moving a file aside, before declaring it, still gets the file back', () => {
    writeFileSync(join(dir, 'build-id.txt'), 'abc-real\n');
    mkdirSync(stash);
    // The state `stage` passes through between its move and its ledger write.
    writeFileSync(join(stash, 'build-id.txt'), 'abc-real\n');
    rmSync(join(dir, 'build-id.txt'));
    writeFileSync(join(stash, 'owned.json'), JSON.stringify([]));
    expect(restore(dir, stash)).toEqual(['build-id.txt: the file that was there is back']);
    expect(readFileSync(join(dir, 'build-id.txt'), 'utf8')).toBe('abc-real\n');
    expect(existsSync(stash)).toBe(false);
  });

  it('staging twice keeps the first real file, and a name never staged cannot be written', () => {
    writeFileSync(join(dir, 'build-id.txt'), 'abc-real\n');
    stage(dir, stash, NAMES);
    put(dir, stash, 'build-id.txt', 'fixture-id\n');
    stage(dir, stash, NAMES);
    restore(dir, stash);
    expect(readFileSync(join(dir, 'build-id.txt'), 'utf8')).toBe('abc-real\n');
    expect(() => put(dir, stash, 'build-id.txt', 'x')).toThrow(/was not staged/);
    expect(readFileSync(join(dir, 'build-id.txt'), 'utf8')).toBe('abc-real\n');
  });

  it('with no stash there is nothing to restore', () => {
    expect(restore(dir, stash)).toEqual([]);
    expect(listing()).toEqual(['code-intelligence']);
  });
});
