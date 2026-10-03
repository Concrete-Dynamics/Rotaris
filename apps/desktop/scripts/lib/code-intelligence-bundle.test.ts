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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureBundle, setupFailureOf, withSetupFailure } from './code-intelligence-bundle.mjs';

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
