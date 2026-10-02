import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { cleanEnvironment, configDirFor, hostSwitches, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { parseEvals, readEval } from './lib/capture-evals.mjs';

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
 *  9. **REQ-MONITOR-060 at a gate no iteration precedes** — a fresh session's plan cycle root calls a tool and parks;
 *     reopened in the next launch, the inspector's run-level agent marks that tool `used` from the store's history
 *     (acceptance A21).
 * 10. **REQ-MONITOR-060 at a gate an iteration precedes, under a switched entry persona** (PD-ORCH-003) — a fresh
 *     session runs an iteration as `orchestrator` with `run_start_mode: auto`; `plan` is chosen and the entry persona
 *     switched before the next prompt, whose plan cycle root calls another tool and parks; reopened, the chips mark the
 *     plan cycle root's tool `used` and the iteration root's not, and the run-level agent is named, and its chips drawn,
 *     as the latest root's persona (`reviewer`: glob, read_file, todo), not the first root's.
 * 11. **REQ-MCP-062 with REQ-ORCH-153: a tool-server tool withheld at the gate is not printed** — the entry role carries
 *     the MCP fixture server `alpha`; every model request of the held cycle (launch 1, captured by the scripted client)
 *     lists the server with no tool under it, and the approved run's requests (launch 4) print and offer its tools. Until
 *     2026-10-01 the held cycle's prompt printed tools the agent could not call
 *     (docs/defects/fixed/an-mcp-tool-withheld-at-the-plan-gate-is-still-printed-in-the-prompt.md).
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
 * costs about 4.5 s of each one (ADR-0035's note, finding 6) — 11 s on the Linux sweep of 2026-09-28, beside the
 * workspace's background project setup. The entry is the `mcp_servers:` one: until 2026-09-28 this fixture wrote a
 * top-level `code_intelligence:` key, which no section reads, so every run discovered the server anyway
 * (docs/defects/fixed/plan-gate-proof-turns-code-intelligence-off-with-a-key-nothing-reads.md). Launch 1 now
 * asserts the server was not discovered, so the fixture cannot silently stop meaning what it says again.
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
  'mcp_servers:',
  '  code_intelligence: { enabled: false }',
  // Assertion 11: the hand-written fixture server, carried by the entry role, whose tools declare no facet (ADR-0016).
  `  alpha: { command: ${JSON.stringify(process.execPath)}, args: ${JSON.stringify([join(app, 'scripts', 'fixtures', 'mcp-fixture-server.mjs')])} }`,
  '',
  'personas:',
  '  orchestrator: { mcp_servers: [alpha] }',
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

async function launch(name, extra, timeoutMs = 120_000) {
  const png = join(output, `${name}.png`);
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
    cwd: app, timeoutMs, windowsHide: true,
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
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  // A relaunch refused because the previous instance's run host still held the session is the product defect
  // repaired by `459e7c8` (main exits only after its run host). Named here, so it cannot read as a gate that
  // did not survive the restart.
  if (/is held by another run in this application/.test(log)) throw new Error(`${name}: the session was refused as held by another run — the previous launch's run host outlived it (docs/defects/fixed/a-session-lock-outlives-the-application-that-held-it-for-as-long-as-its-run-host-takes-to-exit.md); see ${name}.log`);
  return log;
}

/**
 * The gate's readings are DEADLINES, not appointments. Each waits for the surface and reads it once it is there, and
 * the capture waits for the surface too, so a slow run start delays them instead of falsifying them. The sweep of
 * 2026-09-28 read the gate at a fixed 12,000 ms while the run was still discovering tools, and failed a launch whose
 * gate came a second later.
 */
const GATE_DEADLINE_MS = 60_000;
const GATE_TEXT = 'document.body.innerText.includes("Plan ready for your decision")';
/** The `inspect-at` reading of `selector`, parsed; `null` when the launch logged none. */
function inspected(log, selector) {
  const line = log.split('\n').find((l) => l.includes(`capture: inspect-at ${GATE_DEADLINE_MS} ${selector} → `));
  if (!line) return null;
  try { return JSON.parse(line.slice(line.indexOf(' → ') + 3)); } catch { return null; }
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
const HELD_REQUESTS = join(output, 'held.requests.jsonl');
const APPROVED_REQUESTS = join(output, 'approved.requests.jsonl');
/** Every captured request's system text (the scripted client's `ROTARIS_CAPTURE_MODEL_REQUESTS`), in call order. */
const systemsOf = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l).system) : []);
/** The prompt's `## MCP servers` section of one system text, or null when it carries none. */
const mcpSectionOf = (system) => { const at = system.indexOf('## MCP servers'); return at < 0 ? null : system.slice(at).split(/\n(?=## )/)[0].trim(); };
const log1 = await launch('held', {
  ROTARIS_CAPTURE_MODEL_REQUESTS: HELD_REQUESTS,
  ROTARIS_CAPTURE_PROMPT: 'create planned.txt with the word done in it',
  ROTARIS_CAPTURE_WAIT: 'js:document.querySelector(\'[data-testid="plan-gate-plan"]\') !== null',
  ROTARIS_CAPTURE_WAIT_MS: String(GATE_DEADLINE_MS),
  ROTARIS_CAPTURE_AFTER_MS: '1500',
  ROTARIS_CAPTURE_INSPECT_AT: `[data-testid="plan-gate"]@~${GATE_DEADLINE_MS};;[data-testid="plan-gate-plan"]@~${GATE_DEADLINE_MS}`,
  ROTARIS_CAPTURE_EVAL_AT: `${GATE_TEXT}>>[data-testid="plan-gate"]@~${GATE_DEADLINE_MS}`,
});
if (/discovery of 'code_intelligence'/.test(log1)) throw new Error(`the fixture did not turn code intelligence off — the run discovered it:\n${log1}`);
if (existsSync(PLANNED_FILE)) throw new Error('a file the plan names was written while the gate was held (REQ-ORCH-153)');
const held = readStore();
if (held.session?.execution_status !== 'awaiting_plan_decision') throw new Error(`the session is ${held.session?.execution_status}, not awaiting_plan_decision:\n${log1}`);
if (held.session.plan_cycle !== 1) throw new Error(`no plan cycle is pending: ${JSON.stringify(held.session.plan_cycle)}`);
if (held.cycles.length !== 1 || held.cycles[0].plan.trim() === '') throw new Error('the cycle carries no plan text');
if (held.cycles[0].edited !== null) throw new Error('an unedited cycle carries an edit');
if (!held.timeline.includes('plan_gate_opened')) throw new Error(`no plan_gate_opened entry:\n${held.timeline.join(', ')}`);
// Read from the inspection's MATCHES: the log line names the selector whether or not anything matched, so a test of
// the log for "plan-gate" could never fail.
if (!(inspected(log1, '[data-testid="plan-gate"]')?.matches?.length > 0)) throw new Error(`the gate surface was not found in the primary view:\n${log1}`);
if (!(inspected(log1, '[data-testid="plan-gate-plan"]')?.matches?.length > 0)) throw new Error('the gate drew no plan');
if (readEval(parseEvals(log1), GATE_DEADLINE_MS, GATE_TEXT) !== true) throw new Error('the gate does not say "Plan ready for your decision"');
// 11. REQ-MCP-062 with REQ-ORCH-153: every request of the held cycle carries alpha with no tool printed under it.
const heldSections = systemsOf(HELD_REQUESTS).map(mcpSectionOf).filter((x) => x !== null);
if (heldSections.length === 0) throw new Error(`the held cycle's requests carry no MCP section — the fixture server did not reach the entry role:\n${log1}`);
for (const section of heldSections) if (section !== '## MCP servers\n\n- `alpha`') throw new Error(`the held cycle's prompt prints a tool-server tool the gate withholds (REQ-MCP-062):\n${section}`);
results.held = {
  status: held.session.execution_status, cycle: held.session.plan_cycle, released: held.session.plan_released,
  plan: held.cycles[0].plan.slice(0, 200), plannedFileExists: false, mcpSection: heldSections[0], requests: heldSections.length,
};

// 2. Reopened after the window is gone: the decision is still pending and still answerable (REQ-ORCH-153).
const EDIT = 'Revised by the user: write planned.txt containing the word done.';
// The edit goes through the product's own path: set the value the way React's tracker accepts and let the
// blur write it through. React delegates `onBlur` from `focusout`, so a non-bubbling `blur` reaches nothing.
const EDIT_PLAN = `(() => { const el = document.querySelector('[data-testid="plan-gate-plan"]'); if (!el) return 'absent'; const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; setter.call(el, ${JSON.stringify(EDIT)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); return 'edited'; })()`;
const log2 = await launch('reopened-and-edited', {
  ROTARIS_CAPTURE_RESUME: 'latest',
  // Both readings wait for the reopened gate; the capture waits for the edit to stand in the field, then leaves the
  // write-through its own few seconds before the process ends.
  ROTARIS_CAPTURE_EVAL_AT: `${GATE_TEXT}>>[data-testid="plan-gate"]@~${GATE_DEADLINE_MS};;${EDIT_PLAN}>>[data-testid="plan-gate-plan"]@~${GATE_DEADLINE_MS}`,
  ROTARIS_CAPTURE_WAIT: `js:document.querySelector('[data-testid="plan-gate-plan"]')?.value === ${JSON.stringify(EDIT)}`,
  ROTARIS_CAPTURE_WAIT_MS: String(GATE_DEADLINE_MS),
  ROTARIS_CAPTURE_AFTER_MS: '3000',
});
const evals2 = parseEvals(log2);
if (readEval(evals2, GATE_DEADLINE_MS, GATE_TEXT) !== true) throw new Error(`the gate did not survive the restart:\n${log2}`);
if (readEval(evals2, GATE_DEADLINE_MS, EDIT_PLAN) !== 'edited') throw new Error(`the plan could not be edited after the restart: ${JSON.stringify(readEval(evals2, GATE_DEADLINE_MS, EDIT_PLAN))}`);
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
const log2b = await launch('two-states', {
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
const log3 = await launch('revised', {
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
const log4 = await launch('approved', {
  ROTARIS_CAPTURE_MODEL_REQUESTS: APPROVED_REQUESTS,
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
// 11. The approved run builds its ports with the gate released: its requests print alpha's tools, which it may call.
const approvedSections = systemsOf(APPROVED_REQUESTS).map(mcpSectionOf).filter((x) => x !== null);
if (!approvedSections.some((section) => section.startsWith('## MCP servers\n\n- **`alpha`**\n  - `echo`'))) throw new Error(`the approved run's prompt does not print alpha's tools: ${JSON.stringify(approvedSections)}\n${log4}`);
results.approved = {
  decision: approved.cycles[1].decision, released: approved.session.plan_released, status: approved.session.execution_status,
  cycles: approved.cycles.length, plannedFileExists: existsSync(PLANNED_FILE), log: /ended \w+/.exec(log4)?.[0] ?? null,
  mcpSection: approvedSections.find((section) => section.includes('`echo`')) ?? null,
};

/*
 * 5. PD-ORCH-003: a follow-up prompt in the approved session is NOT held.
 *
 * This is the directive's whole point and the one launch that would have failed before it: `run_start_mode` is
 * still `plan`, the intent of the follow-up is outside REQ-ORCH-021's answer group, and the gate must stay shut
 * anyway because this session already holds an approval. The prompt is typed through the real input path.
 */
const log5 = await launch('follow-up-not-held', {
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
const log6 = await launch('re-armed', {
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
 * 7. REQ-MONITOR-060 with REQ-ORCH-153: at a gate no iteration precedes, the run-level agent's chips are marked from the
 * plan cycle's root's calls. A fresh session's root calls a tool and parks; reopened by the next launch, the inspector
 * draws the run-level agent from the store's history alone. Before the repair of
 * docs/defects/fixed/the-run-level-agents-tool-history-is-empty-at-a-plan-gate-no-iteration-precedes.md (acceptance A21,
 * R-067) that history was read under the latest iteration's root, and a plan cycle has no iteration, so every chip read
 * `not used` while the user reviewed the plan.
 */
const INSPECTOR_NAME = '[data-testid="inspector-name"]';
const INSPECTOR_CHIPS = '[data-testid="inspector-chips"] .chip';
// The process that parked it last published the record while the run was still its own, so the reading that shows the
// defect is the one a fresh process makes: the session reopened at its gate, its record read from the store alone.
await launch('tools-at-gate', {
  ROTARIS_SCRIPT: 'glob,answer',
  ROTARIS_CAPTURE_PROMPT: 'plan a change to the readme',
  ROTARIS_CAPTURE_WAIT: 'js:document.querySelector(\'[data-testid="plan-gate-plan"]\') !== null',
  ROTARIS_CAPTURE_WAIT_MS: String(GATE_DEADLINE_MS),
  ROTARIS_CAPTURE_AFTER_MS: '1500',
});
const log7 = await launch('tools-at-gate-reopened', {
  ROTARIS_CAPTURE_RESUME: 'latest',
  ROTARIS_CAPTURE_WAIT: 'js:document.querySelector(\'[data-testid="plan-gate-plan"]\') !== null',
  ROTARIS_CAPTURE_WAIT_MS: String(GATE_DEADLINE_MS),
  ROTARIS_CAPTURE_AFTER_MS: '2500',
  ROTARIS_CAPTURE_PROBE: [INSPECTOR_NAME, INSPECTOR_CHIPS].join(';;'),
});
const probed = (selector) => {
  const line = log7.split('\n').find((l) => l.includes(`capture: probe ${selector} → `));
  if (!line) return [];
  try { return JSON.parse(line.slice(line.indexOf(' → ') + 3)); } catch { return []; }
};
const gated = readStore();
if (gated.session?.execution_status !== 'awaiting_plan_decision' || gated.session.plan_cycle !== 1) throw new Error(`the fresh session did not park at its first gate: ${gated.session?.execution_status}\n${log7}`);
const ringDb = new Database(findStore(join(local, 'rotaris')), { readonly: true });
const rootCalls = ringDb.prepare('SELECT agent_name, tool_name FROM tool_calls WHERE session_id = ? ORDER BY ordinal').all(gated.session.session_id);
const iterations = ringDb.prepare('SELECT count(*) AS c FROM iterations WHERE session_id = ?').get(gated.session.session_id).c;
ringDb.close();
if (iterations !== 0) throw new Error(`the fresh session recorded ${iterations} iteration(s) before its gate`);
if (rootCalls.length === 0) throw new Error(`the plan cycle's root called no tool, so there is no history to show (the scripted step found no such tool):\n${log7}`);
const calledTool = rootCalls[0].tool_name;
const chips7 = probed(INSPECTOR_CHIPS).map((c) => `${c.data['data-tool']}:${c.data['data-state']}`);
const shown7 = probed(INSPECTOR_NAME)[0]?.text ?? null;
if (!chips7.includes(`${calledTool}:used`)) throw new Error(`at the gate the run-level agent's chips do not mark the plan cycle root's ${calledTool} call used (REQ-MONITOR-060): ${JSON.stringify(chips7)} (inspector shows ${JSON.stringify(shown7)})`);
results.toolsAtGate = { rootCalls, inspector: shown7, chips: chips7 };

/*
 * 8. PD-ORCH-003 with REQ-MONITOR-060 and REQ-ORCH-153: a plan cycle after an iteration, under a switched entry persona. A
 * fresh session runs one iteration as `orchestrator` in `auto` mode, its root reading the README. Then the configuration
 * chooses `plan` and switches the entry persona to `reviewer` before the next prompt, whose plan cycle root runs fresh under
 * it, lists the files and parks. Reopened by the next launch, the run-level agent's chips are read from the store's history
 * alone. Before the repair of docs/defects/fixed/a-plan-cycle-after-an-iteration-reads-the-tool-history-of-the-iterations-root.md
 * that history was read under the latest iteration root's persona whenever an iteration existed, so the plan cycle root's
 * `glob` read `not used` and the iteration root's `read_file` `used`.
 */
const REVIEWER = [
  'personas:',
  '  reviewer:',
  '    name: reviewer',
  '    model: scripted',
  "    purpose: 'Reviews the work before it is changed.'",
  // The scripted double follows ROTARIS_SCRIPT for a system prompt that opens this way (`scripted-client.ts`).
  "    system_prompt: 'You are the orchestrator, here as the reviewer. Plan the review.'",
  '    tools: [glob, read_file, todo]',
  '',
].join('\n');
// The run-start chip of step 6 wrote `run_start_mode` into the workspace file, which governs over the global one, so the
// mode is set where the chip sets it: `auto` for the iteration, then `plan` again — the chip's own re-arm, written as it
// writes it (PD-ORCH-003, REQ-CONFIG-476).
const WORKSPACE_FILE = join(workspace, '.rotaris', 'agents.yaml');
const workspaceBefore = existsSync(WORKSPACE_FILE) ? readFileSync(WORKSPACE_FILE, 'utf8') : null;
writeFileSync(WORKSPACE_FILE, 'runtime:\n  run_start_mode: auto\n');
await launch('persona-switch-iteration', {
  ROTARIS_SCRIPT: 'read,answer',
  ROTARIS_CAPTURE_PROMPT: 'read the readme and summarise it',
  ROTARIS_CAPTURE_AFTER_MS: '20000',
}, 180_000);
const iterated = readStore();
if (iterated.session?.execution_status !== 'completed') throw new Error(`the auto-mode session did not complete its iteration: ${iterated.session?.execution_status}`);
writeFileSync(WORKSPACE_FILE, 'runtime:\n  run_start_mode: plan\n');
// GLOBAL ends inside its own `personas:` mapping (assertion 11's entry role), so the reviewer joins it under that one key.
writeFileSync(join(configDir, 'agents.yaml'), `${GLOBAL.replace('large_model: scripted', 'large_model: scripted\ndefault_persona: reviewer')}${REVIEWER.replace(/^personas:\n/, '')}`);
await launch('persona-switch-plan', {
  ROTARIS_SCRIPT: 'glob,answer',
  ROTARIS_CAPTURE_RESUME: 'latest',
  ROTARIS_CAPTURE_PROMPT: 'now review the readme before changing it',
  ROTARIS_CAPTURE_PROMPT_MS: '10000',
  ROTARIS_CAPTURE_WAIT: 'js:document.querySelector(\'[data-testid="plan-gate-plan"]\') !== null',
  ROTARIS_CAPTURE_WAIT_MS: String(GATE_DEADLINE_MS),
  ROTARIS_CAPTURE_AFTER_MS: '1500',
}, 180_000);
const log8 = await launch('persona-switch-reopened', {
  ROTARIS_CAPTURE_RESUME: 'latest',
  ROTARIS_CAPTURE_WAIT: 'js:document.querySelector(\'[data-testid="plan-gate-plan"]\') !== null',
  ROTARIS_CAPTURE_WAIT_MS: String(GATE_DEADLINE_MS),
  ROTARIS_CAPTURE_AFTER_MS: '2500',
  ROTARIS_CAPTURE_PROBE: [INSPECTOR_NAME, INSPECTOR_CHIPS].join(';;'),
});
writeFileSync(join(configDir, 'agents.yaml'), GLOBAL);
if (workspaceBefore === null) rmSync(WORKSPACE_FILE, { force: true }); else writeFileSync(WORKSPACE_FILE, workspaceBefore);
const switched = readStore();
if (switched.session?.session_id !== iterated.session.session_id) throw new Error(`the plan cycle ran in another session than the iteration: ${switched.session?.session_id} after ${iterated.session.session_id}`);
if (switched.session.execution_status !== 'awaiting_plan_decision') throw new Error(`the re-armed session did not park at a gate: ${switched.session.execution_status}\n${log8}`);
const switchDb = new Database(findStore(join(local, 'rotaris')), { readonly: true });
const iterationRoots = switchDb.prepare('SELECT root_persona FROM iterations WHERE session_id = ? ORDER BY iteration').all(switched.session.session_id).map((r) => r.root_persona);
const planRoots = switchDb.prepare('SELECT root_persona FROM plan_roots WHERE session_id = ? ORDER BY opened_at').all(switched.session.session_id).map((r) => r.root_persona);
const switchCalls = switchDb.prepare('SELECT agent_name, tool_name FROM tool_calls WHERE session_id = ? ORDER BY ordinal').all(switched.session.session_id);
switchDb.close();
if (JSON.stringify(iterationRoots) !== JSON.stringify(['orchestrator'])) throw new Error(`expected one iteration whose root ran as orchestrator: ${JSON.stringify(iterationRoots)}`);
if (JSON.stringify(planRoots) !== JSON.stringify(['reviewer'])) throw new Error(`expected one plan cycle whose root ran as reviewer: ${JSON.stringify(planRoots)}`);
const iterationTool = switchCalls.find((c) => c.agent_name === 'orchestrator')?.tool_name;
const planTool = switchCalls.find((c) => c.agent_name === 'reviewer')?.tool_name;
if (!iterationTool || !planTool || iterationTool === planTool) throw new Error(`the two roots did not call two different tools under their own names: ${JSON.stringify(switchCalls)}`);
const probed8 = (selector) => {
  const line = log8.split('\n').find((l) => l.includes(`capture: probe ${selector} → `));
  if (!line) return [];
  try { return JSON.parse(line.slice(line.indexOf(' → ') + 3)); } catch { return []; }
};
const chips8 = probed8(INSPECTOR_CHIPS).map((c) => `${c.data['data-tool']}:${c.data['data-state']}`);
const shown8 = probed8(INSPECTOR_NAME)[0]?.text ?? null;
if (!chips8.includes(`${planTool}:used`)) throw new Error(`at the gate after an iteration the chips do not mark the plan cycle root's ${planTool} call used (REQ-MONITOR-060): ${JSON.stringify(chips8)} (inspector shows ${JSON.stringify(shown8)})`);
if (chips8.includes(`${iterationTool}:used`)) throw new Error(`at the gate after an iteration the chips mark the earlier iteration root's ${iterationTool} call used: ${JSON.stringify(chips8)} (inspector shows ${JSON.stringify(shown8)})`);
// The run-level agent is drawn as the latest root, whose calls mark its chips: named `reviewer`, with reviewer's declared
// tools standing in (REQ-MONITOR-060). Until 2026-10-01 it was named, and its chips drawn, from the first root's persona,
// `orchestrator`'s fourteen tools with `reviewer`'s glob marked used
// (docs/defects/fixed/after-an-entry-persona-switch-the-run-level-agent-is-drawn-as-the-first-roots-persona.md).
if (shown8 !== 'reviewer') throw new Error(`at the gate after a persona switch the run-level agent is not drawn as the latest root's persona, reviewer: ${JSON.stringify(shown8)}`);
const tools8 = chips8.map((c) => c.slice(0, c.indexOf(':')));
if (JSON.stringify(tools8) !== JSON.stringify(['glob', 'read_file', 'todo'])) throw new Error(`at the gate after a persona switch the chips are not reviewer's declared tools glob, read_file and todo: ${JSON.stringify(chips8)}`);
results.toolsAtGateAfterIteration = { iterationRoots, planRoots, calls: switchCalls, inspector: shown8, chips: chips8 };

/*
 * The write half of assertion 6 is reported rather than enforced: whether the scripted role chooses to call
 * `write_file` once released is the script's business, not the gate's. What the gate owes is the negative —
 * nothing wrote while it was held — and that is asserted above at every held launch.
 */
writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
