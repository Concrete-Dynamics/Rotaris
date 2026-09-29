import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, configDirFor, hostSwitches, proofIsolationEnv } from './lib/harness.mjs';

/**
 * ADR-0064's first execution in the BUILT app (Part AS): project initialization resolved once per
 * workspace open, recorded by one writer, and shown on the two surfaces the specification names.
 *
 * Everything here runs on this Windows host. Nothing in this part is platform-specific: the one
 * shipped task launches the bundled code-intelligence runtime, whose three setup subcommands Part T
 * already proved on this machine (`pnpm code-intel-proof`, OQ-23).
 *
 * The scenarios are chosen so the assertions are about THIS part rather than about the runtime's
 * speed: the two that run the shipped task use documentation-only trees, which REQ-WORKSPACE-098
 * classifies `non-code` and REQ-WORKSPACE-091 therefore runs `project create` for and skips the
 * 1800 s indexing stage and the memory stage. The consent dialog and the composer gate are reached
 * through `ROTARIS_INIT_TEST_TASK`, which registers an ordinary task through the ordinary registry —
 * REQ-WORKSPACE-080 admits exactly that, and REQ-WORKSPACE-104 is why the shipped set cannot reach
 * them (with the default task set a fresh workspace prompts for nothing and gates nothing).
 */
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'init-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 240_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 240_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);

const GLOBAL = [
  'models:',
  '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted',
  'medium_model: scripted',
  'large_model: scripted',
  '',
].join('\n');

/** A workspace file with a comment header and a key outside `initialization:`, both of which must survive every write. */
const WORKSPACE = [
  '# workspace configuration — this header must survive the marker write',
  'runtime:',
  '  permission_mode: ask',
  '',
].join('\n');

/** REQ-WORKSPACE-090: an entry whose command is not on PATH is not launchable, so the task is INAPPLICABLE. */
const WORKSPACE_NO_TASK = [
  '# workspace configuration',
  'runtime:',
  '  permission_mode: ask',
  'mcp_servers:',
  '  code_intelligence:',
  '    command: rotaris-no-such-executable-xyz',
  '    args: [start-mcp-server]',
  '',
].join('\n');

function scenario(name, files, { code = false } = {}) {
  const root = join(output, name);
  const workspace = join(root, 'workspace');
  const local = join(root, 'local');
  // The global configuration directory by the platform that reads it (`configDirFor`), not the Windows spelling alone.
  const configDir = configDirFor(local);
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(workspace, 'README.md'), '# documentation only\n');
  writeFileSync(join(workspace, 'notes.txt'), 'nothing here is source\n');
  if (code) writeFileSync(join(workspace, 'main.py'), 'print("source")\n');
  writeFileSync(join(configDir, 'agents.yaml'), GLOBAL);
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), files);
  return { root, workspace, local, configDir, workspaceFile: join(workspace, '.rotaris', 'agents.yaml') };
}

function launch(name, s, extra, timeout = 120_000) {
  const png = join(output, `${name}.png`);
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, s.workspace], {
    cwd: app, encoding: 'utf8', timeout, windowsHide: true,
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
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  return log;
}

/** The one `capture: eval-at … → <json>` line a launch logged for the named expression. */
function evalOf(log, marker) {
  const line = log.split('\n').find((l) => l.includes('capture: eval-at') && l.includes(marker));
  if (!line) throw new Error(`no eval-at reading for ${marker}`);
  const json = line.slice(line.indexOf('→ ') + 2).trim();
  return JSON.parse(json);
}

const results = {};

/* --------------------------------------------------------------------------------------------- *
 * 1. REQ-WORKSPACE-083/088/103/104 — a fresh documentation-only workspace opens with NO dialog and
 *    NO gate; the background task starts by itself; its outcome is recorded by the one writer, and
 *    every other line of the file survives.
 * --------------------------------------------------------------------------------------------- */
const s1 = scenario('background', WORKSPACE);
const log1 = launch('background', s1, {
  ROTARIS_CAPTURE_VIEW: '2',
  ROTARIS_CAPTURE_EVAL_AT: [
    'JSON.stringify({probe:"gate",dialog:!!document.querySelector(\'[data-testid="project-setup-dialog"]\'),send:document.querySelector(\'[data-testid="composer-send"]\')?.disabled??null})>>[data-testid="composer-send"]@~10000',
  ].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '30000',
}, 180_000);
const gate1 = JSON.parse(evalOf(log1, 'probe:"gate"'));
if (gate1.dialog) throw new Error('a fresh workspace with the default task set raised the setup dialog (REQ-WORKSPACE-104)');
// `null` would mean the composer never mounted and the reading proved nothing; the gate must be OFF, seen.
if (gate1.send !== false) throw new Error(`the composer Send control read ${JSON.stringify(gate1.send)}; a fresh workspace with the default task set must leave it enabled (REQ-WORKSPACE-104/142)`);
const ws1 = readFileSync(s1.workspaceFile, 'utf8');
if (!/initialization:/.test(ws1)) throw new Error(`the background task recorded nothing:\n${ws1}`);
if (!/completed:\s*\n?\s*(-\s*code-intelligence-setup|\[\s*code-intelligence-setup\s*\])/.test(ws1.replace(/\r/g, ''))) throw new Error(`code-intelligence-setup was not recorded completed:\n${ws1}`);
if (!/last_run:/.test(ws1)) throw new Error(`last_run was not stamped:\n${ws1}`);
if (!/classification:\s*non-code/.test(ws1)) throw new Error(`the documentation-only tree was not classified non-code:\n${ws1}`);
if (!ws1.startsWith('# workspace configuration — this header must survive the marker write\n')) throw new Error('the marker write lost the comment header');
if (!/permission_mode: ask/.test(ws1)) throw new Error('the marker write disturbed another key');
if (!/initialization: code-intelligence-setup → success/.test(log1)) throw new Error(`the coordinator did not log the outcome:\n${log1}`);
results.background = { workspaceFile: ws1, dialogRaised: gate1.dialog, sendDisabled: gate1.send };

/* --------------------------------------------------------------------------------------------- *
 * 2. REQ-WORKSPACE-083/090 — a workspace whose `code_intelligence` entry is not launchable has NO
 *    applicable task: it is marked initialized silently, with both lists empty and `last_run` alone.
 * --------------------------------------------------------------------------------------------- */
const s2 = scenario('nothing-applicable', WORKSPACE_NO_TASK);
const log2 = launch('nothing-applicable', s2, { ROTARIS_CAPTURE_AFTER_MS: '12000' }, 120_000);
const ws2 = readFileSync(s2.workspaceFile, 'utf8').replace(/\r/g, '');
if (!/last_run:/.test(ws2)) throw new Error(`a workspace with nothing applicable was not marked:\n${ws2}`);
if (/code-intelligence-setup/.test(ws2)) throw new Error(`an inapplicable task was recorded:\n${ws2}`);
if (!/has no applicable task; marked initialized/.test(log2)) throw new Error(`main did not log the silent marking:\n${log2}`);
if (/mcp setup: started/.test(log2)) throw new Error('an inapplicable task was started anyway');
results.nothingApplicable = { workspaceFile: ws2 };

/* --------------------------------------------------------------------------------------------- *
 * 3. REQ-WORKSPACE-106/107/111/112 — a consent-requiring task raises the dialog, disables Send with
 *    REQ-WORKSPACE-112's exact reason, and Escape records a skip that does not re-prompt on reopen.
 * --------------------------------------------------------------------------------------------- */
const s3 = scenario('consent', WORKSPACE);
const log3 = launch('consent', s3, {
  ROTARIS_INIT_TEST_TASK: 'consent',
  ROTARIS_CAPTURE_VIEW: '2',
  ROTARIS_CAPTURE_EVAL_AT: [
    // `visible` is not decoration: the dialog was in the DOM and off screen, and every DOM assertion
    // beside it passed on that. A box that exists and cannot be seen is UIR-014's class.
    // The reading marks the document once taken, and the Escape below waits for that mark, so the dialog is read
    // before it is answered rather than in whichever order two matches of one selector fall (a harness order, no
    // assertion changed: `docs/defects/fixed/the-setup-dialog-takes-a-background-run-as-its-own.md`).
    '(()=>{const r=JSON.stringify({probe:"dialog",headline:document.querySelector(\'[data-testid="project-setup-headline"]\')?.textContent??null,intro:document.querySelector(\'[data-testid="project-setup-intro"]\')?.textContent??null,word:document.querySelector(\'[data-setup-task-word]\')?.textContent??null,visible:(()=>{const d=document.querySelector(\'[data-testid="project-setup-dialog"]\');if(!d)return null;const r=d.getBoundingClientRect();return r.width>0&&r.height>0&&r.top<window.innerHeight&&r.bottom>0&&r.left<window.innerWidth&&r.right>0&&document.elementFromPoint(r.left+r.width/2,r.top+8)!==null&&d.contains(document.elementFromPoint(r.left+r.width/2,r.top+8));})(),send:document.querySelector(\'[data-testid="composer-send"]\')?.disabled??null,reason:document.querySelector(\'[data-testid="composer-send"]\')?.title??document.querySelector(\'.composer__refusal\')?.textContent??null});document.documentElement.setAttribute(\'data-proof-read\',\'dialog\');return r;})()>>[data-testid="project-setup-dialog"]@~15000',
  ].join(';;'),
  // Pressed as soon as the dialog has been read, not at a clock: the run reaches it when it reaches it.
  ROTARIS_CAPTURE_KEYS: 'Escape>>[data-proof-read="dialog"] [data-testid="project-setup-dialog"]@~18000',
  ROTARIS_CAPTURE_AFTER_MS: '32000',
}, 120_000);
const dialog3 = JSON.parse(evalOf(log3, 'probe:"dialog"'));
if (dialog3.headline !== 'Set up this project?') throw new Error(`the dialog headline read ${JSON.stringify(dialog3.headline)}`);
if (!String(dialog3.intro).includes('one-time setup task')) throw new Error(`the dialog intro read ${JSON.stringify(dialog3.intro)}`);
if (dialog3.word !== 'Pending') throw new Error(`the task card's status word read ${JSON.stringify(dialog3.word)}`);
if (dialog3.visible !== true) throw new Error(`the dialog is in the DOM but not on screen (visible=${JSON.stringify(dialog3.visible)}); REQ-WORKSPACE-106 asks for a window-level surface, and a non-modal one has no backdrop to position it`);
if (dialog3.send !== true) throw new Error('the composer Send control was not disabled while the prompt was unanswered (REQ-WORKSPACE-112)');
results.consent = { headline: dialog3.headline, intro: dialog3.intro, word: dialog3.word, visible: dialog3.visible, sendDisabled: dialog3.send, reason: dialog3.reason };

/* 3b. REQ-WORKSPACE-111: once skipped, reopening the workspace never re-prompts. */
const ws3 = readFileSync(s3.workspaceFile, 'utf8').replace(/\r/g, '');
if (!/verification-consent/.test(ws3)) throw new Error(`Escape did not record the skip:\n${ws3}`);
// REQ-WORKSPACE-083/084/088: the background task starts by itself whenever the prompt is answered, so Escape skips the
// consent task only. The dialog can open from the window's mount read before the resolution 800 ms after the workspace
// opens; a skip answered first performs that resolution first (OQ-118). On Linux the Escape used to come first and skip
// both (`docs/defects/fixed/a-skip-answered-before-the-open-resolves-swallows-the-background-task.md`).
if (!/initialization: running code-intelligence-setup[^\n]*\(background\)/.test(log3)) throw new Error('the background task did not start by itself beside the consent prompt (REQ-WORKSPACE-083)');
if (!/completed:\s*\n?\s*(-\s*code-intelligence-setup|\[\s*code-intelligence-setup\s*\])/.test(ws3)) throw new Error(`the background task beside the consent prompt was not recorded completed (REQ-WORKSPACE-088):\n${ws3}`);
const log3b = launch('consent-reopen', s3, {
  ROTARIS_INIT_TEST_TASK: 'consent',
  ROTARIS_CAPTURE_VIEW: '2',
  ROTARIS_CAPTURE_EVAL_AT: 'JSON.stringify({probe:"reopen",dialog:!!document.querySelector(\'[data-testid="project-setup-dialog"]\'),send:document.querySelector(\'[data-testid="composer-send"]\')?.disabled??null,section:document.querySelector(\'[data-testid="project-section-hint"]\')?.textContent??null})>>[data-testid="project-section"]@~12000',
  ROTARIS_CAPTURE_AFTER_MS: '15000',
}, 120_000);
const reopen = JSON.parse(evalOf(log3b, 'probe:"reopen"'));
if (reopen.dialog) throw new Error('the dialog returned after a skip (REQ-WORKSPACE-111)');
if (reopen.send === true) throw new Error('the composer stayed gated after a skip');
// REQ-WORKSPACE-113: a skipped task stays RUNNABLE, so the sidebar's Project section still offers it.
if (!String(reopen.section ?? '').includes('Not run yet: Verification consent task')) throw new Error(`the sidebar Project section did not offer the skipped task: ${JSON.stringify(reopen.section)}`);
results.skipHolds = { dialogReturned: reopen.dialog, sendDisabled: reopen.send, sidebarHint: reopen.section };

/* --------------------------------------------------------------------------------------------- *
 * 4. REQ-WORKSPACE-084/103 — a failing task records NOTHING and reaches the background banner,
 *    while the shipped task beside it still runs and IS recorded.
 * --------------------------------------------------------------------------------------------- */
const s4 = scenario('failure', WORKSPACE);
const log4 = launch('failure', s4, { ROTARIS_INIT_TEST_TASK: 'fail', ROTARIS_CAPTURE_AFTER_MS: '30000' }, 180_000);
const ws4 = readFileSync(s4.workspaceFile, 'utf8').replace(/\r/g, '');
if (/verification-fail/.test(ws4)) throw new Error(`a failed task recorded an outcome:\n${ws4}`);
if (!/code-intelligence-setup/.test(ws4)) throw new Error(`the task after the failure was not attempted:\n${ws4}`);
if (!/initialization: verification-fail → failure/.test(log4)) throw new Error(`the failure was not reported:\n${log4}`);
if (!/Project setup did not finish/.test(log4)) throw new Error(`the background banner was not raised:\n${log4}`);
results.failure = { workspaceFile: ws4 };

/* --------------------------------------------------------------------------------------------- *
 * 5. REQ-WORKSPACE-101/114 — Settings › Project states the card in exactly one of six states, with
 *    the classification sentence, after a completed background run.
 * --------------------------------------------------------------------------------------------- */
const s5 = scenario('settings-card', WORKSPACE, { code: false });
const log5 = launch('settings-card', s5, {
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Project',
  ROTARIS_CAPTURE_EVAL_AT: 'JSON.stringify({probe:"card",state:document.querySelector(\'[data-project-init]\')?.getAttribute(\'data-init-state\')??null,headline:document.querySelector(\'[data-init-headline]\')?.textContent??null,lines:[...document.querySelectorAll(\'[data-init-detail]\')].map(n=>n.textContent),reason:document.querySelector(\'[data-init-reason]\')?.textContent??null})>>[data-init-state="completed"]@~40000',
  ROTARIS_CAPTURE_AFTER_MS: '45000',
}, 180_000);
const card = JSON.parse(evalOf(log5, 'probe:"card"'));
if (card.state !== 'completed') throw new Error(`the Project card read state ${JSON.stringify(card.state)}, expected completed`);
if (card.headline !== 'Project initialized') throw new Error(`the card headline read ${JSON.stringify(card.headline)}`);
if (!card.lines.some((l) => /every initialization task/i.test(l))) throw new Error(`the completed sentence is missing: ${JSON.stringify(card.lines)}`);
if (!card.lines.includes('No code memories were created — this workspace is a documentation-only project.')) throw new Error(`REQ-WORKSPACE-101's sentence is missing: ${JSON.stringify(card.lines)}`);
if (card.reason !== 'Every initialization task for this workspace is already resolved.') throw new Error(`the disabled action did not name its condition: ${JSON.stringify(card.reason)}`);
results.settingsCard = card;

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
console.log('\ninit-proof: five scenarios passed on this host.');
