import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, configDirFor, hostSwitches, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { unpressedClicks } from './lib/capture-clicks.mjs';
import { clickLanded, startApp, stopApp, stopOverrunMessage, until } from './lib/driver.mjs';

/**
 * ADR-0036 / ADR-0037's first execution in the built app (Part I step 5): hand-authored, commented files at
 * both scopes drive the run; Settings → Runtime and → Models edit them with Save/Discard; the composer's
 * permission-mode control writes its one key; a fatal file refuses the run naming file, scope and path, and
 * correcting that key alone is enough. Every assertion reads the files or the store; the PNGs are read back.
 */
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'config-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 120_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 120_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);

const GLOBAL = [
  '# global configuration — the comment header must survive every write',
  'models:',
  '  scripted: { provider: scripted, model_id: scripted }   # the verification client',
  '  other: { provider: scripted, model_id: other }',
  'small_model: scripted',
  'medium_model: scripted',
  'large_model: scripted',
  '',
  '# a key this build does not know, kept in place',
  'future_feature:',
  '  nested: true',
  '',
  'runtime:',
  '  # stated globally, inherited by every workspace',
  '  max_iterations: 7',
  '',
].join('\n');
const WORKSPACE = [
  '# workspace configuration',
  'runtime:',
  '  # the workspace states two keys and inherits the rest',
  '  permission_mode: ask',
  '  max_depth: 2',
  'rotaris:',
  '  delegation_strategy: single',
  '',
].join('\n');
// A workspace opened before: its one initialization task already recorded (REQ-WORKSPACE-078), so resolution on open
// finds nothing pending and the section's one writer (REQ-WORKSPACE-085) has nothing to write. The Discard scenario
// is seeded with it. On a never-initialized seed a host that carries the code-intelligence bundle records
// `code-intelligence-setup` in this same file while Discard is pressed, and a byte comparison cannot tell the two
// writes apart (docs/defects/fixed/config-proofs-discard-scenario-counts-the-initialization-record-as-a-discard-write.md).
const INITIALIZED = [
  'initialization:',
  '  completed:',
  '    - code-intelligence-setup',
  '  skipped: []',
  '  last_run: 2026-09-01T00:00:00.000Z',
  '  classification: non-code',
  '',
].join('\n');

function scenario(name, files = { global: GLOBAL, workspace: WORKSPACE }) {
  const root = join(output, name);
  const workspace = join(root, 'workspace');
  const local = join(root, 'local');
  // The global configuration directory by the platform that reads it (`configDirFor`), not the Windows spelling alone.
  const configDir = configDirFor(local);
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(workspace, 'README.md'), '# proof\n');
  if (files.global !== null) writeFileSync(join(configDir, 'agents.yaml'), files.global);
  if (files.workspace !== null) writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), files.workspace);
  return { root, workspace, local, configDir, workspaceFile: join(workspace, '.rotaris', 'agents.yaml'), globalFile: join(configDir, 'agents.yaml') };
}

async function launch(name, s, extra) {
  const png = join(output, `${name}.png`);
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, s.workspace], {
    cwd: app, timeoutMs: 120_000, windowsHide: true,
    env: {
      ...cleanEnvironment(),
      ...proofIsolationEnv({ local: s.local, preferences: join(s.root, 'preferences') }),
      ROTARIS_MODEL_DIALECT: 'scripted',
      ROTARIS_CAPTURE_PNG: png,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  return log;
}

/**
 * Every click step read back from the launch's log (`lib/capture-clicks.mjs`). A step that found no control, or pressed
 * a point another element covered, fails HERE naming itself, rather than letting the launch carry on and the file
 * assertions below speak for a gesture nobody made.
 */
function clicked(name, log, whats) {
  const missed = unpressedClicks(log, whats);
  if (missed.length > 0) throw new Error(`${name}: ${missed.map((m) => `the step "${m.what}" was ${m.reason === 'covered' ? 'pressed on a point another element covers' : 'never pressed'}`).join('; ')}; see ${name}.log`);
}

// The Settings category, chosen by a step that WAITS for its item: the view seam's own category click is one attempt at
// 800 ms and says nothing when it misses, and every step after it then waits on a control that category draws. The
// deadlines below are deadlines, not appointments (`@~`): each step acts as soon as its control is on screen.
const RUNTIME_CATEGORY = '.settings__categories .nav-list__item>>Runtime@~6000';

const results = {};

// 1. Settings → Runtime: the outside-workspace toggle with its confirmation, then Save; bytes outside the written key unchanged.
const s1 = scenario('runtime-save');
const log1 = await launch('runtime-save', s1, {
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Runtime',
  ROTARIS_CAPTURE_CLICKS: `${RUNTIME_CATEGORY};;.toggle[aria-labelledby="outside-label"]@~7000;;.dialog-actions .btn-warning>>Yes@~8000;;.save-bar .btn-primary>>Save@~9000`,
  ROTARIS_CAPTURE_AFTER_MS: '10500',
});
clicked('runtime-save', log1, ['Runtime', '.toggle[aria-labelledby="outside-label"]', 'Yes', 'Save']);
const ws1 = readFileSync(s1.workspaceFile, 'utf8');
if (!ws1.includes('  allow_outside_workspace: true\n')) throw new Error(`the runtime save did not write allow_outside_workspace:\n${ws1}`);
if (!ws1.includes('# workspace configuration\nruntime:\n  # the workspace states two keys and inherits the rest\n  permission_mode: ask\n  max_depth: 2\n')) throw new Error(`the runtime save disturbed the file's other lines:\n${ws1}`);
if (!ws1.includes('rotaris:\n  delegation_strategy: single\n')) throw new Error('the separate key was lost');
if (readFileSync(s1.globalFile, 'utf8') !== GLOBAL) throw new Error('the global file changed on a workspace save');
if (!/configuration saved/.test(log1)) throw new Error('main did not log the save');
results.runtimeSave = { workspaceFile: ws1, loadMs: /loaded in ([\d.]+) ms/.exec(log1)?.[1] ?? null };

// 2. Settings → Models: a slot chosen from the catalogue, then Save; the global comment header and unknown key survive a global-scoped read.
const s2 = scenario('models-save');
// The slot is a `SearchableSelect` (a button and a listbox), its reasoning companion a native `<select>`.
// The selectors are therefore written WITHOUT a tag qualifier: `select[aria-label=…]` matched nothing once
// the slot control changed, and the step logged `no such control` while the launch carried on.
const models2Log = await launch('models-save', s2, {
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Models',
  ROTARIS_CAPTURE_SELECT: '[aria-label="Model for large_model"]>>other@1800;;[aria-label="Reasoning strength for large_model"]>>high@2400',
  ROTARIS_CAPTURE_CLICKS: '.save-bar .btn-primary>>Save@3000',
  ROTARIS_CAPTURE_AFTER_MS: '4200',
});
// Read the steps back before the file: a control that was never driven must fail HERE, naming itself,
// rather than three lines down as a key missing from a file for reasons the message cannot state.
for (const line of models2Log.split('\n')) {
  const m = /capture: select (.+?) = (.*?) → (.+)$/.exec(line.trim());
  if (m && m[3] !== 'chosen') throw new Error(`the models scenario could not drive ${m[1]} to '${m[2]}': ${m[3]}`);
}
const ws2 = readFileSync(s2.workspaceFile, 'utf8');
if (!ws2.includes('large_model: other\n') || !ws2.includes('large_model_thinking: high\n')) throw new Error(`the models save did not write the slot and its companion:\n${ws2}`);
if (!ws2.startsWith('# workspace configuration\n')) throw new Error('the models save lost the comment header');
results.modelsSave = { workspaceFile: ws2 };

// 3. Discard: a toggle changed, then Discard; nothing written (REQ-CONFIG-279, REQ-CONFIG-281, REQ-CONFIG-282).
// Seeded as a workspace already initialized, so no other writer of this file is due during the launch (see INITIALIZED).
// Driven, not captured: the capture seam presses each control at a box measured once, and the "No model provider is
// authenticated yet" notice can fill the shell's notice slot between that measurement and the press, moving the save bar
// down under it, so Discard was reported clicked while the press met the banner
// (docs/defects/fixed/config-proofs-discard-leaves-the-save-status-unsaved.md). The driver's settled click presses a box
// only once it has held still and is the element at its own centre, and says whether the press met it (`clickLanded`);
// every step below waits for the state the one before it produced.
const s3 = scenario('discard', { global: GLOBAL, workspace: WORKSPACE + INITIALIZED });
const driven3 = await startApp({ root: s3.root, workspace: s3.workspace, timeoutMs: 90_000 });
const d3 = driven3.driver;
const KEEP_GOING = '.toggle[aria-labelledby="keep-going-label"]';
const DISCARD = '.save-bar .btn-secondary';
const readBar = () => d3.eval(`(() => {
  const toggle = document.querySelector(${JSON.stringify(KEEP_GOING)});
  const discard = [...document.querySelectorAll(${JSON.stringify(DISCARD)})].find((b) => b.textContent.trim() === 'Discard');
  const slot = document.querySelector('.notice-slot');
  const box = discard ? discard.getBoundingClientRect() : null;
  return {
    status: document.querySelector('.save-bar__status')?.textContent.trim() ?? null,
    keepGoing: toggle ? toggle.getAttribute('aria-checked') : null,
    discard: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null,
    noticeSlotHeight: slot ? slot.getBoundingClientRect().height : null,
  };
})()`);
let discard3;
let stopped3;
try {
  await d3.chord('Ctrl+7');
  const category = await clickLanded(d3, '.settings__categories .nav-list__item', { text: 'Runtime', timeoutMs: 15_000 });
  const before = await until(readBar, (b) => b?.keepGoing === 'true' || b?.keepGoing === 'false', { timeoutMs: 15_000, what: 'the Keep going toggle on Runtime' });
  if (before.status !== 'All changes saved') throw new Error(`the Runtime category opened with the save status ${JSON.stringify(before.status)}, not settled`);
  const toggle = await clickLanded(d3, KEEP_GOING, { timeoutMs: 15_000 });
  const changed = await until(readBar, (b) => b?.keepGoing !== before.keepGoing && b?.status === 'Unsaved changes' && b?.discard !== null, { timeoutMs: 15_000, what: 'the toggle changed and the save bar offering Discard' });
  const press = await clickLanded(d3, DISCARD, { text: 'Discard', timeoutMs: 15_000 });
  const after = await until(readBar, (b) => b?.status === 'All changes saved', { timeoutMs: 15_000, what: 'the save status settled after Discard (REQ-CONFIG-280)' });
  if (after.keepGoing !== before.keepGoing) throw new Error(`Discard left Keep going at ${after.keepGoing}; it was ${before.keepGoing} before the change`);
  if (after.discard !== null) throw new Error('Discard is still offered after the form settled');
  discard3 = {
    presses: { runtime: category, toggle, discard: press },
    keepGoing: { before: before.keepGoing, changed: changed.keepGoing, after: after.keepGoing },
    // What moved: the Discard box when the save bar first offered it, and the notice slot then and at the end.
    discardBoxFirstOffered: changed.discard,
    noticeSlotHeight: { whenOffered: changed.noticeSlotHeight, atEnd: after.noticeSlotHeight },
  };
} finally {
  stopped3 = await stopApp(driven3, { screenshot: join(output, 'discard.png') });
  // The launch's log is the scenario's evidence whatever ended it, a failed step included.
  writeFileSync(join(output, 'discard.log'), readFileSync(driven3.logFile, 'utf8'));
}
const log3 = readFileSync(driven3.logFile, 'utf8');
if (stopped3.overran) throw new Error(`${stopOverrunMessage('discard', stopped3, log3)}\n(see discard.log)`);
if (stopped3.screenshot !== 'taken') throw new Error(`discard produced no screenshot: ${stopped3.screenshot}`);
for (const [step, receipt] of Object.entries(discard3.presses)) {
  if (receipt.landed !== true) throw new Error(`discard: the press "${step}" was not confirmed landed (${JSON.stringify(receipt)}); see discard.log`);
}
if (/initialization: running/.test(log3)) throw new Error('an initialization run started on a seed that records it resolved, so the byte check below would not isolate Discard; see discard.log');
if (readFileSync(s3.workspaceFile, 'utf8') !== WORKSPACE + INITIALIZED) throw new Error(`Discard wrote the file:\n${readFileSync(s3.workspaceFile, 'utf8')}`);
results.discard = { verdict: 'the file is byte-identical; the save status reads "All changes saved"', ...discard3 };

// 4. The composer's permission-mode control writes its one key through the per-field path, with no run active (REQ-CONFIG-288).
const s4 = scenario('composer-mode');
const log4 = await launch('composer-mode', s4, { ROTARIS_CAPTURE_VIEW: '2', ROTARIS_CAPTURE_MODE: 'autonomous', ROTARIS_CAPTURE_MODE_MS: '1500', ROTARIS_CAPTURE_AFTER_MS: '3200' });
const ws4 = readFileSync(s4.workspaceFile, 'utf8');
if (!ws4.includes('  permission_mode: autonomous\n')) throw new Error(`the composer's control did not write its key:\n${ws4}`);
if (!ws4.includes('  # the workspace states two keys and inherits the rest\n') || !ws4.includes('  max_depth: 2\n')) throw new Error('the per-field write disturbed another key');
if (!/field written/.test(log4)) throw new Error('main did not log the per-field write');
results.composerMode = { workspaceFile: ws4 };

// 5. A fatal file refuses the run naming file, scope and path; correcting that key alone loads and the run completes.
const s5 = scenario('fatal', { global: GLOBAL, workspace: WORKSPACE.replace('  max_depth: 2\n', '  max_depth: many\n') });
const log5 = await launch('fatal-refused', s5, { ROTARIS_CAPTURE_PROMPT: 'run on a broken file', ROTARIS_CAPTURE_AFTER_MS: '4000' });
const refused = log5.split('\n').find((line) => /refused before it started/i.test(line) || /could not be loaded/i.test(line)) ?? '';
if (!refused.includes(s5.workspaceFile) || !refused.includes('workspace scope') || !refused.includes('runtime.max_depth')) throw new Error(`the refusal did not name file, scope and path:\n${log5}`);
if (/session .* started/.test(log5)) throw new Error('a run started on a fatal configuration');
writeFileSync(s5.workspaceFile, WORKSPACE);
// 12 s, not 6: since Part T the shipped code_intelligence entry is enabled by default and its discovery costs every run
// start about 4.5 s (ADR-0035's note, finding 6). This proof's YAML seeds are compared byte for byte, so the entry stays
// on here and the window carries the cost instead.
const log5b = await launch('fatal-corrected', s5, { ROTARIS_CAPTURE_PROMPT: 'run on the corrected file', ROTARIS_CAPTURE_AFTER_MS: '12000' });
if (!/ended completed/.test(log5b)) throw new Error(`the corrected file did not run to completion:\n${log5b}`);
results.fatal = { refusal: refused.trim(), correctedRun: 'completed' };

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
