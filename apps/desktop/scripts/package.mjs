/**
 * `pnpm package` — ADR-0056's build, with its evidence (IC-6).
 *
 *   1. electron-vite build                  the five entries
 *   2. electron-builder --win               rebuild → pack → hooks (rule 1a, rule 4a) → installer
 *   3. the packaged app, launched           rule 4 (b): the product's own path opens a store in a real
 *                                           utilityProcess and runs a terminal call; both settle in the store
 *   4. release/load-proof.json              the merged report; a non-zero exit on any miss
 *
 * ROTARIS_PACKAGE_DIR_ONLY=1   stop at win-unpacked (no installer)
 * ROTARIS_PACKAGE_SKIP_APP=1   skip step 3
 * ROTARIS_IC6_COUNTERFACTUAL   see build-hooks.cjs; the build must then fail and this script reports where
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { proofIsolationEnv, workspacesRootFor } from './lib/harness.mjs';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE = join(APP, 'release');
const REPORT = join(RELEASE, 'load-proof.json');
const require = createRequire(import.meta.url);
const t0 = Date.now();
const report = { startedAt: new Date().toISOString(), steps: [], counterfactual: process.env['ROTARIS_IC6_COUNTERFACTUAL'] || null, ok: false };

function step(name, fn) {
  const at = Date.now();
  process.stdout.write(`\n[package] ${name}\n`);
  try {
    const result = fn();
    report.steps.push({ name, ms: Date.now() - at, ok: true, ...(result ?? {}) });
    return result;
  } catch (e) {
    report.steps.push({ name, ms: Date.now() - at, ok: false, error: String(e && e.message ? e.message : e) });
    throw e;
  }
}
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: APP, stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status ?? r.signal}`);
}
function finish(ok, why) {
  report.ok = ok;
  report.ms = Date.now() - t0;
  report.afterPack = existsSync(join(RELEASE, 'load-proof.afterpack.json')) ? JSON.parse(readFileSync(join(RELEASE, 'load-proof.afterpack.json'), 'utf8')) : null;
  mkdirSync(RELEASE, { recursive: true });
  writeFileSync(REPORT, JSON.stringify(report, null, 2));
  process.stdout.write(`\n[package] ${ok ? 'PASSED' : 'REFUSED'}${why ? ` — ${why}` : ''} (${report.ms} ms) → ${REPORT}\n`);
  // This script builds with the verification seams compiled OUT and leaves that build in `out/`. Every `*-proof`
  // script launches `out/main/index.js` and drives those seams, so the next proof run after a package would fail
  // for a reason no one would guess from its output. Say so here rather than let it be discovered.
  process.stdout.write('[package] `out/` now holds a SEAM-FREE build — run `pnpm build` before any proof or `pnpm app:drive`.\n');
  process.exit(ok ? 0 : 1);
}

try {
  rmSync(join(RELEASE, 'load-proof.afterpack.json'), { force: true });
  // ADR-0035 (Part T): the bundled code-intelligence runtime is BUILT here (idempotent on its pins' marker), then the
  // committed binding manifest is checked against a fresh generation from that runtime — a diff is a refused build
  // (REQ-MCP-116; the same kind of assertion as REQ-MCP-095's version cross-check). The build fetches; the product never does.
  step('code-intelligence bundle', () => {
    run('node', [join(APP, 'scripts', 'code-intelligence', 'bundle.mjs')]);
    const marker = JSON.parse(readFileSync(join(APP, 'resources', 'code-intelligence', 'bundle.json'), 'utf8'));
    return { bundle: { python: marker.answers.python, distribution: marker.distribution, version: marker.answers.distribution, bytes: marker.size.bytes, files: marker.size.files, builtAt: marker.builtAt, elapsedMs: marker.elapsedMs } };
  });
  step('code-intelligence manifest equals the committed module', () => run('node', [join(APP, 'scripts', 'code-intelligence', 'manifest.mjs'), '--check']));
  // ROTARIS_BUILD=package compiles the verification seams OUT (electron.vite.config.ts). A packaged binary that
  // could still be scripted through its environment is the thing this flag exists to prevent.
  step('electron-vite build (seams compiled out)', () => run('pnpm', ['exec', 'electron-vite', 'build'], { env: { ...process.env, ROTARIS_BUILD: 'package' } }));
  /**
   * The SEAM CHECK: the shipped bundle carries the probe's three seams and NOT the scriptable ones.
   *
   * Deliberately un-numbered. ADR-0056's five rules are the native-module obligation (N3) and its rule 5 is about
   * a swallowed failure at runtime; this is about the surface the bundle ships, so numbering it "6" would imply an
   * amendment to a set it does not belong to.
   *
   * This is an assertion about the artifact rather than about the source, for the same reason rule 1a weighs the
   * binary rather than trusting the rebuild: a `define` that stopped being applied — a section added to the config
   * without it, a guard someone moved outside the block — would leave the surface in the product and change
   * nothing a source reading would notice. The probe below drives `_PROMPT` and `_PNG`, so those must survive;
   * everything named in the second list can script a window, so none of them may.
   *
   * EVERY emitted file of the main section is read, not `index.js` alone. The scriptable seams live in
   * `main/capture/seams.ts`, reached by a dynamic import inside `if (__ROTARIS_SEAMS__)`: with the flag false the
   * branch goes, the chunk is unreferenced and rollup emits no chunk at all — but a chunk is exactly the shape
   * this surface could come back in, and a check that reads one file would not see it. `index.js` alone was the
   * check while the seams were inline in `main()`, and it stopped being sufficient the moment they were not.
   */
  step('the packaged bundle carries no scriptable seam', () => {
    const mainOut = join(APP, 'out', 'main');
    const emitted = readdirSync(mainOut, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.js'))
      .map((e) => join(e.parentPath, e.name));
    const bundle = readFileSync(join(mainOut, 'index.js'), 'utf8');
    const kept = ['ROTARIS_CAPTURE_PNG', 'ROTARIS_CAPTURE_PROMPT', 'ROTARIS_CAPTURE_AFTER_MS'];
    // The last two are the injection proof's (2026-09-27): one writes every scripted model call's system text to a
    // file it names, the other points the machine-wide instruction base at any directory — neither may ship.
    const forbidden = ['ROTARIS_CAPTURE_CLICKS', 'ROTARIS_CAPTURE_DOUBLE_CLICKS', 'ROTARIS_CAPTURE_TYPE', 'ROTARIS_CAPTURE_CHORDS', 'ROTARIS_CAPTURE_EVAL_AT', 'ROTARIS_CAPTURE_OS_INPUT', 'ROTARIS_CAPTURE_SELECT', 'ROTARIS_CAPTURE_NOTICES', 'ROTARIS_CAPTURE_DRAG_AT', 'ROTARIS_CAPTURE_PERSONA_STEER', 'ROTARIS_THEME_PROOF_DIR', 'ROTARIS_DRIVER', 'ROTARIS_CAPTURE_MODEL_REQUESTS', 'ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE'];
    const missing = kept.filter((name) => !bundle.includes(name));
    const present = [];
    for (const file of emitted) {
      const text = readFileSync(file, 'utf8');
      for (const name of forbidden) if (text.includes(name)) present.push(`${name} (${relative(mainOut, file)})`);
    }
    if (missing.length) throw new Error(`the packaged bundle lost a seam the probe needs: ${missing.join(', ')}`);
    if (present.length) throw new Error(`the packaged bundle still carries scriptable seams: ${present.join(', ')}`);
    return { kept, removed: forbidden.length, files: emitted.length, bytes: bundle.length };
  });
  // The keep-prebuild counterfactual packs from the same configuration minus the prebuild exclusions, so the
  // prebuild is in the asar index where the binding's own loader looks first. Rule 4 has to refuse it.
  let config = 'electron-builder.yml';
  if (process.env['ROTARIS_IC6_COUNTERFACTUAL'] === 'keep-prebuild') {
    mkdirSync(RELEASE, { recursive: true });
    const base = readFileSync(join(APP, 'electron-builder.yml'), 'utf8');
    // The two "!…/{prebuilds,…}/**" lines lose their prebuilds member, so the prebuild directories are packed.
    const variant = base.replace('better-sqlite3/{prebuilds,build,deps,src}/**', 'better-sqlite3/{build,deps,src}/**').replace('node-pty/{prebuilds,build,deps,src,third_party,scripts}/**', 'node-pty/{build,deps,src,third_party,scripts}/**');
    if (variant === base) throw new Error('keep-prebuild: the exclusion lines were not found in electron-builder.yml');
    config = join('release', 'electron-builder.keep-prebuild.yml');
    writeFileSync(join(APP, config), variant);
    process.stdout.write(`[package] COUNTERFACTUAL keep-prebuild: packing from ${config} (no prebuild exclusions)\n`);
  }
  // The file-descriptor gate (scripts/fd-gate.cjs): electron-builder's `pnpm list --depth Infinity` opens every package.json
  // at once and was refused with EMFILE on this tree (Part S's console spike, 2026-09-05). Every node process of THIS step
  // inherits the preload; the packaged application's launch below never does.
  const builderEnv = { ...process.env, NODE_OPTIONS: `${process.env['NODE_OPTIONS'] ? `${process.env['NODE_OPTIONS']} ` : ''}--require ${JSON.stringify(join(APP, 'scripts', 'fd-gate.cjs'))}` };
  step(`electron-builder --win${process.env['ROTARIS_PACKAGE_DIR_ONLY'] ? ' --dir' : ''}`, () => run('pnpm', ['exec', 'electron-builder', '--win', ...(process.env['ROTARIS_PACKAGE_DIR_ONLY'] ? ['--dir'] : []), '--config', config], { env: builderEnv }));
} catch (e) {
  finish(false, String(e.message));
}

if (process.env['ROTARIS_PACKAGE_SKIP_APP']) finish(true, 'rule 4 (b) skipped by ROTARIS_PACKAGE_SKIP_APP');

// Rule 4 (b): the packaged app on the product's own path. Scratch profile and workspace under release/.
let appRun;
try {
appRun = step('the packaged app opens a store and runs a terminal call', () => {
  const exe = join(RELEASE, 'win-unpacked', 'Rotaris.exe');
  if (!existsSync(exe)) throw new Error(`no packaged executable at ${exe}`);
  const scratch = join(RELEASE, 'scratch');
  rmSync(scratch, { recursive: true, force: true });
  const ws = join(scratch, 'workspace');
  const lad = join(scratch, 'LocalAppData');
  mkdirSync(ws, { recursive: true });
  mkdirSync(lad, { recursive: true });
  writeFileSync(join(ws, 'README.md'), '# scratch\n');
  // The run reads its files (ADR-0036): the scripted model, an autonomous mode and the single strategy.
  mkdirSync(join(ws, '.rotaris'), { recursive: true });
  writeFileSync(join(ws, '.rotaris', 'agents.yaml'), 'models:\n  scripted: { provider: scripted, model_id: scripted }\nsmall_model: scripted\nmedium_model: scripted\nlarge_model: scripted\nruntime:\n  permission_mode: autonomous\nrotaris:\n  delegation_strategy: single\n');
  spawnSync('git', ['init', '-q'], { cwd: ws, stdio: 'ignore' });
  const png = join(RELEASE, 'load-proof.png');
  const env = {
    ...process.env,
    ...proofIsolationEnv({ profileRoot: scratch, local: lad }),
    ROTARIS_MODEL_DIALECT: 'scripted',
    ROTARIS_SCRIPT: 'git',
    ROTARIS_CAPTURE_PNG: png,
    ROTARIS_CAPTURE_PROMPT: 'show me the tree',
    ROTARIS_CAPTURE_AFTER_MS: '9000',
  };
  for (const k of Object.keys(env)) if (k.startsWith('ROTARIS_CAPTURE_') && !(k in { ROTARIS_CAPTURE_PNG: 1, ROTARIS_CAPTURE_PROMPT: 1, ROTARIS_CAPTURE_AFTER_MS: 1 })) delete env[k];
  const r = spawnSync(exe, [ws], { env, encoding: 'utf8', timeout: 120_000, windowsHide: true });
  const log = `${r.stdout || ''}\n${r.stderr || ''}`;
  writeFileSync(join(RELEASE, 'load-proof.app.log'), log);
  const dbs = [];
  // By the platform, never as a Windows literal: the POSIX answer has no `data` segment, so the literal
  // found nothing off Windows while reading as though the launch had written nothing.
  const wsRoot = workspacesRootFor(lad);
  if (existsSync(wsRoot)) for (const d of readdirSync(wsRoot)) { const f = join(wsRoot, d, 'workspace.db'); if (existsSync(f)) dbs.push(f); }
  if (dbs.length !== 1) throw new Error(`expected one workspace store under ${wsRoot}, found ${dbs.length} (app exit ${r.status ?? r.signal}); see load-proof.app.log`);
  const Database = require('better-sqlite3');
  const db = new Database(dbs[0], { readonly: true });
  const userVersion = db.pragma('user_version', { simple: true });
  const sessions = db.prepare('SELECT session_id, execution_status FROM sessions ORDER BY updated_at DESC').all();
  const calls = db.prepare('SELECT tool_name, status, is_error FROM tool_calls ORDER BY ordinal').all();
  db.close();
  const terminal = calls.find((c) => c.tool_name === 'terminal');
  const result = { exit: r.status, signal: r.signal, store: dbs[0], userVersion, sessions, calls, painted: existsSync(png), captured: /captured /.test(log) };
  if (userVersion < 1) throw new Error(`the store was not migrated (user_version ${userVersion})`);
  if (sessions.length !== 1) throw new Error(`expected one session, found ${sessions.length}`);
  if (!terminal) throw new Error(`no terminal call was recorded; calls: ${JSON.stringify(calls)}`);
  if (terminal.status === 'running') throw new Error(`the terminal call never settled: ${JSON.stringify(terminal)}`);
  if (!result.painted) throw new Error('the packaged app did not paint (no capture)');
  return result;
});
} catch (e) {
  finish(false, String(e.message));
}
process.stdout.write(`[package] packaged app: session ${appRun.sessions[0].execution_status}, terminal call ${appRun.calls.find((c) => c.tool_name === 'terminal').status}, store v${appRun.userVersion}\n`);
finish(true);
