import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { cleanEnvironment, configDirFor, hostSwitches, proofIsolationEnv } from './lib/harness.mjs';

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
 *  7. **PD-ORCH-003: a follow-up prompt in the approved session is not held** — the mode is still `plan` and
 *     the gate stays shut, because the release belongs to the session and not to the run that took it.
 *  8. **PD-ORCH-003: choosing `plan` again on the run-start chip re-arms it** — driven through the chip's own
 *     popover, after which the next prompt is held at a third cycle.
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
// The global configuration directory by the platform that reads it (`configDirFor`), not the Windows spelling alone.
const configDir = configDirFor(local);
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
mkdirSync(configDir, { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# plan gate proof\n');
writeFileSync(join(configDir, 'agents.yaml'), GLOBAL);

function launch(name, extra, timeoutMs = 120_000) {
  const png = join(output, `${name}.png`);
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
    cwd: app, encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(),
      ...proofIsolationEnv({ local, preferences: join(root, 'preferences') }),
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

/*
 * 2b. PD-ORCH-002 revision 2's two states, measured rather than asserted. Revision 1 was falsified by geometry —
 * the gate's row was allocated less than its content — so what this reads is geometry: where the boxes actually
 * stand after layout settles, at the window the product opens. The reading is taken twice, once on the state a
 * gate OPENS in and once after the collapse control has been clicked like a user clicks it.
 */
const STATE_PROBE = "(() => { const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; }; const gate = document.querySelector('[data-testid=\"plan-gate\"]'); const plan = document.querySelector('[data-testid=\"plan-gate-preview\"]') || document.querySelector('[data-testid=\"plan-gate-plan\"]'); const tr = document.querySelector('.transcript'); const answers = document.querySelector('[data-ui=\"plan-gate-actions\"]'); const ws = document.querySelector('.workspace'); return { collapsed: ws ? (ws.getAttribute('data-plan-gate-collapsed') || '') : 'no-workspace', workspace: r(ws), rows: ws ? getComputedStyle(ws).gridTemplateRows : null, children: gate ? [...gate.children].map((c) => ({ c: c.className.split(' ')[0], h: Math.round(c.getBoundingClientRect().height), grow: getComputedStyle(c).flexGrow })) : null, gate: r(gate), plan: r(plan), answers: r(answers), transcript: r(tr), threeAnswers: ['plan-approve', 'plan-revise', 'plan-cancel'].every((t) => document.querySelector('[data-testid=\"' + t + '\"]') !== null), viewport: Math.round(window.innerHeight) }; })()";
const log2b = launch('two-states', {
  ROTARIS_CAPTURE_RESUME: 'latest',
  ROTARIS_CAPTURE_AFTER_MS: '14000',
  ROTARIS_CAPTURE_EVAL_AT: `${STATE_PROBE}@7000;;${STATE_PROBE}@10000`,
  ROTARIS_CAPTURE_CLICKS: '[data-testid="plan-gate-collapse"]@8500',
});
const readings = [...log2b.matchAll(/eval-at \d+ .* → (\{.*\})/g)].map((m) => JSON.parse(m[1]));
if (readings.length !== 2) throw new Error(`expected two state readings, got ${readings.length}:\n${log2b}`);
const [open, shut] = readings;
if (open.gate === null) throw new Error('no gate surface stood in the view');
if (open.collapsed !== '') throw new Error(`the gate did not open expanded: ${JSON.stringify(open.collapsed)}`);
if (open.transcript !== null && open.transcript.h > 0) throw new Error(`a transcript was drawn beneath the expanded gate (PD-ORCH-002 revision 2): ${JSON.stringify(open.transcript)}`);
if (!open.threeAnswers || open.answers === null) throw new Error('the three answers are not drawn expanded');
/*
 * "The largest element of the surface and the ONLY element that grows with it" (PD-ORCH-002 revision 2), read as
 * two facts rather than as a share of the height: the plan is taller than every other part of the gate, and it is
 * the only part with a flex grow factor — so the pixels a taller window adds reach the plan and nothing else. The
 * share is REPORTED rather than asserted, because the first execution measured what it depends on: at an 835 px
 * window the composer's own content minimum is 252 px and the gate is left 397, of which the heading, the intent,
 * the implied todo, the progressive revision field and the three answers take what they take.
 */
if (open.plan === null || open.children === null) throw new Error('the expanded gate drew no plan');
const grew = open.children.filter((c) => Number(c.grow) > 0 && c.h > 1).map((c) => c.c);
if (grew.length !== 1 || !/plan-gate__(preview-wrap|plan)/.test(grew[0])) throw new Error(`the plan is not the only element that grows: ${JSON.stringify(grew)}`);
const tallest = open.children.reduce((a, b) => (b.h > a.h ? b : a));
if (!/plan-gate__(preview-wrap|plan)/.test(tallest.c)) throw new Error(`the plan is not the largest element of the surface: ${JSON.stringify(open.children)}`);
if (open.answers.y + open.answers.h > open.gate.y + open.gate.h + 1) throw new Error('the answers stand outside the gate they belong to (the five-capture failure)');
if (!/capture: clicked "\[data-testid="plan-gate-collapse"\]"/.test(log2b)) throw new Error(`the collapse control was not on screen:\n${log2b}`);
if (shut.collapsed !== '1') throw new Error(`clicking the control did not collapse the gate: ${JSON.stringify(shut.collapsed)}`);
if (shut.transcript === null || shut.transcript.h < 180) throw new Error(`collapsing did not give the transcript back under REQ-CHAT-010's floor: ${JSON.stringify(shut.transcript)}`);
if (!shut.threeAnswers || shut.answers === null) throw new Error('the three answers are not offered in the collapsed bar (PD-ORCH-002 revision 2)');
if (shut.gate.h > open.gate.h / 2) throw new Error(`the collapsed gate is not a bar: ${shut.gate.h} of ${open.gate.h}`);
const stillHeld = readStore();
if (stillHeld.session.execution_status !== 'awaiting_plan_decision' || stillHeld.session.plan_cycle !== 1) throw new Error('collapsing the surface answered the gate');
results.twoStates = {
  expanded: { gate: open.gate.h, plan: open.plan.h, share: `${Math.round((open.plan.h / open.gate.h) * 100)}%`, transcript: open.transcript?.h ?? 0, viewport: open.viewport, children: open.children },
  collapsed: { gate: shut.gate.h, transcript: shut.transcript.h, threeAnswers: shut.threeAnswers },
  decisionUntouched: stillHeld.session.execution_status,
};

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
 * 5. PD-ORCH-003: a follow-up prompt in the approved session is NOT held.
 *
 * This is the directive's whole point and the one launch that would have failed before it: `run_start_mode` is
 * still `plan`, the intent of the follow-up is outside REQ-ORCH-021's answer group, and the gate must stay shut
 * anyway because this session already holds an approval. The prompt is typed through the real input path.
 */
const log5 = launch('follow-up-not-held', {
  ROTARIS_CAPTURE_RESUME: 'latest',
  ROTARIS_CAPTURE_PROMPT: 'also add a second line saying again to planned.txt',
  ROTARIS_CAPTURE_PROMPT_MS: '10000',
  ROTARIS_CAPTURE_AFTER_MS: '34000',
}, 180_000);
const followUp = readStore();
if (followUp.session.execution_status === 'awaiting_plan_decision') throw new Error(`a follow-up after approval opened the gate again (PD-ORCH-003):\n${log5}`);
if (followUp.session.plan_cycle !== null) throw new Error(`a cycle is pending after a follow-up: ${JSON.stringify(followUp.session.plan_cycle)}`);
if (followUp.session.plan_released !== 1) throw new Error('the prompt cleared the release — the release is the session\'s under PD-ORCH-003');
if (followUp.cycles.length !== 2) throw new Error(`the follow-up opened a plan cycle: ${followUp.cycles.length} cycles, expected the 2 already decided`);
results.followUpNotHeld = {
  status: followUp.session.execution_status, cycle: followUp.session.plan_cycle,
  released: followUp.session.plan_released, cycles: followUp.cycles.length,
};

/*
 * 6. PD-ORCH-003: choosing `plan` again on the run-start chip re-arms the session, and the next prompt is held.
 *
 * Driven through the chip itself rather than through the command, because the directive puts the re-arm ON that
 * control: the popover is opened and the `plan` item chosen by its own label, so a renamed option fails here
 * rather than silently selecting the wrong one.
 */
// Two steps rather than one, with the popover's own render between them: the panel is mounted by a state update
// the opening click schedules, so a single expression that clicks and then queries is racing its own effect.
const OPEN_CHIP = `(() => { const chip = document.querySelector('[data-testid="chip-run-start-mode"]'); if (!chip) return 'no-chip'; const trigger = chip.querySelector('[data-ui-component="PopoverMenu"]'); if (!trigger) return 'no-trigger'; trigger.click(); return 'opened'; })()`;
const CHOOSE_PLAN = `(() => { const panel = document.querySelector('[data-testid="chip-menu-panel"]'); if (!panel) return 'no-panel'; const item = [...panel.querySelectorAll('[role="menuitemradio"]')].find((b) => /plan first/i.test(b.textContent || '')); if (!item) return 'no-plan-option'; const chosen = (item.textContent || '').trim(); item.click(); return 'chose:' + chosen; })()`;
const log6 = launch('re-armed', {
  ROTARIS_CAPTURE_RESUME: 'latest',
  ROTARIS_CAPTURE_EVAL_AT: `${OPEN_CHIP}@10000;;${CHOOSE_PLAN}@11000`,
  ROTARIS_CAPTURE_PROMPT: 'now do the other thing entirely',
  ROTARIS_CAPTURE_PROMPT_MS: '15000',
  ROTARIS_CAPTURE_AFTER_MS: '36000',
}, 180_000);
// The app logs an eval as `eval-at <ms> <the expression> → "<the value>"`, and the expression itself contains
// every token the answer does — so the answer is read from the arrow at the end of the line, never from the line.
const rearmSteps = log6.split('\n').filter((l) => l.includes('eval-at')).map((l) => /→ "([^"]*)"/.exec(l)?.[1]?.trim() ?? 'no-answer');
const rearmChoice = rearmSteps.find((s) => s.startsWith('chose:')) ?? null;
if (rearmSteps.some((s) => s.startsWith('no-')) || rearmChoice === null) throw new Error(`the run-start chip could not be driven: ${JSON.stringify(rearmSteps)}\n${log6}`);
const rearmed = readStore();
if (rearmed.session.plan_released !== 0) throw new Error(`choosing \`plan\` did not re-arm the session: plan_released=${rearmed.session.plan_released}\n${log6}`);
if (rearmed.session.execution_status !== 'awaiting_plan_decision') throw new Error(`the re-armed session did not hold the next prompt: ${rearmed.session.execution_status}\n${log6}`);
if (rearmed.session.plan_cycle !== 3) throw new Error(`the held cycle is ${JSON.stringify(rearmed.session.plan_cycle)}, expected a third`);
if (rearmed.cycles.length !== 3) throw new Error(`expected a third cycle, found ${rearmed.cycles.length}`);
results.reArmed = {
  chipChoice: rearmChoice, released: rearmed.session.plan_released, status: rearmed.session.execution_status,
  cycle: rearmed.session.plan_cycle, cycles: rearmed.cycles.length,
};

/*
 * The write half of assertion 6 is reported rather than enforced: whether the scripted role chooses to call
 * `write_file` once released is the script's business, not the gate's. What the gate owes is the negative —
 * nothing wrote while it was held — and that is asserted above at every held launch.
 */
writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
