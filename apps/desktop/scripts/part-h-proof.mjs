import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, findDatabases, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';

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

function scratchAgentsYaml(workspace) {
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
    'rotaris:',
    '  delegation_strategy: single',
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

function launch(name, workspace, local, preferences, extra) {
  const png = join(output, `${name}.png`);
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
    cwd: app,
    encoding: 'utf8',
    timeout: 120_000,
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
launch('loop-supervisor', loopWorkspace, loopLocal, join(loopRoot, 'preferences'), {
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

const resumeRoot = join(output, 'resume');
const resumeWorkspace = join(resumeRoot, 'workspace');
const resumeLocal = join(resumeRoot, 'local');
const resumePreferences = join(resumeRoot, 'preferences');
mkdirSync(resumeWorkspace, { recursive: true });
mkdirSync(resumeLocal, { recursive: true });
writeFileSync(join(resumeWorkspace, 'README.md'), '# resume proof\n');
scratchAgentsYaml(resumeWorkspace);
launch('resume-before', resumeWorkspace, resumeLocal, resumePreferences, {
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
launch('resume-after', resumeWorkspace, resumeLocal, resumePreferences, {
  ROTARIS_CAPTURE_RESUME: 'latest',
  ROTARIS_INTENT_SCRIPT: 'garbage',
  ROTARIS_CAPTURE_PROMPT: 'continue after restart',
  ROTARIS_CAPTURE_AFTER_MS: '18000',
});
const resumedDb = new Database(resumeFile, { readonly: true });
const after = resumedDb.prepare('SELECT session_id, execution_status, stop_reason, iterations_completed FROM sessions').all();
const userRows = resumedDb.prepare("SELECT row_index, body FROM transcript_rows WHERE session_id = ? AND kind = 'user' ORDER BY row_index").all(sessionId);
const continuationRows = resumedDb.prepare("SELECT row_index, body FROM transcript_rows WHERE session_id = ? AND kind = 'system' AND body = 'Intent classified: moderate_feature (continued from previous run)' ORDER BY row_index").all(sessionId);
const timeline = resumedDb.prepare('SELECT ordinal, name FROM timeline WHERE session_id = ? ORDER BY ordinal').all(sessionId);
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

const result = {
  loop: { session: loopSession, activations: loopActivations.length, issues: loopIssues, toolCalls: loopCalls.length, screenshot: 'loop-supervisor.png' },
  resume: { before, after, userRows, continuationRows: continuationRows.length, staleChild, locks: locks.length, ordinals, screenshots: ['resume-before.png', 'resume-after.png'] },
};
writeFileSync(join(output, 'results.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
