/**
 * The delegation proof: three delegation features no built-app run had driven, through the BUILT application with the
 * scripted client (free: no provider, no key, no network). The 2026-10-13 survey (item N57) found each built and covered by
 * scripted unit tests only, and the live run asking none of them; the live run's half is its `delegation` scenario
 * (`live-run.mjs`), the orchestrator's to run.
 *
 *   1. follow-up    — PD-TOOLS-006 revision 3's `session_id` and PD-ORCH-005 clause 22: the coordinator delegates a
 *                     `codebase-analyst`, waits for it to end, then calls `delegate` again with `session_id` naming its task
 *                     id. The child resumes its own conversation under the same task id — one child row, no second child —
 *                     with the follow-up's task as its next message, a `child_resumed` timeline entry saying it was followed
 *                     up, and ends again; the tool's observation says "Following up".
 *   2. delegates-to — OQ-229 as ruled (R-072): the workspace gives the orchestrator `delegates_to: [codebase-analyst]`. The
 *                     `delegate` tool the model port is offered says the list narrows it and names no `docs-writer` entry; a
 *                     delegation to `codebase-analyst` is admitted, one to `docs-writer` refused naming the list.
 *   3. swarm        — PD-ORCH-006 revision 3's other half: a `swarm` run the mapping does NOT grant (the scripted classifier's
 *                     default `moderate_feature`) keeps REQ-ORCH-025's `swarm` as written. The coordinator's first request
 *                     carries the `## Run override: \`swarm\`` layer and not the direct-work statement, and is offered
 *                     `delegate` and none of `write_file`, `terminal`, `haet_edit`. `fetch-proof`'s launch 8 measures the
 *                     granted half.
 *
 * Each launch reads the store's `children`, `agent_messages`, `timeline` and `tool_calls`, and the model-call capture
 * (`ROTARIS_CAPTURE_MODEL_REQUESTS`), never the model's prose. Evidence under `.proof/delegation-proof/`: one log and one
 * capture per launch, and `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { cleanEnvironment, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'delegation-proof');
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

/** One scratch profile per launch, so each launch's store holds its own session alone. */
function profile(name, { strategy = 'orchestrator', personas = [] } = {}) {
  const root = join(output, 'profiles', name);
  const workspace = join(root, 'workspace');
  const local = join(root, 'local');
  const preferences = join(root, 'preferences');
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  mkdirSync(local, { recursive: true });
  writeFileSync(join(workspace, 'README.md'), `# Delegation proof workspace (${name})\n`);
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
    '# scratch configuration written by the delegation proof',
    'models:', '  scripted: { provider: scripted, model_id: scripted }',
    'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
    'mcp_servers:', '  code_intelligence: { enabled: false }',
    'runtime:', '  permission_mode: autonomous', '  allow_unsandboxed_autonomous: true',
    'rotaris:', `  delegation_strategy: ${strategy}`,
    ...(personas.length > 0 ? ['personas:', ...personas] : []),
    '',
  ].join('\n'));
  return { workspace, local, preferences };
}

async function launch(name, p, env) {
  const requests = join(output, `${name}.model-requests.jsonl`);
  writeFileSync(requests, '');
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, p.workspace], {
    timeoutMs: 150_000, cwd: app,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local: p.local, preferences: p.preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', ROTARIS_CIRCUIT_BREAKER: 'off',
      ROTARIS_CAPTURE_MODEL_REQUESTS: requests,
      ROTARIS_CAPTURE_PROMPT: `Delegation proof: ${name}`, ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500',
      ROTARIS_CAPTURE_PNG: join(output, `${name}.png`),
      ...env,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(overrunMessage(name, result, log));
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}`);
  if (/capture: wait for result timed out/.test(log)) throw new Error(`${name}: the run did not reach its result inside the capture's wait`);
  const calls = readFileSync(requests, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
  const db = new Database(oneDatabase(p.local), { readonly: true });
  try {
    const session = db.prepare('SELECT session_id, execution_status, stop_reason FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
    const children = db.prepare('SELECT task_id, persona, canonical_name, state FROM children WHERE session_id = ? ORDER BY spawned_at, rowid').all(session.session_id);
    const delegations = db.prepare("SELECT ordinal, status, entry FROM tool_calls WHERE session_id = ? AND tool_name = 'delegate' ORDER BY ordinal").all(session.session_id).map((row) => {
      const entry = JSON.parse(row.entry);
      return { ordinal: row.ordinal, status: row.status, args: entry.args ?? {}, result: String(entry.result ?? '') };
    });
    const messages = db.prepare('SELECT task_id, body FROM agent_messages WHERE session_id = ? ORDER BY task_id, seq').all(session.session_id);
    const messagesOf = (taskId) => messages.filter((row) => row.task_id === taskId).map((row) => row.body);
    const timeline = db.prepare('SELECT name, message, metadata FROM timeline WHERE session_id = ? ORDER BY ordinal').all(session.session_id).map((row) => ({ name: row.name, message: row.message, metadata: JSON.parse(row.metadata || '{}') }));
    return { name, session, children, delegations, messagesOf, timeline, calls, log };
  } finally { db.close(); }
}

const results = {};
// ── 1. A settled child followed up by session_id ──────────────────────────────────────────────────────────
{
  const p = profile('follow-up');
  const r = await launch('follow-up', p, {
    ROTARIS_INTENT_SCRIPT: 'explicit_trivial',
    ROTARIS_SCRIPT: 'plan,delegate:codebase-analyst:probe,wait:4000,delegate:codebase-analyst:probe:followup,wait:4000,answer',
    ROTARIS_CHILD_SCRIPT: 'answer,answer',
  });
  {
    if (r.session.execution_status !== 'completed') throw new Error(`follow-up: the run ended ${r.session.execution_status} (${r.session.stop_reason})`);
    if (r.children.length !== 1) throw new Error(`follow-up: expected the one child, followed up under its own task id; found ${r.children.length}: ${JSON.stringify(r.children)}`);
    const child = r.children[0];
    if (r.delegations.length !== 2) throw new Error(`follow-up: expected two delegate calls; found ${r.delegations.length}`);
    const [first, again] = r.delegations;
    if (!first.result.includes(child.task_id)) throw new Error(`follow-up: the first delegation's observation does not name the child's task id ${child.task_id}:\n${first.result}`);
    if (again.args.session_id !== child.task_id) throw new Error(`follow-up: the second delegate call named session_id ${JSON.stringify(again.args.session_id)}, not ${child.task_id}`);
    if (!/Following up probe \(codebase-analyst\): it resumes from its record under its own task id/.test(again.result)) throw new Error(`follow-up: the follow-up's observation is not the follow-up's:\n${again.result}`);
    const said = r.messagesOf(child.task_id).filter((body) => body.includes('FOLLOW-UP: probe'));
    if (said.length !== 1) throw new Error(`follow-up: the child's record holds the follow-up's task ${said.length} time(s), not once`);
    const resumed = r.timeline.filter((t) => t.name === 'child_resumed' && t.metadata.follow_up === true && t.metadata.task_id === child.task_id);
    if (resumed.length !== 1) throw new Error(`follow-up: expected one child_resumed entry saying the child was followed up; found ${resumed.length}`);
    if (child.state !== 'succeeded') throw new Error(`follow-up: the followed-up child ended ${child.state}`);
    const childCalls = r.calls.filter((c) => c.who === 'child');
    if (childCalls.length < 2) throw new Error(`follow-up: the child answered ${childCalls.length} model call(s); a follow-up resumes it for one more`);
    results.followUp = { taskId: child.task_id, children: r.children.length, observation: again.result.split('\n')[0].slice(0, 160), timeline: resumed[0].message, childCalls: childCalls.length, finalState: child.state };
  }
}

// ── 2. delegates_to narrows the catalogue and the admission ───────────────────────────────────────────────
{
  const p = profile('delegates-to', { personas: ['  orchestrator:', '    delegates_to: [codebase-analyst]'] });
  const r = await launch('delegates-to', p, {
    ROTARIS_INTENT_SCRIPT: 'explicit_trivial',
    ROTARIS_SCRIPT: 'plan,delegate:codebase-analyst:allowed,delegate:docs-writer:refused,wait:3000,answer',
    ROTARIS_CHILD_SCRIPT: 'answer',
  });
  {
    const offered = r.calls.find((c) => c.who === 'orchestrator' && c.delegateDescription !== null)?.delegateDescription ?? null;
    if (offered === null) throw new Error('delegates-to: no orchestrator call was offered delegate');
    if (!offered.includes('Your delegates_to (codebase-analyst) narrows this list: a delegation to any other persona is refused.')) throw new Error(`delegates-to: the catalogue does not say delegates_to narrows it:\n${offered}`);
    if (!/codebase-analyst \(/.test(offered) || /docs-writer \(/.test(offered) || /coding-agent \(/.test(offered)) throw new Error(`delegates-to: the catalogue names personas outside delegates_to:\n${offered}`);
    if (r.delegations.length !== 2) throw new Error(`delegates-to: expected two delegate calls; found ${r.delegations.length}`);
    const [allowed, refused] = r.delegations;
    if (allowed.status !== 'ok' || r.children.length !== 1 || r.children[0].persona !== 'codebase-analyst') throw new Error(`delegates-to: the delegation to codebase-analyst was not admitted (${allowed.status}; children ${JSON.stringify(r.children)})`);
    if (!/'docs-writer' is not a persona orchestrator may delegate to: its delegates_to lists codebase-analyst\. Known personas: codebase-analyst\./.test(refused.result)) throw new Error(`delegates-to: the delegation to docs-writer was not refused naming the list:\n${refused.result}`);
    results.delegatesTo = { narrowed: true, admitted: r.children.map((c) => c.persona), refusal: refused.result.split('\n')[0].slice(0, 200) };
  }
}

// ── 3. A swarm run the mapping does not grant ───────────────────────────────────────────────────────────
{
  const p = profile('swarm', { strategy: 'swarm' });
  const r = await launch('swarm', p, { ROTARIS_SCRIPT: 'answer' });
  {
    const first = r.calls.find((c) => c.who === 'orchestrator');
    if (!first) throw new Error('swarm: the model port recorded no orchestrator call');
    if (!first.system.includes('## Run override: `swarm`')) throw new Error(`swarm: the coordinating run's instructions carry no swarm layer (REQ-ORCH-025):\n${first.system.slice(-1500)}`);
    if (first.system.includes('For this run you hold the tools to read and write files and run commands yourself')) throw new Error('swarm: a run the mapping does not grant was given the direct-work statement');
    const offered = first.tools ?? [];
    if (!offered.includes('delegate')) throw new Error(`swarm: the coordinator was not offered delegate: ${offered.join(', ')}`);
    const writing = offered.filter((t) => ['write_file', 'terminal', 'haet_edit', 'haet'].includes(t));
    if (writing.length > 0) throw new Error(`swarm: the coordination-only tool set offered ${writing.join(', ')} (REQ-ORCH-025)`);
    results.swarm = { layer: true, directWork: false, offered };
  }
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
console.log('delegation-proof: PASS');
