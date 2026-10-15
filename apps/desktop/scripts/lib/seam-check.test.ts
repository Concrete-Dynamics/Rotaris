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
const PACKAGES = join(import.meta.dirname, '..', '..', '..', '..', 'packages');
const ROOTS = ['main', 'run-host', 'workspace-service'];

/** A product source file: TypeScript, not a test and not a declaration file. */
const isSource = (name: string): boolean => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts');

/** Every source file of the three roots, by root-relative path. */
function rootSources(): { file: string; name: string; text: string }[] {
  const found: { file: string; name: string; text: string }[] = [];
  for (const root of ROOTS) {
    for (const e of readdirSync(join(SRC, root), { recursive: true, withFileTypes: true })) {
      if (!e.isFile() || !isSource(e.name)) continue;
      const path = join(e.parentPath, e.name);
      found.push({ file: path.slice(SRC.length + 1), name: e.name, text: readFileSync(path, 'utf8') });
    }
  }
  return found;
}

/**
 * Every string constant a read may be keyed by, by name: each `const NAME = 'VALUE'` (or `let`, `var`) in the desktop app's
 * sources and the packages' — `process.env[APP_LOG_LEVEL_VARIABLE]` in main is keyed by a constant of `main/app-log.ts`, and
 * `env[PORTABLE_ARTIFACT_VARIABLE]` by one of `@rotaris/platform`.
 */
function stringConstants(texts: Iterable<string>): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  for (const text of texts) {
    for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;\n]+)?=\s*(['"`])([A-Z][A-Z0-9_]*)\2/g)) {
      found.set(m[1]!, (found.get(m[1]!) ?? new Set<string>()).add(m[3]!));
    }
  }
  return found;
}

function productConstants(): Map<string, Set<string>> {
  const texts: string[] = [];
  const add = (dir: string): void => {
    for (const e of readdirSync(dir, { recursive: true, withFileTypes: true })) {
      if (e.isFile() && isSource(e.name) && !e.parentPath.includes('node_modules')) texts.push(readFileSync(join(e.parentPath, e.name), 'utf8'));
    }
  };
  add(SRC);
  for (const pkg of readdirSync(PACKAGES, { withFileTypes: true })) if (pkg.isDirectory()) add(join(PACKAGES, pkg.name, 'src'));
  return stringConstants(texts);
}

interface EnvRead { variable: string; line: number; flagged: boolean }

/**
 * Every `ROTARIS_*` variable `text` reads from an environment, in each form a read takes, with its 1-based line and whether
 * that line carries `__ROTARIS_SEAMS__`: the bracket form (`process.env['ROTARIS_X']`, `deps.env?.["ROTARIS_X"]`), the dot form
 * (`process.env.ROTARIS_X`, `env?.ROTARIS_X`), a read keyed by an identifier (`process.env[SOME_VARIABLE]`), resolved through
 * `constants`, and a destructuring of an environment (`const { ROTARIS_X } = process.env`, across lines too). A key in
 * constant shape that `constants` cannot resolve is answered as `env[KEY]`, so the rules report it rather than pass it; a
 * lower-case key (`env[key]` in a loop) is not a constant and is not read.
 *
 * Until 2026-10-15 the three rules below found the bracket form alone, so a seam read in any other form passed them
 * (docs/defects/fixed/the-seam-checks-source-test-reads-only-the-bracket-form-of-a-variable-read.md).
 */
function envReads(text: string, constants: Map<string, Set<string>>): EnvRead[] {
  const lines = text.split('\n');
  const reads: EnvRead[] = [];
  const at = (variable: string, index: number): void => {
    reads.push({ variable, line: index + 1, flagged: lines[index]!.includes('__ROTARIS_SEAMS__') });
  };
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/[Ee]nv(?:\?\.)?\[\s*(['"`])(ROTARIS_[A-Z0-9_]+)\1\s*\]/g)) at(m[2]!, i);
    for (const m of line.matchAll(/[Ee]nv\??\.(ROTARIS_[A-Z0-9_]+)\b/g)) at(m[1]!, i);
    for (const m of line.matchAll(/[Ee]nv(?:\?\.)?\[\s*([A-Za-z_$][\w$]*)\s*\]/g)) {
      const values = constants.get(m[1]!);
      if (values !== undefined) for (const v of values) { if (v.startsWith('ROTARIS_')) at(v, i); }
      else if (/^[A-Z][A-Z0-9_]*$/.test(m[1]!)) at(`env[${m[1]}]`, i);
    }
  });
  for (const m of text.matchAll(/\{([^{}]*)\}\s*=\s*[\w$.?]*[Ee]nv\b/g)) {
    for (const n of m[1]!.matchAll(/\bROTARIS_[A-Z0-9_]+\b/g)) at(n[0], text.slice(0, m.index + 1 + n.index).split('\n').length - 1);
  }
  return reads.sort((a, b) => a.line - b.line);
}

/** Every `ROTARIS_*` read on a line that carries the build-time flag, by name, with the file and line it is read at. */
function flaggedReads(): Map<string, string> {
  const constants = productConstants();
  const found = new Map<string, string>();
  for (const { name, text } of rootSources()) {
    for (const r of envReads(text, constants)) if (r.flagged) found.set(r.variable, `${name}:${r.line}`);
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

/** The sources of the three roots a packaged build keeps, the two compiled-out modules aside. */
const keptSources = (): { name: string; text: string }[] => rootSources().filter(({ file }) => !COMPILED_OUT.has(file));

/** Every capture variable read on a line WITHOUT the build-time flag, in a module a packaged build keeps. */
function unflaggedReads(): Map<string, string> {
  const constants = productConstants();
  const found = new Map<string, string>();
  for (const { name, text } of keptSources()) {
    for (const r of envReads(text, constants)) {
      if (!r.flagged && r.variable.startsWith('ROTARIS_CAPTURE_')) found.set(r.variable, `${name}:${r.line}`);
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

/** Every `ROTARIS_*` variable read off the flag, in any form and through any environment, in a module a packaged build keeps. */
function unflaggedVariables(): string[] {
  const constants = productConstants();
  const found: string[] = [];
  for (const { name, text } of keptSources()) {
    for (const r of envReads(text, constants)) {
      if (!r.flagged && !PRODUCT.has(r.variable) && !(KEPT as string[]).includes(r.variable)) found.push(`${r.variable} (${name}:${r.line})`);
    }
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

  it('the packaged launch of package.mjs sets none of them', () => {
    const text = readFileSync(join(import.meta.dirname, '..', 'package.mjs'), 'utf8');
    const launch = text.slice(text.indexOf('Rule 4 (b)'));
    for (const name of SCRIPTED) expect(launch, name).not.toMatch(new RegExp(`\\b${name}\\b`));
  });
});

/*
 * docs/defects/fixed/the-seam-checks-source-test-reads-only-the-bracket-form-of-a-variable-read.md: the three rules above found a
 * read only as `env['ROTARIS_X']`, so a seam read off the flag as `process.env.ROTARIS_X`, through a constant or by
 * destructuring passed them, and the bundle-level check would have been the first to refuse it, at packaging.
 */
describe('the rules read a variable in every form a read takes (ADR-0056)', () => {
  it('finds the bracket, dot, constant-keyed and destructuring forms, flagged or not, and reports a key it cannot resolve', () => {
    const constants = stringConstants(["export const SEAM_VARIABLE = 'ROTARIS_SEAM_C';", "const OTHER: string = 'APPIMAGE';"]);
    const text = [
      "const a = process.env['ROTARIS_SEAM_A'];",
      'const b = deps.env?.ROTARIS_SEAM_B;',
      'const c = process.env[SEAM_VARIABLE];',
      'const { ROTARIS_SEAM_D, HOME } = process.env;',
      'const e = process.env[UNKNOWN_VARIABLE];',
      'const f = process.env[OTHER];',
      'const g = __ROTARIS_SEAMS__ ? process.env.ROTARIS_SEAM_G : undefined;',
      'for (const key of keys) out[key] = process.env[key];',
      'const {',
      '  ROTARIS_SEAM_I: i,',
      '} = childEnv;',
    ].join('\n');
    expect(envReads(text, constants)).toEqual([
      { variable: 'ROTARIS_SEAM_A', line: 1, flagged: false },
      { variable: 'ROTARIS_SEAM_B', line: 2, flagged: false },
      { variable: 'ROTARIS_SEAM_C', line: 3, flagged: false },
      { variable: 'ROTARIS_SEAM_D', line: 4, flagged: false },
      { variable: 'env[UNKNOWN_VARIABLE]', line: 5, flagged: false },
      { variable: 'ROTARIS_SEAM_G', line: 7, flagged: true },
      { variable: 'ROTARIS_SEAM_I', line: 10, flagged: false },
    ]);
  });

  it('sees the constant-keyed reads the source holds today, each of a product variable', () => {
    const constants = productConstants();
    const reads = rootSources().flatMap(({ name, text }) => envReads(text, constants).map((r) => `${r.variable} (${name})`));
    // `main/index.ts` reads the log threshold through `APP_LOG_LEVEL_VARIABLE` (`main/app-log.ts`), and `main/updater/classify.ts`
    // the portable artifact through `PORTABLE_ARTIFACT_VARIABLE` (`@rotaris/platform`): if either is read another way, this
    // case names a read the rule is no longer shown to see, and wants another witness.
    expect(reads).toContain('ROTARIS_APP_LOG_LEVEL (index.ts)');
    expect(reads).toContain('ROTARIS_PORTABLE_ARTIFACT (classify.ts)');
  });
});

/*
 * OQ-312 (ruled 2026-10-14 under R-072, no directive): a packaged build answers no `provider: scripted` entry, so the scripted
 * client itself does not ship and rule 4 (b) runs against a loopback stub reached through the product's own model client. Until
 * the ruling's build `package.mjs`'s launch configured `provider: scripted`, and the seam check named nothing of the client, so a
 * packaged `run-host.js` carrying it passed
 * (docs/defects/fixed/a-packaged-build-answers-a-scripted-provider-entry-with-the-scripted-client.md).
 */
describe('a packaged build carries no scripted model client (OQ-312, ADR-0056)', () => {
  let dir: string | undefined;
  afterEach(() => { if (dir !== undefined) rmSync(dir, { recursive: true, force: true }); dir = undefined; });

  it('the seam check refuses a packaged run host that carries the scripted client', () => {
    expect(FORBIDDEN as string[]).toContain('scripted model call:');
    // The client's own log line, which only the client writes (`scripted-client.ts`): if it moves, this list must follow it.
    expect(readFileSync(join(SRC, 'run-host', 'scripted-client.ts'), 'utf8')).toContain('log(`scripted model call: ');
    dir = mkdtempSync(join(tmpdir(), 'rotaris-seam-check-'));
    writeFileSync(join(dir, 'index.js'), 'env.ROTARIS_CAPTURE_PNG; env.ROTARIS_CAPTURE_PROMPT; env.ROTARIS_CAPTURE_AFTER_MS;');
    writeFileSync(join(dir, 'run-host.js'), 'log(`scripted model call: ${req.model.providerId}/${req.model.modelId} (${who})`);');
    expect(seamCheck(dir).present).toEqual(['scripted model call: (run-host.js)']);
  });

  it('package.mjs\'s rule 4 (b) launch names no provider: scripted, and runs against the stub it starts', () => {
    const text = readFileSync(join(import.meta.dirname, '..', 'package.mjs'), 'utf8');
    const launch = text.slice(text.indexOf('Rule 4 (b)'));
    expect(launch).not.toMatch(/provider:\s*scripted/);
    expect(launch).toMatch(/startStubModelEndpoint\(\)/);
    expect(launch).toMatch(/provider: openai, model_id: rule-4b-stub, base_url: "\$\{stub\.baseUrl\}"/);
    expect(launch).toMatch(/stub\.counts\.toolsRequests < 1 \|\| stub\.counts\.terminalCalls < 1/);
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
