/**
 * The conflict-marker gate, over texts and over a throwaway git repository: a real three-marker block it must fail
 * (also when git is configured to colour its output), and the two lookalikes it must pass — a Markdown setext heading underlined with seven `=`, and a marker block shown
 * as an indented example. The markers are built with `repeat` so this file cannot trip the gate it tests.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { checkRepository, markersIn } from './check-conflict-markers.mjs';

const OPEN = '<'.repeat(7);
const BASE = '|'.repeat(7);
const SEP = '='.repeat(7);
const CLOSE = '>'.repeat(7);

/** The block the 361f71c merge left in first-executions.md, in shape: four table rows split two ways. */
const block = ['# Record', '', '| a | b |', '|---|---|', `${OPEN} HEAD`, '| 1 | 2 |', SEP, '| 3 | 4 |', `${CLOSE} origin/main`, ''].join('\n');
const heading = ['Title', SEP, '', 'Body under a setext heading.', ''].join('\n');
const indented = ['A merge looks like this:', '', '```text', `    ${OPEN} HEAD`, '    ours', `    ${SEP}`, '    theirs', `    ${CLOSE} origin/main`, '```', ''].join('\n');

describe('markersIn — a real block fails, the lookalikes pass', () => {
  it('names all three lines of a marker block, with their line numbers', () => {
    expect(markersIn(block)).toEqual([
      { line: 5, marker: OPEN },
      { line: 7, marker: SEP },
      { line: 9, marker: CLOSE },
    ]);
  });

  it('names the base marker of a diff3 block, and an opening or closing marker that stands alone', () => {
    const diff3 = [`${OPEN} ours`, 'a', `${BASE} base`, 'b', SEP, 'c', `${CLOSE} theirs`].join('\n');
    expect(markersIn(diff3).map((m: { line: number }) => m.line)).toEqual([1, 3, 5, 7]);
    expect(markersIn(`text\n${CLOSE}\n`)).toEqual([{ line: 2, marker: CLOSE }]);
    expect(markersIn(`${OPEN}\nrest\n`)).toEqual([{ line: 1, marker: OPEN }]);
  });

  it('passes a setext heading underline that no opening marker precedes, before or after a closed block', () => {
    expect(markersIn(heading)).toEqual([]);
    expect(markersIn(`${OPEN} a\nx\n${CLOSE} b\n\nTitle\n${SEP}\n`).map((m: { marker: string }) => m.marker)).toEqual([OPEN, CLOSE]);
  });

  it('passes an indented example and a marker-like line that git would not write', () => {
    expect(markersIn(indented)).toEqual([]);
    expect(markersIn(`${OPEN}${'<'} eight\n${CLOSE}x\n${SEP}=\n`)).toEqual([]);
  });

  it('passes a text with neither', () => {
    expect(markersIn('# Plain\n\nNothing here.\n')).toEqual([]);
  });
});

describe('checkRepository — over the working copy and the index of a git checkout', () => {
  let root: string;
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'conflict-markers-'));
    git('init', '-q');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('fails a staged Markdown file holding a block, naming file and line on both sides', () => {
    writeFileSync(join(root, 'first-executions.md'), block);
    writeFileSync(join(root, 'heading.md'), heading);
    writeFileSync(join(root, 'example.md'), indented);
    git('add', '.');
    const problems = checkRepository(root);
    expect(problems.filter((p: { where: string }) => p.where === 'index')).toEqual([
      { where: 'index', path: 'first-executions.md', line: 5, marker: OPEN },
      { where: 'index', path: 'first-executions.md', line: 7, marker: SEP },
      { where: 'index', path: 'first-executions.md', line: 9, marker: CLOSE },
    ]);
    expect(problems.filter((p: { where: string }) => p.where === 'working copy').map((p: { path: string }) => p.path)).toEqual([
      'first-executions.md',
      'first-executions.md',
      'first-executions.md',
    ]);
  });

  it('passes the heading, the example and a plain file', () => {
    writeFileSync(join(root, 'heading.md'), heading);
    writeFileSync(join(root, 'example.md'), indented);
    writeFileSync(join(root, 'plain.json'), '{ "a": 1 }\n');
    git('add', '.');
    expect(checkRepository(root)).toEqual([]);
  });

  it('fails a block still staged after the working copy was cleaned, and a block not yet staged', () => {
    writeFileSync(join(root, 'a.md'), block);
    git('add', 'a.md');
    writeFileSync(join(root, 'a.md'), '# Record\n');
    expect(checkRepository(root).map((p: { where: string; path: string }) => `${p.where} ${p.path}`)).toEqual([
      'index a.md',
      'index a.md',
      'index a.md',
    ]);
    git('add', 'a.md');
    writeFileSync(join(root, 'a.md'), block);
    expect(checkRepository(root).map((p: { where: string }) => p.where)).toEqual(['working copy', 'working copy', 'working copy']);
  });

  it('fails a staged block when git is configured to colour its output always', () => {
    // `color.ui=always` / `color.grep=always` once wrapped every path `git grep -l` named in ANSI escapes, the read
    // of that name failed, and the failure was skipped: a staged block read as green.
    git('config', 'color.ui', 'always');
    git('config', 'color.grep', 'always');
    writeFileSync(join(root, 'first-executions.md'), block);
    git('add', 'first-executions.md');
    const problems = checkRepository(root);
    expect(problems.filter((p: { where: string }) => p.where === 'index')).toEqual([
      { where: 'index', path: 'first-executions.md', line: 5, marker: OPEN },
      { where: 'index', path: 'first-executions.md', line: 7, marker: SEP },
      { where: 'index', path: 'first-executions.md', line: 9, marker: CLOSE },
    ]);
    expect(problems.filter((p: { where: string }) => p.where === 'working copy')).toHaveLength(3);
  });

  it('reads the working copy of an unmerged path and reports nothing it could not read', () => {
    git('config', 'user.email', 'gate@example.invalid');
    git('config', 'user.name', 'gate');
    writeFileSync(join(root, 'a.md'), '# Record\n\nbase\n');
    git('add', 'a.md');
    git('commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'theirs');
    writeFileSync(join(root, 'a.md'), '# Record\n\ntheirs\n');
    git('commit', '-q', '-am', 'theirs');
    git('checkout', '-q', '-');
    writeFileSync(join(root, 'a.md'), '# Record\n\nours\n');
    git('commit', '-q', '-am', 'ours');
    expect(() => git('merge', '-q', 'theirs')).toThrow();
    const problems = checkRepository(root);
    expect(problems.filter((p: object) => 'unreadable' in p)).toEqual([]);
    expect(problems.map((p: { where: string; path: string; line: number }) => `${p.where} ${p.path}:${p.line}`)).toEqual([
      'working copy a.md:3',
      'working copy a.md:5',
      'working copy a.md:7',
    ]);
  });

  it('throws, rather than answering skipped or clean, when git cannot grep a checkout', () => {
    writeFileSync(join(root, 'a.md'), block);
    git('add', 'a.md');
    writeFileSync(join(root, '.git', 'index'), 'not an index');
    expect(() => checkRepository(root)).toThrow(/git grep/);
  });

  it('ignores an untracked file, and answers null outside a git checkout', () => {
    writeFileSync(join(root, 'untracked.md'), block);
    expect(checkRepository(root)).toEqual([]);
    const bare = mkdtempSync(join(tmpdir(), 'conflict-markers-nogit-'));
    try {
      expect(checkRepository(bare)).toBeNull();
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});
