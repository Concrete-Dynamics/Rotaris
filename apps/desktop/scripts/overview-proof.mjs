/**
 * The Overview proof (Part M): the startup view painted with what the run and the store give it (REQ-SHELL-026,
 * REQ-MONITOR-164..171; ADR-0038's first execution behind the repository card). Scripted client, scratch store,
 * three launches against one scratch profile:
 *
 *   1. empty     — a fresh workspace that is a Git repository with one commit and one untracked file: Overview is
 *                  the first view painted; the onboarding empty state; then, with PATH emptied of git, the repository
 *                  card's "not available" state and no dialog (REQ-GIT-102/103).
 *   2. run       — a scripted run whose one model call waits 21 s (three token-sample periods), one delegate step
 *                  and two tool calls; driven from the Workspace view, the Overview read afterwards: the header, the
 *                  tokens card with ≥ 2 samples, the tool-call chips matching the store, the agents caption, the
 *                  repository card with the branch, the sessions card with the session and its duration.
 *   3. relaunch  — the same profile again: the sparkline's samples identical (persisted with the session,
 *                  REQ-MONITOR-166) and the pane split written in (2) restored (REQ-SHELL-069).
 *
 * Evidence under `.proof/overview-proof/`: one PNG and one log per launch, `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { cleanEnvironment, findDatabases, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'overview-proof');
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

const PROBES = ['[data-testid="overview-session"]', '[data-testid="overview-empty"]', '[data-testid="overview-tokens"]', '.ov-spark', '[data-testid="overview-cost"]', '[data-testid="overview-tool-calls"]', '[data-testid="overview-tool-chips"] .tag', '[data-testid="overview-repo-state"]', '[data-testid="overview-repo-branch"]', '[data-testid="overview-repo-counts"]', '[data-testid="overview-agent-count"]', '[data-testid="overview-agent-caps"]', '[data-testid="overview-agent-states"]', '[data-testid="overview-sessions"] .ov-session', '[data-testid="overview-sessions-empty"]', '[data-testid="overview-divider"]', '.app-shell'];

function launch(name, workspace, local, preferences, extra, timeoutMs = 120_000) {
  const png = join(output, `${name}.png`);
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
    cwd: app, encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local, preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ROTARIS_CAPTURE_PROBE: PROBES.join(';;'), ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  const probes = {};
  for (const line of log.split('\n')) {
    const m = /capture: probe (.+?) → (\[.*\])\s*$/.exec(line);
    if (m) { try { probes[m[1]] = JSON.parse(m[2]); } catch { probes[m[1]] = []; } }
  }
  return { png, log, probes };
}
const text = (probes, selector) => (probes[selector] ?? []).map((p) => p.text);
const first = (probes, selector) => (probes[selector] ?? [])[0] ?? null;

const root = join(output, 'profile');
const workspace = join(root, 'workspace');
const local = join(root, 'local');
const preferences = join(root, 'preferences');
mkdirSync(workspace, { recursive: true });
mkdirSync(local, { recursive: true });
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# Overview proof workspace\n');
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
  '# scratch configuration written by the proof script',
  'models:',
  // PD-MONITOR-001 revision 2: both prices set, one written as an exponent, so the run is priced at configured rates.
  '  scripted: { provider: scripted, model_id: scripted, input_cost_per_token: 3e-6, output_cost_per_token: 0.000015 }',
  'small_model: scripted',
  'medium_model: scripted',
  'large_model: scripted',
  'runtime:',
  '  permission_mode: autonomous',
  '  max_depth: 3',
  '  max_active_children: 4',
  '',
].join('\n'));
// A repository with one commit and one untracked file, so the repository card has something to read (ADR-0038).
const git = (...args) => execFileSync('git', args, { cwd: workspace, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 'proof', GIT_AUTHOR_EMAIL: 'proof@rotaris.local', GIT_COMMITTER_NAME: 'proof', GIT_COMMITTER_EMAIL: 'proof@rotaris.local' } });
git('init', '-q', '-b', 'main');
// Both directories the load's amendment keeps ignored (REQ-CONFIG-013 / REQ-MCP-089; the runtime's marker since Parts T and U),
// so the amendment is a no-op on this scratch repository and the tree stays clean.
writeFileSync(join(workspace, '.gitignore'), '.rotaris/\n.serena/\n');
git('add', 'README.md', '.gitignore');
git('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'first');
writeFileSync(join(workspace, 'NOTES.md'), 'untracked\n');
const results = {};

// 1. The empty Overview, as the startup view (REQ-SHELL-026, REQ-MONITOR-165's onboarding state).
const empty = launch('empty', workspace, local, preferences, { ROTARIS_CAPTURE_AFTER_MS: '3500' });
const emptyView = first(empty.probes, '.app-shell')?.data?.['data-view'];
if (emptyView !== 'overview') throw new Error(`the first view painted was ${emptyView ?? 'none'}, not overview`);
if (text(empty.probes, '[data-testid="overview-empty"]').length !== 1) throw new Error('the onboarding empty state was not on screen with no session and no stored run');
if (!/repository .*: git=true repo=true branch=main base=- \+0\/-0 touched=1 uncommitted=0/.test(empty.log)) throw new Error(`the repository was not read as expected:\n${empty.log.split('\n').filter((l) => /repository/.test(l)).join('\n')}`);
const readMs = Number(/repository .* in (\d+) ms/.exec(empty.log)?.[1] ?? -1);
results.empty = { view: emptyView, emptyState: true, repositoryReadMs: readMs };

// 1b. PATH emptied of git: the reads end in a state — no dialog, no throw (REQ-GIT-102/103).
const noGit = launch('no-git', workspace, local, preferences, { ROTARIS_CAPTURE_AFTER_MS: '3500', PATH: process.platform === 'win32' ? 'C:\\Windows\\System32' : '/nonexistent', Path: process.platform === 'win32' ? 'C:\\Windows\\System32' : '/nonexistent' });
if (!/repository .*: git=false repo=false/.test(noGit.log)) throw new Error(`with no git on the path the repository read did not end in the empty state:\n${noGit.log.split('\n').filter((l) => /repository/.test(l)).join('\n')}`);
if (/Error box|dialog/i.test(noGit.log.split('\n').filter((l) => /repository/.test(l)).join('\n'))) throw new Error('a dialog was raised for a missing git');
results.noGit = { repositoryState: 'git=false', dialog: false };

// 2. A scripted run driven from the Workspace view, the Overview read afterwards. The orchestrator's first call waits
//    21 s (three sample periods), then delegates one child, then reads a file, then answers.
const RUN_WAIT_MS = 21_000;
const run = launch('run', workspace, local, preferences, {
  ROTARIS_SCRIPT: `wait:${RUN_WAIT_MS},delegate:coding-agent:helper,read,answer`,
  ROTARIS_CHILD_SCRIPT: 'glob,answer',
  ROTARIS_CAPTURE_PROMPT: 'Exercise the overview.',
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS + 60_000), ROTARIS_CAPTURE_AFTER_MS: '1500',
  ROTARIS_CAPTURE_END_VIEW: '1', ROTARIS_CAPTURE_END_VIEW_MS: '3500',
  // the divider dragged in by keyboard is not scriptable; the split is written through the preference command instead
}, RUN_WAIT_MS + 120_000);
const db = new Database(oneDatabase(local), { readonly: true });
const session = db.prepare('SELECT session_id, execution_status, stop_reason, tokens_input, tokens_output, cost, cost_qualifier, tool_calls, token_samples, run_started_at FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
const toolCounts = db.prepare('SELECT tool_name, COUNT(*) AS count, COUNT(DISTINCT agent_name) AS agents FROM tool_calls WHERE session_id = ? GROUP BY tool_name ORDER BY count DESC, tool_name').all(session.session_id);
const children = db.prepare('SELECT task_id, state, depth FROM children WHERE session_id = ?').all(session.session_id);
db.close();
const samples = JSON.parse(session.token_samples);
if (session.execution_status !== 'completed') throw new Error(`the run ended ${session.execution_status} (${session.stop_reason})`);
if (samples.length < 2) throw new Error(`fewer than two token samples were persisted: ${session.token_samples}`);
const view2 = first(run.probes, '.app-shell')?.data?.['data-view'];
if (view2 !== 'overview') throw new Error(`the capture was not on the Overview (view ${view2 ?? 'none'})`);
const header = text(run.probes, '[data-testid="overview-session"]')[0] ?? '';
if (!/^session .* · Completed · \d+:\d{2}/.test(header)) throw new Error(`the header did not name the session, its status and its runtime: "${header}"`);
const tokensShown = (text(run.probes, '[data-testid="overview-tokens"]')[0] ?? '').replace(/,/g, '');
const totalStored = session.tokens_input + session.tokens_output;
if (Number(tokensShown) !== totalStored) throw new Error(`the tokens card shows ${tokensShown}; the store holds ${totalStored}`);
const sparkSamples = Number(first(run.probes, '.ov-spark')?.data?.['data-samples'] ?? -1);
if (sparkSamples !== samples.length) throw new Error(`the sparkline carries ${sparkSamples} samples; the store holds ${samples.length}`);
// PD-MONITOR-001 revision 2: every request of the run — the entry agent's and the child's — priced at the configured
// rates, recorded with its qualifier, and the label the Overview draws is the one the store holds.
const cost = first(run.probes, '[data-testid="overview-cost"]');
if (session.cost_qualifier !== 'configured' || !/[1-9]/.test(session.cost)) throw new Error(`the run's cost is ${session.cost} (${session.cost_qualifier}); configured rates should have priced it`);
if (cost?.data?.['data-qualifier'] !== 'configured') throw new Error(`the cost label's qualifier is ${cost?.data?.['data-qualifier'] ?? 'absent'}`);
const costShown = text(run.probes, '[data-testid="overview-cost"]')[0] ?? '';
if (!/\b\d+\.\d{2,4} at configured rates$/.test(costShown.trim())) throw new Error(`the cost label reads "${costShown}"`);
const toolTotalShown = Number(text(run.probes, '[data-testid="overview-tool-calls"]')[0] ?? -1);
if (toolTotalShown !== session.tool_calls) throw new Error(`the tool-calls card shows ${toolTotalShown}; the session row holds ${session.tool_calls}`);
const chips = text(run.probes, '[data-testid="overview-tool-chips"] .tag');
const expectedChips = toolCounts.slice(0, 5).map((t) => `${t.tool_name} ${t.count}`);
if (JSON.stringify(chips) !== JSON.stringify(expectedChips)) throw new Error(`the chips ${JSON.stringify(chips)} differ from the store's ${JSON.stringify(expectedChips)}`);
const agentCount = Number(text(run.probes, '[data-testid="overview-agent-count"]')[0] ?? -1);
if (agentCount !== children.length) throw new Error(`the agents card shows ${agentCount}; the ledger holds ${children.length}`);
const caps = text(run.probes, '[data-testid="overview-agent-caps"]')[0] ?? '';
if (!/^depth \d+ \/ 3 · fan-out \d+ \/ 4$/.test(caps)) throw new Error(`the agents caption did not carry the configured caps: "${caps}"`);
const states = text(run.probes, '[data-testid="overview-agent-states"]')[0] ?? '';
if (!/done 1/.test(states)) throw new Error(`the agents detail line did not count the settled child: "${states}"`);
const branch = text(run.probes, '[data-testid="overview-repo-branch"]')[0] ?? '';
if (!/→ main$/.test(branch)) throw new Error(`the repository card did not name the branch: "${branch}"`);
const sessionRows = run.probes['[data-testid="overview-sessions"] .ov-session'] ?? [];
if (sessionRows.length !== 1 || sessionRows[0].data['data-session'] !== session.session_id) throw new Error(`the sessions card listed ${sessionRows.length} row(s): ${JSON.stringify(sessionRows)}`);
if (!/\d+:\d{2}/.test(sessionRows[0].text) || !/tok/.test(sessionRows[0].text) || !/focused/.test(sessionRows[0].text)) throw new Error(`the session row lacks its duration, tokens or focused marker: "${sessionRows[0].text}"`);
results.run = { status: session.execution_status, samples: samples.length, tokens: totalStored, toolCalls: session.tool_calls, chips, agents: children.length, caps, states, header, branch };

// The pane split: written as the view would write it (REQ-SHELL-069), then read back by the relaunch.
mkdirSync(preferences, { recursive: true });
writeFileSync(join(preferences, 'preferences.json'), JSON.stringify({ ...JSON.parse(existsSync(join(preferences, 'preferences.json')) ? require('node:fs').readFileSync(join(preferences, 'preferences.json'), 'utf8') : '{}'), 'panels/overview': { version: 1, panes: 2, sizes: [800, 420] } }, null, 2));

// 3. Relaunch: the samples identical, the split restored, the session listed.
const again = launch('relaunch', workspace, local, preferences, { ROTARIS_CAPTURE_RESUME: 'latest', ROTARIS_CAPTURE_END_VIEW: '1', ROTARIS_CAPTURE_END_VIEW_MS: '3500', ROTARIS_CAPTURE_AFTER_MS: '2500' });
const sparkAgain = Number(first(again.probes, '.ov-spark')?.data?.['data-samples'] ?? -1);
if (sparkAgain !== samples.length) throw new Error(`after the relaunch the sparkline carries ${sparkAgain} samples; the store holds ${samples.length}`);
const divider = first(again.probes, '[data-testid="overview-divider"]');
if (divider?.data?.['aria-valuenow'] !== '420') throw new Error(`the stored split was not restored: aria-valuenow=${divider?.data?.['aria-valuenow'] ?? 'absent'}`);
const rowsAgain = again.probes['[data-testid="overview-sessions"] .ov-session'] ?? [];
if (rowsAgain.length !== 1) throw new Error(`after the relaunch the sessions card listed ${rowsAgain.length} row(s)`);
results.relaunch = { samples: sparkAgain, split: 420, sessionsListed: rowsAgain.length };

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
