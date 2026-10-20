/**
 * The bundled code-intelligence runtime as `init-proof`'s precondition
 * (`docs/defects/fixed/init-proof-reads-a-missing-code-intelligence-bundle-as-a-task-that-recorded-nothing.md`).
 *
 * In a checkout without the bundle the shipped task's `create` exits 127, the task records nothing (REQ-WORKSPACE-084),
 * and the proof used to report "the background task recorded nothing" — naming the workspace file's writer when the cause
 * was the build tree. What is decided here: the proof checks the tree before its first launch, builds it when the proof
 * builds, refuses at once naming `pnpm code-intel:bundle` when it does not, and quotes the app log's own setup failure
 * beside every "not recorded" message.
 */
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildBundle, ensureBundle, runBundleScript, setupFailureOf, withSetupFailure } from './code-intelligence-bundle.mjs';

const PROOF = resolve(import.meta.dirname, '..', 'init-proof.mjs');

/** Lines of `background.log` as the built app wrote them on 2026-10-01 in a worktree without the bundle. */
const FAILED_LOG = [
  '[main 2026-10-01T10:05:03.764Z] info    initialization: running code-intelligence-setup for /w (background)',
  '[main 2026-10-01T10:05:04.348Z] info    run host: mcp setup: create failed — exited with code 127; its last output: the bus: Failed to connect',
  '[main 2026-10-01T10:05:04.350Z] info    initialization: code-intelligence-setup → failure — Code intelligence could not create this project\'s configuration: exited with code 127; its last output: the bus: Failed to connect',
  '[main 2026-10-01T10:05:04.350Z] info    rotaris: the bundled code-intelligence runtime is not present in this installation (build it with pnpm code-intel:bundle)',
  '[main 2026-10-01T10:05:04.351Z] info    diagnostics: notice #2 error "Project setup did not finish"',
].join('\n');

const ok = { status: 0, output: '[code-intel:bundle] up to date' };
const absent = { status: 1, output: '[code-intel:bundle] REFUSED — the bundle is absent or stale at /x; run pnpm code-intel:bundle' };

describe('ensureBundle: the bundle before the first launch (REQ-WORKSPACE-083, REQ-WORKSPACE-084)', () => {
  it('a present bundle is used as it is and nothing is built', () => {
    let built = 0;
    expect(ensureBundle({ skipBuild: false, check: () => ok, build: () => { built += 1; return ok; } })).toBe('present');
    expect(built).toBe(0);
  });

  it('--skip-build with no bundle refuses at once, naming pnpm code-intel:bundle, and builds nothing', () => {
    let built = 0;
    expect(() => ensureBundle({ skipBuild: true, check: () => absent, build: () => { built += 1; return ok; } }))
      .toThrow(/run pnpm code-intel:bundle first/);
    expect(built).toBe(0);
  });

  it('a proof that builds builds the bundle too, and checks it again', () => {
    const answers = [absent, ok];
    let built = 0;
    expect(ensureBundle({ skipBuild: false, check: () => answers.shift()!, build: () => { built += 1; return ok; } })).toBe('built');
    expect(built).toBe(1);
    expect(answers).toEqual([]);
  });

  it('a bundle step that fails, or leaves the tree stale, is the refusal — never a launch', () => {
    expect(() => ensureBundle({ skipBuild: false, check: () => absent, build: () => ({ status: 1, output: 'curl: (6) could not resolve host' }) }))
      .toThrow(/bundle step \(pnpm code-intel:bundle\) exited 1:\ncurl: \(6\)/);
    expect(() => ensureBundle({ skipBuild: false, check: () => absent, build: () => ok }))
      .toThrow(/--check still refuses/);
  });
});

describe('setupFailureOf: the app log\'s own account of a failed setup', () => {
  it('quotes the coordinator\'s failure line and the launcher\'s missing-runtime line, without the log prefix', () => {
    expect(setupFailureOf(FAILED_LOG)).toBe([
      'initialization: code-intelligence-setup → failure — Code intelligence could not create this project\'s configuration: exited with code 127; its last output: the bus: Failed to connect',
      'rotaris: the bundled code-intelligence runtime is not present in this installation (build it with pnpm code-intel:bundle)',
    ].join('\n'));
  });

  it('is null for a log whose setup succeeded, and the message is then left as it is', () => {
    const success = '[main …] info    initialization: code-intelligence-setup → success';
    expect(setupFailureOf(success)).toBeNull();
    expect(withSetupFailure('the background task recorded nothing', success)).toBe('the background task recorded nothing');
  });

  it('reads only the named task: another task\'s failure is not the shipped task\'s', () => {
    expect(setupFailureOf('[main …] info    initialization: verification-fail → failure — boom')).toBeNull();
  });

  it('withSetupFailure puts the quoted cause after the proof\'s own message', () => {
    expect(withSetupFailure('the background task recorded nothing', FAILED_LOG))
      .toMatch(/^the background task recorded nothing\nthe app logged why code-intelligence-setup failed:\ninitialization: code-intelligence-setup → failure — .*\nrotaris: the bundled code-intelligence runtime is not present/);
  });
});

describe('init-proof states its bundle precondition and quotes the app\'s setup failure', () => {
  const text = readFileSync(PROOF, 'utf8');

  it('ensures the bundle before the first launch', () => {
    const at = text.indexOf('ensureBundle({');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(text.indexOf("await launch('background'"));
    expect(text.slice(at, at + 80)).toMatch(/skipBuild: process\.argv\.includes\('--skip-build'\)/);
  });

  it('every check that expects code-intelligence-setup recorded quotes the app log\'s failure', () => {
    for (const message of [
      'the background task recorded nothing',
      'code-intelligence-setup was not recorded completed',
      'the background task beside the consent prompt was not recorded completed',
      'the task after the failure was not attempted',
      'the Project card read state',
    ]) {
      const line = text.split('\n').find((l) => l.includes(message));
      expect(line, message).toMatch(/withSetupFailure\(/);
    }
  });
});

/*
 * Finding A4 of fin47's acceptance round 1: `code-intel-proof` ran the bundle step only when the marker was absent and never
 * asked `bundle.mjs --check`, so PD-MCP-004's acceptance gate (launch 11, re-run on every pin change) ran on the recipe-3
 * runtime that 559003b superseded, without a word
 * (docs/defects/fixed/code-intel-proof-uses-a-stale-code-intelligence-bundle-without-checking-it.md).
 */
describe('code-intel-proof checks the bundle is current, not only present, and records which one it ran on (A4)', () => {
  const text = readFileSync(resolve(import.meta.dirname, '..', 'code-intel-proof.mjs'), 'utf8');
  const at = text.indexOf('ensureBundle({');

  it('ensures the bundle (bundle.mjs --check, rebuilt when absent or stale) before the marker is read and before any launch', () => {
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(text.indexOf("const bundle = JSON.parse(readFileSync(marker, 'utf8'))"));
    expect(at).toBeLessThan(text.indexOf('if (want(1)) {'));
    expect(at).toBeLessThan(text.indexOf("spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build']"));
  });

  it('no longer gates the bundle step on the marker\'s presence alone', () => {
    expect(text).not.toMatch(/if \(!existsSync\(marker\)\)/);
  });

  it('builds the bundle itself under --skip-build too, as it always built an absent one: the bundle is its subject', () => {
    expect(text.slice(at, at + 80)).toMatch(/skipBuild: false/);
  });

  it('results.json names the runtime the launches ran on: recipe, pins hash, target, and whether this run built it', () => {
    const line = text.split('\n').find((l) => l.startsWith('const results = {')) ?? '';
    for (const field of ['recipe: bundle.recipe', 'pinsHash: bundle.pinsHash', 'target: bundle.target', 'ensured: bundleState']) {
      expect(line, field).toContain(field);
    }
  });
});

/*
 * Finding U5 of the duress live run at 1763f7f: a `--skip-build` live run on a tree without the bundle ran every scenario,
 * its setup and discovery failed, and it passed all 18 checks without a line saying code intelligence never ran
 * (docs/defects/fixed/the-live-run-runs-without-the-code-intelligence-bundle-and-passes-without-saying-so.md).
 */
describe('live-run states the same precondition, and says in every launch whether code intelligence ran (U5)', () => {
  const text = readFileSync(resolve(import.meta.dirname, '..', 'live-run.mjs'), 'utf8');

  it('ensures the bundle after the key is known and before any pack, sandbox or launch exists', () => {
    const at = text.indexOf('ensureBundle({');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(text.indexOf("if (key === null || key === '')"));
    expect(at).toBeLessThan(text.indexOf('mkdirSync(output, { recursive: true });'));
    expect(at).toBeLessThan(text.indexOf('mkdirSync(sandbox, { recursive: true });'));
    expect(at).toBeLessThan(text.indexOf("await launch('sign-in'"));
    expect(text.slice(at, at + 60)).toMatch(/skipBuild: has\('skip-build'\)/);
  });

  it('refuses a --skip-build tree without the bundle in its own words, naming pnpm code-intel:bundle', () => {
    const consequence = /consequence: '([^\n]*?)',\n/.exec(text.slice(text.indexOf('ensureBundle({')))?.[1]?.replace(/\\'/g, "'") ?? '';
    expect(consequence).toMatch(/this run would judge a tree in which code intelligence never ran/);
    expect(() => ensureBundle({ skipBuild: true, consequence, check: () => absent, build: () => ok }))
      .toThrow(/run pnpm code-intel:bundle first\. Without it every launch's code-intelligence setup and discovery fail/);
  });

  it('every launch states whether its code-intelligence discovery succeeded', () => {
    // The statement itself is exercised in code-intelligence-discovery.test.ts; here, that launch prints it.
    const body = text.slice(text.indexOf('async function launch('), text.indexOf('/** The store as the run left it'));
    expect(body).toMatch(/codeIntelligenceStatement\(name, log\)/);
    expect(body).toMatch(/check\(intelligence\.verdict === 'pass', intelligence\.label, intelligence\.detail\)/);
  });
});

/*
 * fin47's review of `accept1-1`, finding (1): `ensureBundle`'s build captured `bundle.mjs`'s output through `spawnSync`'s defaults,
 * where the call before it had inherited the streams. A first build from an empty cache (uv's interpreter and install) then
 * printed nothing for up to fifteen minutes, and a build printing more than `spawnSync`'s default `maxBuffer` of 1 MiB would have
 * been ended with ENOBUFS and read as a failed build
 * (docs/defects/fixed/ensure-bundles-build-shows-no-progress-and-fails-past-spawnsyncs-buffer.md). The build now streams its output
 * through as it runs and holds none; the check, whose output is short and is quoted in a refusal, is read back whole with a buffer
 * it cannot outgrow. A stand-in for `bundle.mjs` prints 2 MiB here, past that default.
 */
describe('the bundle step\'s output: the build streamed, the check read back whole (fin47 accept1-1)', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); });
  /** A stand-in for `bundle.mjs` printing 2 MiB to its standard output in lines, then `done` to its standard error, then exiting `exit`. */
  const loud = (exit = 0): { dir: string; script: string } => {
    const dir = mkdtempSync(join(tmpdir(), 'rotaris-bundle-output-'));
    dirs.push(dir);
    const script = join(dir, 'loud.mjs');
    writeFileSync(script, `const line = 'x'.repeat(1023) + '\\n';\nfor (let i = 0; i < 2048; i += 1) process.stdout.write(line);\nprocess.stderr.write('done\\n');\nprocess.exitCode = ${exit};\n`);
    return { dir, script };
  };
  const MIB = 1024 * 1024;

  it('the build streams: a step printing 2 MiB runs to its end, its output written through where the caller\'s goes, none held here', () => {
    const { dir, script } = loud();
    const log = join(dir, 'streamed.log');
    const fd = openSync(log, 'w');
    let r: ReturnType<typeof buildBundle>;
    try { r = buildBundle(120_000, { script, stdio: ['ignore', fd, fd] }); } finally { closeSync(fd); }
    expect(r).toEqual({ status: 0, output: '', streamed: true });
    expect(statSync(log).size).toBeGreaterThan(2 * MIB);
    expect(readFileSync(log, 'utf8').trimEnd().endsWith('done')).toBe(true);
  });

  it('the check reads its output back whole, past spawnSync\'s default buffer', () => {
    const { script } = loud();
    const r = runBundleScript([], 120_000, { script });
    expect(r.status).toBe(0);
    expect(r.output.length).toBeGreaterThan(2 * MIB);
    expect(r.output.endsWith('done')).toBe(true);
  });

  it('ensureBundle builds through the streamed step unless told otherwise, and a streamed failure says where its output went', () => {
    const { dir, script } = loud(3);
    const fd = openSync(join(dir, 'failed.log'), 'w');
    let failed: ReturnType<typeof buildBundle>;
    try { failed = buildBundle(120_000, { script, stdio: ['ignore', fd, fd] }); } finally { closeSync(fd); }
    expect(failed).toEqual({ status: 3, output: '', streamed: true });
    expect(() => ensureBundle({ skipBuild: false, check: () => absent, build: () => failed }))
      .toThrow(/bundle step \(pnpm code-intel:bundle\) exited 3:\n\(its output is above, streamed as it ran\)/);
    const helper = readFileSync(resolve(import.meta.dirname, 'code-intelligence-bundle.mjs'), 'utf8');
    expect(helper).toMatch(/build = \(\) => buildBundle\(\) \}\)/);
  });
});
