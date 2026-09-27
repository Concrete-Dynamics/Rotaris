import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_ID_FILE, identifyBuild, PATHS, runBuildIdStep } from './build-id.mjs';

/**
 * The build-identifier writer (REQ-SHELL-140; first-release-plan.md §4.4). Every case but the last block runs it over a
 * FIXTURE repository made in a temporary directory, so what the identifier says is produced by changing the tree: a
 * clean commit, a modified file, an untracked one, an ignored one, no repository at all.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** A commit needs an author, and the operator's own configuration may ask for a signature this test cannot make. */
const IDENTITY = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', '-c', 'commit.gpgsign=false'];

/**
 * The fixture's git runs without the variables an enclosing git process sets (a hook running `pnpm check`), which would
 * otherwise point `init` and `commit` at the repository under test instead of the fixture.
 */
const FIXTURE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX)$/.test(k)));

function run(root: string, ...args: string[]): string {
  const r = spawnSync('git', ['-C', root, ...IDENTITY, ...args], { encoding: 'utf8', env: FIXTURE_ENV });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let root: string;
const put = (rel: string, text: string) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rotaris-build-id-'));
  run(root, 'init', '-q');
  // The real repository ignores the output (REQ-SHELL-140's asset is generated per build, never committed), so the
  // fixture does too: the writer's own file must not make the next identifier dirty.
  put('.gitignore', `${PATHS.output}\n`);
  put('README.md', '# fixture\n');
  run(root, 'add', '-A');
  run(root, 'commit', '-q', '-m', 'fixture');
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('REQ-SHELL-140: the identifier names the commit the build was made from', () => {
  it('is the full commit name for a clean tree, and the same on every run', () => {
    const head = run(root, 'rev-parse', 'HEAD');
    expect(identifyBuild({ root })).toEqual({ id: head, commit: head, dirty: false });
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    const first = runBuildIdStep({ root });
    const second = runBuildIdStep({ root });
    expect(first).toEqual({ code: 0, stdout: [`[build-id] wrote ${PATHS.output}: ${head}`], stderr: [] });
    expect(second).toEqual(first);
    // One line, stripped: the appendix's shape of the asset.
    expect(readFileSync(join(root, PATHS.output), 'utf8')).toBe(`${head}\n`);
  });

  it('says -dirty when a tracked file differs from the commit', () => {
    const head = run(root, 'rev-parse', 'HEAD');
    put('README.md', '# fixture, edited\n');
    expect(identifyBuild({ root })).toEqual({ id: `${head}-dirty`, commit: head, dirty: true });
    const r = runBuildIdStep({ root });
    expect(r.code).toBe(0);
    expect(r.stdout[0]).toContain('-dirty');
    expect(readFileSync(join(root, PATHS.output), 'utf8')).toBe(`${head}-dirty\n`);
  });

  it('says -dirty for an untracked file, and not for an ignored one', () => {
    const head = run(root, 'rev-parse', 'HEAD');
    put('notes/scratch.md', 'not committed\n');
    expect(identifyBuild({ root })).toMatchObject({ id: `${head}-dirty`, dirty: true });
    rmSync(join(root, 'notes'), { recursive: true });
    put('.gitignore', `${PATHS.output}\nout/\n`);
    run(root, 'commit', '-q', '-am', 'ignore out/');
    const next = run(root, 'rev-parse', 'HEAD');
    put('out/main/index.js', '// a build output\n');
    expect(identifyBuild({ root })).toEqual({ id: next, commit: next, dirty: false });
  });

  it('answers for the root it is given, not for a repository an enclosing git process points at', () => {
    const other = mkdtempSync(join(tmpdir(), 'rotaris-build-id-other-'));
    try {
      run(other, 'init', '-q');
      writeFileSync(join(other, 'x'), 'x');
      run(other, 'add', '-A');
      run(other, 'commit', '-q', '-m', 'other');
      const env = { ...process.env, GIT_DIR: join(other, '.git'), GIT_WORK_TREE: other, GIT_INDEX_FILE: join(other, '.git', 'index') };
      expect(identifyBuild({ root, env })).toMatchObject({ commit: run(root, 'rev-parse', 'HEAD'), dirty: false });
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});

describe('REQ-STARTUP-149: exit 1 with one `error:` line, and no file left behind', () => {
  it('a tree that is no repository cannot name its commit, and an earlier file is removed', () => {
    const bare = mkdtempSync(join(tmpdir(), 'rotaris-build-id-none-'));
    try {
      mkdirSync(join(bare, 'apps/desktop/resources'), { recursive: true });
      writeFileSync(join(bare, PATHS.output), '0123456789abcdef0123456789abcdef01234567\n');
      const env = { ...process.env, GIT_CEILING_DIRECTORIES: dirname(bare) };
      const r = runBuildIdStep({ root: bare, env });
      expect(r.code).toBe(1);
      expect(r.stdout).toEqual([]);
      expect(r.stderr).toHaveLength(1);
      expect(r.stderr[0]).toMatch(new RegExp(`^error: the commit this build is made from cannot be named in ${bare.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}: git rev-parse .* exited 128`));
      expect(r.stderr[0]?.endsWith(`; ${PATHS.output} was not written`)).toBe(true);
      expect(existsSync(join(bare, PATHS.output))).toBe(false);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it('a repository with no commit yet is the same handled error', () => {
    const empty = mkdtempSync(join(tmpdir(), 'rotaris-build-id-empty-'));
    try {
      run(empty, 'init', '-q');
      const r = runBuildIdStep({ root: empty });
      expect(r.code).toBe(1);
      expect(r.stderr[0]).toMatch(/^error: the commit this build is made from cannot be named in /);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('a git that cannot be run is named, not thrown', () => {
    const r = runBuildIdStep({ root, git: join(root, 'no-such-git') });
    expect(r.code).toBe(1);
    expect(r.stderr[0]).toMatch(/could not be run \(ENOENT\)/);
    expect(existsSync(join(root, PATHS.output))).toBe(false);
  });

  it('a directory standing where the file goes is a handled error', () => {
    mkdirSync(join(root, PATHS.output), { recursive: true });
    const r = runBuildIdStep({ root });
    expect(r.code).toBe(1);
    expect(r.stderr[0]).toBe(`error: ${PATHS.output} cannot be written: EISDIR`);
    expect(r.stderr.every((l) => l.startsWith('error: '))).toBe(true);
  });

  it('refuses an argument as a usage error (2), writing nothing', () => {
    const r = spawnSync(process.execPath, [join(REPO, 'tools/build-id/write.mjs'), '--short'], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toBe('error: pnpm build-id takes no arguments (got --short)\n');
  });
});

describe('the real repository', () => {
  it('writes the file the About page reads, where the packaging step picks it up, and never commits it', () => {
    expect(BUILD_ID_FILE).toBe('build-id.txt');
    expect(PATHS.output).toBe('apps/desktop/resources/build-id.txt');
    const ignored = readFileSync(join(REPO, '.gitignore'), 'utf8').split(/\r?\n/);
    expect(ignored).toContain(PATHS.output);
  });
});
