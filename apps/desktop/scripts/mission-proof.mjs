import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, findDatabases, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';

/**
 * Part R's first execution in the built app — the agent surfaces: the Mission view (REQ-MONITOR-274..276), the per-agent
 * inspector (REQ-MONITOR-050..067), the persona windows (REQ-SHELL-072..078, REQ-MONITOR-068..073; ADR-0048's registry
 * first executed) and the shared selection (REQ-MONITOR-042). Scripted client, scratch stores, the launches the plan
 * names (eight, two of them in two parts):
 *
 *   1. painted     — Mission opened by Ctrl+3 during a run with three live children: the header, the run row, the tree,
 *                    the table with one row per agent and state text, elapsed advancing between two probes 1.5 s apart.
 *   1b. waiting    — the model's slot cap one, two children waiting behind it: every row's Elapsed cell and tree meta
 *                    carries a figure, and a waiting row's advances (REQ-MONITOR-107/111).
 *   2. parity      — the Mission tree, the Overview card and the Workspace sidebar probed in one run: identical ids and
 *                    states; then a 23-agent record (20 seeded) refreshed with Mission visible, the apply-to-paint time.
 *   3. pause       — a child selected → Pause refused with the explanation, no control sent; the run selected → accepted,
 *                    `pausing` then `paused`; at rest the still-mounted view's Pause reads `Pause`, not `Pausing…`.
 *   4. cancel      — a child with a live descendant: the confirmation names it and the cascade; the child cancelled, the run on;
 *                    the rows sampled just after the confirm (REQ-MONITOR-128's optimistic cancel) and overwritten by the
 *                    engine's record at 9 s (REQ-MONITOR-296).
 *   4b. cancel run — the run row selected, "Cancel selection" confirmed: every sample after the confirm reads the subtitle and
 *                    the run row (and the status strip) `Cancelling` or the run at rest — never `Running` nor another active
 *                    status; how many land inside the `Cancelling` window is host timing, recorded and not asserted
 *                    (acceptance A35, REQ-MONITOR-127/130).
 *   4c. persona    — the inspector pops out the run-level agent; the window's Cancel on the run's own instance confirmed: every
 *                    snapshot after the confirmation was handled reads the instance's state `cancelling` or the run at rest,
 *                    never `running` (acceptance A35, REQ-MONITOR-127/130, REQ-SHELL-075 (a)).
 *   5. open        — pop-out off: Open pins the agent in the Workspace inspector; on: one window per persona, 820×620,
 *                    reused for a second instance, hidden on close, shown again; a new session destroys it.
 *   6. inspector   — following the latest author, pinned on selection, chips in one order across a state change, Steer
 *                    through the persona window recorded against that agent.
 *   7. settings    — the strategy selector and the depth control write their keys; Settings shows the same; the toggle writes.
 *   8. reconcile   — a child left `running` on a completed session presents settled on every surface.
 *
 * Evidence under `.proof/mission-proof/`: PNGs, logs, `results.json`. `--skip-build` skips the build.
 */
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'mission-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 400_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 400_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);

function scenario(name, extraYaml = []) {
  const root = join(output, name);
  const workspace = join(root, 'workspace');
  const local = join(root, 'local');
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  mkdirSync(local, { recursive: true });
  writeFileSync(join(workspace, 'README.md'), '# mission proof workspace\n');
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
    '# scratch configuration written by the proof script',
    'models:', '  scripted: { provider: scripted, model_id: scripted }',
    'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
    // Since Part T the shipped code_intelligence entry is enabled by default and its discovery costs every run start
    // about 4.5 s (ADR-0035's note, finding 6); this proof measures another mechanism, so the entry is off here.
    'mcp_servers:', '  code_intelligence: { enabled: false }',
    'runtime:', '  permission_mode: autonomous', '  max_depth: 3', '  max_active_children: 4', ...extraYaml, '',
  ].join('\n'));
  return { root, workspace, local, preferences: join(root, 'preferences') };
}
function setPreference(s, key, value) {
  mkdirSync(s.preferences, { recursive: true });
  const file = join(s.preferences, 'preferences.json');
  const current = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  writeFileSync(file, `${JSON.stringify({ ...current, [key]: value }, null, 2)}\n`);
}
async function launch(name, s, extra, opts = {}) {
  const png = join(output, `${name}.png`);
  const started = Date.now();
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, s.workspace], {
    cwd: app, timeoutMs: opts.timeout ?? 150_000, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local: s.local, preferences: s.preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  const errors = log.split('\n').filter((l) => /renderer console:/.test(l));
  return { log, png, elapsedMs: Date.now() - started, errors };
}
function open(s) { return new Database(oneDatabase(s.local), { readonly: true }); }
const session = (db) => db.prepare('SELECT session_id, execution_status, stop_reason, updated_at FROM sessions ORDER BY created_at DESC').get();
const children = (db, sid) => db.prepare('SELECT task_id, canonical_name, given_name, persona, state, parent_id, depth FROM children WHERE session_id = ? ORDER BY spawned_at').all(sid);
const timeline = (db, sid) => db.prepare('SELECT name, metadata, message FROM timeline WHERE session_id = ? ORDER BY ordinal').all(sid);
/** Every `probe-at <ms> <selector> → […]` of one label, or the end probes. */
const probesAt = (log, at, selector) => { const m = log.match(new RegExp(`capture: probe-at ${at} ${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} → (\\[.*\\])`)); return m ? JSON.parse(m[1]) : null; };
const personaProbesAt = (log, at, selector) => { const m = log.match(new RegExp(`capture: persona-probe-at ${at} ${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} → (\\[.*\\]|null)`)); return m ? JSON.parse(m[1]) : null; };
const endProbe = (log, selector) => { const m = log.match(new RegExp(`capture: probe ${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} → (\\[.*\\])`)); return m ? JSON.parse(m[1]) : null; };
const windowsAt = (log, at) => { const m = log.match(new RegExp(`capture: windows-at ${at} → (\\[.*\\])`)); return m ? JSON.parse(m[1]) : null; };
const results = {};
const expect = (cond, message) => { if (!cond) throw new Error(message); };
const stateOf = (rowText) => (/(running|waiting|queued|done|failed|cancelled)/.exec(rowText) ?? [])[1] ?? null;
const seconds = (label) => { const m = /(?:(\d+)m )?(\d+)s/.exec(label); return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null; };

const THREE = 'delegate:coding-agent:alpha,delegate:coding-agent:beta,delegate:codebase-analyst:gamma,answer';

// 1. Mission painted during a run with three live children.
const s1 = scenario('painted');
{
  const r = await launch('painted', s1, {
    ROTARIS_SCRIPT: THREE, ROTARIS_CHILD_SCRIPT: 'wait:14000,read,answer', ROTARIS_CAPTURE_PROMPT: 'delegate to three agents',
    ROTARIS_CAPTURE_VIEWS: '3@3500',
    ROTARIS_CAPTURE_PROBE_AT: '[data-testid="mission-subtitle"]@6000;;[data-testid="mission-run-row"]@6000;;.agent-table__row@6000;;[data-testid="agent-elapsed"]@6000;;[data-testid="agent-elapsed"]@7500;;.agent-table__state-text@6000;;.mission__run-row + .agent-tree .agent-row@6000',
    ROTARIS_CAPTURE_PNG_AT: `${join(output, 'mission.png')}@7000`,
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500', ROTARIS_CAPTURE_END_VIEW: '3', ROTARIS_CAPTURE_END_VIEW_MS: '1500',
    ROTARIS_CAPTURE_PROBE: '[data-testid="mission"];;.agent-table__row;;[data-testid="mission-refresh"];;.app-shell',
  });
  const db = open(s1); const row = session(db); const kids = children(db, row.session_id); db.close();
  expect(row.execution_status === 'completed', `the run ended ${row.execution_status} (${row.stop_reason})`);
  expect(kids.length === 3, `the ledger holds ${kids.length} children`);
  const subtitle = probesAt(r.log, 6000, '[data-testid="mission-subtitle"]')?.[0]?.text ?? '';
  expect(/^delegation tree · /.test(subtitle), `the header's subtitle: "${subtitle}"`);
  const runRow = probesAt(r.log, 6000, '[data-testid="mission-run-row"]')?.[0]?.text ?? '';
  expect(/Run · orchestrator/.test(runRow), `the run row: "${runRow}"`);
  const rows6 = probesAt(r.log, 6000, '.agent-table__row') ?? [];
  expect(rows6.length === 3, `the table had ${rows6.length} rows at 6 s`);
  const states6 = probesAt(r.log, 6000, '.agent-table__state-text')?.map((p) => p.text) ?? [];
  // The scripted client's children share one step list, so only the first waits 14 s; the others finish at once (run-host/index.ts).
  expect(states6.length === 3 && states6.every((t) => ['running', 'waiting', 'queued', 'done'].includes(t)) && states6.includes('running'), `state text at 6 s: ${JSON.stringify(states6)}`);
  const tree6 = probesAt(r.log, 6000, '.mission__run-row + .agent-tree .agent-row') ?? [];
  expect(tree6.length === 3, `the tree under the run row had ${tree6.length} rows`);
  const e6 = (probesAt(r.log, 6000, '[data-testid="agent-elapsed"]') ?? []).map((p) => seconds(p.text));
  const e75 = (probesAt(r.log, 7500, '[data-testid="agent-elapsed"]') ?? []).map((p) => seconds(p.text));
  const liveAt6 = states6.map((t, i) => (t === 'running' ? i : -1)).filter((i) => i >= 0);
  expect(e6.length === 3 && e75.length === 3 && liveAt6.length > 0 && liveAt6.every((i) => e6[i] !== null && e75[i] !== null && e75[i] > e6[i]), `elapsed did not advance for the live rows: ${JSON.stringify(e6)} → ${JSON.stringify(e75)} at ${JSON.stringify(states6)} (REQ-MONITOR-107)`);
  const settledAt6 = states6.map((t, i) => (t === 'done' ? i : -1)).filter((i) => i >= 0);
  expect(settledAt6.every((i) => e6[i] === e75[i]), `a settled row's elapsed changed: ${JSON.stringify(e6)} → ${JSON.stringify(e75)} (REQ-MONITOR-107)`);
  const endRows = endProbe(r.log, '.agent-table__row') ?? [];
  expect(endRows.length === 3 && endRows.every((p) => p.data['data-state'] === 'done'), `after the run the rows read ${JSON.stringify(endRows.map((p) => p.data['data-state']))}`);
  expect(endProbe(r.log, '.app-shell')?.[0]?.data?.['data-view'] === 'mission', 'the capture was not on Mission');
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
  results.painted = { subtitle, runRow, statesAt6s: states6, elapsedAt6s: e6, elapsedAt7_5s: e75, finalStates: endRows.map((p) => p.data['data-state']), png: join(output, 'mission.png') };
}

// 1b. A waiting agent's clock (REQ-MONITOR-107/111, resolution item 25; the note "a waiting agent's elapsed time is not
// shown", R-067): the scripted model's slot cap is one, so two of the three children wait on the model slot while the first
// runs; every row holds a spawn timestamp, so every Elapsed cell and every tree meta carries a figure, and a waiting row's
// advances between the two probes as the running row's does. Before the repair a waiting row read an em-dash in the table
// and its state alone in the tree.
const s1b = scenario('waiting');
{
  const yaml = join(s1b.workspace, '.rotaris', 'agents.yaml');
  writeFileSync(yaml, readFileSync(yaml, 'utf8').replace('model_id: scripted }', 'model_id: scripted, max_parallel: 1 }'));
  const r = await launch('waiting', s1b, {
    ROTARIS_SCRIPT: THREE, ROTARIS_CHILD_SCRIPT: 'wait:14000,read,answer', ROTARIS_CAPTURE_PROMPT: 'delegate to three agents behind one slot',
    ROTARIS_CAPTURE_VIEWS: '3@3500',
    ROTARIS_CAPTURE_PROBE_AT: '.agent-table__state-text@6000;;[data-testid="agent-elapsed"]@6000;;[data-testid="agent-elapsed"]@7500;;.mission__run-row + .agent-tree .agent-row__meta@6000;;.mission__run-row + .agent-tree .agent-row__meta@7500',
    ROTARIS_CAPTURE_PNG_AT: `${join(output, 'mission-waiting.png')}@7000`,
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '120000', ROTARIS_CAPTURE_AFTER_MS: '1000',
  });
  const states6 = probesAt(r.log, 6000, '.agent-table__state-text')?.map((p) => p.text) ?? [];
  const waitingAt6 = states6.map((t, i) => (t === 'waiting' || t === 'queued' ? i : -1)).filter((i) => i >= 0);
  expect(states6.length === 3 && waitingAt6.length > 0, `no waiting or queued row at 6 s behind the slot cap: ${JSON.stringify(states6)}`);
  const cells6 = (probesAt(r.log, 6000, '[data-testid="agent-elapsed"]') ?? []).map((p) => p.text);
  const cells75 = (probesAt(r.log, 7500, '[data-testid="agent-elapsed"]') ?? []).map((p) => p.text);
  const e6 = cells6.map(seconds); const e75 = cells75.map(seconds);
  expect(e6.length === 3 && e75.length === 3 && e6.every((v) => v !== null), `an Elapsed cell showed the fallback although the agent holds a spawn timestamp: ${JSON.stringify(cells6)} at ${JSON.stringify(states6)} (REQ-MONITOR-111)`);
  expect(waitingAt6.every((i) => e75[i] !== null && e75[i] > e6[i]), `a waiting row's elapsed did not advance: ${JSON.stringify(cells6)} → ${JSON.stringify(cells75)} at ${JSON.stringify(states6)} (REQ-MONITOR-107)`);
  const meta6 = (probesAt(r.log, 6000, '.mission__run-row + .agent-tree .agent-row__meta') ?? []).map((p) => p.text);
  const meta75 = (probesAt(r.log, 7500, '.mission__run-row + .agent-tree .agent-row__meta') ?? []).map((p) => p.text);
  expect(meta6.length === 3 && meta6.every((t) => seconds(t) !== null), `a tree meta showed its state alone although the agent holds a spawn timestamp: ${JSON.stringify(meta6)} (REQ-MONITOR-111)`);
  expect(meta6.some((t, i) => /^(waiting|queued) · /.test(t) && seconds(meta75[i] ?? '') > seconds(t)), `no waiting tree meta advanced: ${JSON.stringify(meta6)} → ${JSON.stringify(meta75)} (REQ-MONITOR-107)`);
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
  results.waiting = { statesAt6s: states6, elapsedAt6s: cells6, elapsedAt7_5s: cells75, treeMetaAt6s: meta6, treeMetaAt7_5s: meta75, png: join(output, 'mission-waiting.png') };
}

// 2. Parity across the three trees, then the 23-agent refresh with Mission visible.
const s2 = scenario('parity');
{
  const r = await launch('parity', s2, {
    ROTARIS_SCRIPT: THREE, ROTARIS_CHILD_SCRIPT: 'wait:14000,read,answer', ROTARIS_CAPTURE_PROMPT: 'three trees',
    // Probed once the two quick children have settled and the first is still waiting, so the states are steady across the three views (a state change between probes is not a parity fault).
    ROTARIS_CAPTURE_VIEWS: '3@7000;;1@8000;;2@9000',
    ROTARIS_CAPTURE_PROBE_AT: '.agent-row@7500;;.app-shell@7500;;.agent-row@8500;;.app-shell@8500;;.agent-row@9500;;.app-shell@9500',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1000',
  });
  const trees = [7500, 8500, 9500].map((at) => ({ view: probesAt(r.log, at, '.app-shell')?.[0]?.data?.['data-view'], rows: (probesAt(r.log, at, '.agent-row') ?? []).map((p) => `${p.data['data-task-id']}:${p.data['data-state']}`) }));
  expect(trees[0].view === 'mission' && trees[1].view === 'overview' && trees[2].view === 'workspace', `the views probed: ${JSON.stringify(trees.map((t) => t.view))}`);
  expect(trees[0].rows.length === 3 && JSON.stringify(trees[0].rows) === JSON.stringify(trees[1].rows) && JSON.stringify(trees[1].rows) === JSON.stringify(trees[2].rows), `the three trees differ: ${JSON.stringify(trees)} (REQ-MONITOR-038)`);
  results.parity = { views: trees.map((t) => t.view), rows: trees[0].rows };
  // 2b. Twenty more agents on the record, the session re-opened with Mission already visible: one publication, the apply-to-paint time.
  const dbw = new Database(oneDatabase(s2.local));
  const row = dbw.prepare('SELECT session_id FROM sessions ORDER BY created_at DESC').get();
  const insert = dbw.prepare(`INSERT INTO children (session_id, task_id, canonical_name, given_name, persona, state, parent_id, depth, iteration, model_key, category, background, task, depends_on, inherited_context, granted_tools, granted_mcp, spawned_at, completed_at, tool_calls)
    VALUES (@session_id, @task_id, @canonical_name, @given_name, @persona, @state, @parent_id, @depth, 1, 'scripted', 'quick', 1, @task, '[]', '[]', '["read_file"]', '{}', @spawned_at, @completed_at, 0)`);
  const parents = dbw.prepare('SELECT task_id, parent_id FROM children WHERE session_id = ?').all(row.session_id);
  for (let i = 0; i < 20; i += 1) {
    const id = `bg_${(0xa0000000 + i).toString(16)}`;
    insert.run({ session_id: row.session_id, task_id: id, canonical_name: `seeded-${i}`, given_name: `Seeded ${i}`, persona: i % 2 === 0 ? 'coding-agent' : 'codebase-analyst', state: 'succeeded', parent_id: parents[i % parents.length].task_id, depth: 2, task: `seeded agent ${i}`, spawned_at: '2026-09-05T10:00:00.000Z', completed_at: '2026-09-05T10:01:00.000Z' });
  }
  dbw.close();
  const r2 = await launch('parity-20', s2, {
    // Opening a stored session lands on the Workspace; Mission is opened after it, and one whole read is asked for while Mission is visible.
    ROTARIS_CAPTURE_RESUME: 'latest', ROTARIS_CAPTURE_VIEWS: '3@2600', ROTARIS_CAPTURE_RECONCILE_AT: '3200',
    ROTARIS_CAPTURE_PROBE_AT: '[data-testid="mission"]@4000;;.agent-table__row@4000',
    ROTARIS_CAPTURE_AFTER_MS: '4000', ROTARIS_CAPTURE_END_VIEW: '3', ROTARIS_CAPTURE_END_VIEW_MS: '500', ROTARIS_CAPTURE_PROBE: '[data-testid="mission"];;.agent-table__row',
  });
  const mission = probesAt(r2.log, 4000, '[data-testid="mission"]')?.[0]?.data ?? {};
  const rows20 = probesAt(r2.log, 4000, '.agent-table__row') ?? [];
  expect(rows20.length === 23, `the table held ${rows20.length} rows, not 23`);
  const refreshMs = Number(mission['data-refresh-ms']);
  expect(Number(mission['data-refresh-agents']) === 23 && Number.isFinite(refreshMs), `the refresh figure was not recorded for the 23-agent publication: ${JSON.stringify(mission)}`);
  expect(refreshMs < 250, `a 23-agent refresh took ${refreshMs} ms, over the 250 ms budget (REQ-MONITOR-038)`);
  results.parity20 = { agents: Number(mission['data-refresh-agents']), refreshMs, rows: rows20.length };
}

// 3. Pause refused for a child, honoured for the run.
const s3 = scenario('pause');
{
  const r = await launch('pause', s3, {
    ROTARIS_SCRIPT: THREE, ROTARIS_CHILD_SCRIPT: 'wait:9000,answer', ROTARIS_CAPTURE_PROMPT: 'pause me',
    ROTARIS_CAPTURE_VIEWS: '3@3500',
    ROTARIS_CAPTURE_CLICKS: '.agent-table__row@5000;;[data-testid="mission-pause"]@5400;;[data-testid="mission-run-row"]@6200;;[data-testid="mission-pause"]@6600',
    ROTARIS_CAPTURE_PROBE_AT: '[data-testid="mission-pause"]@5800;;[data-testid="mission-message"]@5800;;[data-testid="mission-pause-reason"]@5800;;.status-strip__item@5800;;[data-testid="mission-pause"]@6400;;[data-testid="mission-message"]@7200;;.status-strip__item@7200',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1000',
    // The view stays mounted from the accepted pause until the session rests: what its Pause reads then (REQ-MONITOR-296).
    ROTARIS_CAPTURE_PROBE: '[data-testid="mission-pause"];;[data-testid="mission-pause-reason"];;[data-testid="mission-subtitle"]',
  });
  const db = open(s3); const row = session(db); const names = timeline(db, row.session_id).map((t) => t.name); db.close();
  const refused = probesAt(r.log, 5800, '[data-testid="mission-pause"]')?.[0]?.data?.['data-enabled'];
  const message = probesAt(r.log, 5800, '[data-testid="mission-message"]')?.[0]?.text ?? '';
  const reason = probesAt(r.log, 5800, '[data-testid="mission-pause-reason"]')?.[0]?.text ?? '';
  expect(refused === '0', `Pause was enabled with a child selected (data-enabled=${refused})`);
  expect(message === 'Pause applies to the whole run; select the run to pause it.' && reason === message, `the refusal text: message "${message}", reason "${reason}" (REQ-MONITOR-276)`);
  const strip58 = (probesAt(r.log, 5800, '.status-strip__item') ?? []).map((p) => p.text);
  expect(strip58.includes('run Running'), `the run was not still running after the refused pause: ${JSON.stringify(strip58)}`);
  const enabled = probesAt(r.log, 6400, '[data-testid="mission-pause"]')?.[0]?.data?.['data-enabled'];
  expect(enabled === '1', `Pause was not enabled with the run selected (data-enabled=${enabled})`);
  const accepted = probesAt(r.log, 7200, '[data-testid="mission-message"]')?.[0]?.text ?? '';
  const strip72 = (probesAt(r.log, 7200, '.status-strip__item') ?? []).map((p) => p.text);
  expect(/Pause accepted/.test(accepted), `the accepted pause's message: "${accepted}"`);
  expect(strip72.includes('run Pausing') || strip72.includes('run Paused'), `the strip after the accepted pause: ${JSON.stringify(strip72)} (REQ-MONITOR-124)`);
  expect(row.execution_status === 'paused', `the session ended ${row.execution_status} (${row.stop_reason}), not paused`);
  // REQ-MONITOR-296 / REQ-NOTIFY-050: the accepted pause's pending mark belongs to the run that accepted it, so once the
  // session rests `paused` the still-mounted view's Pause reads `Pause` beside the subtitle's Paused, never `Pausing…`
  // (the note "the Mission view's pause reads pausing after the session rests").
  const restPause = endProbe(r.log, '[data-testid="mission-pause"]')?.[0];
  const restSubtitle = endProbe(r.log, '[data-testid="mission-subtitle"]')?.[0]?.text ?? '';
  const restReason = endProbe(r.log, '[data-testid="mission-pause-reason"]')?.[0]?.text ?? '';
  expect(/· Paused$/.test(restSubtitle), `the subtitle at rest: "${restSubtitle}"`);
  expect(restPause?.text === 'Pause' && restPause?.data?.['data-enabled'] === '0' && restReason === 'Pause is unavailable because no active run exists.', `the Pause control at rest read "${restPause?.text}" (data-enabled=${restPause?.data?.['data-enabled']}) beside "${restReason}" (REQ-MONITOR-296)`);
  results.pause = { pauseAtRest: restPause?.text ?? null, subtitleAtRest: restSubtitle, refusedMessage: message, stripAfterRefusal: strip58.find((t) => t.startsWith('run ')), stripAfterAccept: strip72.find((t) => t.startsWith('run ')), finalStatus: row.execution_status, timeline: names.filter((n) => /pause/.test(n)) };
}

// 4. Cancel a child with a live descendant: the confirmation names it and the cascade count; the child cancelled, the run on.
// A configured persona that may delegate (only the built-in orchestrator declares `delegate`, and the scripted client would read a second orchestrator as the root).
const s4 = scenario('cancel', ['personas:', '  lead:', '    name: lead', '    model: scripted', "    purpose: 'Delegates the work, then waits for it.'", "    system_prompt: 'You are a lead. Delegate the work, then wait for it.'", '    tools: [delegate, read_file, todo]']);
{
  const r = await launch('cancel', s4, {
    // The children share one step list: alpha delegates `sub`, and the next two calls — alpha's and sub's, in whichever order — each wait 16 s.
    ROTARIS_SCRIPT: 'delegate:lead:alpha,answer', ROTARIS_CHILD_SCRIPT: 'delegate:coding-agent:sub,wait:16000,answer,wait:16000,answer', ROTARIS_CAPTURE_PROMPT: 'cancel a child',
    ROTARIS_CAPTURE_VIEWS: '3@3500',
    ROTARIS_CAPTURE_CLICKS: '.agent-table__row@7000;;[data-testid="mission-cancel"]@7400;;.dialog-actions .btn-danger@8200',
    ROTARIS_CAPTURE_PROBE_AT: '.agent-table__row@6800;;[data-testid="mission-confirm"]@7900;;[data-testid="mission-confirm"] .btn-danger@7900;;.agent-table__row@8205;;.agent-table__row@8215;;.agent-table__row@8240;;.agent-table__row@9000',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '120000', ROTARIS_CAPTURE_AFTER_MS: '1000',
  }, { timeout: 200_000 });
  const db = open(s4); const row = session(db); const kids = children(db, row.session_id); const names = timeline(db, row.session_id); db.close();
  const before = probesAt(r.log, 6800, '.agent-table__row') ?? [];
  expect(before.length >= 2, `fewer than two agents on the table before the cancel: ${before.length}`);
  const dialog = probesAt(r.log, 7900, '[data-testid="mission-confirm"]')?.[0]?.text ?? '';
  const confirmLabel = probesAt(r.log, 7900, '[data-testid="mission-confirm"] .btn-danger')?.[0]?.text ?? '';
  expect(/Cancel alpha\?/.test(dialog) && (/Cancelling cascades to \d+ live descendants?\./.test(dialog) || /Nothing cascades\./.test(dialog)), `the confirmation did not name the agent and the cascade: "${dialog}" (REQ-MONITOR-055/064)`);
  expect(confirmLabel === 'Cancel alpha', `the confirm label: "${confirmLabel}"`);
  const alpha = kids.find((k) => k.canonical_name === 'alpha');
  expect(alpha?.state === 'cancelled', `alpha ended ${alpha?.state}`);
  expect(row.execution_status === 'completed', `the run ended ${row.execution_status} (${row.stop_reason}) — it should have continued`);
  const after9 = (probesAt(r.log, 9000, '.agent-table__row') ?? []).map((p) => `${p.text.slice(0, 40)}:${p.data['data-state']}`);
  // REQ-MONITOR-128 / REQ-MONITOR-296: sampled just after the confirm, before or as the engine answers. The activity line
  // "The user cancelled this agent." is drawn only by the optimistic overlay (the engine's record keeps the task).
  // Recorded, not asserted: whether a sample lands before the engine's own record depends on the host's timing (on
  // 2026-09-29 the build without the overlay still read `running` 40 ms after the confirm, and the build with it read
  // both agents cancelled with the user's activity lines). What is asserted is the overwrite by the authoritative read.
  const justAfter = [8205, 8215, 8240].map((at) => ({ at, rows: (probesAt(r.log, at, '.agent-table__row') ?? []).map((p) => `${p.text.slice(0, 80)}:${p.data['data-state']}`) }));
  const settled9 = probesAt(r.log, 9000, '.agent-table__row') ?? [];
  expect(settled9.length >= 2 && settled9.every((p) => p.data['data-state'] === 'cancelled' && !/which the user cancelled|The user cancelled this agent/.test(p.text)), `at 9 s the rows were not the engine's cancelled record: ${JSON.stringify(settled9.map((p) => `${p.text.slice(0, 60)}:${p.data['data-state']}`))} (REQ-MONITOR-296)`);
  results.cancel = { justAfterConfirm: justAfter, dialog, confirmLabel, alphaState: alpha?.state, descendants: kids.filter((k) => k.parent_id === alpha?.task_id).map((k) => `${k.canonical_name}:${k.state}`), rowsAfter: after9, runStatus: row.execution_status, cancelEntry: names.find((n) => n.name === 'child_user_cancelled')?.message ?? null };
}

// 4b. Cancel the run from the Mission view (acceptance A35, REQ-MONITOR-127/130/296): the run row selected, "Cancel selection",
// confirmed. The session is shown `cancelling` from the confirmation — the engine writes no `cancelling` for the explicit
// cancel, so its records read `running` until the run's end (OQ-165) — and no sample from the confirm to the run's end
// reads `Running`, in the subtitle, the run row or the status strip. Before the repair only the Workspace set anything, and the Mission view read `Running` throughout.
const s4b = scenario('cancel-run', ['personas:', '  lead:', '    name: lead', '    model: scripted', "    purpose: 'Delegates the work, then waits for it.'", "    system_prompt: 'You are a lead. Delegate the work, then wait for it.'", '    tools: [delegate, read_file, todo]']);
{
  const SAMPLES = [8210, 8220, 8230, 8240, 8250, 8270, 8300, 8500, 9000, 10000];
  // One selector list, so each sample is ONE querySelectorAll — the dialog, the subtitle, the run row and the strip read in
  // the same instant. The confirm click is an input event the renderer handles after the main process logs "clicked", and a
  // separate probe can run before it (seen 2026-10-01: the click and a probe reading `Running` logged in the same
  // millisecond, the next probe 6 ms later reading `Cancelling`). The dialog closes in the same commit that lays the
  // overlay (`confirmCancel`: `setConfirming(null)`, then `cancelRun`'s `beginRun`, in one handler), so a snapshot without
  // the dialog was read after the click was handled — on the base build as on the repair.
  const SNAPSHOT = '[data-testid="mission-confirm"], [data-testid="mission-subtitle"], [data-testid="mission-run-row"], .status-strip__item';
  const r = await launch('cancel-run', s4b, {
    ROTARIS_SCRIPT: 'delegate:lead:alpha,answer', ROTARIS_CHILD_SCRIPT: 'delegate:coding-agent:sub,wait:16000,answer,wait:16000,answer', ROTARIS_CAPTURE_PROMPT: 'cancel the run',
    ROTARIS_CAPTURE_VIEWS: '3@3500',
    ROTARIS_CAPTURE_CLICKS: '[data-testid="mission-run-row"]@7000;;[data-testid="mission-cancel"]@7400;;.dialog-actions .btn-danger@8200',
    ROTARIS_CAPTURE_PROBE_AT: ['[data-testid="mission-subtitle"]@6800', '[data-testid="mission-confirm"]@7900', ...SAMPLES.map((at) => `${SNAPSHOT}@${at}`)].join(';;'),
    ROTARIS_CAPTURE_PNG_AT: `${join(output, 'cancel-run.png')}@8240`,
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '120000', ROTARIS_CAPTURE_AFTER_MS: '1000',
  }, { timeout: 200_000 });
  const db = open(s4b); const row = session(db); db.close();
  const before = probesAt(r.log, 6800, '[data-testid="mission-subtitle"]')?.[0]?.text ?? '';
  expect(/· Running$/.test(before), `the run was not running before the cancel: "${before}"`);
  const dialog = probesAt(r.log, 7900, '[data-testid="mission-confirm"]')?.[0]?.text ?? '';
  expect(/Cancel the run\?/.test(dialog), `the run's confirmation did not open: "${dialog}" (REQ-MONITOR-126)`);
  // Only the snapshots the log records after the confirm click AND that no longer hold the dialog count: a click scheduled
  // at 8.2 s can be logged after a probe scheduled at 8.215 s, and a probe logged after the click can still have run before
  // the renderer handled it — both rightly read `Running`. "Logged after the click" alone went red that way on 2026-10-01.
  const confirmed = r.log.indexOf('capture: clicked ".dialog-actions .btn-danger"');
  expect(confirmed >= 0, 'the confirm click was not recorded');
  const afterConfirm = r.log.slice(confirmed);
  const byTestId = (snap, id) => snap.find((p) => p.data['data-testid'] === id)?.text ?? null;
  const snapshots = SAMPLES.map((at) => ({ at, snap: probesAt(afterConfirm, at, SNAPSHOT) })).filter((x) => x.snap !== null);
  const pending = snapshots.filter((x) => byTestId(x.snap, 'mission-confirm') !== null).map((x) => x.at);
  const samples = snapshots.filter((x) => byTestId(x.snap, 'mission-confirm') === null).map(({ at, snap }) => ({ at, subtitle: byTestId(snap, 'mission-subtitle'), runRow: byTestId(snap, 'mission-run-row'), strip: snap.filter((p) => p.data['data-testid'] === undefined).map((p) => p.text).find((t) => t.startsWith('run ')) ?? null })).filter((x) => x.subtitle !== null);
  expect(samples.length >= 3, `fewer than three samples landed after the confirm was handled: ${JSON.stringify(samples)} (still showing the dialog: ${JSON.stringify(pending)})`);
  const status = (text) => (text === null ? null : text.split('·').pop().trim());
  // REQ-MONITOR-127/130: from the confirmation on, the Mission view and the strip never read the run `Running` again — each
  // sample reads `Cancelling` until the run's record at rest arrives (REQ-ORCH-082: `user_cancelled` rests `paused`).
  const running = samples.filter((x) => status(x.subtitle) === 'Running' || /Running$/.test(x.runRow ?? '') || x.strip === 'run Running');
  expect(running.length === 0, `the Mission view read the cancelled run Running after the confirm: ${JSON.stringify(running)} (REQ-MONITOR-127, acceptance A35)`);
  // A sample that is not yet at rest is inside the cancel's window, so it reads `Cancelling` and no other active status.
  const ACTIVE = ['Running', 'Waiting', 'Starting', 'Pausing', 'Background'];
  const otherActive = samples.filter((x) => ACTIVE.includes(status(x.subtitle)));
  expect(otherActive.length === 0, `a sample after the confirm read an active status other than Cancelling: ${JSON.stringify(otherActive)} (REQ-MONITOR-127)`);
  // Whether a sample lands inside the cancel's window depends on the host's timing: recorded, not asserted.
  const cancellingSamples = samples.filter((x) => status(x.subtitle) === 'Cancelling').length;
  expect(!['running', 'waiting', 'starting', 'pausing', 'cancelling', 'background'].includes(row.execution_status), `the cancelled run ended ${row.execution_status} (${row.stop_reason})`);
  results.cancelRun = { before, dialog, samples, stillShowingDialog: pending, cancellingSamples, finalStatus: row.execution_status, stopReason: row.stop_reason };
}

// 4c. Cancel the run from a persona window (acceptance A35's second half, the verifier's finding of 2026-10-01; REQ-MONITOR-127/130,
// REQ-SHELL-075 (a)/(g)): the inspector following the run-level agent pops it out, the window's Cancel on the run's own
// instance is confirmed, and every snapshot after the confirmation was handled reads the instance's state `cancelling` or
// the run at rest — never `running`. Before the repair the window drew the run's instance through the agent vocabulary,
// which has no `cancelling`, and read `running` until the record at rest arrived.
const s4c = scenario('cancel-run-persona');
{
  const SAMPLES = [6610, 6620, 6630, 6640, 6660, 6700, 6800, 7000, 8000, 9000];
  // One selector list per sample: the confirmation and the heading read in the same instant (see 4b).
  const SNAPSHOT = '[data-testid="persona-cancel-confirm"], [data-testid="persona-agent-name"], [data-testid="persona-agent-state"]';
  const r = await launch('cancel-run-persona', s4c, {
    ROTARIS_SCRIPT: 'delegate:coding-agent:alpha,answer', ROTARIS_CHILD_SCRIPT: 'wait:16000,answer', ROTARIS_CAPTURE_PROMPT: 'cancel the run from its window',
    ROTARIS_CAPTURE_PROBE_AT: '[data-testid="inspector-name"]@3000',
    ROTARIS_CAPTURE_CLICKS: '.inspector__actions .btn>>Pop out@3200',
    ROTARIS_CAPTURE_WINDOWS_AT: '5000',
    ROTARIS_CAPTURE_PERSONA_CLICKS: '[data-testid="persona-cancel"]@6000;;[data-testid="persona-cancel-confirm"] .btn-danger@6600',
    ROTARIS_CAPTURE_PERSONA_PROBE_AT: [`${SNAPSHOT}@5500`, '[data-testid="persona-cancel-confirm"]@6300', ...SAMPLES.map((at) => `${SNAPSHOT}@${at}`)].join(';;'),
    ROTARIS_CAPTURE_PERSONA_PNG_AT: `${join(output, 'cancel-run-persona-window.png')}@6620`,
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '120000', ROTARIS_CAPTURE_AFTER_MS: '1000',
  }, { timeout: 200_000 });
  const db = open(s4c); const row = session(db); db.close();
  const following = probesAt(r.log, 3000, '[data-testid="inspector-name"]')?.[0]?.text ?? null;
  expect(following === 'orchestrator', `the inspector did not follow the run-level agent at 3 s: "${following}"`);
  const windows = windowsAt(r.log, 5000) ?? [];
  expect(windows.length === 1 && windows[0].title === 'Rotaris · orchestrator', `the run-level agent's window at 5 s: ${JSON.stringify(windows)} (REQ-SHELL-072)`);
  const field = (snap, id) => snap?.find((p) => p.data['data-testid'] === id)?.text ?? null;
  const before = personaProbesAt(r.log, 5500, SNAPSHOT);
  expect(field(before, 'persona-agent-name') === 'orchestrator' && field(before, 'persona-agent-state') === 'running', `the run's instance before the cancel: ${JSON.stringify(before)}`);
  const dialog = personaProbesAt(r.log, 6300, '[data-testid="persona-cancel-confirm"]')?.[0]?.text ?? '';
  expect(/Cancel the run\?/.test(dialog), `the window's Cancel on the run's own instance did not ask "Cancel the run?": "${dialog}" (REQ-MONITOR-126)`);
  expect(/persona-click-at 6600 \S.* → clicked/.test(r.log), 'the confirmation was not clicked in the persona window');
  const snapshots = SAMPLES.map((at) => ({ at, snap: personaProbesAt(r.log, at, SNAPSHOT) })).filter((x) => x.snap !== null);
  const pending = snapshots.filter((x) => field(x.snap, 'persona-cancel-confirm') !== null).map((x) => x.at);
  const samples = snapshots.filter((x) => field(x.snap, 'persona-cancel-confirm') === null).map(({ at, snap }) => ({ at, name: field(snap, 'persona-agent-name'), state: field(snap, 'persona-agent-state') })).filter((x) => x.state !== null);
  expect(samples.length >= 3, `fewer than three snapshots after the confirmation was handled: ${JSON.stringify(samples)} (still showing the dialog: ${JSON.stringify(pending)})`);
  const running = samples.filter((x) => x.state === 'running');
  expect(running.length === 0, `the persona window read the cancelled run's instance running after the confirm: ${JSON.stringify(running)} (REQ-MONITOR-127/130, acceptance A35)`);
  // Whether a snapshot lands inside the cancel's window is host timing: recorded, not asserted.
  const cancellingSamples = samples.filter((x) => x.state === 'cancelling').length;
  expect(!['running', 'waiting', 'starting', 'pausing', 'cancelling', 'background'].includes(row.execution_status), `the cancelled run ended ${row.execution_status} (${row.stop_reason})`);
  results.cancelRunPersona = { following, window: windows[0] ?? null, before: { name: field(before, 'persona-agent-name'), state: field(before, 'persona-agent-state') }, dialog, samples, stillShowingDialog: pending, cancellingSamples, finalStatus: row.execution_status, stopReason: row.stop_reason, png: join(output, 'cancel-run-persona-window.png') };
}

// 5. Open an agent under both preferences; the window's lifecycle; a new session destroys it.
const s5 = scenario('open');
{
  const r = await launch('open-off', s5, {
    ROTARIS_SCRIPT: THREE, ROTARIS_CHILD_SCRIPT: 'wait:10000,answer', ROTARIS_CAPTURE_PROMPT: 'open an agent',
    ROTARIS_CAPTURE_VIEWS: '3@3500', ROTARIS_CAPTURE_CLICKS: '.agent-table__row@5000;;[data-testid="mission-open"]@5500',
    ROTARIS_CAPTURE_PROBE_AT: '.app-shell@6200;;[data-testid="inspector-tag"]@6200;;[data-testid="inspector-name"]@6200;;.inspector@6200',
    ROTARIS_CAPTURE_WINDOWS_AT: '6200',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1000',
  });
  expect(probesAt(r.log, 6200, '.app-shell')?.[0]?.data?.['data-view'] === 'workspace', 'Open with the preference off did not switch to the Workspace');
  const tag = probesAt(r.log, 6200, '[data-testid="inspector-tag"]')?.[0]?.text ?? '';
  const name = probesAt(r.log, 6200, '[data-testid="inspector-name"]')?.[0]?.text ?? '';
  expect(tag === 'Pinned by selection' && name === 'alpha', `the inspector after Open: tag "${tag}", name "${name}" (REQ-MONITOR-072/054)`);
  expect((windowsAt(r.log, 6200) ?? []).length === 0, 'a persona window was created with the preference off (REQ-SHELL-073)');
  expect(probesAt(r.log, 6200, '.inspector')?.[0]?.data?.['data-mode'] === 'pinned', 'the inspector was not pinned');
  results.openOff = { view: 'workspace', tag, name, windows: 0 };

  setPreference(s5, 'interface/agentPopOut', true);
  const r2 = await launch('open-on', s5, {
    ROTARIS_SCRIPT: THREE, ROTARIS_CHILD_SCRIPT: 'wait:16000,answer', ROTARIS_CAPTURE_PROMPT: 'pop out an agent',
    ROTARIS_CAPTURE_VIEWS: '3@3500',
    ROTARIS_CAPTURE_CLICKS: '.agent-table__row@5000;;.agent-table__row:nth-child(2) .btn>>Pop out@7500;;.agent-table__row:nth-child(2) .btn>>Pop out@10500',
    ROTARIS_CAPTURE_WINDOWS_AT: '6500;;8500;;9800;;11500',
    ROTARIS_CAPTURE_PERSONA_PROBE_AT: '[data-testid="persona-agent-name"]@6500;;[data-testid="persona-count"]@6500;;.persona-window__tabs .tab@6500;;[data-testid="persona-agent-name"]@8500;;[data-testid="persona-agent-state"]@11500;;[data-testid="persona-context-line"]@11500;;[data-testid="persona-transcript"]@11500',
    ROTARIS_CAPTURE_PERSONA_CLOSE_AT: '9000',
    ROTARIS_CAPTURE_PERSONA_PNG_AT: `${join(output, 'persona.png')}@12000`,
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1000',
  });
  const w65 = windowsAt(r2.log, 6500) ?? [];
  expect(w65.length === 1 && w65[0].title === 'Rotaris · coding-agent' && w65[0].width === 820 && w65[0].height === 620 && w65[0].visible, `the window at 6.5 s: ${JSON.stringify(w65)} (REQ-SHELL-072)`);
  const name65 = personaProbesAt(r2.log, 6500, '[data-testid="persona-agent-name"]')?.[0]?.text;
  const count65 = personaProbesAt(r2.log, 6500, '[data-testid="persona-count"]')?.[0]?.text;
  const tabs65 = (personaProbesAt(r2.log, 6500, '.persona-window__tabs .tab') ?? []).map((p) => p.text);
  expect(name65 === 'alpha' && count65 === '2 instances' && tabs65.length === 2, `the window's content at 6.5 s: name ${name65}, count ${count65}, tabs ${JSON.stringify(tabs65)} (REQ-SHELL-074)`);
  const w85 = windowsAt(r2.log, 8500) ?? [];
  const name85 = personaProbesAt(r2.log, 8500, '[data-testid="persona-agent-name"]')?.[0]?.text;
  expect(w85.length === 1 && name85 === 'beta', `a second instance did not reuse the window: ${JSON.stringify(w85)}, shown ${name85}`);
  const w98 = windowsAt(r2.log, 9800) ?? [];
  expect(w98.length === 1 && w98[0].visible === false, `closing did not hide-and-retain: ${JSON.stringify(w98)} (REQ-SHELL-076)`);
  expect(/hidden on close \(retained/.test(r2.log), 'the registry did not log the hide on close');
  const w115 = windowsAt(r2.log, 11500) ?? [];
  expect(w115.length === 1 && w115[0].visible === true, `reopening did not show the retained window: ${JSON.stringify(w115)}`);
  const state115 = personaProbesAt(r2.log, 11500, '[data-testid="persona-agent-state"]')?.[0]?.text;
  const line115 = personaProbesAt(r2.log, 11500, '[data-testid="persona-context-line"]')?.[0]?.text ?? '';
  expect(['running', 'done'].includes(state115) && /\d+ tool calls? · (\d+m )?\d+s/.test(line115), `the reopened window's state: ${state115}, context line "${line115}" (REQ-MONITOR-073/069)`);
  const paints = [...r2.log.matchAll(/persona "coding-agent" first paint after show: (\d+) ms/g)].map((m) => Number(m[1]));
  expect(paints.length >= 2, `first-paint measurements: ${JSON.stringify(paints)}`);
  expect(existsSync(join(output, 'persona.png')), 'no persona window PNG');
  results.openOn = { windowAt6_5s: w65[0], shownAt8_5s: name85, hiddenAt9_8s: w98[0], shownAt11_5s: w115[0], stateAt11_5s: state115, contextLine: line115, firstPaintMs: paints, png: join(output, 'persona.png') };

  // 5c. A new session destroys every persona window (REQ-SHELL-078): the stored session reopened, a window popped out, then New session → Start session → a prompt.
  const r3 = await launch('open-new-session', s5, {
    ROTARIS_SCRIPT: 'answer', ROTARIS_CAPTURE_RESUME: 'latest', ROTARIS_CAPTURE_VIEWS: '3@2500;;1@5000',
    ROTARIS_CAPTURE_CLICKS: '.agent-table__row .btn>>Pop out@3500;;.btn>>New session@5600;;[data-testid="start-session-accept"]@6400',
    ROTARIS_CAPTURE_TYPE: 'second session>>composer@7600',
    ROTARIS_CAPTURE_WINDOWS_AT: '4600;;9800',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '60000', ROTARIS_CAPTURE_AFTER_MS: '1000',
  });
  const w46 = windowsAt(r3.log, 4600) ?? [];
  expect(w46.length === 1, `no persona window on the reopened session: ${JSON.stringify(w46)}`);
  const w98b = windowsAt(r3.log, 9800) ?? [];
  expect(w98b.length === 0 && /destroyed: a new session started/.test(r3.log), `the new session did not destroy the persona windows: ${JSON.stringify(w98b)}`);
  results.openNewSession = { before: w46.length, after: w98b.length };
}

// 6. The inspector: following, pinned, chips stable across a state change, Steer through the persona window.
const s6 = scenario('inspector');
{
  const r = await launch('inspector', s6, {
    ROTARIS_SCRIPT: 'delegate:coding-agent:alpha,answer', ROTARIS_CHILD_SCRIPT: 'wait:5000,read,wait:6000,answer', ROTARIS_CAPTURE_PROMPT: 'inspect an agent',
    ROTARIS_CAPTURE_CLICKS: '.agent-row@4000;;.inspector__actions .btn>>Steer@9200',
    ROTARIS_CAPTURE_PROBE_AT: '[data-testid="inspector-tag"]@3000;;[data-testid="inspector-name"]@3000;;[data-testid="inspector-chips"] .chip@3000;;[data-testid="inspector-tag"]@4500;;[data-testid="inspector-name"]@4500;;[data-testid="inspector-chips"] .chip@4500;;[data-testid="inspector-chips"] .chip@8500;;[data-testid="inspector-meta"]@8500;;[data-testid="inspector-controls-note"]@8500;;.ctx-ring@8500',
    ROTARIS_CAPTURE_PERSONA_STEER: 'keep going, but summarise first@11000',
    ROTARIS_CAPTURE_PERSONA_PROBE_AT: '[data-testid="persona-steer"]@12000;;[data-testid="persona-steer-error"]@12000',
    ROTARIS_CAPTURE_PNG_AT: `${join(output, 'inspector-live.png')}@8600`,
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1000',
  });
  const db = open(s6); const row = session(db); const kids = children(db, row.session_id); const entries = timeline(db, row.session_id); db.close();
  const tag3 = probesAt(r.log, 3000, '[data-testid="inspector-tag"]')?.[0]?.text; const name3 = probesAt(r.log, 3000, '[data-testid="inspector-name"]')?.[0]?.text;
  expect(tag3 === 'Following — tracking whichever agent wrote last' && name3 === 'orchestrator', `following at 3 s: tag "${tag3}", name "${name3}" (REQ-MONITOR-053/054)`);
  // Live-run finding K1 (REQ-MONITOR-060/061): the running run-level agent shows the tools its run resolved — a coordinator,
  // so none of the write, terminal and commit tools its policy withholds — marked from its own history (it has delegated).
  const rootChips = (probesAt(r.log, 3000, '[data-testid="inspector-chips"] .chip') ?? []).map((p) => [p.data['data-tool'], p.data['data-state']]);
  expect(rootChips.length > 0 && rootChips.some((c) => c[0] === 'delegate' && c[1] !== 'not used'), `the run-level agent's chips at 3 s: ${JSON.stringify(rootChips)} (REQ-MONITOR-060)`);
  expect(!rootChips.some((c) => ['write_file', 'haet_edit', 'haet', 'terminal', 'git_commit'].includes(c[0])), `the running coordinator lists a tool its policy withholds: ${JSON.stringify(rootChips)} (REQ-MONITOR-061)`);
  const tag45 = probesAt(r.log, 4500, '[data-testid="inspector-tag"]')?.[0]?.text; const name45 = probesAt(r.log, 4500, '[data-testid="inspector-name"]')?.[0]?.text;
  expect(tag45 === 'Pinned by selection' && name45 === 'alpha', `pinned at 4.5 s: tag "${tag45}", name "${name45}"`);
  const chips45 = (probesAt(r.log, 4500, '[data-testid="inspector-chips"] .chip') ?? []).map((p) => [p.data['data-tool'], p.data['data-state']]);
  const chips85 = (probesAt(r.log, 8500, '[data-testid="inspector-chips"] .chip') ?? []).map((p) => [p.data['data-tool'], p.data['data-state']]);
  expect(chips45.length > 0 && JSON.stringify(chips45.map((c) => c[0])) === JSON.stringify(chips85.map((c) => c[0])), `the chip order changed: ${JSON.stringify(chips45)} → ${JSON.stringify(chips85)} (REQ-MONITOR-062)`);
  expect(chips45.every((c) => c[1] === 'not used') && chips85.some((c) => c[0] === 'read_file' && c[1] === 'used'), `the chip states: ${JSON.stringify(chips45)} → ${JSON.stringify(chips85)} (REQ-MONITOR-060)`);
  const meta = probesAt(r.log, 8500, '[data-testid="inspector-meta"]')?.[0]?.text ?? '';
  expect(/^running · \d+s · 1 tool call$/.test(meta), `the meta line: "${meta}" (REQ-MONITOR-052)`);
  const note = probesAt(r.log, 8500, '[data-testid="inspector-controls-note"]')?.[0]?.text;
  expect(note === 'Model and reasoning are set per persona and edited in persona settings.', `the controls note for a child: "${note}" (REQ-MONITOR-058)`);
  const ring = probesAt(r.log, 8500, '.ctx-ring')?.[0]?.data ?? {};
  expect(ring['data-threshold'] === '60' && Number(ring['aria-valuenow']) >= 0, `the ring: ${JSON.stringify(ring)} (REQ-MONITOR-065)`);
  const steered = entries.find((t) => t.name === 'steering_submitted');
  const alpha = kids.find((k) => k.canonical_name === 'alpha');
  expect(steered !== undefined && JSON.parse(steered.metadata).agent === alpha?.task_id, `the steer was not recorded against alpha: ${JSON.stringify(steered)} (REQ-MONITOR-137)`);
  const box = personaProbesAt(r.log, 12000, '[data-testid="persona-steer"]')?.[0]?.text ?? null;
  expect(box === '', `the accepted steer did not clear the box: "${box}" (REQ-MONITOR-070)`);
  expect(/persona-steer-at 11000 → sent/.test(r.log), 'the steer card was not driven');
  results.inspector = { following: { tag: tag3, name: name3, chips: rootChips }, pinned: { tag: tag45, name: name45 }, chipsBefore: chips45, chipsAfter: chips85, meta, note, ring, steer: steered ? JSON.parse(steered.metadata) : null, png: join(output, 'inspector-live.png') };
}

// 7. The strategy selector and the depth control write their keys; Settings shows the same values; the pop-out toggle writes its preference.
const s7 = scenario('settings');
{
  const r = await launch('settings', s7, {
    ROTARIS_CAPTURE_VIEWS: '3@1200;;7@4200',
    ROTARIS_CAPTURE_SELECT: '[data-testid="mission-strategy"]>>swarm@2200;;[data-testid="mission-depth"]>>2@3000',
    ROTARIS_CAPTURE_CLICKS: '.nav-list__item>>Interface@4800;;[data-testid="agent-pop-out-toggle"]@5200;;.nav-list__item>>Runtime@5700',
    ROTARIS_CAPTURE_PROBE_AT: '[data-testid="mission-strategy"]@3800;;[data-testid="mission-depth"]@3800',
    ROTARIS_CAPTURE_AFTER_MS: '6800', ROTARIS_CAPTURE_PROBE: '#strategy;;#max-depth;;[data-testid="agent-pop-out-toggle"]',
  });
  const yaml = readFileSync(join(s7.workspace, '.rotaris', 'agents.yaml'), 'utf8');
  expect(/delegation_strategy: swarm/.test(yaml) && /max_depth: 2\b/.test(yaml), `the file after the writes:\n${yaml}`);
  const strategy = endProbe(r.log, '#strategy')?.[0]?.value; const depth = endProbe(r.log, '#max-depth')?.[0]?.value;
  expect(strategy === 'swarm' && depth === '2', `Settings → Runtime shows strategy ${strategy}, depth ${depth}`);
  const prefs = JSON.parse(readFileSync(join(s7.preferences, 'preferences.json'), 'utf8'));
  expect(prefs['interface/agentPopOut'] === true, `the toggle did not persist: ${JSON.stringify(prefs)} (REQ-SHELL-073)`);
  results.settings = { yamlStrategy: 'swarm', yamlDepth: 2, settingsStrategy: strategy, settingsDepth: depth, popOutPreference: prefs['interface/agentPopOut'] };
}

// 8. Reconciliation: a child left `running` on a completed session presents settled on every surface (REQ-MONITOR-211/213).
{
  const dbw = new Database(oneDatabase(s1.local));
  const row = dbw.prepare('SELECT session_id FROM sessions ORDER BY created_at DESC').get();
  dbw.prepare(`INSERT INTO children (session_id, task_id, canonical_name, given_name, persona, state, parent_id, depth, iteration, model_key, category, background, task, depends_on, inherited_context, granted_tools, granted_mcp, spawned_at, tool_calls)
    VALUES (?, 'bg_0000dead', 'zombie', 'Zombie', 'coding-agent', 'running', 'root:1', 1, 1, 'scripted', 'quick', 1, 'a child the run left running', '[]', '[]', '["read_file"]', '{}', '2026-09-05T10:00:00.000Z', 0)`).run(row.session_id);
  dbw.close();
  const r = await launch('reconcile', s1, {
    ROTARIS_CAPTURE_RESUME: 'latest', ROTARIS_CAPTURE_VIEWS: '3@2500',
    ROTARIS_CAPTURE_CLICKS: '[data-agent-id="bg_0000dead"]@3500;;[data-testid="mission-open"]@4000;;.inspector__actions .btn>>Pop out@5000',
    ROTARIS_CAPTURE_PROBE_AT: '[data-agent-id="bg_0000dead"]@3800;;.agent-table__row@3800;;[data-testid="inspector-name"]@4600;;[data-testid="inspector-meta"]@4600;;.agent-row[data-task-id="bg_0000dead"]@4600',
    ROTARIS_CAPTURE_PERSONA_PROBE_AT: '[data-testid="persona-agent-name"]@6500;;[data-testid="persona-agent-state"]@6500',
    ROTARIS_CAPTURE_AFTER_MS: '7500', ROTARIS_CAPTURE_PROBE: '.agent-row',
  });
  // Found on this launch: opening a stored session runs REQ-ORCH-053's sweep FIRST, which settles the planted row `cancelled`
  // before any surface sees it — REQ-MONITOR-211's outcome-dictated state (`done` for a completed run) never reaches the
  // projection by this route (the reading in ADR-0043's note). What REQ-MONITOR-213 demands is asserted: every surface shows
  // the same settled state and none shows the agent running.
  const tableRow = probesAt(r.log, 3800, '[data-agent-id="bg_0000dead"]')?.[0];
  const settled = tableRow?.data?.['data-state'];
  expect(settled === 'cancelled' || settled === 'done', `the Mission table row: ${JSON.stringify(tableRow)}`);
  const all = (probesAt(r.log, 3800, '.agent-table__row') ?? []).map((p) => p.data['data-state']);
  expect(all.length === 4 && all.every((st) => st === 'done' || st === 'cancelled'), `the table's states: ${JSON.stringify(all)}`);
  const meta = probesAt(r.log, 4600, '[data-testid="inspector-meta"]')?.[0]?.text ?? '';
  expect(probesAt(r.log, 4600, '[data-testid="inspector-name"]')?.[0]?.text === 'zombie' && meta.startsWith(`${settled} · `), `the inspector: "${meta}" against ${settled}`);
  const treeRow = probesAt(r.log, 4600, '.agent-row[data-task-id="bg_0000dead"]')?.[0];
  expect(treeRow?.data?.['data-state'] === settled, `the sidebar tree row: ${JSON.stringify(treeRow)} against ${settled}`);
  const pName = personaProbesAt(r.log, 6500, '[data-testid="persona-agent-name"]')?.[0]?.text; const pState = personaProbesAt(r.log, 6500, '[data-testid="persona-agent-state"]')?.[0]?.text;
  expect(pName === 'zombie' && pState === settled, `the persona window: ${pName} ${pState} against ${settled} (REQ-MONITOR-213)`);
  const sweep = /(\d+) unfinished child record/.exec(r.log)?.[1] ?? null;
  results.reconcile = { settledBy: settled === 'cancelled' ? 'REQ-ORCH-053 sweep on open (cancelled)' : 'projection (run outcome)', sweepNotice: sweep, table: settled, inspectorMeta: meta, tree: treeRow.data['data-state'], personaWindow: pState };
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
