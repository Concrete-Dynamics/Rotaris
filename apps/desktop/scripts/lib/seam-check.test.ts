/**
 * The seam check's lists, held to the source (docs/defects/fixed/a-packaged-build-keeps-capture-seams-that-answer-mains-dialogs.md).
 * Until 2026-10-14 `package.mjs`'s forbidden list named none of main's dialog answers, so a packaged build passed with them
 * inside. Every variable main, the run host or the workspace service reads behind `__ROTARIS_SEAMS__` on the read's own line
 * must be named by the list, so a seam added under the flag and left off the list fails here, before any package is built.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM beside the scripts that run it.
import { FORBIDDEN, KEPT, seamCheck } from './seam-check.mjs';

const SRC = join(import.meta.dirname, '..', '..', 'src');
const ROOTS = ['main', 'run-host', 'workspace-service'];

/** Every capture variable read on a line that carries the build-time flag, by root-relative file. */
function flaggedReads(): Map<string, string> {
  const found = new Map<string, string>();
  for (const root of ROOTS) {
    for (const e of readdirSync(join(SRC, root), { recursive: true, withFileTypes: true })) {
      if (!e.isFile() || !e.name.endsWith('.ts') || e.name.endsWith('.test.ts')) continue;
      readFileSync(join(e.parentPath, e.name), 'utf8').split('\n').forEach((line, i) => {
        if (!line.includes('__ROTARIS_SEAMS__')) return;
        for (const m of line.matchAll(/process\.env\[['"](ROTARIS_[A-Z0-9_]+)['"]\]/g)) found.set(m[1]!, `${e.name}:${i + 1}`);
      });
    }
  }
  return found;
}

const covered = (name: string): boolean => (FORBIDDEN as string[]).some((f) => name.startsWith(f));

describe('the seam check names every seam read behind __ROTARIS_SEAMS__ (ADR-0056)', () => {
  it('finds main\'s dialog answers among the flagged reads', () => {
    const reads = flaggedReads();
    for (const name of ['ROTARIS_CAPTURE_HOOK_REVIEW', 'ROTARIS_CAPTURE_ANSWERS', 'ROTARIS_CAPTURE_PAUSE_ANSWER', 'ROTARIS_CAPTURE_BACKUP_TO', 'ROTARIS_CAPTURE_OPEN_EXTERNAL']) {
      expect([...reads.keys()], name).toContain(name);
    }
  });

  it('every flagged read is a name the forbidden list covers, and none is one the probe keeps', () => {
    const uncovered = [...flaggedReads()].filter(([name]) => !covered(name)).map(([name, at]) => `${name} (${at})`);
    expect(uncovered).toEqual([]);
    for (const kept of KEPT as string[]) expect(covered(kept), kept).toBe(false);
  });
});

/**
 * The two modules a packaged build never emits: `capture/index.ts` reaches each only by a dynamic import inside
 * `if (__ROTARIS_SEAMS__)`, so with the flag false rollup drops the branch and the chunk is never written.
 */
const COMPILED_OUT = new Set([join('main', 'capture', 'seams.ts'), join('main', 'capture', 'theme-proof.ts')]);

/** Every capture variable read on a line WITHOUT the build-time flag, in a module a packaged build keeps. */
function unflaggedReads(): Map<string, string> {
  const found = new Map<string, string>();
  for (const root of ROOTS) {
    for (const e of readdirSync(join(SRC, root), { recursive: true, withFileTypes: true })) {
      if (!e.isFile() || !e.name.endsWith('.ts') || e.name.endsWith('.test.ts')) continue;
      const file = join(e.parentPath, e.name);
      if (COMPILED_OUT.has(file.slice(SRC.length + 1))) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (line.includes('__ROTARIS_SEAMS__')) return;
        for (const m of line.matchAll(/process\.env\[['"](ROTARIS_CAPTURE_[A-Z0-9_]+)['"]\]/g)) found.set(m[1]!, `${e.name}:${i + 1}`);
      });
    }
  }
  return found;
}

describe('a packaged build answers no capture variable beyond the probe\'s three (ADR-0056)', () => {
  /*
   * docs/defects/fixed/a-packaged-build-still-answers-capture-variables-beyond-the-probes-three.md: `probe.ts` read
   * `_WAIT` (whose `js:` form evaluates an expression the environment supplies), `_WAIT_MS`, `_END_VIEW`, `_END_VIEW_MS`,
   * `_PROBE` and `_PROMPT_MS` with no flag, and the run host and the workspace service read `_SKILLS_HOME` and
   * `_INSTRUCTIONS_HOME` with no test at all, so a packaged build kept all eight while the seam check passed.
   */
  let dir: string | undefined;
  afterEach(() => { if (dir !== undefined) rmSync(dir, { recursive: true, force: true }); dir = undefined; });
  function out(files: Record<string, string>): string {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-seam-check-'));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return dir;
  }

  it('reads every other capture variable behind __ROTARIS_SEAMS__, on the read\'s own line', () => {
    const offFlag = [...unflaggedReads()].filter(([name]) => !(KEPT as string[]).includes(name)).map(([name, at]) => `${name} (${at})`);
    expect(offFlag).toEqual([]);
  });

  it('the dynamically imported modules stay unreachable from a static import', () => {
    for (const e of readdirSync(join(SRC, 'main'), { recursive: true, withFileTypes: true })) {
      if (!e.isFile() || !e.name.endsWith('.ts') || e.name.endsWith('.test.ts')) continue;
      const text = readFileSync(join(e.parentPath, e.name), 'utf8');
      expect(text, e.name).not.toMatch(/^import[^;]*from\s+['"][^'"]*\/(seams|theme-proof)\.js['"]/m);
    }
  });

  it('names the eight the packaged probe does not need, so the seam check fails a build that keeps one', () => {
    for (const name of ['ROTARIS_CAPTURE_WAIT', 'ROTARIS_CAPTURE_WAIT_MS', 'ROTARIS_CAPTURE_END_VIEW', 'ROTARIS_CAPTURE_END_VIEW_MS', 'ROTARIS_CAPTURE_PROBE', 'ROTARIS_CAPTURE_PROMPT_MS', 'ROTARIS_CAPTURE_SKILLS_HOME', 'ROTARIS_CAPTURE_INSTRUCTIONS_HOME']) {
      expect(covered(name), name).toBe(true);
    }
    const r = seamCheck(out({ 'index.js': 'env.ROTARIS_CAPTURE_PNG; env.ROTARIS_CAPTURE_PROMPT; env.ROTARIS_CAPTURE_AFTER_MS; env.ROTARIS_CAPTURE_WAIT_MS', 'run-host.js': "process.env['ROTARIS_CAPTURE_SKILLS_HOME']" }));
    expect(r.present).toEqual(['ROTARIS_CAPTURE_WAIT (index.js)', 'ROTARIS_CAPTURE_SKILLS_HOME (run-host.js)']);
  });
});

/**
 * The `ROTARIS_*` variables a shipped build answers on purpose, each named by the record that decided it: ADR-0059's host
 * switch, the application log's threshold (ADR-0033), the configuration directory (`docs/spec/resolutions/09-lifecycle-hooks.md`),
 * the preference store's root (ADR-0042), the hooks discovery's settings file (REQ-HOOKS-110), the search server's key
 * (REQ-CONFIG-181) and the launcher's portable artifact (REQ-STARTUP-106). Every other one is a verification seam.
 */
const PRODUCT = new Set(['ROTARIS_CIRCUIT_BREAKER', 'ROTARIS_APP_LOG_LEVEL', 'ROTARIS_CONFIG_DIR', 'ROTARIS_PREFERENCES_ROOT',
  'ROTARIS_CLAUDE_SETTINGS_PATH', 'ROTARIS_SEARCH_API_KEY', 'ROTARIS_PORTABLE_ARTIFACT']);

/** The scripted model client's variables, the note's list (docs/defects/fixed/a-packaged-build-still-answers-the-scripted-model-clients-variables.md). */
const SCRIPTED = ['ROTARIS_MODEL_DIALECT', 'ROTARIS_SCRIPT', 'ROTARIS_CHILD_SCRIPT', 'ROTARIS_LOOP_SCRIPT', 'ROTARIS_INTENT_SCRIPT',
  'ROTARIS_COMPRESSOR_SCRIPT', 'ROTARIS_IMPROVEMENT_SCRIPT', 'ROTARIS_SCRIPT_QUESTIONS', 'ROTARIS_SCRIPT_ARTIFACT_ARGS',
  'ROTARIS_SCRIPT_DELEGATE_ARGS', 'ROTARIS_SCRIPT_MCP_ARGS', 'ROTARIS_SCRIPT_TERMINAL_ARGS', 'ROTARIS_SCRIPT_TOOL_ARGS'];

/** The sources of the three roots a packaged build keeps, the two compiled-out modules aside. */
function keptSources(): { name: string; text: string }[] {
  const found: { name: string; text: string }[] = [];
  for (const root of ROOTS) {
    for (const e of readdirSync(join(SRC, root), { recursive: true, withFileTypes: true })) {
      if (!e.isFile() || !e.name.endsWith('.ts') || e.name.endsWith('.test.ts') || e.name.endsWith('.d.ts')) continue;
      const file = join(e.parentPath, e.name);
      if (!COMPILED_OUT.has(file.slice(SRC.length + 1))) found.push({ name: e.name, text: readFileSync(file, 'utf8') });
    }
  }
  return found;
}

/** Every `ROTARIS_*` variable read off the flag — through `process.env` or an `env` handed in — in a module a packaged build keeps. */
function unflaggedVariables(): string[] {
  const found: string[] = [];
  for (const { name, text } of keptSources()) {
    text.split('\n').forEach((line, i) => {
      if (line.includes('__ROTARIS_SEAMS__')) return;
      for (const m of line.matchAll(/env\[['"](ROTARIS_[A-Z0-9_]+)['"]\]/g)) {
        if (!PRODUCT.has(m[1]!) && !(KEPT as string[]).includes(m[1]!)) found.push(`${m[1]} (${name}:${i + 1})`);
      }
    });
  }
  return found;
}

/**
 * Every line of a block comment, in a module a packaged build keeps, that names one of the scripted client's variables: a
 * block comment survives into the bundle (the first seam-free build of fin44's repair still carried four names in `probe.ts`'s
 * doc comments), so the seam check would refuse a build whose reads are all compiled out.
 */
function blockCommentsNaming(): string[] {
  const found: string[] = [];
  for (const { name, text } of keptSources()) {
    let inBlock = false;
    text.split('\n').forEach((line, i) => {
      const opens = /\/\*/.test(line);
      if (inBlock || opens) for (const v of SCRIPTED) if (new RegExp(`\\b${v}\\b`).test(line)) found.push(`${v} (${name}:${i + 1})`);
      if (opens) inBlock = true;
      if (/\*\//.test(line)) inBlock = false;
    });
  }
  return found;
}

describe('a packaged build answers none of the scripted model client\'s variables (ADR-0056, REQ-CONFIG-478)', () => {
  /*
   * docs/defects/fixed/a-packaged-build-still-answers-the-scripted-model-clients-variables.md: the run host read
   * `ROTARIS_MODEL_DIALECT` (every model of every run answered by the scripted client, no credential asked) and the client's
   * script variables (which tool calls it makes, and with what arguments) with no flag, and the seam check named none of them.
   */
  let dir: string | undefined;
  afterEach(() => { if (dir !== undefined) rmSync(dir, { recursive: true, force: true }); dir = undefined; });

  it('reads every ROTARIS_ variable but the product\'s own and the probe\'s three behind __ROTARIS_SEAMS__, on the read\'s own line', () => {
    expect(unflaggedVariables()).toEqual([]);
  });

  it('names none of the scripted client\'s variables in a block comment, which would survive into the bundle', () => {
    expect(blockCommentsNaming()).toEqual([]);
  });

  it('names every one in the forbidden list, so the seam check fails a build that keeps one', () => {
    for (const name of SCRIPTED) expect(covered(name), name).toBe(true);
    dir = mkdtempSync(join(tmpdir(), 'rotaris-seam-check-'));
    writeFileSync(join(dir, 'index.js'), 'env.ROTARIS_CAPTURE_PNG; env.ROTARIS_CAPTURE_PROMPT; env.ROTARIS_CAPTURE_AFTER_MS;');
    writeFileSync(join(dir, 'run-host.js'), 'deps.env["ROTARIS_MODEL_DIALECT"]; process.env["ROTARIS_SCRIPT_TOOL_ARGS"]; env.ROTARIS_CIRCUIT_BREAKER');
    expect(seamCheck(dir).present).toEqual(['ROTARIS_MODEL_DIALECT (run-host.js)', 'ROTARIS_SCRIPT (run-host.js)']);
  });

  it('the packaged launch of package.mjs sets none of them: its configuration names the scripted model', () => {
    const text = readFileSync(join(import.meta.dirname, '..', 'package.mjs'), 'utf8');
    const launch = text.slice(text.indexOf('Rule 4 (b)'));
    expect(launch).toMatch(/provider: scripted/);
    for (const name of SCRIPTED) expect(launch, name).not.toMatch(new RegExp(`\\b${name}\\b`));
  });
});

describe('seamCheck reads every emitted file of the main section', () => {
  let dir: string | undefined;
  afterEach(() => { if (dir !== undefined) rmSync(dir, { recursive: true, force: true }); dir = undefined; });

  function out(files: Record<string, string>): string {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-seam-check-'));
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(dir, name, '..'), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
    return dir;
  }

  it('passes a bundle with the probe\'s names and no scriptable one', () => {
    const r = seamCheck(out({ 'index.js': 'env.ROTARIS_CAPTURE_PNG; env.ROTARIS_CAPTURE_PROMPT; env.ROTARIS_CAPTURE_AFTER_MS;' }));
    expect([r.missing, r.present]).toEqual([[], []]);
  });

  it('names a dialog answer left in a chunk, and a probe name lost', () => {
    const r = seamCheck(out({ 'index.js': 'env.ROTARIS_CAPTURE_PNG; env.ROTARIS_CAPTURE_PROMPT;', 'chunks/a.js': "process.env['ROTARIS_CAPTURE_HOOK_REVIEW_MS']" }));
    expect(r.missing).toEqual(['ROTARIS_CAPTURE_AFTER_MS']);
    expect(r.present).toEqual([`ROTARIS_CAPTURE_HOOK_REVIEW (${join('chunks', 'a.js')})`]);
  });
});
