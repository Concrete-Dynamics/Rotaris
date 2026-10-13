import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EMPTY_RUN_REPORT, type InitRunReport } from '@rotaris/contracts';
import type { PlainMap } from '../merge.js';
import { ignoredBy, parseGitignore } from './gitignore.js';
import { classifyWorkspace, classifyWorkspaceRoot, DEFAULT_SOURCE_EXTENSIONS, extensionOf } from './classify.js';
import { applyRecord, initializationOf, isNeverInitialized, isResolved, NEVER_INITIALIZED, readInitializationState, recordPatch, sourceExtensionOverrideOf, type InitializationState } from './state.js';
import { DUPLICATE_TASK, isApplicable, labelFor, TaskRegistry, type InitializationTask, type TaskResult } from './registry.js';
import { deriveSets, promptOwed, sameView, viewOf } from './sets.js';
import { executeTasks, recordSkip, stampOnly } from './execute.js';

/**
 * Each test's scratch directory below the temporary directory, removed after the test so a run leaves none behind
 * (docs/defects/fixed/unit-tests-leave-their-temporary-directories-behind.md).
 */
const scratchDirs: string[] = [];
function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}
afterEach(() => { for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); });

function tree(): string {
  return scratchDir('rotaris-init-');
}

function ignores(text: string, path: string, isDir = false): boolean {
  return ignoredBy(parseGitignore(text), path, isDir);
}

/** REQ-WORKSPACE-100: the full grammar, last match wins. */
describe('the gitignore matcher', () => {
  it('honours anchoring, directory-only patterns and whole labels', () => {
    expect(ignores('build/', 'build', true)).toBe(true);
    expect(ignores('build/', 'build', false)).toBe(false);
    expect(ignores('/build', 'src/build')).toBe(false);
    expect(ignores('build', 'src/build')).toBe(true);
    expect(ignores('build', 'src/rebuild')).toBe(false);
    // An ignored directory carries everything beneath it, a directory-only rule's included: git never
    // looks inside an excluded directory, so nothing beneath it can be re-included.
    expect(ignores('build', 'build/x/y.ts')).toBe(true);
    expect(ignores('build/', 'build/x/y.ts')).toBe(true);
    expect(ignores('build/', 'build/x', true)).toBe(true);
    expect(ignores('build/\n!build/x/y.ts', 'build/x/y.ts')).toBe(true);
  });

  /*
   * docs/defects/fixed/a-re-included-directory-under-an-ignored-glob-keeps-its-files-ignored.md: every rule carried
   * a descendant suffix, so `gen/*` matched `gen/keep/f.ts` itself and the directory-only `!gen/keep/` was
   * never asked about the file. Git decides a path by its ancestors first, then by the rules matching the
   * path alone, and keeps the file.
   */
  it('keeps what a re-included directory under an ignored glob holds, as git does', () => {
    const rules = parseGitignore('gen/*\n!gen/keep/\n');
    expect(ignoredBy(rules, 'gen/x.ts', false)).toBe(true);
    expect(ignoredBy(rules, 'gen/drop', true)).toBe(true);
    expect(ignoredBy(rules, 'gen/drop/f.ts', false)).toBe(true);
    expect(ignoredBy(rules, 'gen/keep', true)).toBe(false);
    expect(ignoredBy(rules, 'gen/keep/f.ts', false)).toBe(false);
    expect(ignoredBy(rules, 'gen/keep/sub', true)).toBe(false);
    expect(ignoredBy(rules, 'gen/keep/sub/g.ts', false)).toBe(false);
    // A file named like the re-included directory is still ignored: `!gen/keep/` is for a directory.
    expect(ignoredBy(rules, 'gen/keep', false)).toBe(true);
    // `*` stops at a slash in the path itself as well as through an ancestor.
    expect(ignores('gen/*.ts', 'gen/a/b.ts')).toBe(false);
    expect(ignores('docs/*\n!docs/*.md\n', 'docs/a.md')).toBe(false);
    expect(ignores('docs/*\n!docs/*.md\n', 'docs/sub/a.md')).toBe(true);
  });

  it('applies negation with last-match-wins', () => {
    expect(ignores('*.log\n!keep.log', 'keep.log')).toBe(false);
    expect(ignores('!keep.log\n*.log', 'keep.log')).toBe(true);
    expect(ignores('*.log', 'a/b/c.log')).toBe(true);
  });

  it('spans zero or more directories with a double star on its own segment', () => {
    const rules = parseGitignore('a/**/b.ts');
    expect(ignoredBy(rules, 'a/b.ts', false)).toBe(true);
    expect(ignoredBy(rules, 'a/x/b.ts', false)).toBe(true);
    expect(ignoredBy(rules, 'a/x/y/b.ts', false)).toBe(true);
    expect(ignoredBy(rules, 'z/a/b.ts', false)).toBe(false);
    expect(ignores('**/vendor', 'a/b/vendor', true)).toBe(true);
    expect(ignores('logs/**', 'logs/a/b.txt')).toBe(true);
    // Any other run of asterisks is an ordinary `*`, which stops at a slash.
    expect(ignores('a**b', 'axyb')).toBe(true);
    expect(ignores('a**b', 'ax/yb')).toBe(false);
  });

  /** The gap the subset reader left: `[` and `]` were escaped and matched as characters. */
  it('honours character classes, including ranges and negation', () => {
    expect(ignores('vendor/[a-z]*', 'vendor/abc.ts')).toBe(true);
    expect(ignores('vendor/[a-z]*', 'vendor/Abc.ts')).toBe(false);
    expect(ignores('[!0-9]*.ts', 'a1.ts')).toBe(true);
    expect(ignores('[!0-9]*.ts', '1a.ts')).toBe(false);
    expect(ignores('[^ab]c', 'zc')).toBe(true);
    // An unterminated class is a literal bracket, as git treats it.
    expect(ignores('a[bc', 'a[bc')).toBe(true);
  });

  it('honours escapes and strips only unescaped trailing whitespace', () => {
    expect(ignores('\\#notes.md', '#notes.md')).toBe(true);
    expect(ignores('#notes.md', '#notes.md')).toBe(false);
    expect(ignores('\\!bang.txt', '!bang.txt')).toBe(true);
    expect(ignores('trail\\ ', 'trail ')).toBe(true);
    expect(ignores('trail   ', 'trail')).toBe(true);
    expect(ignores('a\\*b', 'a*b')).toBe(true);
    expect(ignores('a\\*b', 'axb')).toBe(false);
  });

  it('ignores blanks and comments', () => {
    expect(parseGitignore('\n# a comment\n   \n')).toEqual([]);
  });
});

/** REQ-WORKSPACE-098/099: exactly 23 extensions by default, case-insensitive, gitignore-aware. */
describe('workspace classification', () => {
  it('states REQ-WORKSPACE-099\'s twenty-three entries and no more', () => {
    expect(DEFAULT_SOURCE_EXTENSIONS).toHaveLength(23);
    expect([...DEFAULT_SOURCE_EXTENSIONS].sort()).toEqual([
      '.c', '.cpp', '.cs', '.ex', '.exs', '.fs', '.go', '.h', '.hpp', '.java', '.jl', '.js',
      '.jsx', '.kt', '.php', '.py', '.r', '.rb', '.rs', '.scala', '.swift', '.ts', '.tsx',
    ].sort());
    // The runtime's own manifest lists these; this domain's set does not.
    for (const outside of ['.tf', '.sh', '.bash', '.ps1', '.vue', '.svelte', '.nix', '.config']) {
      expect(DEFAULT_SOURCE_EXTENSIONS).not.toContain(outside);
    }
  });

  it('matches case-insensitively and needs a real extension', () => {
    expect(extensionOf('Main.PY')).toBe('.py');
    expect(extensionOf('.gitignore')).toBeNull();
    expect(extensionOf('Makefile')).toBeNull();
  });

  it('classifies a documentation-only tree, an empty tree and a missing root as non-code', () => {
    const root = tree();
    writeFileSync(join(root, 'README.md'), '# docs');
    mkdirSync(join(root, 'notes'));
    writeFileSync(join(root, 'notes', 'a.txt'), 'x');
    expect(classifyWorkspace(root)).toBe('non-code');
    expect(classifyWorkspace(tree())).toBe('non-code');
    expect(classifyWorkspace(join(root, 'nowhere'))).toBe('non-code');
  });

  it('finds source at depth and honours case', () => {
    const root = tree();
    mkdirSync(join(root, 'a', 'b'), { recursive: true });
    writeFileSync(join(root, 'a', 'b', 'Main.PY'), 'x');
    expect(classifyWorkspace(root)).toBe('code');
  });

  it('disregards what the root .gitignore matches, and only the root one', () => {
    const root = tree();
    mkdirSync(join(root, 'vendor'));
    writeFileSync(join(root, '.gitignore'), 'vendor/\n');
    writeFileSync(join(root, 'vendor', 'lib.ts'), 'x');
    expect(classifyWorkspace(root)).toBe('non-code');

    const nested = tree();
    mkdirSync(join(nested, 'vendor'));
    writeFileSync(join(nested, 'vendor', '.gitignore'), 'lib.ts\n');
    writeFileSync(join(nested, 'vendor', 'lib.ts'), 'x');
    expect(classifyWorkspace(nested)).toBe('code');
  });

  /** docs/defects/fixed/a-re-included-directory-under-an-ignored-glob-keeps-its-files-ignored.md: the classifier's walk. */
  it('counts source in a directory re-included under an ignored glob, as git keeps it', () => {
    const root = tree();
    mkdirSync(join(root, 'gen', 'keep'), { recursive: true });
    writeFileSync(join(root, '.gitignore'), 'gen/*\n!gen/keep/\n');
    writeFileSync(join(root, 'gen', 'x.ts'), 'x');
    expect(classifyWorkspace(root)).toBe('non-code');
    writeFileSync(join(root, 'gen', 'keep', 'f.ts'), 'x');
    expect(classifyWorkspace(root)).toBe('code');
  });

  it('does not descend into .git', () => {
    const root = tree();
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, '.git', 'hook.py'), 'x');
    expect(classifyWorkspace(root)).toBe('non-code');
  });

  it('never follows a symbolic link to a directory', () => {
    const root = tree();
    const other = tree();
    writeFileSync(join(other, 'lib.ts'), 'x');
    try { symlinkSync(other, join(root, 'linked'), 'junction'); } catch { return; }
    expect(classifyWorkspace(root)).toBe('non-code');
  });

  it('honours project_init.source_extensions, normalized, including an override to nothing', () => {
    const root = tree();
    mkdirSync(join(root, '.rotaris'));
    const agents = join(root, '.rotaris', 'agents.yaml');
    writeFileSync(join(root, 'deploy.tf'), 'x');
    expect(classifyWorkspaceRoot(root, agents)).toBe('non-code');
    writeFileSync(agents, 'project_init:\n  source_extensions:\n    - " TF "\n    - ""\n');
    expect(sourceExtensionOverrideOf({ project_init: { source_extensions: [' TF ', '', '.', 'md'] } })).toEqual(['.tf', '.md']);
    expect(classifyWorkspaceRoot(root, agents)).toBe('code');
    writeFileSync(agents, 'project_init:\n  source_extensions: []\n');
    expect(classifyWorkspaceRoot(root, agents)).toBe('non-code');
  });
});

/** REQ-WORKSPACE-078/079: the marker, its default, and move-never-duplicate. */
describe('the persisted initialization state', () => {
  it('reads a missing file, a missing key and a bare empty section all as never initialized', () => {
    expect(readInitializationState(join(tree(), 'nope.yaml'))).toEqual(NEVER_INITIALIZED);
    expect(initializationOf({})).toEqual(NEVER_INITIALIZED);
    expect(initializationOf({ initialization: {} })).toEqual(NEVER_INITIALIZED);
    expect(isNeverInitialized(NEVER_INITIALIZED)).toBe(true);
  });

  it('leaves the never-initialized state on a last_run stamp alone', () => {
    const state = initializationOf({ initialization: { last_run: '2026-09-15T00:00:00.000+00:00' } });
    expect(state.lastRun).toBe('2026-09-15T00:00:00.000+00:00');
    expect(isNeverInitialized(state)).toBe(false);
  });

  it('treats an id in either list as resolved', () => {
    const state = initializationOf({ initialization: { completed: ['a'], skipped: ['b'] } });
    expect(isResolved(state, 'a')).toBe(true);
    expect(isResolved(state, 'b')).toBe(true);
    expect(isResolved(state, 'c')).toBe(false);
  });

  it('moves rather than duplicates, stamps every recording, and overwrites classification only with a value', () => {
    const start: InitializationState = { completed: ['a'], skipped: ['a', 'b'], lastRun: 'old', classification: 'code' };
    const patch = recordPatch(start, [{ id: 'a', outcome: 'skipped' }], null, 'now')['initialization'] as Record<string, unknown>;
    expect(patch['completed']).toEqual([]);
    expect(patch['skipped']).toEqual(['b', 'a']);
    expect(patch['last_run']).toBe('now');
    expect(patch['classification']).toBe('code');
    const next = applyRecord(start, [{ id: 'a', outcome: 'completed' }], 'non-code', 'now');
    expect(next).toEqual({ completed: ['a'], skipped: ['b'], lastRun: 'now', classification: 'non-code' });
  });

  it('stamps last_run for the degenerate no-task recording', () => {
    const patch = recordPatch(NEVER_INITIALIZED, [], null, 'now')['initialization'] as Record<string, unknown>;
    expect(patch).toEqual({ completed: [], skipped: [], last_run: 'now' });
    expect(isNeverInitialized(applyRecord(NEVER_INITIALIZED, [], null, 'now'))).toBe(false);
  });
});

function task(id: string, over: Partial<InitializationTask> = {}): InitializationTask {
  return {
    id,
    label: `${id} label`,
    description: `${id} description`,
    applicable: () => true,
    run: async () => ({ status: 'success', steps: [], classification: null, error: '', retryable: false, summary: 'done' }) as TaskResult,
    ...over,
  };
}

describe('the task registry', () => {
  it('refuses a duplicate id unless replacement is requested, and ignores an unknown unregister', () => {
    const r = new TaskRegistry();
    r.register(task('a'));
    expect(() => r.register(task('a'))).toThrow(DUPLICATE_TASK('a'));
    r.register(task('a', { label: 'second' }), true);
    expect(r.get('a')?.label).toBe('second');
    expect(() => r.unregister('nope')).not.toThrow();
  });

  it('treats a raising predicate as not applicable, and logs it', async () => {
    const lines: string[] = [];
    const bad = task('x', { applicable: () => { throw new Error('boom'); } });
    expect(await isApplicable(bad, (m) => lines.push(m), { workspaceRoot: 'C:/ws' })).toBe(false);
    expect(lines[0]).toContain('boom');
  });

  it('displays an unregistered id as itself', () => {
    const r = new TaskRegistry();
    r.register(task('a'));
    expect(labelFor(r, 'a')).toBe('a label');
    expect(labelFor(r, 'ghost')).toBe('ghost');
  });
});

/** REQ-WORKSPACE-081/082/105. */
describe('the task sets and the nine values', () => {
  const log = () => undefined;
  const at = { workspaceRoot: 'C:/ws' };

  /** REQ-WORKSPACE-013/102, PD-SHELL-001: the sets are one workspace's, and every predicate is told which. */
  it('asks every predicate about the workspace the sets are derived for', async () => {
    const r = new TaskRegistry();
    const asked: string[] = [];
    r.register(task('only-alpha', { applicable: ({ workspaceRoot }) => { asked.push(workspaceRoot); return workspaceRoot === 'C:/alpha'; } }));
    const state: InitializationState = { completed: [], skipped: [], lastRun: null, classification: null };
    expect((await deriveSets(r, state, log, { workspaceRoot: 'C:/alpha' })).applicable.map((t) => t.id)).toEqual(['only-alpha']);
    expect((await deriveSets(r, state, log, { workspaceRoot: 'C:/beta' })).applicable).toEqual([]);
    expect(asked).toEqual(['C:/alpha', 'C:/beta']);
  });

  it('separates applicable, pending, runnable, background and consent', async () => {
    const r = new TaskRegistry();
    r.register(task('bg'));
    r.register(task('ask', { requiresConsent: true }));
    r.register(task('done'));
    r.register(task('skip'));
    r.register(task('gone', { applicable: () => false }));
    const state: InitializationState = { completed: ['done'], skipped: ['skip'], lastRun: 'x', classification: null };
    const sets = await deriveSets(r, state, log, at);
    expect(sets.applicable.map((t) => t.id)).toEqual(['bg', 'ask', 'done', 'skip']);
    expect(sets.pending.map((t) => t.id)).toEqual(['bg', 'ask']);
    // A skipped task stays runnable; a completed one does not.
    expect(sets.runnable.map((t) => t.id)).toEqual(['bg', 'ask', 'skip']);
    expect(sets.background.map((t) => t.id)).toEqual(['bg']);
    expect(sets.consent.map((t) => t.id)).toEqual(['ask']);
    expect(promptOwed(sets)).toBe(true);
  });

  it('counts an id in both lists at once as completed', async () => {
    const r = new TaskRegistry();
    r.register(task('a'));
    const sets = await deriveSets(r, { completed: ['a'], skipped: ['a'], lastRun: 'x', classification: null }, log, at);
    expect(sets.pending).toEqual([]);
    expect(sets.runnable).toEqual([]);
  });

  it('owes the prompt on a consent task pending whatever the workspace has done before', async () => {
    const r = new TaskRegistry();
    r.register(task('ask', { requiresConsent: true }));
    const sets = await deriveSets(r, { completed: ['other'], skipped: [], lastRun: 'x', classification: 'code' }, log, at);
    expect(promptOwed(sets)).toBe(true);
  });

  it('compares the four id collections as sets and everything else by value', async () => {
    const r = new TaskRegistry();
    r.register(task('a'));
    r.register(task('b'));
    const state: InitializationState = { completed: ['a', 'b'], skipped: [], lastRun: 'x', classification: 'code' };
    const sets = await deriveSets(r, state, log, at);
    const one = viewOf(state, sets, false, null);
    const other = viewOf({ ...state, completed: ['b', 'a'] }, sets, false, null);
    expect(sameView(one, other)).toBe(true);
    expect(sameView(one, { ...one, running: true })).toBe(false);
    expect(sameView(one, { ...one, lastError: 'x' })).toBe(false);
    expect(sameView({ ...one, lastRun: null }, one)).toBe(false);
  });

  it('drops an id no registered task claims, and one whose task no longer applies', async () => {
    const r = new TaskRegistry();
    r.register(task('gone', { applicable: () => false }));
    const state: InitializationState = { completed: ['gone', 'ghost'], skipped: [], lastRun: 'x', classification: null };
    const view = viewOf(state, await deriveSets(r, state, log, at), false, null);
    expect(view.completed).toEqual([]);
  });
});

/** REQ-WORKSPACE-084/085/086/109. */
describe('one execution', () => {
  const ok = async () => ({ ok: true } as const);
  const deps = (over: Partial<Parameters<typeof executeTasks>[2]> = {}) => ({
    workspaceRoot: 'C:/ws',
    nowIso: () => 'now',
    write: ok,
    signal: new AbortController().signal,
    log: () => undefined,
    publish: () => undefined,
    ...over,
  });

  it('records one outcome per task and lets a failure not cut the run short', async () => {
    const written: unknown[] = [];
    const tasks = [
      task('a'),
      task('b', { run: async () => ({ status: 'failure', steps: [], classification: null, error: 'nope', retryable: true, summary: 'failed' }) }),
      task('c', { run: async () => ({ status: 'skipped', steps: [], classification: 'non-code', error: '', retryable: false, summary: 'skipped' }) }),
    ];
    const r = await executeTasks(tasks, NEVER_INITIALIZED, deps({ write: async (p) => { written.push(p); return { ok: true }; } }));
    expect(r.report.tasks.map((t) => [t.id, t.status])).toEqual([['a', 'success'], ['b', 'failure'], ['c', 'skipped']]);
    // The failure recorded nothing: two writes, not three.
    expect(written).toHaveLength(2);
    expect(r.state.completed).toEqual(['a']);
    expect(r.state.skipped).toEqual(['c']);
    expect(r.state.classification).toBe('non-code');
  });

  it('treats a task that reports no outcome as a failure that says what went wrong', async () => {
    const tasks = [task('a', { run: async () => { throw new Error('exploded'); } })];
    const r = await executeTasks(tasks, NEVER_INITIALIZED, deps());
    expect(r.report.tasks[0]?.status).toBe('failure');
    expect(r.report.tasks[0]?.error).toContain('exploded');
    expect(r.report.tasks[0]?.retryable).toBe(true);
  });

  it('downgrades a success whose marker write failed to a retryable failure', async () => {
    const r = await executeTasks([task('a')], NEVER_INITIALIZED, deps({ write: async () => ({ ok: false, reason: 'disk full' }) }));
    expect(r.report.tasks[0]?.status).toBe('failure');
    expect(r.report.tasks[0]?.error).toBe('a label completed, but the workspace config could not be written: disk full');
    expect(r.report.tasks[0]?.summary).toBe('a label finished, but the result could not be saved. Retry initialization.');
    expect(r.state).toEqual(NEVER_INITIALIZED);
  });

  it('publishes the announcement, then each step as it finishes, then the outcome', async () => {
    const seen: InitRunReport[] = [];
    const tasks = [task('a', {
      run: async (ctx) => {
        ctx.onStep({ name: 'one', status: 'success', detail: 'first' });
        ctx.onStep({ name: 'two', status: 'skipped-no-code', detail: 'second' });
        return { status: 'success', steps: [], classification: null, error: '', retryable: false, summary: 'done' };
      },
    })];
    await executeTasks(tasks, NEVER_INITIALIZED, deps({ publish: (r) => seen.push(r) }));
    expect(seen[0]).toMatchObject({ current: 'a', currentLabel: 'a label', currentSteps: [] });
    expect(seen[1]?.currentSteps.map((s) => s.name)).toEqual(['one']);
    expect(seen[2]?.currentSteps.map((s) => s.name)).toEqual(['one', 'two']);
    expect(seen.at(-1)).toMatchObject({ running: false, outcome: 'reported' });
    expect(seen.at(-1)?.tasks[0]?.steps.map((s) => s.status)).toEqual(['success', 'skipped-no-code']);
  });

  it('starts nothing new after cancellation and reports the run as cancelled', async () => {
    const controller = new AbortController();
    const started: string[] = [];
    const tasks = [
      task('a', { run: async () => { started.push('a'); controller.abort(); return { status: 'success', steps: [], classification: null, error: '', retryable: false, summary: '' }; } }),
      task('b', { run: async () => { started.push('b'); return { status: 'success', steps: [], classification: null, error: '', retryable: false, summary: '' }; } }),
    ];
    const r = await executeTasks(tasks, NEVER_INITIALIZED, deps({ signal: controller.signal }));
    expect(started).toEqual(['a']);
    expect(r.report.outcome).toBe('cancelled');
  });

  it('stamps last_run when nothing ran, and when everything was skipped', async () => {
    expect(isNeverInitialized(await stampOnly(NEVER_INITIALIZED, null, { nowIso: () => 'now', write: ok, log: () => undefined }))).toBe(false);
    const skipped = await recordSkip(NEVER_INITIALIZED, [], { nowIso: () => 'now', write: ok });
    expect(skipped.ok && isNeverInitialized(skipped.state)).toBe(false);
    const some = await recordSkip(NEVER_INITIALIZED, ['a', 'b'], { nowIso: () => 'now', write: ok });
    expect(some.ok && some.state.skipped).toEqual(['a', 'b']);
    const refused = await recordSkip(NEVER_INITIALIZED, ['a'], { nowIso: () => 'now', write: async () => ({ ok: false, reason: 'locked' }) });
    expect(refused).toEqual({ ok: false, reason: 'locked' });
  });

  /**
   * The defect ADR-0064's first execution found in the built app: a run computes each patch from the
   * state it started with, and a patch replaces both lists wholesale — so a skip answered while the run
   * was in flight was erased by the run's own next recording. The patch is now built from the state the
   * commit reads when it writes, and the run goes on from that state.
   */
  it('builds each recording from the state the commit reads when it writes, so a concurrent skip survives', async () => {
    const patches: PlainMap[] = [];
    let onDisk: InitializationState = NEVER_INITIALIZED;
    const tasks = [task('slow', {
      run: async () => {
        // Another writer answers the prompt while this task runs.
        onDisk = { ...onDisk, skipped: ['asks'], lastRun: 'earlier' };
        return { status: 'success', steps: [], classification: null, error: '', retryable: false, summary: '' };
      },
    })];
    const r = await executeTasks(tasks, NEVER_INITIALIZED, deps({
      commit: async (build) => { patches.push(build(onDisk)); return { ok: true }; },
      write: async () => { throw new Error('write is not called when a commit is supplied'); },
    }));
    const section = patches[0]!['initialization'] as Record<string, unknown>;
    expect(section['completed']).toEqual(['slow']);
    expect(section['skipped']).toEqual(['asks']);
    expect(r.state.skipped).toEqual(['asks']);
    expect(r.state.completed).toEqual(['slow']);
  });

  it('uses the run\'s own state when no commit is supplied', async () => {
    const patches: PlainMap[] = [];
    await executeTasks([task('a')], { completed: [], skipped: ['b'], lastRun: 'x', classification: null }, deps({ write: async (p) => { patches.push(p); return { ok: true }; } }));
    expect((patches[0]!['initialization'] as Record<string, unknown>)['skipped']).toEqual(['b']);
  });

  it('starts from an empty report', () => {
    expect(EMPTY_RUN_REPORT.running).toBe(false);
    expect(EMPTY_RUN_REPORT.tasks).toEqual([]);
  });
});
