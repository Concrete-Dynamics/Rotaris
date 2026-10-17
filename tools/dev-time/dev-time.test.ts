import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REDIRECTING } from '../build-id/build-id.mjs';
import {
  GATE_STAGES,
  HOME_ENV,
  KINDS,
  SCHEMA,
  STORE_FILE,
  aggregate,
  appendRecord,
  cancelSpan,
  defaultStoreDir,
  failedRecord,
  filterByDays,
  formatDuration,
  formatRecordLine,
  formatReport,
  gitFacts,
  hostFacts,
  listPending,
  parseKindLabel,
  pendingFile,
  pnpmCommand,
  readRecords,
  runGate,
  runMeasured,
  shellCommand,
  startSpan,
  stopSpan,
  storePath,
} from './dev-time.mjs';
import type { Command, DevTimeRecord, SpawnLike, SpawnResultLike, Totals } from './dev-time.mjs';

/**
 * The development-time measure (R-075 — priority 3 of the owner's process review of 2026-10-18). The cases run the
 * library over fixture repositories in temporary directories and the store under `ROTARIS_DEV_TIME_HOME`, so
 * nothing here writes inside the repository: a record's git facts are produced by changing the fixture tree, its
 * store lines by appending, and its CLI behaviour by running `cli.mjs` the way `pnpm dev-time` does.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(dirname(fileURLToPath(import.meta.url)), 'cli.mjs');
/** A commit needs an author, and the operator's configuration may ask for a signature this test cannot make. */
const IDENTITY = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', '-c', 'commit.gpgsign=false'];
/** The fixture's git runs without the variables an enclosing git process sets (a hook running `pnpm check`). */
const FIXTURE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !REDIRECTING.includes(k)));

function gitRun(dir: string, ...args: string[]): string {
  const r = spawnSync('git', ['-C', dir, ...IDENTITY, ...args], { encoding: 'utf8', env: FIXTURE_ENV });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function put(dir: string, rel: string, text: string): void {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
}

function sampleRecord(over: Partial<DevTimeRecord> = {}): DevTimeRecord {
  return {
    schema: 1,
    kind: 'gate',
    label: 'test',
    command: 'pnpm run test',
    cwd: '/x',
    root: null,
    repo: null,
    branch: null,
    head: null,
    dirty: null,
    host: { platform: 'linux', arch: 'x64', node: '24.0.0', cpus: 8, memoryGb: 16 },
    startedAt: '2026-10-18T00:00:00.000Z',
    endedAt: '2026-10-18T00:00:05.000Z',
    durationMs: 5000,
    exitCode: 0,
    signal: null,
    error: null,
    ...over,
  };
}

interface SpawnCall {
  file: string;
  args: string[];
  options: { cwd: string; env: NodeJS.ProcessEnv; stdio: 'inherit'; windowsHide: boolean; shell: boolean };
}

/** A `spawn` that answers per file name and remembers every call, so no test runs a real child. */
function fakeSpawn(answer: (file: string) => SpawnResultLike): { calls: SpawnCall[]; spawn: SpawnLike } {
  const calls: SpawnCall[] = [];
  const spawn: SpawnLike = (file, args, options) => {
    calls.push({ file, args, options });
    return answer(file);
  };
  return { calls, spawn };
}

async function cli(store: string, cwd: string, args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...FIXTURE_ENV, ROTARIS_DEV_TIME_HOME: store, GIT_CEILING_DIRECTORIES: dirname(cwd) },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

let root: string;
let bare: string;
let store: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rotaris-dev-time-repo-'));
  gitRun(root, 'init', '-q');
  put(root, 'README.md', '# fixture\n');
  gitRun(root, 'add', '-A');
  gitRun(root, 'commit', '-q', '-m', 'fixture');
  bare = mkdtempSync(join(tmpdir(), 'rotaris-dev-time-bare-'));
  store = mkdtempSync(join(tmpdir(), 'rotaris-dev-time-store-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(bare, { recursive: true, force: true });
  rmSync(store, { recursive: true, force: true });
});

describe('R-075: the identity of a measurement', () => {
  it('the kind is from the closed set and the label is one word', () => {
    expect(parseKindLabel('gate:test')).toEqual({ kind: 'gate', label: 'test' });
    expect(parseKindLabel('repair:flaky-windows-test')).toEqual({ kind: 'repair', label: 'flaky-windows-test' });
    expect(parseKindLabel('build:v1.2.3_rc')).toEqual({ kind: 'build', label: 'v1.2.3_rc' });
    expect(parseKindLabel('nope:test')).toMatchObject({ problem: expect.stringContaining('not a kind') });
    expect(parseKindLabel('gate')).toMatchObject({ problem: expect.stringContaining('<kind>:<label>') });
    expect(parseKindLabel('gate:')).toMatchObject({ problem: expect.stringContaining('<kind>:<label>') });
    expect(parseKindLabel(':test')).toMatchObject({ problem: expect.stringContaining('<kind>:<label>') });
    expect(parseKindLabel('gate:two words')).toMatchObject({ problem: expect.stringContaining('not a label') });
  });

  it('the published sets hold what the gate and the report speak', () => {
    expect(SCHEMA).toBe(1);
    expect(STORE_FILE).toBe('log.jsonl');
    expect(HOME_ENV).toBe('ROTARIS_DEV_TIME_HOME');
    expect(GATE_STAGES).toEqual(['symbols', 'typecheck', 'lint', 'test']);
    expect(KINDS).toEqual(['setup', 'build', 'gate', 'proof', 'repair', 'rebase', 'other']);
  });

  it('the store directory is ~/.rotaris/dev-time unless the environment moves it', () => {
    expect(defaultStoreDir({}, 'C:\\Users\\x')).toBe(join('C:\\Users\\x', '.rotaris', 'dev-time'));
    expect(defaultStoreDir({ [HOME_ENV]: join(bare, 'elsewhere') }, 'C:\\Users\\x')).toBe(resolve(bare, 'elsewhere'));
    expect(defaultStoreDir({ [HOME_ENV]: '' }, 'C:\\Users\\x')).toBe(join('C:\\Users\\x', '.rotaris', 'dev-time'));
    expect(storePath('/s')).toBe(join('/s', 'log.jsonl'));
  });
});

describe('R-075: one command line, built and measured', () => {
  it('shellCommand runs tokens directly off Windows and builds a quoted cmd line on it', () => {
    expect(shellCommand(['a', 'b c'], 'linux')).toEqual({ file: 'a', args: ['b c'], pretty: 'a b c' });
    expect(shellCommand(['a', 'b c'], 'win32')).toEqual({ file: 'a "b c"', args: [], pretty: 'a b c', shell: true });
    expect(shellCommand(['a', 'say "hi"'], 'win32')).toEqual({ file: 'a "say ""hi"""', args: [], pretty: 'a say "hi"', shell: true });
    expect(() => shellCommand([], 'linux')).toThrow(TypeError);
  });

  it('pnpmCommand runs pnpm through its own entry when npm_execpath names it', () => {
    const entry = join(bare, 'pnpm.cjs');
    const plain = pnpmCommand('test', [], { npm_execpath: entry });
    expect(plain).toEqual({ file: process.execPath, args: [entry, 'run', 'test'], pretty: 'pnpm run test' });
    const withArgs = pnpmCommand('theme-proof', ['--counterfactual=text'], { npm_execpath: entry });
    expect(withArgs.args).toEqual([entry, 'run', 'theme-proof', '--', '--counterfactual=text']);
    expect(withArgs.pretty).toBe('pnpm run theme-proof -- --counterfactual=text');
  });

  it('pnpmCommand falls back to the platform’s own pnpm invocation', () => {
    const fallback = pnpmCommand('test', [], {});
    if (process.platform === 'win32') {
      expect(fallback).toEqual({ file: 'pnpm.cmd run test', args: [], pretty: 'pnpm run test', shell: true });
    } else {
      expect(fallback).toEqual({ file: 'pnpm', args: ['run', 'test'], pretty: 'pnpm run test' });
    }
  });

  it('runMeasured appends one record of the command and answers its exit code', () => {
    const { calls, spawn } = fakeSpawn(() => ({ status: 3, signal: null }));
    const { record, code } = runMeasured({
      storeDir: store,
      kind: 'build',
      label: 'desktop',
      command: { file: 'fake', args: ['--watch'], pretty: 'fake --watch' },
      cwd: root,
      env: FIXTURE_ENV,
      spawn,
    });
    expect(code).toBe(3);
    expect(calls).toMatchObject([{ file: 'fake', args: ['--watch'], options: { cwd: root, stdio: 'inherit', shell: false } }]);
    expect(record).toMatchObject({
      schema: 1,
      kind: 'build',
      label: 'desktop',
      command: 'fake --watch',
      cwd: resolve(root),
      branch: gitRun(root, 'branch', '--show-current'),
      head: gitRun(root, 'rev-parse', 'HEAD'),
      dirty: false,
      exitCode: 3,
      signal: null,
      error: null,
    });
    // git answers with its own separators (`C:/…`); what matters is the directory it names.
    expect(resolve(record.root ?? '')).toBe(resolve(root));
    expect(record.durationMs).toBeGreaterThanOrEqual(0);
    expect(record.startedAt <= record.endedAt).toBe(true);
    expect(Number.isFinite(Date.parse(record.startedAt))).toBe(true);
    expect(record.host.platform).toBe(process.platform);
    const { records, missing } = readRecords(store);
    expect(missing).toBe(false);
    expect(records).toHaveLength(1);
  });

  it('runMeasured maps a signal POSIX-style and a spawn failure to 1', () => {
    const killed = fakeSpawn(() => ({ status: null, signal: 'SIGTERM' }));
    const first = runMeasured({
      storeDir: store,
      kind: 'proof',
      label: 'x',
      command: { file: 'fake', args: [], pretty: 'fake' },
      cwd: bare,
      env: FIXTURE_ENV,
      spawn: killed.spawn,
    });
    expect(first.code).toBe(143);
    expect(first.record.signal).toBe('SIGTERM');
    expect(first.record.exitCode).toBeNull();
    expect(first.record.root).toBeNull();

    const unknown = fakeSpawn(() => ({ status: null, signal: 'SIGWEIRD' }));
    expect(runMeasured({ storeDir: store, kind: 'proof', label: 'y', command: { file: 'fake', args: [], pretty: 'fake' }, cwd: bare, env: FIXTURE_ENV, spawn: unknown.spawn }).code).toBe(129);

    const failed = fakeSpawn(() => ({ status: null, signal: null, error: { code: 'ENOENT' } }));
    const third = runMeasured({ storeDir: store, kind: 'proof', label: 'z', command: { file: 'nope', args: [], pretty: 'nope' }, cwd: bare, env: FIXTURE_ENV, spawn: failed.spawn });
    expect(third.code).toBe(1);
    expect(third.record.error).toBe('ENOENT');
  });
});

describe('R-075: the git and host facts a record carries', () => {
  it('names the commit, the branch and the dirt of the directory it runs in', () => {
    const facts = gitFacts({ cwd: root, env: FIXTURE_ENV });
    expect(facts.root).toBeDefined();
    expect(resolve(facts.root ?? '')).toBe(resolve(root));
    expect(facts.branch).toBe(gitRun(root, 'branch', '--show-current'));
    expect(facts.head).toMatch(/^[0-9a-f]{40}$/);
    expect(facts.head).toBe(gitRun(root, 'rev-parse', 'HEAD'));
    expect(facts.dirty).toBe(false);

    put(root, 'README.md', '# fixture, edited\n');
    expect(gitFacts({ cwd: root, env: FIXTURE_ENV }).dirty).toBe(true);

    put(root, 'scratch/note.txt', 'untracked\n');
    expect(gitFacts({ cwd: root, env: FIXTURE_ENV }).dirty).toBe(true);
  });

  it('answers for a subdirectory with the same root, and for a linked worktree with the shared repository', () => {
    mkdirSync(join(root, 'src'), { recursive: true });
    const fromSub = gitFacts({ cwd: join(root, 'src'), env: FIXTURE_ENV });
    expect(resolve(fromSub.root ?? '')).toBe(resolve(root));

    const worktree = mkdtempSync(join(tmpdir(), 'rotaris-dev-time-wt-'));
    try {
      gitRun(root, 'worktree', 'add', '-q', worktree, '-b', 'wt-branch');
      const fromWorktree = gitFacts({ cwd: worktree, env: FIXTURE_ENV });
      expect(resolve(fromWorktree.root ?? '')).toBe(resolve(worktree));
      expect(fromWorktree.branch).toBe('wt-branch');
      // `repo` is the common directory: the grouping key one repository's worktrees share.
      expect(resolve(fromWorktree.repo ?? '')).toBe(resolve(join(root, '.git')));
      expect(resolve(fromWorktree.repo ?? '')).toBe(resolve(gitFacts({ cwd: root, env: FIXTURE_ENV }).repo ?? ''));
    } finally {
      rmSync(worktree, { recursive: true, force: true });
    }
  });

  it('answers nulls outside a repository, and for the directory given rather than one an enclosing git points at', () => {
    const none = gitFacts({ cwd: bare, env: { ...FIXTURE_ENV, GIT_CEILING_DIRECTORIES: dirname(bare) } });
    expect(none).toEqual({ root: null, repo: null, branch: null, head: null, dirty: null });

    const other = mkdtempSync(join(tmpdir(), 'rotaris-dev-time-other-'));
    try {
      gitRun(other, 'init', '-q');
      put(other, 'x.txt', 'x\n');
      gitRun(other, 'add', '-A');
      gitRun(other, 'commit', '-q', '-m', 'other');
      const env = { ...FIXTURE_ENV, GIT_DIR: join(other, '.git'), GIT_WORK_TREE: other, GIT_INDEX_FILE: join(other, '.git', 'index') };
      const facts = gitFacts({ cwd: root, env });
      expect(facts.head).toBe(gitRun(root, 'rev-parse', 'HEAD'));
      expect(resolve(facts.root ?? '')).toBe(resolve(root));
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('hostFacts describes the machine the measurement ran on', () => {
    const facts = hostFacts();
    expect(facts.platform).toBe(process.platform);
    expect(facts.arch).toBe(process.arch);
    expect(facts.node).toMatch(/^\d+\.\d+\.\d+/);
    expect(facts.cpus).toBeGreaterThanOrEqual(1);
    expect(facts.memoryGb).toBeGreaterThan(0);
  });
});

describe('R-075: the store is append-only JSONL that never silently shrinks', () => {
  it('readRecords keeps the order, skips what it cannot read, and counts every skip by line', () => {
    const first = sampleRecord({ label: 'first' });
    const last = sampleRecord({ label: 'last' });
    const lines = [
      JSON.stringify(first),
      '{"schema":1,',
      '',
      JSON.stringify({ ...sampleRecord(), schema: 2 }),
      JSON.stringify({ schema: 1, kind: 'gate' }),
      JSON.stringify(last),
    ];
    writeFileSync(storePath(store), lines.join('\n'), 'utf8');
    const { records, skips, missing } = readRecords(store);
    expect(missing).toBe(false);
    expect(records.map((record) => record.label)).toEqual(['first', 'last']);
    expect(skips).toEqual({ unreadable: [2], unknownSchema: [4], malformed: [5] });
  });

  it('a store that does not exist yet is missing, not empty', () => {
    const { records, missing } = readRecords(store);
    expect(missing).toBe(true);
    expect(records).toEqual([]);
  });

  it('appendRecord makes the directory and appends one line per record', () => {
    const nested = join(store, 'deep', 'nested');
    const file = appendRecord(nested, sampleRecord({ label: 'one' }));
    appendRecord(nested, sampleRecord({ label: 'two' }));
    expect(file).toBe(storePath(nested));
    const text = readFileSync(file, 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.trim().split('\n')).toHaveLength(2);
    expect(readRecords(nested).records.map((record) => record.label)).toEqual(['one', 'two']);
  });
});

describe('R-075: the gate’s stages are timed apart, with the gate’s own stopping', () => {
  const stageCommand = (script: string): Command => ({ file: script, args: [], pretty: `pnpm run ${script}`, shell: false });

  it('times the four stages in order and passes the gate on', () => {
    const { calls, spawn } = fakeSpawn(() => ({ status: 0, signal: null }));
    const { code } = runGate({ storeDir: store, cwd: root, env: FIXTURE_ENV, commandFor: stageCommand, spawn });
    expect(code).toBe(0);
    expect(calls.map((call) => call.file)).toEqual(['symbols', 'typecheck', 'lint', 'test']);
    const { records } = readRecords(store);
    expect(records.map((record) => `${record.kind}:${record.label}`)).toEqual(['gate:symbols', 'gate:typecheck', 'gate:lint', 'gate:test']);
    expect(records.every((record) => record.exitCode === 0)).toBe(true);
  });

  it('a failing stage stops the run with its code, as the gate’s && does', () => {
    const { calls, spawn } = fakeSpawn((file) => ({ status: file === 'typecheck' ? 1 : 0, signal: null }));
    const { code } = runGate({ storeDir: store, cwd: root, env: FIXTURE_ENV, commandFor: stageCommand, spawn });
    expect(code).toBe(1);
    expect(calls.map((call) => call.file)).toEqual(['symbols', 'typecheck']);
    expect(readRecords(store).records.map((record) => record.label)).toEqual(['symbols', 'typecheck']);
  });

  it('keepGoing runs the rest anyway and answers the first failure', () => {
    const { calls, spawn } = fakeSpawn((file) => ({ status: file === 'typecheck' ? 1 : 0, signal: null }));
    const { code } = runGate({ storeDir: store, cwd: root, env: FIXTURE_ENV, keepGoing: true, commandFor: stageCommand, spawn });
    expect(code).toBe(1);
    expect(calls.map((call) => call.file)).toEqual(['symbols', 'typecheck', 'lint', 'test']);
    expect(readRecords(store).records).toHaveLength(4);
  });

  it('a named subset runs alone', () => {
    const { calls, spawn } = fakeSpawn(() => ({ status: 0, signal: null }));
    const { code } = runGate({ storeDir: store, cwd: root, env: FIXTURE_ENV, stages: ['test'], commandFor: stageCommand, spawn });
    expect(code).toBe(0);
    expect(calls.map((call) => call.file)).toEqual(['test']);
  });
});

describe('R-075: a manual span around work no single command covers', () => {
  it('opens, closes and records one span for the worktree, however deep the shell stands', () => {
    const opened = startSpan({ storeDir: store, kind: 'repair', label: 'flaky', cwd: root, env: FIXTURE_ENV, now: () => new Date('2026-10-18T10:00:00.000Z') });
    if (!('span' in opened)) throw new Error('the span was refused');
    expect(existsSync(opened.file)).toBe(true);
    expect(opened.span.startedAt).toBe('2026-10-18T10:00:00.000Z');

    const again = startSpan({ storeDir: store, kind: 'repair', label: 'other', cwd: root, env: FIXTURE_ENV });
    expect(again).toMatchObject({ problem: expect.stringContaining('already open') });
    expect(again).toMatchObject({ problem: expect.stringContaining('repair:flaky') });

    mkdirSync(join(root, 'src'), { recursive: true });
    const closed = stopSpan({ storeDir: store, cwd: join(root, 'src'), env: FIXTURE_ENV, now: () => new Date('2026-10-18T10:00:01.234Z') });
    if (!('record' in closed)) throw new Error('the span was not found from the subdirectory');
    expect(closed.record).toMatchObject({
      kind: 'repair',
      label: 'flaky',
      command: null,
      exitCode: null,
      signal: null,
      error: null,
      startedAt: '2026-10-18T10:00:00.000Z',
      endedAt: '2026-10-18T10:00:01.234Z',
      durationMs: 1234,
      cwd: resolve(join(root, 'src')),
    });
    expect(existsSync(opened.file)).toBe(false);
    expect(readRecords(store).records).toHaveLength(1);
  });

  it('a stop with no span open is refused, not invented', () => {
    expect(stopSpan({ storeDir: store, cwd: root, env: FIXTURE_ENV })).toMatchObject({ problem: expect.stringContaining('no span is open') });
  });

  it('a clock correction backwards cannot mint a negative measurement', () => {
    startSpan({ storeDir: store, kind: 'rebase', label: 'onto-main', cwd: root, env: FIXTURE_ENV, now: () => new Date('2026-10-18T10:00:05.000Z') });
    const closed = stopSpan({ storeDir: store, cwd: root, env: FIXTURE_ENV, now: () => new Date('2026-10-18T10:00:00.000Z') });
    if (!('record' in closed)) throw new Error('the span was not found');
    expect(closed.record.durationMs).toBe(0);
  });

  it('cancel drops the span and records nothing', () => {
    startSpan({ storeDir: store, kind: 'repair', label: 'abandoned', cwd: root, env: FIXTURE_ENV });
    const dropped = cancelSpan({ storeDir: store, cwd: root, env: FIXTURE_ENV });
    expect(dropped).toMatchObject({ span: { kind: 'repair', label: 'abandoned' } });
    expect(readRecords(store).missing).toBe(true);
    expect(cancelSpan({ storeDir: store, cwd: root, env: FIXTURE_ENV })).toMatchObject({ problem: expect.stringContaining('nothing to cancel') });
  });

  it('one worktree shares a span across its directories; another directory is keyed apart', () => {
    const fromRoot = pendingFile(store, { cwd: root, env: FIXTURE_ENV });
    mkdirSync(join(root, 'src'), { recursive: true });
    expect(pendingFile(store, { cwd: join(root, 'src'), env: FIXTURE_ENV })).toBe(fromRoot);
    expect(pendingFile(store, { cwd: bare, env: FIXTURE_ENV })).not.toBe(fromRoot);
  });

  it('lists every open span across worktrees, newest first, unreadable files named', () => {
    startSpan({ storeDir: store, kind: 'repair', label: 'older', cwd: root, env: FIXTURE_ENV, now: () => new Date('2026-10-18T09:00:00.000Z') });
    startSpan({ storeDir: store, kind: 'repair', label: 'newer', cwd: bare, env: FIXTURE_ENV, now: () => new Date('2026-10-18T11:00:00.000Z') });
    writeFileSync(join(store, 'pending', 'zz.json'), '{ torn', 'utf8');
    const open = listPending(store);
    expect(open.map((entry) => entry.span?.label)).toEqual(['newer', 'older', undefined]);
  });
});

describe('R-075: the report, from the records alone', () => {
  it('filters by a window of days, keeping a record whose date cannot be parsed', () => {
    const now = new Date('2026-10-18T12:00:00.000Z');
    const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
    const records = [
      sampleRecord({ startedAt: daysAgo(0.5), label: 'today' }),
      sampleRecord({ startedAt: daysAgo(2), label: 'two' }),
      sampleRecord({ startedAt: daysAgo(10), label: 'ten' }),
      sampleRecord({ startedAt: 'not-a-date', label: 'torn' }),
    ];
    expect(filterByDays(records, null, now).map((record) => record.label)).toEqual(['today', 'two', 'ten', 'torn']);
    expect(filterByDays(records, 3, now).map((record) => record.label)).toEqual(['today', 'two', 'torn']);
  });

  it('failedRecord is a non-zero exit, a signal or a spawn failure; a manual span is not a failure', () => {
    expect(failedRecord(sampleRecord({ exitCode: 0 }))).toBe(false);
    expect(failedRecord(sampleRecord({ exitCode: 1 }))).toBe(true);
    expect(failedRecord(sampleRecord({ exitCode: null, signal: 'SIGTERM' }))).toBe(true);
    expect(failedRecord(sampleRecord({ exitCode: null, signal: null, error: 'ENOENT' }))).toBe(true);
    expect(failedRecord(sampleRecord({ command: null, exitCode: null, signal: null, error: null }))).toBe(false);
  });

  it('aggregates totals, kinds and labels, with the label rows sorted by the time they hold', () => {
    const records = [
      sampleRecord({ kind: 'gate', label: 'test', durationMs: 10_000, exitCode: 0 }),
      sampleRecord({ kind: 'gate', label: 'test', durationMs: 2_000, exitCode: 1 }),
      sampleRecord({ kind: 'proof', label: 'theme-proof', durationMs: 30_000, exitCode: 0 }),
      sampleRecord({ kind: 'repair', label: 'flaky', durationMs: 60_000, command: null, exitCode: null, signal: 'SIGTERM' }),
    ];
    const totals: Totals = aggregate(records);
    expect(totals.count).toBe(4);
    expect(totals.durationMs).toBe(102_000);
    expect(totals.failures).toBe(2);
    expect(totals.byKind.map((row) => row.kind)).toEqual(['gate', 'proof', 'repair']);
    expect(totals.byLabel.map((row) => row.label)).toEqual(['flaky', 'theme-proof', 'test']);

    const gate = totals.byLabel.find((row) => row.label === 'test');
    expect(gate).toMatchObject({ kind: 'gate', count: 2, durationMs: 12_000, meanMs: 6_000, medianMs: 6_000, minMs: 2_000, maxMs: 10_000, failures: 1 });
    expect(gate?.share).toBeCloseTo(12_000 / 102_000, 10);
    const shareSum = totals.byLabel.reduce((sum, row) => sum + row.share, 0);
    expect(shareSum).toBeCloseTo(1, 10);
  });

  it('formats durations as a person reads a clock', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(999)).toBe('999ms');
    expect(formatDuration(1_500)).toBe('2s');
    expect(formatDuration(61_000)).toBe('1m01s');
    expect(formatDuration(3_600_000)).toBe('1h00m00s');
    expect(formatDuration(3_661_000)).toBe('1h01m01s');
    expect(formatDuration(102_000)).toBe('1m42s');
  });

  it('a record line names when, what, how long, how it ended and the command', () => {
    const line = formatRecordLine(sampleRecord({ kind: 'gate', label: 'test', durationMs: 5_000, command: 'pnpm run test' }));
    expect(line).toContain('2026-10-18 00:00:00Z');
    expect(line).toContain('gate:test');
    expect(line).toContain('5s');
    expect(line).toContain('exit 0');
    expect(line).toContain('pnpm run test');
    expect(formatRecordLine(sampleRecord({ command: null, exitCode: null, signal: null }))).toContain('(manual span)');
    expect(formatRecordLine(sampleRecord({ command: null, exitCode: null, signal: 'SIGTERM' }))).toContain('signal SIGTERM');
  });

  it('reads in the report what it could not read, what it skipped outside the window, and what is still open', () => {
    const missing = formatReport({
      aggregate: aggregate([]),
      store: storePath(store),
      missing: true,
      skips: { unreadable: [], unknownSchema: [], malformed: [] },
      days: null,
      pending: [],
    });
    expect(missing.join('\n')).toContain('no records yet');
    expect(missing.join('\n')).toContain(storePath(store));

    const emptyWindow = formatReport({
      aggregate: aggregate([]),
      store: storePath(store),
      missing: false,
      skips: { unreadable: [], unknownSchema: [], malformed: [] },
      days: 7,
      pending: [],
      outsideWindow: 3,
    });
    expect(emptyWindow.join('\n')).toContain('nothing recorded in this window');
    expect(emptyWindow.join('\n')).toContain('(3 older records outside it)');

    const totals = aggregate([sampleRecord({ kind: 'gate', label: 'test', durationMs: 10_000 })]);
    const report = formatReport({
      aggregate: totals,
      store: storePath(store),
      missing: false,
      skips: { unreadable: [2], unknownSchema: [4], malformed: [5] },
      days: null,
      pending: [{ file: join(store, 'pending', 'a.json'), span: { kind: 'repair', label: 'flaky', startedAt: '2026-10-18T09:00:00.000Z' } }],
    }).join('\n');
    expect(report).toContain('KIND');
    expect(report).toContain('gate');
    expect(report).toContain('test');
    expect(report).toContain('3 lines skipped: 1 unreadable, 1 of an unknown schema, 1 malformed (log.jsonl lines 2, 4, 5)');
    expect(report).toContain('1 span still open: repair:flaky');
  });
});

describe('R-075: the CLI, end to end', () => {
  it('prints the usage for no command and for help, and refuses an unknown command', async () => {
    const usage = await cli(store, bare, []);
    expect(usage.status).toBe(0);
    expect(usage.stdout).toContain('pnpm dev-time');
    expect(usage.stdout).toContain('gate [--stage=<name>]');
    expect((await cli(store, bare, ['help'])).status).toBe(0);

    const unknown = await cli(store, bare, ['frobnicate']);
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain('"frobnicate" is not a command');
  });

  it('refuses a run with no command, an unknown kind, a bad stage and a bad proof before anything runs', async () => {
    const noCommand = await cli(store, bare, ['run', 'build:desktop']);
    expect(noCommand.status).toBe(2);
    expect(noCommand.stderr).toContain('names no command');

    const badKind = await cli(store, bare, ['run', 'nope:x', '--', 'node', '-e', '0']);
    expect(badKind.status).toBe(2);
    expect(badKind.stderr).toContain('not a kind');

    expect((await cli(store, bare, ['gate', '--stage=bogus'])).status).toBe(2);
    expect((await cli(store, bare, ['gate', '--stage'])).status).toBe(2);

    const badProof = await cli(store, bare, ['proof', 'not-a-real-script-xyz']);
    expect(badProof.status).toBe(2);
    expect(badProof.stderr).toContain('not a script');

    expect(existsSync(storePath(store))).toBe(false);
  });

  it('measures a command and passes its exit code through, with the record in the store', async () => {
    const script = join(bare, 'exit3.cjs');
    writeFileSync(script, 'process.exit(3);\n', 'utf8');
    const failed = await cli(store, bare, ['run', 'other:exit-three', '--', process.execPath, script]);
    expect(failed.status).toBe(3);
    expect(failed.stderr).toContain('other:exit-three');

    const ok = await cli(store, bare, ['run', 'build:tiny', '--', process.execPath, '-e', 'process.exit(0)']);
    expect(ok.status).toBe(0);

    const { records } = readRecords(store);
    expect(records).toHaveLength(2);
    expect(records.map((record) => `${record.kind}:${record.label}`)).toEqual(['other:exit-three', 'build:tiny']);
    expect(records[0]?.exitCode).toBe(3);
    expect(records[0]?.command).toContain('exit3.cjs');
    expect(records[0]?.cwd).toBe(resolve(bare));
    expect(records[0]?.root).toBeNull();
    expect(records[0]?.dirty).toBeNull();
    expect(records[0]?.host.platform).toBe(process.platform);
  });

  it('opens, protects, lists, closes and drops a span', async () => {
    const opened = await cli(store, bare, ['start', 'repair:flaky']);
    expect(opened.status).toBe(0);
    expect(opened.stdout).toContain('repair:flaky');
    expect(listPending(store)).toHaveLength(1);

    const second = await cli(store, bare, ['start', 'repair:other']);
    expect(second.status).toBe(1);
    expect(second.stderr).toContain('already open');

    const pending = await cli(store, bare, ['pending']);
    expect(pending.status).toBe(0);
    expect(pending.stdout).toContain('repair:flaky');

    const stopped = await cli(store, bare, ['stop']);
    expect(stopped.status).toBe(0);
    expect(listPending(store)).toEqual([]);
    const closed = readRecords(store).records;
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ kind: 'repair', label: 'flaky', command: null, exitCode: null });
    expect(closed[0]?.durationMs).toBeGreaterThanOrEqual(0);

    expect((await cli(store, bare, ['stop'])).status).toBe(1);
    expect((await cli(store, bare, ['cancel'])).status).toBe(1);

    await cli(store, bare, ['start', 'repair:abandoned']);
    const dropped = await cli(store, bare, ['cancel']);
    expect(dropped.status).toBe(0);
    expect(dropped.stdout).toContain('nothing was recorded');
    expect(readRecords(store).records).toHaveLength(1);
  });

  it('reports and logs in both voices, and counts a torn line rather than losing it', async () => {
    const run = await cli(store, bare, ['run', 'build:tiny', '--', process.execPath, '-e', 'process.exit(0)']);
    expect(run.status).toBe(0);

    const json = await cli(store, bare, ['report', '--json']);
    expect(json.status).toBe(0);
    const report = JSON.parse(json.stdout) as { store: string; count: number; byLabel: { label: string; count: number }[]; days: number | null };
    expect(report.store).toBe(storePath(store));
    expect(report.count).toBe(1);
    expect(report.days).toBeNull();
    expect(report.byLabel).toMatchObject([{ label: 'tiny', count: 1 }]);

    const windowed = await cli(store, bare, ['report', '--days=7']);
    expect(windowed.status).toBe(0);
    expect(windowed.stdout).toContain('the last 7 days');
    expect((await cli(store, bare, ['report', '--days=0'])).status).toBe(2);

    const logged = await cli(store, bare, ['log', '--json', '--tail=1']);
    expect(logged.status).toBe(0);
    const lines = logged.stdout.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ kind: 'build', label: 'tiny' });
    expect((await cli(store, bare, ['log', '--tail=0'])).status).toBe(2);
    expect((await cli(store, bare, ['log', '--all', '--tail=1'])).status).toBe(2);

    appendFileSync(storePath(store), '{"torn\n', 'utf8');
    const honest = await cli(store, bare, ['report']);
    expect(honest.status).toBe(0);
    expect(honest.stdout).toContain('1 line skipped: 1 unreadable');
  });

  it('finds the CLI’s own script in the root package.json, as `pnpm dev-time` does', () => {
    const scripts = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(scripts.scripts['dev-time']).toBe('node tools/dev-time/cli.mjs');
  });
});
