import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, findDatabases, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'part-h-proof');
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

function scratchAgentsYaml(workspace, strategy = 'single') {
  // The stopgaps `ROTARIS_PERMISSION_MODE` and `ROTARIS_RUN_OVERRIDE` are gone: the run reads its files (ADR-0036).
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
    '# scratch configuration written by the proof script',
    'models:',
    '  scripted: { provider: scripted, model_id: scripted }',
    'small_model: scripted',
    'medium_model: scripted',
    'large_model: scripted',
    'runtime:',
    '  permission_mode: autonomous',
    ...(strategy === null ? [] : ['rotaris:', `  delegation_strategy: ${strategy}`]),
    // Part T's shipped `code_intelligence` entry is enabled by default and its discovery costs every run start
    // about 4.5 s. This proof's capture windows were sized before that and stopped fitting: the loop scenario
    // reached two supervisor activations of the three it needs, leaving the session `running` with no stop
    // reason, which reads like a supervisor defect and is not one. Switched off here, as `artifacts-proof` and
    // `composer-proof` already do, rather than widening a window that would drift again.
    'mcp:',
    '  servers:',
    '    code_intelligence: { enabled: false }',
    '',
  ].join('\n'));
}

async function launch(name, workspace, local, preferences, extra) {
  const png = join(output, `${name}.png`);
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
    cwd: app,
    timeoutMs: 120_000,
    windowsHide: true,
    env: {
      ...cleanEnvironment(),
      ...proofIsolationEnv({ local, preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted',
      ROTARIS_CAPTURE_PNG: png,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  return { png, log };
}

const loopRoot = join(output, 'loop');
const loopWorkspace = join(loopRoot, 'workspace');
const loopLocal = join(loopRoot, 'local');
mkdirSync(loopWorkspace, { recursive: true });
mkdirSync(loopLocal, { recursive: true });
writeFileSync(join(loopWorkspace, 'README.md'), '# loop proof\n');
scratchAgentsYaml(loopWorkspace);
await launch('loop-supervisor', loopWorkspace, loopLocal, join(loopRoot, 'preferences'), {
  ROTARIS_SCRIPT: 'loop:read:20',
  ROTARIS_LOOP_SCRIPT: 'detected',
  ROTARIS_CAPTURE_PROMPT: 'exercise the loop supervisor',
  ROTARIS_CAPTURE_AFTER_MS: '10000',
});
const loopDb = new Database(oneDatabase(loopLocal), { readonly: true });
const loopSession = loopDb.prepare('SELECT session_id, execution_status, stop_reason, iterations_completed FROM sessions').get();
const loopActivations = loopDb.prepare("SELECT name, message, metadata FROM timeline WHERE name = 'loop_supervisor_activation' ORDER BY ordinal").all();
const loopIssues = loopDb.prepare("SELECT kind, severity, actor, message FROM issues WHERE kind = 'circuit_breaker_escalation'").all();
const loopCalls = loopDb.prepare("SELECT tool_name, status FROM tool_calls ORDER BY ordinal").all();
loopDb.close();
writeFileSync(join(output, 'loop-observed.json'), `${JSON.stringify({ loopSession, loopActivations, loopIssues, loopCalls }, null, 2)}\n`);
if (loopSession?.stop_reason !== 'agent_session_aborted') throw new Error(`loop supervisor stop reason was ${loopSession?.stop_reason ?? 'absent'}`);
if (loopActivations.length !== 3) throw new Error(`expected three supervisor activations; found ${loopActivations.length}`);
if (loopIssues.length !== 1) throw new Error(`expected one circuit_breaker_escalation issue; found ${loopIssues.length}`);

// PD-ORCH-016 (OQ-232, ruled 2026-10-07 under R-072; fin32): when the classification is cut on a raw-count trigger, four
// consecutive calls are evidence only when they are the same action. The duress live run at a68f121 (finding D6) told a child
// reading two files of its own to "Pause and reassess". Two launches, the tool threshold at 4 and the repetition and cycle
// triggers out of reach, the classifier held past its 2.0 s bound: four reads of four files in one step (no activation), and
// four reads of one file (one, naming it). One step, so REQ-ORCH-104's message limb has one sentence and cannot decide.
const rawCases = [
  { name: 'raw-count-varied', script: 'reads4:varied,answer', activations: 0 },
  { name: 'raw-count-same', script: 'reads4:same,answer', activations: 1 },
];
const rawObserved = {};
for (const c of rawCases) {
  const root = join(output, c.name);
  const ws = join(root, 'workspace');
  const local = join(root, 'local');
  mkdirSync(join(ws, 'docs'), { recursive: true });
  mkdirSync(local, { recursive: true });
  for (const f of ['README.md', 'NOTES.md', 'docs/a.md', 'docs/b.md']) writeFileSync(join(ws, f), `# ${f}\n`);
  scratchAgentsYaml(ws);
  writeFileSync(join(ws, '.rotaris', 'agents.yaml'), `${readFileSync(join(ws, '.rotaris', 'agents.yaml'), 'utf8')}circuit_breaker:\n  tool_call_threshold: 4\n  repetition_threshold: 99\n  cycle_threshold: 99\n`);
  await launch(c.name, ws, local, join(root, 'preferences'), {
    ROTARIS_SCRIPT: c.script,
    ROTARIS_LOOP_SCRIPT: 'timeout',
    ROTARIS_CAPTURE_PROMPT: 'read the files',
    ROTARIS_CAPTURE_AFTER_MS: '12000',
  });
  const db = new Database(oneDatabase(local), { readonly: true });
  const session = db.prepare('SELECT execution_status, stop_reason FROM sessions').get();
  const activations = db.prepare("SELECT message, metadata FROM timeline WHERE name = 'loop_supervisor_activation' ORDER BY ordinal").all();
  const reads = db.prepare("SELECT tool_name, status, entry FROM tool_calls WHERE tool_name = 'read_file' ORDER BY ordinal").all();
  db.close();
  rawObserved[c.name] = { session, activations, reads: reads.map((r) => JSON.parse(r.entry).args) };
  if (reads.length !== 4) throw new Error(`${c.name}: expected four read_file calls, found ${reads.length}`);
  if (activations.length !== c.activations) throw new Error(`${c.name}: expected ${c.activations} loop_supervisor_activation entries, found ${activations.length}: ${JSON.stringify(activations)} (PD-ORCH-016)`);
  for (const a of activations) {
    if (JSON.parse(a.metadata ?? '{}').trigger !== 'raw-count') throw new Error(`${c.name}: the activation's trigger is not raw-count: ${a.metadata}`);
    if (!/read_file around README\.md/.test(a.message ?? '')) throw new Error(`${c.name}: the corrective message does not name the repeated read: ${a.message}`);
  }
}
writeFileSync(join(output, 'raw-count-observed.json'), `${JSON.stringify(rawObserved, null, 2)}\n`);

const resumeRoot = join(output, 'resume');
const resumeWorkspace = join(resumeRoot, 'workspace');
const resumeLocal = join(resumeRoot, 'local');
const resumePreferences = join(resumeRoot, 'preferences');
mkdirSync(resumeWorkspace, { recursive: true });
mkdirSync(resumeLocal, { recursive: true });
writeFileSync(join(resumeWorkspace, 'README.md'), '# resume proof\n');
scratchAgentsYaml(resumeWorkspace);
await launch('resume-before', resumeWorkspace, resumeLocal, resumePreferences, {
  ROTARIS_CAPTURE_PROMPT: 'finish the first run',
  ROTARIS_CAPTURE_AFTER_MS: '11000',
});
const resumeFile = oneDatabase(resumeLocal);
const planted = new Database(resumeFile);
const before = planted.prepare('SELECT session_id, execution_status, iterations_completed FROM sessions').all();
if (before.length !== 1) throw new Error(`first resume run stored ${before.length} sessions`);
const sessionId = before[0].session_id;
planted.prepare(`INSERT INTO children (
  session_id, task_id, canonical_name, given_name, persona, state, parent_id, depth, iteration,
  model_key, category, background, task, depends_on, inherited_context, granted_tools, granted_mcp, spawned_at
) VALUES (?, 'bg_deadbeef', 'planted-child', 'planted child', 'researcher', 'running', 'root', 1, 1,
  'scripted', '', 1, 'planted stale child', '[]', '[]', '[]', '{}', ?)`)
  .run(sessionId, new Date().toISOString());
planted.close();

// REQ-SESSION-114: the carry-over is measured on its own path — the fresh classification is made unusable
// (`garbage` → the fallback intent) so the previous run's intent is what the status row must name.
await launch('resume-after', resumeWorkspace, resumeLocal, resumePreferences, {
  ROTARIS_CAPTURE_RESUME: 'latest',
  ROTARIS_INTENT_SCRIPT: 'garbage',
  ROTARIS_CAPTURE_PROMPT: 'continue after restart',
  ROTARIS_CAPTURE_AFTER_MS: '18000',
});
const resumedDb = new Database(resumeFile, { readonly: true });
const after = resumedDb.prepare('SELECT session_id, execution_status, stop_reason, iterations_completed FROM sessions').all();
const userRows = resumedDb.prepare("SELECT row_index, body FROM transcript_rows WHERE session_id = ? AND kind = 'user' ORDER BY row_index").all(sessionId);
const continuationRows = resumedDb.prepare("SELECT row_index, body FROM transcript_rows WHERE session_id = ? AND kind = 'system' AND body = 'Intent classified: moderate_feature (continued from previous run)' ORDER BY row_index").all(sessionId);
const timeline = resumedDb.prepare('SELECT ordinal, name, message FROM timeline WHERE session_id = ? ORDER BY ordinal').all(sessionId);
const staleChild = resumedDb.prepare("SELECT state, report_stored FROM children WHERE session_id = ? AND task_id = 'bg_deadbeef'").get(sessionId);
const locks = resumedDb.prepare('SELECT session_id, pid, host FROM session_locks').all();
resumedDb.close();
if (after.length !== 1 || after[0].session_id !== sessionId) throw new Error('continuation changed the persisted session identity');
if (after[0].iterations_completed < 2) throw new Error(`continuation ordinal did not advance: ${after[0].iterations_completed}`);
if (userRows.map((row) => row.body).join('|') !== 'finish the first run|continue after restart') throw new Error(`unexpected user rows: ${JSON.stringify(userRows)}`);
if (continuationRows.length !== 1) throw new Error(`expected one carried-intent status row; found ${continuationRows.length}`);
if (staleChild?.state !== 'cancelled') throw new Error(`stale child remained ${staleChild?.state ?? 'absent'}`);
if (locks.length !== 0) throw new Error(`capture exit left ${locks.length} session lock(s)`);
const ordinals = timeline.map((entry) => entry.ordinal);
if (ordinals.some((ordinal, index) => index > 0 && ordinal <= ordinals[index - 1])) throw new Error(`the continued run broke the ordinal series: ${ordinals.join(',')}`);
if (timeline.filter((entry) => entry.name === 'run_start').length !== 2) throw new Error('expected two run_start entries in one ordinal series');
// REQ-ORCH-139 / REQ-SESSION-115 (live-run finding P4): every iteration that closed wrote its `iteration_end` timeline entry —
// the record the continuation's "Recent iterations" block reads, which nothing wrote before (the block read "(none recorded)").
const iterationEnds = timeline.filter((entry) => entry.name === 'iteration_end');
if (iterationEnds.length !== after[0].iterations_completed || !/^Iteration 1 \(finish the first run\): succeeded/.test(iterationEnds[0]?.message ?? '')) throw new Error(`iteration_end timeline entries: ${JSON.stringify(iterationEnds)} for ${after[0].iterations_completed} iteration(s)`);

/*
 * PD-ORCH-015 (OQ-225, live-run finding P1): a coordinating root that answers while its plan's report item is still PENDING
 * is corrected in its own conversation at the default configuration (`runtime.auto_retries_validation` unset, 0), records
 * the item done there, and its iteration closes `succeeded` — one iteration, no re-queue, no "returned to the queue" row.
 * Before the directive the default sent no correction: the iteration closed `partial` and a second, fresh root took the task.
 * No `delegation_strategy`, so the entry role coordinates and REQ-ORCH-029 binds it.
 */
const correctionRoot = join(output, 'plan-correction');
const correctionWorkspace = join(correctionRoot, 'workspace');
const correctionLocal = join(correctionRoot, 'local');
mkdirSync(correctionWorkspace, { recursive: true });
mkdirSync(correctionLocal, { recursive: true });
writeFileSync(join(correctionWorkspace, 'README.md'), '# plan correction proof\n');
scratchAgentsYaml(correctionWorkspace, null);
await launch('plan-correction', correctionWorkspace, correctionLocal, join(correctionRoot, 'preferences'), {
  ROTARIS_SCRIPT: 'planopen,report,plandone',
  ROTARIS_CAPTURE_PROMPT: 'do the scripted work and report it',
  // Two streamed answers of about 5 s each after the two `todo` steps; under a loaded host the second outran a 12 s window.
  ROTARIS_CAPTURE_AFTER_MS: '24000',
});
const correctionDb = new Database(oneDatabase(correctionLocal), { readonly: true });
const correctionSession = correctionDb.prepare('SELECT session_id, execution_status, stop_reason, iterations_completed, todo FROM sessions').get();
const correctionIterations = correctionDb.prepare('SELECT iteration, outcome FROM iterations ORDER BY iteration').all();
const heldRows = correctionDb.prepare("SELECT row_index, body FROM transcript_rows WHERE kind = 'system' AND body LIKE 'Iteration %' ORDER BY row_index").all();
const todoCalls = correctionDb.prepare("SELECT ordinal, status FROM tool_calls WHERE tool_name = 'todo' ORDER BY ordinal").all();
correctionDb.close();
const agentPlan = JSON.parse(correctionSession?.todo ?? '{}').agent ?? null;
const agentStates = agentPlan === null ? [] : agentPlan.phases.flatMap((phase) => phase.tasks.map((task) => task.state));
const { todo: _todo, ...correctionSessionShown } = correctionSession ?? {};
writeFileSync(join(output, 'plan-correction-observed.json'), `${JSON.stringify({ session: correctionSessionShown, iterations: correctionIterations, heldRows, todoCalls, agentStates }, null, 2)}\n`);
if (correctionSession?.execution_status !== 'completed' || correctionSession?.stop_reason !== 'tasks_complete') throw new Error(`plan-correction session ended ${correctionSession?.execution_status ?? 'absent'} / ${correctionSession?.stop_reason ?? 'absent'}`);
if (correctionIterations.map((row) => row.outcome).join(',') !== 'succeeded') throw new Error(`plan-correction iterations: ${JSON.stringify(correctionIterations)} (expected one, succeeded: the correction answered in the root's own conversation)`);
if (heldRows.length !== 0) throw new Error(`plan-correction wrote a held-answer row: ${JSON.stringify(heldRows)}`);
if (todoCalls.length !== 2 || todoCalls.some((call) => call.status === 'failed' || call.status === 'blocked')) throw new Error(`plan-correction todo calls: ${JSON.stringify(todoCalls)}`);
if (agentStates.length < 2 || agentStates.some((state) => state !== 'COMPLETED')) throw new Error(`plan-correction agent plan: ${JSON.stringify(agentStates)}`);

const result = {
  planCorrection: { session: correctionSessionShown, iterations: correctionIterations, heldRows: heldRows.length, todoCalls: todoCalls.length, agentStates, screenshot: 'plan-correction.png' },
  loop: { session: loopSession, activations: loopActivations.length, issues: loopIssues, toolCalls: loopCalls.length, screenshot: 'loop-supervisor.png' },
  rawCountFallback: Object.fromEntries(Object.entries(rawObserved).map(([k, v]) => [k, { status: v.session?.execution_status, activations: v.activations.length }])),
  resume: { before, after, userRows, continuationRows: continuationRows.length, staleChild, locks: locks.length, ordinals, iterationEnds: iterationEnds.map((entry) => entry.message), screenshots: ['resume-before.png', 'resume-after.png'] },
};
writeFileSync(join(output, 'results.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
