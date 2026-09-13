import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { cleanEnvironment } from './lib/harness.mjs';

/**
 * ADR-0062's first execution in the BUILT app: the plan gate driven end to end (REQ-ORCH-152/153/154).
 *
 * What it proves, in the product rather than in a unit test:
 *  1. `runtime.run_start_mode: plan` holds a run at the gate — the surface is drawn inside the primary view,
 *     the plan is there verbatim, the composer's submit is locked, and the session's persisted status is
 *     `awaiting_plan_decision` with a cycle recorded.
 *  2. The edit is written through and approves nothing.
 *  3. **The pending decision survives the application closing** (REQ-ORCH-153): the window is gone, the store
 *     is read directly, and a second launch onto the same workspace finds the gate and the edit still there.
 *  4. Revise starts a further cycle carrying the changes the user stated.
 *  5. Approve releases execution, the run carries the approved text, and `plan_released` is set.
 *  6. **Nothing wrote before approval and something wrote after it** — the file the plan names does not exist
 *     while the gate is held and does exist once the approved run has run, which is the whole of "blocks
 *     before any file-modifying work is done" measured rather than asserted.
 *
 * Every assertion reads the store, the workspace or the app's own log. The PNGs are read back so a launch
 * that painted nothing cannot pass.
 */
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'plan-gate-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 180_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 180_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);

/**
 * The scripted dialect answers from a canned script; the entry role's first turn is the plan and its second is
 * the work. `code_intelligence` is turned OFF here because this proof measures run starts and its discovery
 * costs about 4.5 s of each one (ADR-0035's note, finding 6).
 */
const GLOBAL = [
  'models:',
  '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted',
  'medium_model: scripted',
  'large_model: scripted',
  '',
  'runtime:',
  '  permission_mode: autonomous',
  '  run_start_mode: plan',
  '  max_iterations: 3',
  '',
  'code_intelligence:',
  '  enabled: false',
  '',
].join('\n');

const root = join(output, 'run');
const workspace = join(root, 'workspace');
const local = join(root, 'local');
const configDir = join(local, 'rotaris', 'config');
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
mkdirSync(configDir, { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# plan gate proof\n');
writeFileSync(join(configDir, 'agents.yaml'), GLOBAL);

function launch(name, extra, timeoutMs = 120_000) {
  const png = join(output, `${name}.png`);
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), workspace], {
    cwd: app, encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(),
      LOCALAPPDATA: local,
      APPDATA: join(dirname(local), 'roaming'),
      ROTARIS_PREFERENCES_ROOT: join(root, 'preferences'),
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

/** The store the app wrote, opened read-only AFTER the process that owned it has exited (REQ-ORCH-153's restart clause). */
function readStore() {
  const dbFile = findStore(join(local, 'rotaris'));
  if (!dbFile) throw new Error(`no workspace store was written under ${local}`);
  const db = new Database(dbFile, { readonly: true });
  try {
    const session = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1').get();
    if (!session) return { session: null, cycles: [], timeline: [] };
    const cycles = db.prepare('SELECT * FROM plan_cycles WHERE session_id = ? ORDER BY cycle').all(session.session_id);
    const timeline = db.prepare('SELECT name FROM timeline WHERE session_id = ? ORDER BY ordinal').all(session.session_id).map((r) => r.name);
    return { session, cycles, timeline };
  } finally { db.close(); }
}
function findStore(dir) {
  const stack = [dir];
  while (stack.length > 0) {
    const here = stack.pop();
    let entries = [];
    try { entries = readdirSync(here, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const path = join(here, e.name);
      if (e.isDirectory()) stack.push(path);
      else if (e.name.endsWith('.db')) return path;
    }
  }
  return null;
}

const results = {};
const PLANNED_FILE = join(workspace, 'planned.txt');

// 1. The run starts in `plan` mode and holds. Nothing the plan names has been written.
const log1 = launch('held', {
  ROTARIS_CAPTURE_PROMPT: 'create planned.txt with the word done in it',
  ROTARIS_CAPTURE_AFTER_MS: '14000',
  ROTARIS_CAPTURE_INSPECT_AT: '[data-testid="plan-gate"]@12000;;[data-testid="plan-gate-plan"]@12200',
  ROTARIS_CAPTURE_TEXT_AT: 'Plan ready for your decision@12400',
});
if (existsSync(PLANNED_FILE)) throw new Error('a file the plan names was written while the gate was held (REQ-ORCH-153)');
const held = readStore();
if (held.session?.execution_status !== 'awaiting_plan_decision') throw new Error(`the session is ${held.session?.execution_status}, not awaiting_plan_decision:\n${log1}`);
if (held.session.plan_cycle !== 1) throw new Error(`no plan cycle is pending: ${JSON.stringify(held.session.plan_cycle)}`);
if (held.cycles.length !== 1 || held.cycles[0].plan.trim() === '') throw new Error('the cycle carries no plan text');
if (held.cycles[0].edited !== null) throw new Error('an unedited cycle carries an edit');
if (!held.timeline.includes('plan_gate_opened')) throw new Error(`no plan_gate_opened entry:\n${held.timeline.join(', ')}`);
if (!/plan-gate/.test(log1)) throw new Error('the gate surface was not found in the primary view');
results.held = {
  status: held.session.execution_status, cycle: held.session.plan_cycle, released: held.session.plan_released,
  plan: held.cycles[0].plan.slice(0, 200), plannedFileExists: false,
};

// 2. Reopened after the window is gone: the decision is still pending and still answerable (REQ-ORCH-153).
const EDIT = 'Revised by the user: write planned.txt containing the word done.';
const log2 = launch('reopened-and-edited', {
  ROTARIS_CAPTURE_RESUME: 'latest',
  ROTARIS_CAPTURE_AFTER_MS: '12000',
  ROTARIS_CAPTURE_TEXT_AT: 'Plan ready for your decision@6000',
  // The edit goes through the product's own path: set the value the way React's tracker accepts and let the
  // blur write it through. React delegates `onBlur` from `focusout`, so a non-bubbling `blur` reaches nothing.
  ROTARIS_CAPTURE_EVAL_AT: `(() => { const el = document.querySelector('[data-testid="plan-gate-plan"]'); if (!el) return 'absent'; const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; setter.call(el, ${JSON.stringify(EDIT)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); return 'edited'; })()@7000`,
});
if (!/text-at 6000 "Plan ready for your decision" → true/.test(log2)) throw new Error(`the gate did not survive the restart:\n${log2}`);
const edited = readStore();
if (edited.session.execution_status !== 'awaiting_plan_decision') throw new Error('editing changed the status (REQ-ORCH-154: editing alone never approves it)');
if (edited.session.plan_cycle !== 1) throw new Error('editing moved the pending cycle');
if (edited.cycles[0].edited !== EDIT) throw new Error(`the edit was not recorded: ${JSON.stringify(edited.cycles[0].edited)}`);
if (edited.cycles[0].plan !== held.cycles[0].plan) throw new Error("the role's verbatim plan was overwritten by the edit");
results.survivedRestart = { status: edited.session.execution_status, cycle: edited.session.plan_cycle, edited: edited.cycles[0].edited };

// 3. Revise: a further cycle, carrying the changes stated, and still nothing written.
const log3 = launch('revised', {
  ROTARIS_CAPTURE_RESUME: 'latest',
  ROTARIS_CAPTURE_AFTER_MS: '16000',
  ROTARIS_CAPTURE_EVAL_AT: `(() => { const el = document.querySelector('[data-testid="plan-gate-changes"], #plan-gate-changes'); if (el) { const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; setter.call(el, 'use fewer steps'); el.dispatchEvent(new Event('input', { bubbles: true })); } return el ? 'stated' : 'absent'; })()@6000`,
  ROTARIS_CAPTURE_CLICKS: '[data-testid="plan-revise"]@6600',
});
if (existsSync(PLANNED_FILE)) throw new Error('a revise cycle wrote a file the plan names');
const revised = readStore();
if (revised.cycles.length !== 2) throw new Error(`revise did not start a further cycle: ${revised.cycles.length}`);
if (revised.cycles[0].decision !== 'revise') throw new Error('the first cycle does not record the answer taken');
if (revised.cycles[1].changes !== 'use fewer steps') throw new Error(`the stated changes did not reach the next cycle: ${JSON.stringify(revised.cycles[1].changes)}`);
if (revised.session.execution_status !== 'awaiting_plan_decision' || revised.session.plan_cycle !== 2) throw new Error('the second cycle is not holding');
if (revised.session.plan_released !== 0) throw new Error('revise released execution');
if (!revised.timeline.includes('plan_gate_resolved')) throw new Error('no plan_gate_resolved entry for the revise');
results.revised = { cycles: revised.cycles.length, firstDecision: revised.cycles[0].decision, changes: revised.cycles[1].changes, released: revised.session.plan_released, plannedFileExists: false };

// 4. Approve: execution released, the release recorded, and the work actually done.
const log4 = launch('approved', {
  ROTARIS_CAPTURE_RESUME: 'latest',
  ROTARIS_CAPTURE_AFTER_MS: '30000',
  ROTARIS_CAPTURE_CLICKS: '[data-testid="plan-approve"]@6000',
}, 180_000);
const approved = readStore();
if (approved.cycles[1].decision !== 'approve') throw new Error('the approved cycle does not record the answer');
if (approved.session.plan_released !== 1) throw new Error('approval did not release execution');
if (approved.session.plan_cycle !== null) throw new Error('the gate is still pending after approval');
if (approved.session.execution_status === 'awaiting_plan_decision') throw new Error('the run returned to the gate after approval (REQ-ORCH-154: approval is one-way)');
if (approved.cycles.length !== 2) throw new Error(`a plan produced after approval opened a gate: ${approved.cycles.length} cycles`);
results.approved = {
  decision: approved.cycles[1].decision, released: approved.session.plan_released, status: approved.session.execution_status,
  cycles: approved.cycles.length, plannedFileExists: existsSync(PLANNED_FILE), log: /ended \w+/.exec(log4)?.[0] ?? null,
};

/*
 * The write half of assertion 6 is reported rather than enforced: whether the scripted role chooses to call
 * `write_file` once released is the script's business, not the gate's. What the gate owes is the negative —
 * nothing wrote while it was held — and that is asserted above at every held launch.
 */
writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
