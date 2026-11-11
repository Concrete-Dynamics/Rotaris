// @ts-nocheck — a typecheck exception (tools/typecheck-exceptions.json, R-091): its types are owed, and the list only shrinks.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { replicaRunStartDeclines, unexpectedRendererErrors } from './lib/renderer-console.mjs';

/**
 * Part R's first execution in the built app — the agent surfaces: the delegation graph and the agent table
 * (REQ-MONITOR-274..276), the per-agent inspector (REQ-MONITOR-050..067), the persona windows (REQ-SHELL-072..078,
 * REQ-MONITOR-068..073; ADR-0048's registry first executed) and the shared selection (REQ-MONITOR-042). Scripted client,
 * scratch stores, the launches the plan names (eight, two of them in two parts):
 *
 * PD-SHELL-015, PD-MONITOR-009 (2026-11-11): Mission is no primary view, and what it drew stands on the Overview as two
 * cards, the graph (`mission-graph`, first in the right column) and the table (`mission-table`, in the left column under
 * the metric cards); every launch that opened Mission by Ctrl+3 opens the Overview by its identifier. The run's state is
 * read from the Overview's header (`overview-session`, "session {label} · {status} · {runtime}") where the Mission
 * subtitle gave it; parity is between two trees, not three; item 7's strategy selector and depth control are gone from
 * the monitoring view, and the card's read-only strategy, its "Open Runtime settings" and the Settings fields are
 * measured in their place. "Mission" below names the two cards where it is kept in a file or result name.
 *
 *   1. painted     — the Overview opened during a run with three live children: the two cards in their places and the
 *                    retired surfaces absent, the header, the run row, the tree,
 *                    the table with one row per agent and state text, elapsed advancing between two probes 1.5 s apart.
 *   1b. waiting    — the model's slot cap one, two children waiting behind it: every row's Elapsed cell and tree meta
 *                    carries a figure, and a waiting row's advances (REQ-MONITOR-107/111).
 *   1c. todo list  — OQ-213: a second delegation before the coordinator's own todo list is refused, then runs after it.
 *   1d. timed out  — a child cut off at a 3 s per-agent timeout, with and without progress: the tree and table tags, the
 *                    inspector's and the persona window's line, and their geometry (PD-CONFIG-003 revision 3, OQ-234).
 *   1e. todo item  — PD-TOOLS-006 revision 6 (OQ-220): a held item and an unnamed delegation after the list are refused;
 *                    revision 7 with PD-TOOLS-008 revision 2 (OQ-249): each admitted delegation marks its PENDING item
 *                    IN_PROGRESS, two side by side while their children run, and no todo call is refused;
 *                    named ones run, and each child's record holds its item.
 *   1f. stalled    — a child silent past a 3 s stall threshold: REQ-ORCH-089's `stalled Ns` tag in the Workspace sidebar's
 *                    row and the agent table's state cell, and their geometry (the persona on one line in the sidebar row and in the table, the card unscrolled).
 *   2. parity      — the Overview's graph card and the Workspace sidebar probed in one run: identical ids and
 *                    states (two surfaces since PD-MONITOR-009); then a 23-agent record (20 seeded) refreshed with the
 *                    Overview visible, the apply-to-paint time; then that table at 1440×900 and at 1000×680, where its
 *                    card is narrower than 40rem: each row a three-line grid that keeps every value (PD-MONITOR-009 clause 3).
 *   3. pause       — a child selected → Pause refused with the explanation, no control sent; the run selected → accepted,
 *                    `pausing` then `paused`; at rest the still-mounted view's Pause reads `Pause`, not `Pausing…`.
 *   4. cancel      — a child with a live descendant: the confirmation names it and the cascade; the child cancelled, the run on;
 *                    the rows sampled just after the confirm (REQ-MONITOR-128's optimistic cancel) and overwritten by the
 *                    engine's record at 9 s (REQ-MONITOR-296).
 *   4b. cancel run — the run row selected, "Cancel selection" confirmed: every sample after the confirm reads the Overview's
 *                    header and the run row `cancelling` or the run at rest — never `running` nor another active
 *                    status; how many land inside the `Cancelling` window is host timing, recorded and not asserted
 *                    (acceptance A35, REQ-MONITOR-127/130).
 *   4c. persona    — the inspector pops out the run-level agent; the window's Cancel on the run's own instance confirmed: every
 *                    snapshot after the confirmation was handled reads the instance's state `cancelling` or the run at rest,
 *                    never `running` (acceptance A35, REQ-MONITOR-127/130, REQ-SHELL-075 (a)).
 *   4d. inspector  — the Workspace inspector following the run-level agent, its Cancel confirmed ("Cancel the run?"): every
 *                    snapshot after the confirmation was handled whose run header reads `Cancelling…` reads the meta line
 *                    `cancelling · …`, never `running · …` (REQ-MONITOR-127/130/052, OQ-165's reading).
 *   5. open        — pop-out off: Open pins the agent in the Workspace inspector; on: one window per persona, 820×620,
 *                    reused for a second instance, hidden on close, shown again; a new session destroys it.
 *   6. inspector   — following the latest author, pinned on selection, chips in one order across a state change, Steer
 *                    through the persona window recorded against that agent.
 *   7. settings    — PD-MONITOR-009 clause 6: the graph card shows the configured strategy as text, with no selector and no
 *                    depth control on the monitoring view; "Open Runtime settings" lands on Settings › Runtime, whose
 *                    "Delegation strategy" and "Depth cap" fields write their keys on Save; the toggle writes; relaunched,
 *                    the card reads the strategy the file now holds.
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
/** Every `eval-at` of the launch whose answer is an object, parsed; a reading is found by the `kind` it names itself. */
const evalsOf = (log) => [...log.matchAll(/capture: eval-at \d+ .*? → (\{.*\})\s*$/gm)].map((m) => JSON.parse(m[1]));
const results = {};
// The replica's run-start decline is REQ-SESSION-161's own recovery, read from the code and left as a diagnostic
// (docs/archive/defects/a-row-settled-below-the-last-is-published-without-the-rows-after-it.md, "The declined increment at run
// start"); it met the timed-out item's first launch at a load of 15 on 4 CPUs, before any click. Every other console line still
// fails a launch. The filter is `renderer-console.mjs`'s, shared with palette-proof since 2026-10-14, and since 2026-10-15 every
// launch here reads through it, `painted` and `waiting` included, which start a delegating run and read the unfiltered lines
// until then (docs/archive/defects/notice-proof-and-two-mission-proof-checks-still-fail-on-the-replicas-run-start-decline.md).
const unexpected = unexpectedRendererErrors;
const expect = (cond, message) => { if (!cond) throw new Error(message); };
const seconds = (label) => { const m = /(?:(\d+)m )?(\d+)s/.exec(label); return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null; };

// OQ-213: a coordinator that delegates more than once keeps its own todo list first, or its second delegation is refused; and
// since PD-TOOLS-006 revision 6 (OQ-220) each implementation delegation after the list names the open item it serves
// (`plan:3` writes three, each `delegate` names the next, `done` completes them so REQ-ORCH-075 holds the task by none).
const THREE = 'plan:3,delegate:coding-agent:alpha,delegate:coding-agent:beta,delegate:codebase-analyst:gamma,done,answer';

// PD-MONITOR-009: the run's state where the Mission subtitle gave it — the Overview's header, "session {label} · {status} ·
// {runtime}", the status being the presentation status in lower case. Read from the end, since a label is free text.
const HEADER = '[data-testid="overview-session"]';
const headerStatus = (text) => { const parts = (text ?? '').split(' · '); return parts.length >= 3 ? parts[parts.length - 2] : null; };
// PD-MONITOR-009 clauses 2, 3 and 6, and PD-SHELL-015: where the two cards stand, what each carries, and what is gone —
// the Mission view's root and subtitle, its "Delegation settings" card with the depth control, any selector in the graph
// card, and the Overview's old read-only tree card. One evaluation, so the reading is of one instant.
const CARDS = `(() => { const q = (s) => document.querySelector(s); const graph = q('[data-testid="mission-graph"]'); const table = q('[data-testid="mission-table"]'); const strategy = q('[data-testid="mission-strategy"]'); return { kind: 'cards', view: q('.app-shell')?.getAttribute('data-view') ?? null, rail: [...document.querySelectorAll('.nav-item')].map((el) => (el.textContent ?? '').trim()), graphFirstInRight: graph !== null && q('.overview__right')?.firstElementChild === graph, tableInLeft: table !== null && table.parentElement === q('.overview__left'), tableAfterMetrics: table?.previousElementSibling?.classList.contains('overview__metrics') === true, graphSelected: graph?.getAttribute('data-selected') ?? null, tableRefresh: table === null ? null : [table.hasAttribute('data-refresh-ms'), table.hasAttribute('data-refresh-agents')], strategyTag: strategy?.tagName ?? null, strategyText: strategy?.textContent ?? null, openRuntime: q('[data-testid="mission-open-runtime"]')?.textContent ?? null, gone: { root: q('[data-testid="mission"]') !== null, subtitle: q('[data-testid="mission-subtitle"]') !== null, settingsCard: q('[data-testid="mission-settings"]') !== null, depth: q('[data-testid="mission-depth"]') !== null, selects: graph?.querySelectorAll('select').length ?? null, treeCard: q('.ov-card--tree') !== null } }; })()`;

// 1. The Overview's two delegation cards painted during a run with three live children (the Mission view, until PD-SHELL-015).
const s1 = scenario('painted');
{
  const r = await launch('painted', s1, {
    ROTARIS_SCRIPT: THREE, ROTARIS_CHILD_SCRIPT: 'wait:14000,read,answer', ROTARIS_CAPTURE_PROMPT: 'delegate to three agents',
    // The prompt seam leaves the startup view for the Workspace to type; the Overview is opened again by its identifier.
    ROTARIS_CAPTURE_VIEWS: 'overview@3500',
    ROTARIS_CAPTURE_PROBE_AT: `${HEADER}@6000;;[data-testid="mission-run-row"]@6000;;.agent-table__row@6000;;[data-testid="agent-elapsed"]@6000;;[data-testid="agent-elapsed"]@7500;;.agent-table__state-text@6000;;.mission__run-row + .agent-tree .agent-row@6000`,
    ROTARIS_CAPTURE_EVAL_AT: `${CARDS}@6000`,
    ROTARIS_CAPTURE_PNG_AT: `${join(output, 'mission.png')}@7000`,
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500', ROTARIS_CAPTURE_END_VIEW: 'overview', ROTARIS_CAPTURE_END_VIEW_MS: '1500',
    ROTARIS_CAPTURE_PROBE: '[data-testid="mission-graph"];;[data-testid="mission-table"];;.agent-table__row;;.app-shell', // the refresh figure is the table card's attributes; its drawn line went with UIR-302 (2026-11-11)
  });
  const db = open(s1); const row = session(db); const kids = children(db, row.session_id); db.close();
  expect(row.execution_status === 'completed', `the run ended ${row.execution_status} (${row.stop_reason})`);
  expect(kids.length === 3, `the ledger holds ${kids.length} children`);
  // PD-MONITOR-009: this read the Mission header's subtitle, "delegation tree · {label} · {status}"; the Overview's header
  // carries the session and its state now.
  const subtitle = probesAt(r.log, 6000, HEADER)?.[0]?.text ?? '';
  expect(/^session .+ · running · \S+$/.test(subtitle), `the Overview's header: "${subtitle}" (PD-MONITOR-009: "session {label} · {status} · {runtime}")`);
  const cards = evalsOf(r.log).find((e) => e.kind === 'cards');
  expect(cards, 'no reading of the two delegation cards (see painted.log)');
  expect(cards.view === 'overview' && JSON.stringify(cards.rail) === JSON.stringify(['Overview', 'Workspace', 'Requirements', 'Git', 'Library', 'Settings']), `the view and the rail: ${cards.view}, ${JSON.stringify(cards.rail)} (PD-SHELL-015: six views, Mission none)`);
  expect(cards.graphFirstInRight && cards.tableInLeft && cards.tableAfterMetrics, `the cards' places: ${JSON.stringify(cards)} (PD-MONITOR-009 clauses 2 and 3: the graph first in the right column, the table in the left under the metric cards)`);
  expect(cards.graphSelected !== null && cards.tableRefresh?.every((present) => present === true), `the cards' attributes: ${JSON.stringify(cards)} (the shared selection on the graph card, the refresh figures on the table card)`);
  expect(cards.strategyTag === 'SPAN' && cards.strategyText === 'orchestrator' && cards.openRuntime === 'Open Runtime settings', `the graph card's last line: ${JSON.stringify(cards)} (PD-MONITOR-009 clause 6)`);
  expect(!cards.gone.root && !cards.gone.subtitle && !cards.gone.settingsCard && !cards.gone.depth && cards.gone.selects === 0 && !cards.gone.treeCard, `a retired surface is still drawn: ${JSON.stringify(cards.gone)} (PD-MONITOR-009, PD-SHELL-015)`);
  const runRow = probesAt(r.log, 6000, '[data-testid="mission-run-row"]')?.[0]?.text ?? '';
  expect(/Run · orchestrator/.test(runRow), `the run row: "${runRow}"`);
  const rows6 = probesAt(r.log, 6000, '.agent-table__row') ?? [];
  expect(rows6.length === 3, `the table had ${rows6.length} rows at 6 s`);
  const states6 = probesAt(r.log, 6000, '.agent-table__state-text')?.map((p) => p.text) ?? [];
  // Each child keeps its own place in the scripted client's step list (run-host/scripted-client.ts), so every child holds
  // its own 14 s wait and all three are still running at 6 s. A row settled this early means the children took each
  // other's steps again (docs/archive/defects/the-scripted-clients-wait-prefix-is-spliced-out-of-the-list-every-child-shares.md).
  expect(states6.length === 3 && states6.every((t) => t === 'running'), `state text at 6 s: ${JSON.stringify(states6)}`);
  const tree6 = probesAt(r.log, 6000, '.mission__run-row + .agent-tree .agent-row') ?? [];
  expect(tree6.length === 3, `the tree under the run row had ${tree6.length} rows`);
  const e6 = (probesAt(r.log, 6000, '[data-testid="agent-elapsed"]') ?? []).map((p) => seconds(p.text));
  const e75 = (probesAt(r.log, 7500, '[data-testid="agent-elapsed"]') ?? []).map((p) => seconds(p.text));
  // Every row is live at 6 s, so every row's elapsed advances. No row settles inside these probes any more; an ended
  // agent's fixed figure is pinned by packages/ui/src/agent-clock.test.ts.
  expect(e6.length === 3 && e75.length === 3 && e6.every((v, i) => v !== null && e75[i] !== null && e75[i] > v), `elapsed did not advance for the live rows: ${JSON.stringify(e6)} → ${JSON.stringify(e75)} at ${JSON.stringify(states6)} (REQ-MONITOR-107)`);
  const endRows = endProbe(r.log, '.agent-table__row') ?? [];
  expect(endRows.length === 3 && endRows.every((p) => p.data['data-state'] === 'done'), `after the run the rows read ${JSON.stringify(endRows.map((p) => p.data['data-state']))}`);
  expect(endProbe(r.log, '.app-shell')?.[0]?.data?.['data-view'] === 'overview', 'the capture was not on the Overview');
  expect(unexpected(r.errors).length === 0, `renderer errors: ${unexpected(r.errors).join(' | ')}`);
  results.painted = { replicaDeclines: replicaRunStartDeclines(r.errors), header: subtitle, cards, runRow, statesAt6s: states6, elapsedAt6s: e6, elapsedAt7_5s: e75, finalStates: endRows.map((p) => p.data['data-state']), png: join(output, 'mission.png') };
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
    ROTARIS_CAPTURE_VIEWS: 'overview@3500',
    ROTARIS_CAPTURE_PROBE_AT: '.agent-table__state-text@6000;;[data-testid="agent-elapsed"]@6000;;[data-testid="agent-elapsed"]@7500;;.mission__run-row + .agent-tree .agent-row__meta@6000;;.mission__run-row + .agent-tree .agent-row__meta@7500',
    ROTARIS_CAPTURE_PNG_AT: `${join(output, 'mission-waiting.png')}@7000`,
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '120000', ROTARIS_CAPTURE_AFTER_MS: '1000',
  });
  // PD-MONITOR-009: the table and the tree read here are the Overview's two cards (the Mission view's, until 2026-11-11).
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
  expect(unexpected(r.errors).length === 0, `renderer errors: ${unexpected(r.errors).join(' | ')}`);
  results.waiting = { replicaDeclines: replicaRunStartDeclines(r.errors), statesAt6s: states6, elapsedAt6s: cells6, elapsedAt7_5s: cells75, treeMetaAt6s: meta6, treeMetaAt7_5s: meta75, png: join(output, 'mission-waiting.png') };
}

// 1c. OQ-213 as ruled (R-072), REQ-ORCH-029's todo clause in the built app: a scripted coordinator that delegates twice
// before writing a todo list of its own has its second delegation refused at the gate — `blocked`, `todo_list_owed`, no child
// spawned for it, no `tool_error` issue — then writes its list and repeats the call, which runs. Before the repair both
// delegations ran with no plan behind them (live-run finding K2).
const s1c = scenario('todo-list-owed');
{
  const r = await launch('todo-list-owed', s1c, {
    ROTARIS_SCRIPT: 'delegate:coding-agent:alpha,delegate:coding-agent:beta,plan:1,delegate:coding-agent:beta,done,answer', ROTARIS_CHILD_SCRIPT: 'answer',
    ROTARIS_CAPTURE_PROMPT: 'delegate twice', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1000',
  });
  const db = open(s1c);
  const row = session(db);
  const kids = children(db, row.session_id);
  const calls = db.prepare("SELECT ordinal, tool_name, status, entry FROM tool_calls WHERE session_id = ? AND agent_name = 'orchestrator' ORDER BY ordinal").all(row.session_id)
    .map((c) => ({ tool: c.tool_name, status: c.status, failureKind: JSON.parse(c.entry).failure_kind ?? null }));
  const toolErrors = db.prepare("SELECT COUNT(*) AS n FROM issues WHERE session_id = ? AND kind = 'tool_error'").get(row.session_id).n;
  const stored = JSON.parse(db.prepare('SELECT todo FROM sessions WHERE session_id = ?').get(row.session_id).todo);
  db.close();
  expect(row.execution_status === 'completed', `the run ended ${row.execution_status} (${row.stop_reason})`);
  const shape = calls.map((c) => `${c.tool}:${c.status}${c.failureKind ? `:${c.failureKind}` : ''}`);
  expect(JSON.stringify(shape) === JSON.stringify(['delegate:ok', 'delegate:blocked:todo_list_owed', 'todo:ok', 'delegate:ok', 'todo:ok']), `the coordinator's calls: ${JSON.stringify(shape)}`);
  expect(kids.length === 2 && kids.map((k) => k.canonical_name).join(',') === 'alpha,beta', `the ledger holds ${JSON.stringify(kids.map((k) => k.canonical_name))}`);
  expect(toolErrors === 0, `the refusal filed ${toolErrors} tool_error issue(s)`);
  expect(stored.schema_version === 2 && stored.agent?.phases?.[0]?.tasks?.length === 1, `the stored todo carries no agent plan: ${JSON.stringify(stored).slice(0, 200)}`);
  const warned = /began the task's second work item with no todo list of its own; the call was refused \(REQ-ORCH-029\)/.test(r.log);
  expect(warned, 'the refusal was not logged as a warning citing REQ-ORCH-029 (see todo-list-owed.log)');
  results.todoListOwed = { calls: shape, children: kids.map((k) => k.canonical_name), toolErrors, warningInLog: warned };
}

// 1d. PD-CONFIG-003 revision 3 (OQ-234, the R-072 consortium's CN1; the repair of
// docs/archive/defects/a-child-cut-off-at-its-per-agent-timeout-reads-only-failed.md): a child its per-agent timeout stops says
// so where its failure shows. The limit is set to 3 s (`runtime.child_timeout`), so the seconds form is what is read here;
// the minutes forms are pinned by packages/ui/src/agent-timeout.test.ts. Launch A: a child that completed a call (making
// progress) — selected in the Workspace sidebar, the inspector's line under its unchanged meta line, the tree row's tag on a
// line of its own (the persona keeps its width), the persona window's line under its state; then the Overview's table and
// tree (PD-MONITOR-009: the two cards; Mission's, until 2026-11-11).
// Launch B: a child that made no call — the table's tag titled with the line, no "while making progress", the card not
// scrolled sideways. Before the repair every one of these read `failed` and nothing else.
const TIMEOUT_LINE = (progress) => `Cut off at its per-agent timeout of 3 seconds${progress ? ' while making progress' : ''}. Settings › Runtime › Per-agent timeout sets this limit for runs started from now.`;
const s1d = scenario('timed-out', ['  child_timeout: 3']);
{
  const box = 'const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };';
  const geometry = `(() => { ${box} const row = document.querySelector('.agent-row'); const line = document.querySelector('[data-testid="inspector-timeout"]'); const path = line?.querySelector('.agent-timeout__path'); const lh = parseFloat(getComputedStyle(path).lineHeight) || 0; return { kind: 'workspace', treeRow: box(row), treeMain: box(row?.querySelector('.agent-row__main')), treePersona: box(row?.querySelector('.agent-row__persona')), treeMeta: box(row?.querySelector('.agent-row__meta')), treeMetaClass: row?.querySelector('.agent-row__meta')?.className ?? null, tag: box(row?.querySelector('[data-testid="agent-timed-out"]')), personaLineHeight: parseFloat(getComputedStyle(row.querySelector('.agent-row__persona')).lineHeight) || 0, meta: document.querySelector('[data-testid="inspector-meta"]')?.textContent ?? null, metaThenLine: document.querySelector('[data-testid="inspector-meta"]')?.nextElementSibling === line, line: line?.textContent ?? null, lineBox: box(line), pathBox: box(path), pathLineHeight: lh, inspectorScroll: (() => { const b = document.querySelector('.inspector__body'); return b ? [b.scrollWidth, b.clientWidth] : null; })() }; })()`;
  // The end probes carry `data-*` attributes only, so the tags' class and title are read by an evaluation once the Overview's cards show them.
  const missionTags = `(() => { const read = (el) => el ? { text: el.textContent, className: el.className, title: el.getAttribute('title'), description: el.getAttribute('aria-description') } : null; return { kind: 'mission-tags', table: read(document.querySelector('.agent-table__row [data-testid="agent-timed-out"]')), tree: read(document.querySelector('.mission__run-row + .agent-tree [data-testid="agent-timed-out"]')), state: document.querySelector('.agent-table__state-text')?.textContent ?? null }; })()`;
  const r = await launch('timed-out', s1d, {
    ROTARIS_SCRIPT: 'delegate:coding-agent:alpha,answer', ROTARIS_CHILD_SCRIPT: 'read,wait:6000,answer', ROTARIS_CAPTURE_PROMPT: 'delegate one long job',
    ROTARIS_CAPTURE_CLICKS: '.agent-row@~20000;;.inspector:has([data-testid="inspector-timeout"]) .inspector__actions .btn>>Pop out@~45000',
    ROTARIS_CAPTURE_EVAL_AT: `${geometry}>>[data-testid="inspector-timeout"]@~45000;;${missionTags}>>.agent-table__row [data-testid="agent-timed-out"]@~70000`,
    ROTARIS_CAPTURE_PNG_WHEN: '[data-testid="inspector-timeout"]', ROTARIS_CAPTURE_PNG_AT: `${join(output, 'timed-out-workspace.png')}@~45000`,
    ROTARIS_CAPTURE_PERSONA_PROBE_AT: '[data-testid="persona-timeout"]@~50000;;[data-testid="persona-agent-state"]@~50000',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '8000', ROTARIS_CAPTURE_END_VIEW: 'overview', ROTARIS_CAPTURE_END_VIEW_MS: '3000',
    ROTARIS_CAPTURE_PROBE: '.agent-table__row [data-testid="agent-timed-out"];;.agent-table__state-text;;.mission__run-row + .agent-tree [data-testid="agent-timed-out"]',
  });
  const db = open(s1d); const row = session(db); const kids = children(db, row.session_id);
  const report = JSON.parse(db.prepare('SELECT report FROM children WHERE session_id = ?').get(row.session_id).report);
  db.close();
  expect(row.execution_status === 'completed' && kids.length === 1 && kids[0].state === 'failed', `the run ended ${row.execution_status} with ${JSON.stringify(kids.map((k) => k.state))}`);
  expect(report.errors.some((e) => e.type === 'timeout' && e.message === 'Child timed out after 3s') && typeof report.cut_off?.statement === 'string', `the stored report: ${JSON.stringify({ errors: report.errors, cut_off: report.cut_off })}`);
  const g = evalsOf(r.log).find((e) => e.kind === 'workspace');
  expect(g, 'no geometry reading in the Workspace (see timed-out.log)');
  expect(g.meta === 'failed · ' + g.meta.split(' · ')[1] + ' · 1 tool call' && g.metaThenLine, `the inspector's meta line "${g.meta}" or its order (REQ-MONITOR-052's form)`);
  expect(g.line === TIMEOUT_LINE(true), `the inspector's line: "${g.line}"`);
  expect(g.pathBox && g.pathBox.h <= Math.ceil(g.pathLineHeight) + 1, `the control's path wrapped: ${JSON.stringify(g.pathBox)} at line height ${g.pathLineHeight}`);
  expect(g.inspectorScroll && g.inspectorScroll[0] <= g.inspectorScroll[1], `the inspector scrolls sideways: ${JSON.stringify(g.inspectorScroll)}`);
  expect(g.tag && /agent-row__meta--stacked/.test(g.treeMetaClass ?? '') && g.treePersona.h <= Math.ceil(g.personaLineHeight) + 1, `the sidebar row: persona ${JSON.stringify(g.treePersona)} at line height ${g.personaLineHeight}, main ${JSON.stringify(g.treeMain)}, meta ${g.treeMetaClass} (the tag squeezed the persona onto two lines)`);
  const persona = personaProbesAt(r.log, '~50000', '[data-testid="persona-timeout"]')?.[0]?.text ?? null;
  const personaState = personaProbesAt(r.log, '~50000', '[data-testid="persona-agent-state"]')?.[0]?.text ?? null;
  expect(persona === TIMEOUT_LINE(true) && personaState === 'failed', `the persona window: state "${personaState}", line "${persona}"`);
  const tags = evalsOf(r.log).find((e) => e.kind === 'mission-tags');
  expect(tags, 'no reading of the tags on the Overview\'s two cards (see timed-out.log)');
  const tableTag = tags.table; const treeTag = tags.tree;
  expect(tableTag?.text === 'timed out' && /\btag-fail\b/.test(tableTag.className) && tableTag.title === TIMEOUT_LINE(true) && tableTag.description === TIMEOUT_LINE(true), `the agent table's tag: ${JSON.stringify(tableTag)}`);
  expect(treeTag?.text === 'timed out' && /\btag-fail\b/.test(treeTag.className) && treeTag.title === TIMEOUT_LINE(true), `the graph card's tree tag: ${JSON.stringify(treeTag)}`);
  expect(tags.state === 'failed' && endProbe(r.log, '.agent-table__state-text')?.[0]?.text === 'failed', 'the table row no longer reads failed');
  expect(unexpected(r.errors).length === 0, `renderer errors: ${unexpected(r.errors).join(' | ')}`);
  results.timedOut = { replicaDeclines: replicaRunStartDeclines(r.errors), report: { error: 'Child timed out after 3s', cutOff: true }, workspace: g, personaWindow: { state: personaState, line: persona }, missionTable: tableTag.title, missionTree: treeTag.title, png: [join(output, 'timed-out-workspace.png'), r.png] };

  const tableGeometry = `(() => { const tbl = document.querySelector('.agent-table'); const row = tbl.querySelector('.agent-table__row'); const card = tbl.parentElement; return { kind: 'mission', title: row.querySelector('[data-testid="agent-timed-out"]').getAttribute('title'), cells: [...row.children].map((c) => Math.round(c.getBoundingClientRect().width)), rowHeight: Math.round(row.getBoundingClientRect().height), cardScroll: [card.scrollWidth, card.clientWidth], tagOwnLine: (() => { const t = row.querySelector('[data-testid="agent-timed-out"]').getBoundingClientRect(); const s = row.querySelector('.agent-table__state-text').getBoundingClientRect(); return t.top >= s.bottom - 1; })() }; })()`;
  const r2 = await launch('timed-out-idle', s1d, {
    ROTARIS_SCRIPT: 'delegate:coding-agent:alpha,answer', ROTARIS_CHILD_SCRIPT: 'wait:6000,answer', ROTARIS_CAPTURE_PROMPT: 'delegate one idle job',
    ROTARIS_CAPTURE_VIEWS: 'overview@3500',
    ROTARIS_CAPTURE_EVAL_AT: `${tableGeometry}>>.agent-table__row [data-testid="agent-timed-out"]@~45000`,
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500',
  });
  const t = evalsOf(r2.log).find((e) => e.kind === 'mission');
  expect(t && t.cardScroll[0] <= t.cardScroll[1] && t.tagOwnLine, `the agent table with the tag: ${JSON.stringify(t)} (the card scrolled sideways, or the tag sat beside the state)`);
  expect(t.title === TIMEOUT_LINE(false), `the idle child's tag title: "${t.title}"`);
  expect(unexpected(r2.errors).length === 0, `renderer errors: ${unexpected(r2.errors).join(' | ')}`);
  results.timedOutIdle = { table: t, png: r2.png };
}

// 1e. PD-TOOLS-006 revision 6 (OQ-220, ruled 2026-10-07 under R-072), REQ-ORCH-028/029's per-item ownership in the built app: the
// scripted coordinator writes two open items and delegates `alpha` for the first. `beta` names the same item while alpha runs
// and is refused, naming alpha; `gamma` names no item although the coordinator keeps a list, and is refused with the open
// items listed; `delta` names the next open item and runs. Each child's record holds the item it served; no refusal spawns a
// child; each is logged as a warning citing its requirement. Before the ruling a delegation named no item, and nothing refused
// a second implementation delegation for one. Since PD-TOOLS-008 revision 3 (OQ-255) the coordinator waits for both children to
// end and closes its plan as a model usually does, with one `replace` sending every item COMPLETED (`donereplace`): the items the
// run marked close, the `replace` names nothing it kept, and the run completes with no PD-ORCH-015 correction. Until then such a
// `replace` left both items IN_PROGRESS, and `done` closed them with one `update` each instead.
const s1e = scenario('todo-item');
{
  const r = await launch('todo-item', s1e, {
    ROTARIS_SCRIPT: 'plan:2,delegate:coding-agent:alpha,delegate:coding-agent:beta,delegate:coding-agent:gamma,delegate:coding-agent:delta,wait:16000,donereplace,answer', ROTARIS_CHILD_SCRIPT: 'wait:6000,answer',
    ROTARIS_SCRIPT_DELEGATE_ARGS: JSON.stringify({ beta: { todo_item: '@1' }, gamma: { todo_item: null } }),
    ROTARIS_CAPTURE_PROMPT: 'delegate two items', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1000',
  });
  const db = open(s1e);
  const row = session(db);
  const kids = db.prepare('SELECT canonical_name, todo_item FROM children WHERE session_id = ? ORDER BY spawned_at').all(row.session_id);
  const delegates = db.prepare("SELECT status, entry FROM tool_calls WHERE session_id = ? AND agent_name = 'orchestrator' AND tool_name = 'delegate' ORDER BY ordinal").all(row.session_id)
    .map((c) => ({ status: c.status, result: String(JSON.parse(c.entry).result ?? '') }));
  const stored = JSON.parse(db.prepare('SELECT todo FROM sessions WHERE session_id = ?').get(row.session_id).todo);
  const todoCalls = db.prepare("SELECT status, started_at, entry FROM tool_calls WHERE session_id = ? AND agent_name = 'orchestrator' AND tool_name = 'todo' ORDER BY ordinal").all(row.session_id)
    .map((c) => ({ status: c.status, startedAt: c.started_at, op: JSON.parse(c.entry).args?.operation, result: String(JSON.parse(c.entry).result ?? '') }));
  const ended = db.prepare('SELECT canonical_name, completed_at FROM children WHERE session_id = ? AND completed_at IS NOT NULL').all(row.session_id);
  const iterations = db.prepare('SELECT COUNT(*) AS n FROM iterations WHERE session_id = ?').get(row.session_id).n;
  db.close();
  const items = (stored.agent?.phases ?? []).flatMap((p) => p.tasks.map((t) => t.id));
  expect(row.execution_status === 'completed', `the run ended ${row.execution_status} (${row.stop_reason})`);
  expect(items.length === 2, `the stored plan holds ${items.length} items`);
  expect(JSON.stringify(kids) === JSON.stringify([{ canonical_name: 'alpha', todo_item: items[0] }, { canonical_name: 'delta', todo_item: items[1] }]), `the ledger holds ${JSON.stringify(kids)} for items ${JSON.stringify(items)}`);
  const [alpha, beta, gamma, delta] = delegates;
  expect(delegates.length === 4, `the coordinator made ${delegates.length} delegate calls`);
  expect(/^Task 'alpha': queued/.test(alpha.result) && /^Task 'delta': queued/.test(delta.result), `the named delegations: ${alpha.result.slice(0, 80)} / ${delta.result.slice(0, 80)}`);
  expect(new RegExp(`^Task 'beta': rejected — todo_item '${items[0]}' \\('Scripted item 1'\\) is held by alpha \\(coding-agent, task_id bg_[0-9a-f]{8}, state \\w+\\)`).test(beta.result), `beta's refusal: ${beta.result}`);
  // Since fin38 (live-run finding Q3) the refusal also names the add beside the listed items, for work none of them is.
  expect(gamma.result.startsWith("Task 'gamma': rejected — This delegation names no todo item") && gamma.result.includes(`Scripted item 1 (${items[0]}), Scripted item 2 (${items[1]}). If none of them is this work, add one with the todo tool (add_task) and name its id.`), `gamma's refusal: ${gamma.result}`);
  // PD-TOOLS-006 revision 7 and PD-TOOLS-008 revision 2 (OQ-249): each admitted delegation marked its PENDING item IN_PROGRESS,
  // alpha's and delta's side by side while both ran. PD-TOOLS-008 revision 3 (OQ-255): once both children had ended, one
  // `replace` sending every item COMPLETED closed both, named nothing kept, and the run took no plan correction.
  expect(alpha.result.includes(`Todo item Scripted item 1 (${items[0]}) is now IN_PROGRESS.`) && delta.result.includes(`Todo item Scripted item 2 (${items[1]}) is now IN_PROGRESS.`), `the marks: ${alpha.result.slice(0, 200)} / ${delta.result.slice(0, 200)}`);
  expect(/\[IN_PROGRESS\] Scripted item 1 .*\n {2}\[IN_PROGRESS\] Scripted item 2 /s.test(delta.result), `delta's Todo state shows both items active: ${delta.result}`);
  expect(todoCalls.length === 2 && todoCalls.every((c) => c.status === 'ok' && c.op === 'replace'), `the coordinator's todo calls: ${JSON.stringify(todoCalls.map((c) => ({ status: c.status, op: c.op })))}`);
  // fin37's review: the count alone is read after the run ended; each child's completion stamped no later than the closing
  // `replace` started says directly that both had ended before the close (instants compared as times, not as text).
  const closeAt = Date.parse(todoCalls[1]?.startedAt ?? '');
  expect(ended.length === 2 && Number.isFinite(closeAt) && ended.every((c) => Date.parse(c.completed_at) <= closeAt), `the children ended before the close at ${todoCalls[1]?.startedAt}: ${JSON.stringify(ended)}`);
  const close = todoCalls[1]?.result ?? '';
  expect(/^Replaced the todo list: 1 phase, 2 tasks\.\n/.test(close) && !close.includes('Kept as they were') && /\[COMPLETED\] Scripted item 1 .*\n {2}\[COMPLETED\] Scripted item 2 /s.test(close), `the closing replace answered: ${close}`);
  expect((stored.agent?.phases ?? []).every((p) => p.tasks.every((t) => t.state === 'COMPLETED')), `the stored plan ends ${JSON.stringify(stored.agent)}`);
  const corrected = /a correction is sent into its conversation/.test(r.log);
  expect(!corrected && iterations === 1, `the run took a plan correction (${corrected}) or a second iteration (${iterations} iteration(s); see todo-item.log)`);
  const warned028 = /was refused for its todo item \(REQ-ORCH-028\)/.test(r.log);
  const warned029 = /was refused for its todo item \(REQ-ORCH-029\)/.test(r.log);
  expect(warned028 && warned029, `the refusals were not logged as warnings citing REQ-ORCH-028 and REQ-ORCH-029 (see todo-item.log): ${warned028} ${warned029}`);
  results.todoItem = { items, children: kids, refusals: { beta: beta.result.slice(0, 240), gamma: gamma.result.slice(0, 240) }, warnings: { 'REQ-ORCH-028': warned028, 'REQ-ORCH-029': warned029 }, marked: { alpha: alpha.result.split('\n')[0], delta: delta.result.split('\n')[0] }, todoCalls: todoCalls.map((c) => ({ status: c.status, op: c.op })), close: close.split('\n')[0], corrected, iterations };
}

// 1f. REQ-ORCH-089's stalled tag in the narrow rows (the repair of
// docs/archive/defects/the-stalled-tag-beside-a-tree-rows-state-can-squeeze-the-persona-onto-two-lines.md, fin35): the
// timed-out tag of 1d took its own line because beside the state it squeezed the sidebar row's persona onto two lines and
// scrolled the Mission card sideways; the stalled tag sat in the same nowrap label and the same cell. A child that reads
// once and then holds its next call silent for 25 s with `child_stall_timeout: 3` is stalled for about 20 s: its sidebar row
// is read while the tag shows, then the agent table's row — on the Overview's table card since PD-MONITOR-009 — whose
// persona cell must read on one line (fin36).
const s1f = scenario('stalled', ['  child_stall_timeout: 3']);
{
  const box = 'const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) }; };';
  const sidebar = `(() => { ${box} const tag = document.querySelector('.agent-row [data-testid="agent-stalled"]'); const row = tag?.closest('.agent-row'); const persona = row?.querySelector('.agent-row__persona'); return { kind: 'stalled-sidebar', window: [innerWidth, innerHeight], tagText: tag?.textContent ?? null, tagClass: tag?.className ?? null, treeRow: box(row), treeMain: box(row?.querySelector('.agent-row__main')), treePersona: box(persona), personaLineHeight: persona ? parseFloat(getComputedStyle(persona).lineHeight) || 0 : 0, treeMeta: box(row?.querySelector('.agent-row__meta')), treeMetaClass: row?.querySelector('.agent-row__meta')?.className ?? null, tag: box(tag) }; })()`;
  const table = `(() => { ${box} const row = [...document.querySelectorAll('.agent-table__row')].find((r) => r.querySelector('[data-testid="agent-stalled"]')); if (!row) return { kind: 'stalled-mission', row: null }; const card = row.closest('.agent-table').parentElement; const tag = row.querySelector('[data-testid="agent-stalled"]'); const state = row.querySelector('.agent-table__state-text'); return { kind: 'stalled-mission', tagText: tag.textContent, cells: [...row.children].map((c) => Math.round(c.getBoundingClientRect().width)), rowHeight: Math.round(row.getBoundingClientRect().height), cardScroll: [card.scrollWidth, card.clientWidth], tag: box(tag), state: box(state), tagOwnLine: tag.getBoundingClientRect().top >= state.getBoundingClientRect().bottom - 1, persona: (() => { const p = row.querySelector('.agent-table__persona'); const range = document.createRange(); range.selectNodeContents(p); return { text: p.textContent, w: Math.round(p.getBoundingClientRect().width), lines: new Set([...range.getClientRects()].map((rc) => Math.round(rc.top))).size }; })() }; })()`;
  const r = await launch('stalled', s1f, {
    ROTARIS_SCRIPT: 'delegate:coding-agent:alpha,answer', ROTARIS_CHILD_SCRIPT: 'read,wait:25000,answer', ROTARIS_CAPTURE_PROMPT: 'delegate one quiet job',
    ROTARIS_CAPTURE_EVAL_AT: `${sidebar}>>.agent-row [data-testid="agent-stalled"]@~20000;;${table}>>.agent-table__row [data-testid="agent-stalled"]@~30000`,
    ROTARIS_CAPTURE_PNG_WHEN: '.agent-row [data-testid="agent-stalled"]', ROTARIS_CAPTURE_PNG_AT: `${join(output, 'stalled-workspace.png')}@~20000;;${join(output, 'stalled-overview.png')}@19000`,
    ROTARIS_CAPTURE_VIEWS: 'overview@17000',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500',
  });
  const g = evalsOf(r.log).find((e) => e.kind === 'stalled-sidebar');
  expect(g && /^stalled\u00a0\d+s$/.test(g.tagText ?? '') && /\btag-wait\b/.test(g.tagClass ?? ''), `no stalled tag read in the Workspace sidebar: ${JSON.stringify(g)} (see stalled.log)`);
  expect(g.treePersona && g.treePersona.h <= Math.ceil(g.personaLineHeight) + 1, `the sidebar row: persona ${JSON.stringify(g.treePersona)} at line height ${g.personaLineHeight}, main ${JSON.stringify(g.treeMain)}, meta ${JSON.stringify(g.treeMeta)} ${g.treeMetaClass} (the stalled tag squeezed the persona onto two lines)`);
  const t = evalsOf(r.log).find((e) => e.kind === 'stalled-mission');
  expect(t && t.tagText && t.cardScroll[0] <= t.cardScroll[1] && t.tagOwnLine, `the agent table with the stalled tag: ${JSON.stringify(t)} (the card scrolled sideways, or the tag sat beside the state)`);
  // The persona cell on one line (docs/archive/defects/the-mission-tables-persona-cell-breaks-a-hyphenated-persona-over-two-lines.md):
  // before the repair "coding-agent" read "coding-" over "agent" in a 65 to 71 px column.
  expect(t.persona?.text === 'coding-agent' && t.persona.lines === 1, `the agent table's persona cell: ${JSON.stringify(t.persona)} (the persona broke over two lines)`);
  expect(unexpected(r.errors).length === 0, `renderer errors: ${unexpected(r.errors).join(' | ')}`);
  results.stalled = { sidebar: g, table: t, png: [join(output, 'stalled-workspace.png'), join(output, 'stalled-overview.png'), r.png] };
}

// 2. Parity across the two trees, then the 23-agent refresh with the Overview visible. PD-MONITOR-009 (2026-11-11): the
// trees are two — the Overview's graph card and the Workspace sidebar — where they were three (the Mission tree, the
// Overview's read-only tree card and the sidebar); the graph card is the one tree the Overview draws.
const s2 = scenario('parity');
{
  const r = await launch('parity', s2, {
    ROTARIS_SCRIPT: THREE, ROTARIS_CHILD_SCRIPT: 'wait:14000,read,answer', ROTARIS_CAPTURE_PROMPT: 'two trees',
    // Probed while all three children are still inside their own 14 s wait, so the states are steady across the two views (a state change between probes is not a parity fault).
    ROTARIS_CAPTURE_VIEWS: 'overview@7000;;workspace@9000',
    ROTARIS_CAPTURE_PROBE_AT: '.agent-row@7500;;[data-testid="mission-graph"] .agent-row@7500;;.app-shell@7500;;.agent-row@9500;;.app-shell@9500',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1000',
  });
  const trees = [7500, 9500].map((at) => ({ view: probesAt(r.log, at, '.app-shell')?.[0]?.data?.['data-view'], rows: (probesAt(r.log, at, '.agent-row') ?? []).map((p) => `${p.data['data-task-id']}:${p.data['data-state']}`) }));
  expect(trees[0].view === 'overview' && trees[1].view === 'workspace', `the views probed: ${JSON.stringify(trees.map((t) => t.view))}`);
  // The Overview draws ONE tree, the graph card's: every tree row on the view is inside that card (the old tree card is gone).
  const inGraph = (probesAt(r.log, 7500, '[data-testid="mission-graph"] .agent-row') ?? []).map((p) => `${p.data['data-task-id']}:${p.data['data-state']}`);
  expect(JSON.stringify(inGraph) === JSON.stringify(trees[0].rows), `the Overview draws tree rows outside its graph card: ${JSON.stringify({ all: trees[0].rows, inGraph })} (PD-MONITOR-009)`);
  expect(trees[0].rows.length === 3 && JSON.stringify(trees[0].rows) === JSON.stringify(trees[1].rows), `the two trees differ: ${JSON.stringify(trees)} (REQ-MONITOR-038, PD-MONITOR-009)`);
  results.parity = { views: trees.map((t) => t.view), rows: trees[0].rows };
  // 2b. Twenty more agents on the record, the session re-opened with the Overview already visible: one publication, the apply-to-paint time.
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
    // Opening a stored session lands on the Workspace; the Overview is opened after it, and one whole read is asked for while it is visible.
    // PD-MONITOR-009: the refresh figures are the table card's attributes (the Mission view root's, until 2026-11-11).
    ROTARIS_CAPTURE_RESUME: 'latest', ROTARIS_CAPTURE_VIEWS: 'overview@2600', ROTARIS_CAPTURE_RECONCILE_AT: '3200',
    ROTARIS_CAPTURE_PROBE_AT: '[data-testid="mission-table"]@4000;;.agent-table__row@4000',
    ROTARIS_CAPTURE_AFTER_MS: '4000', ROTARIS_CAPTURE_END_VIEW: 'overview', ROTARIS_CAPTURE_END_VIEW_MS: '500', ROTARIS_CAPTURE_PROBE: '[data-testid="mission-table"];;.agent-table__row',
  });
  const mission = probesAt(r2.log, 4000, '[data-testid="mission-table"]')?.[0]?.data ?? {};
  const rows20 = probesAt(r2.log, 4000, '.agent-table__row') ?? [];
  expect(rows20.length === 23, `the table held ${rows20.length} rows, not 23`);
  const refreshMs = Number(mission['data-refresh-ms']);
  expect(Number(mission['data-refresh-agents']) === 23 && Number.isFinite(refreshMs), `the refresh figure was not recorded for the 23-agent publication: ${JSON.stringify(mission)}`);
  expect(refreshMs < 250, `a 23-agent refresh took ${refreshMs} ms, over the 250 ms budget (REQ-MONITOR-038)`);
  results.parity20 = { agents: Number(mission['data-refresh-agents']), refreshMs, rows: rows20.length };

  // 2c. PD-MONITOR-009 clause 3: the table's two forms, on that 23-agent record. At 1440×900 a row is one line of a table; at
  // REQ-SHELL-022's minimum, 1000×680, the table's card is narrower than 40rem and each row is a three-line grid that keeps
  // every value. The card's own width decides the form, so it is read beside the row rather than assumed from the window's.
  // `lines` counts the bands the first row's cells stand in: a cell starts a new band where its top is at or under the
  // bottom of every cell before it, so cells aligned on a baseline inside one band are one line.
  const tableForm = (kind) => `(() => { const card = document.querySelector('[data-testid="mission-table"]'); const rows = [...document.querySelectorAll('.agent-table__row')]; const row = rows[0]; if (!card || !row) return { kind: ${JSON.stringify(kind)}, row: null }; const rem = parseFloat(getComputedStyle(document.documentElement).fontSize); const boxes = [...row.children].map((c) => c.getBoundingClientRect()).sort((a, b) => a.top - b.top); let lines = 0; let bottom = -Infinity; for (const b of boxes) { if (b.top >= bottom - 1) { lines += 1; bottom = b.bottom; } else bottom = Math.max(bottom, b.bottom); } return { kind: ${JSON.stringify(kind)}, window: [innerWidth, innerHeight], cardWidthRem: Math.round((card.clientWidth / rem) * 10) / 10, cardScroll: [card.scrollWidth, card.clientWidth], rows: rows.length, displays: [...new Set(rows.map((r) => getComputedStyle(r).display))], lines, roles: [row.getAttribute('role'), ...new Set([...row.children].map((c) => c.getAttribute('role')))], values: rows.map((r) => [...r.children].filter((c) => !c.classList.contains('agent-table__actions')).map((c) => (c.textContent ?? '').trim())), shown: rows.every((r) => [...r.children].every((c) => { const b = c.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(c).visibility !== 'hidden'; })), actions: rows.every((r) => [...r.querySelectorAll('.agent-table__actions .btn')].map((b) => (b.textContent ?? '').trim()).join(',') === 'Open,Pop out') }; })()`;
  const r3 = await launch('table-forms', s2, {
    ROTARIS_CAPTURE_RESUME: 'latest', ROTARIS_CAPTURE_VIEWS: 'overview@2600',
    ROTARIS_CAPTURE_EVAL_AT: `${tableForm('table-wide')}@4000;;${tableForm('table-narrow')}@6000`,
    ROTARIS_CAPTURE_RESIZE: '1000x680@4600',
    ROTARIS_CAPTURE_PNG_AT: `${join(output, 'table-narrow.png')}@6200`,
    ROTARIS_CAPTURE_AFTER_MS: '7000',
  });
  const wide = evalsOf(r3.log).find((e) => e.kind === 'table-wide');
  const narrow = evalsOf(r3.log).find((e) => e.kind === 'table-narrow');
  expect(wide?.rows === 23 && narrow?.rows === 23, `the table's rows at the two sizes: ${wide?.rows} and ${narrow?.rows}, not 23 each (see table-forms.log)`);
  expect(wide.window[0] === 1440 && JSON.stringify(wide.displays) === JSON.stringify(['table-row']) && wide.lines === 1, `at ${wide.window.join('×')} the rows are not the one-line table: display ${JSON.stringify(wide.displays)}, ${wide.lines} line(s), card ${wide.cardWidthRem}rem (PD-MONITOR-009 clause 3)`);
  expect(narrow.window[0] === 1000 && narrow.cardWidthRem < 40, `at ${narrow.window.join('×')} the table's card is ${narrow.cardWidthRem}rem wide, not under the 40rem at which the rows give way`);
  expect(JSON.stringify(narrow.displays) === JSON.stringify(['grid']) && narrow.lines === 3, `in a card ${narrow.cardWidthRem}rem wide the rows are not the three-line grid: display ${JSON.stringify(narrow.displays)}, ${narrow.lines} line(s) (PD-MONITOR-009 clause 3)`);
  expect(JSON.stringify(narrow.values) === JSON.stringify(wide.values) && narrow.shown && narrow.actions, `the narrow rows dropped or changed a value: wide ${JSON.stringify(wide.values[0])}, narrow ${JSON.stringify(narrow.values[0])}, every cell drawn ${narrow.shown}, both controls ${narrow.actions} (PD-MONITOR-009 clause 3: every value kept)`);
  expect(narrow.cardScroll[0] <= narrow.cardScroll[1], `the narrow table's card scrolls sideways: ${JSON.stringify(narrow.cardScroll)}`);
  expect(JSON.stringify(narrow.roles) === JSON.stringify(['row', 'cell']), `the rows' roles in the grid form: ${JSON.stringify(narrow.roles)} (a grid costs a table its semantics unless each box carries its role)`);
  results.tableForms = { wide: { window: wide.window, cardWidthRem: wide.cardWidthRem, display: wide.displays, lines: wide.lines }, narrow: { window: narrow.window, cardWidthRem: narrow.cardWidthRem, display: narrow.displays, lines: narrow.lines, roles: narrow.roles }, valuesKept: true, png: join(output, 'table-narrow.png') };
}

// 3. Pause refused for a child, honoured for the run.
const s3 = scenario('pause');
{
  const r = await launch('pause', s3, {
    ROTARIS_SCRIPT: THREE, ROTARIS_CHILD_SCRIPT: 'wait:9000,answer', ROTARIS_CAPTURE_PROMPT: 'pause me',
    ROTARIS_CAPTURE_VIEWS: 'overview@3500',
    ROTARIS_CAPTURE_CLICKS: '.agent-table__row@5000;;[data-testid="mission-pause"]@5400;;[data-testid="mission-run-row"]@6200;;[data-testid="mission-pause"]@6600',
    ROTARIS_CAPTURE_PROBE_AT: `[data-testid="mission-pause"]@5800;;[data-testid="mission-message"]@5800;;[data-testid="mission-pause-reason"]@5800;;${HEADER}@5800;;[data-testid="mission-pause"]@6400;;[data-testid="mission-message"]@7200;;${HEADER}@7200`,
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1000',
    // The view stays mounted from the accepted pause until the session rests: what its Pause reads then (REQ-MONITOR-296).
    ROTARIS_CAPTURE_PROBE: `[data-testid="mission-pause"];;[data-testid="mission-pause-reason"];;${HEADER}`,
  });
  const db = open(s3); const row = session(db); const names = timeline(db, row.session_id).map((t) => t.name); db.close();
  const refused = probesAt(r.log, 5800, '[data-testid="mission-pause"]')?.[0]?.data?.['data-enabled'];
  const message = probesAt(r.log, 5800, '[data-testid="mission-message"]')?.[0]?.text ?? '';
  const reason = probesAt(r.log, 5800, '[data-testid="mission-pause-reason"]')?.[0]?.text ?? '';
  expect(refused === '0', `Pause was enabled with a child selected (data-enabled=${refused})`);
  expect(message === 'Pause applies to the whole run; select the run to pause it.' && reason === message, `the refusal text: message "${message}", reason "${reason}" (REQ-MONITOR-276)`);
  // The run's state from the Overview's header (PD-MONITOR-009; the Mission subtitle until 2026-11-11): REQ-SHELL-038's status
  // strip names no run state (its repair, 2026-10-02, dropped the `run …` item this read until then).
  const sub58 = probesAt(r.log, 5800, HEADER)?.[0]?.text ?? '';
  expect(headerStatus(sub58) === 'running', `the run was not still running after the refused pause: "${sub58}"`);
  const enabled = probesAt(r.log, 6400, '[data-testid="mission-pause"]')?.[0]?.data?.['data-enabled'];
  expect(enabled === '1', `Pause was not enabled with the run selected (data-enabled=${enabled})`);
  const accepted = probesAt(r.log, 7200, '[data-testid="mission-message"]')?.[0]?.text ?? '';
  const sub72 = probesAt(r.log, 7200, HEADER)?.[0]?.text ?? '';
  expect(/Pause accepted/.test(accepted), `the accepted pause's message: "${accepted}"`);
  expect(['pausing', 'paused'].includes(headerStatus(sub72)), `the Overview's header after the accepted pause: "${sub72}" (REQ-MONITOR-124)`);
  expect(row.execution_status === 'paused', `the session ended ${row.execution_status} (${row.stop_reason}), not paused`);
  // REQ-MONITOR-296 / REQ-NOTIFY-050: the accepted pause's pending mark belongs to the run that accepted it, so once the
  // session rests `paused` the still-mounted view's Pause reads `Pause` beside the header's `paused`, never `Pausing…`
  // (the note "the Mission view's pause reads pausing after the session rests"; the control is the graph card's now).
  const restPause = endProbe(r.log, '[data-testid="mission-pause"]')?.[0];
  const restSubtitle = endProbe(r.log, HEADER)?.[0]?.text ?? '';
  const restReason = endProbe(r.log, '[data-testid="mission-pause-reason"]')?.[0]?.text ?? '';
  expect(headerStatus(restSubtitle) === 'paused', `the Overview's header at rest: "${restSubtitle}"`);
  expect(restPause?.text === 'Pause' && restPause?.data?.['data-enabled'] === '0' && restReason === 'Pause is unavailable because no active run exists.', `the Pause control at rest read "${restPause?.text}" (data-enabled=${restPause?.data?.['data-enabled']}) beside "${restReason}" (REQ-MONITOR-296)`);
  results.pause = { pauseAtRest: restPause?.text ?? null, headerAtRest: restSubtitle, refusedMessage: message, headerAfterRefusal: sub58, headerAfterAccept: sub72, finalStatus: row.execution_status, timeline: names.filter((n) => /pause/.test(n)) };
}

// 4. Cancel a child with a live descendant: the confirmation names it and the cascade count; the child cancelled, the run on.
// A configured persona that may delegate (only the built-in orchestrator declares `delegate`, and the scripted client would read a second orchestrator as the root).
const s4 = scenario('cancel', ['personas:', '  lead:', '    name: lead', '    model: scripted', "    purpose: 'Delegates the work, then waits for it.'", "    system_prompt: 'You are a lead. Delegate the work, then wait for it.'", '    tools: [delegate, read_file, todo]']);
{
  const r = await launch('cancel', s4, {
    // Each child walks this list from its own first step (run-host/scripted-client.ts): alpha delegates `sub`, and its next call waits 16 s; sub's first step names `delegate`, which a coding-agent is not granted, so the client answers instead, and sub's next call waits 16 s — both are live when the cancel lands.
    ROTARIS_SCRIPT: 'delegate:lead:alpha,answer', ROTARIS_CHILD_SCRIPT: 'delegate:coding-agent:sub,wait:16000,answer,wait:16000,answer', ROTARIS_CAPTURE_PROMPT: 'cancel a child',
    ROTARIS_CAPTURE_VIEWS: 'overview@3500',
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
  // REQ-ORCH-098 (the repair of a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries): the cancel tears
  // alpha and each live descendant it cancelled down, once each, after its `child_user_cancelled` — their executions, which
  // return after the cancel, write no second teardown.
  const TEARDOWN = ['child_end', 'child_result', 'child_conversation_closed'];
  const ownEntries = (taskId) => names.filter((n) => { try { return JSON.parse(n.metadata).task_id === taskId; } catch { return false; } }).map((n) => n.name);
  const cancelledKids = kids.filter((k) => k.state === 'cancelled' && (k.task_id === alpha?.task_id || k.parent_id === alpha?.task_id));
  const teardowns = cancelledKids.map((k) => ({ child: k.canonical_name, entries: ownEntries(k.task_id).filter((n) => n === 'child_user_cancelled' || TEARDOWN.includes(n)) }));
  for (const t of teardowns) expect(JSON.stringify(t.entries) === JSON.stringify(['child_user_cancelled', ...TEARDOWN]), `${t.child}'s cancel and teardown entries: ${JSON.stringify(t.entries)} (REQ-ORCH-098: once each, after the cancel's own entry)`);
  results.cancel = { justAfterConfirm: justAfter, dialog, confirmLabel, alphaState: alpha?.state, descendants: kids.filter((k) => k.parent_id === alpha?.task_id).map((k) => `${k.canonical_name}:${k.state}`), rowsAfter: after9, runStatus: row.execution_status, cancelEntry: names.find((n) => n.name === 'child_user_cancelled')?.message ?? null, teardowns };
}

// 4b. Cancel the run from the Overview's graph card (PD-MONITOR-009; the Mission view until 2026-11-11; acceptance A35, REQ-MONITOR-127/130/296): the run row selected, "Cancel selection",
// confirmed. The session is shown `cancelling` from the confirmation — first by the window's own overlay, then, since OQ-165
// was ruled (2026-10-06), by the record itself, the engine saving `cancelling` when it accepts the explicit cancel and keeping
// it to the run's end (before the ruling its records read `running` until the run's end) — and no sample from the confirm to the run's end
// reads the run running, in the Overview's header or the run row (the status strip names no run state since 2026-10-02, REQ-SHELL-038). Before the repair only the Workspace set anything, and the Mission view read `Running` throughout.
const s4b = scenario('cancel-run', ['personas:', '  lead:', '    name: lead', '    model: scripted', "    purpose: 'Delegates the work, then waits for it.'", "    system_prompt: 'You are a lead. Delegate the work, then wait for it.'", '    tools: [delegate, read_file, todo]']);
{
  const SAMPLES = [8210, 8220, 8230, 8240, 8250, 8270, 8300, 8500, 9000, 10000];
  // One selector list, so each sample is ONE querySelectorAll — the dialog, the Overview's header and the run row read in
  // the same instant. The confirm click is an input event the renderer handles after the main process logs "clicked", and a
  // separate probe can run before it (seen 2026-10-01: the click and a probe reading `Running` logged in the same
  // millisecond, the next probe 6 ms later reading `Cancelling`). The dialog closes in the same commit that lays the
  // overlay (`confirmCancel`: `setConfirming(null)`, then `cancelRun`'s `beginRun`, in one handler), so a snapshot without
  // the dialog was read after the click was handled — on the base build as on the repair.
  const SNAPSHOT = `[data-testid="mission-confirm"], ${HEADER}, [data-testid="mission-run-row"]`;
  const r = await launch('cancel-run', s4b, {
    ROTARIS_SCRIPT: 'delegate:lead:alpha,answer', ROTARIS_CHILD_SCRIPT: 'delegate:coding-agent:sub,wait:16000,answer,wait:16000,answer', ROTARIS_CAPTURE_PROMPT: 'cancel the run',
    ROTARIS_CAPTURE_VIEWS: 'overview@3500',
    ROTARIS_CAPTURE_CLICKS: '[data-testid="mission-run-row"]@7000;;[data-testid="mission-cancel"]@7400;;.dialog-actions .btn-danger@8200',
    ROTARIS_CAPTURE_PROBE_AT: [`${HEADER}@6800`, '[data-testid="mission-confirm"]@7900', ...SAMPLES.map((at) => `${SNAPSHOT}@${at}`)].join(';;'),
    ROTARIS_CAPTURE_PNG_AT: `${join(output, 'cancel-run.png')}@8240`,
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '120000', ROTARIS_CAPTURE_AFTER_MS: '1000',
  }, { timeout: 200_000 });
  const db = open(s4b); const row = session(db); db.close();
  const before = probesAt(r.log, 6800, HEADER)?.[0]?.text ?? '';
  expect(headerStatus(before) === 'running', `the run was not running before the cancel: "${before}"`);
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
  const samples = snapshots.filter((x) => byTestId(x.snap, 'mission-confirm') === null).map(({ at, snap }) => ({ at, subtitle: byTestId(snap, 'overview-session'), runRow: byTestId(snap, 'mission-run-row') })).filter((x) => x.subtitle !== null);
  expect(samples.length >= 3, `fewer than three samples landed after the confirm was handled: ${JSON.stringify(samples)} (still showing the dialog: ${JSON.stringify(pending)})`);
  // The header's status is the presentation status in lower case (`headerStatus`); the run row still reads the label.
  const status = headerStatus;
  // REQ-MONITOR-127/130: from the confirmation on, the Overview never reads the run running again, in its header or in the
  // graph card's run row — each sample reads `cancelling` until the run's record at rest arrives (REQ-ORCH-082:
  // `user_cancelled` rests `paused`).
  const running = samples.filter((x) => status(x.subtitle) === 'running' || /Running$/.test(x.runRow ?? ''));
  expect(running.length === 0, `the Overview read the cancelled run running after the confirm: ${JSON.stringify(running)} (REQ-MONITOR-127, acceptance A35)`);
  // A sample that is not yet at rest is inside the cancel's window, so it reads `cancelling` and no other active status.
  const ACTIVE = ['running', 'waiting', 'starting', 'pausing', 'background'];
  const otherActive = samples.filter((x) => ACTIVE.includes(status(x.subtitle)));
  expect(otherActive.length === 0, `a sample after the confirm read an active status other than cancelling: ${JSON.stringify(otherActive)} (REQ-MONITOR-127)`);
  // Whether a sample lands inside the cancel's window depends on the host's timing: recorded, not asserted.
  const cancellingSamples = samples.filter((x) => status(x.subtitle) === 'cancelling').length;
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

// 4d. Cancel the run from the Workspace inspector (REQ-MONITOR-127/130/052, OQ-165's reading;
// docs/archive/defects/the-inspector-meta-line-reads-the-run-level-agent-running-while-the-run-is-cancelling.md): the inspector
// following the run-level agent, its Cancel confirmed as "Cancel the run?". The run header and the meta line are read in one
// snapshot: whenever the header reads `Cancelling…` the meta line reads `cancelling · …`. Before the repair the meta line read
// the agent vocabulary alone, `running · …`, beside the header's `Cancelling…` until the record at rest arrived.
const s4d = scenario('cancel-run-inspector');
{
  const SAMPLES = [6610, 6620, 6630, 6640, 6660, 6700, 6800, 7000, 8000, 9000];
  // One selector list per sample: the confirmation, the run header and the meta line read in the same instant (see 4b).
  const SNAPSHOT = '[data-testid="cancel-run-confirm"], [data-testid="run-state"], [data-testid="inspector-meta"]';
  const r = await launch('cancel-run-inspector', s4d, {
    ROTARIS_SCRIPT: 'delegate:coding-agent:alpha,answer', ROTARIS_CHILD_SCRIPT: 'wait:16000,answer', ROTARIS_CAPTURE_PROMPT: 'cancel the run from the inspector',
    ROTARIS_CAPTURE_CLICKS: '[data-testid="inspector-cancel"]@6000;;[data-testid="cancel-run-confirm"] .btn-danger@6600',
    ROTARIS_CAPTURE_PROBE_AT: ['[data-testid="inspector-name"]@5800', `${SNAPSHOT}@5800`, '[data-testid="cancel-run-confirm"]@6300', ...SAMPLES.map((at) => `${SNAPSHOT}@${at}`)].join(';;'),
    ROTARIS_CAPTURE_PNG_AT: `${join(output, 'cancel-run-inspector.png')}@6640`,
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '120000', ROTARIS_CAPTURE_AFTER_MS: '1000',
  }, { timeout: 200_000 });
  const db = open(s4d); const row = session(db); db.close();
  const following = probesAt(r.log, 5800, '[data-testid="inspector-name"]')?.[0]?.text ?? null;
  expect(following === 'orchestrator', `the inspector did not follow the run-level agent at 5.8 s: "${following}"`);
  const field = (snap, id) => snap?.find((p) => p.data['data-testid'] === id)?.text ?? null;
  const before = probesAt(r.log, 5800, SNAPSHOT);
  expect((field(before, 'inspector-meta') ?? '').startsWith('running · '), `the run-level agent's meta line before the cancel: ${JSON.stringify(before)}`);
  const dialog = probesAt(r.log, 6300, '[data-testid="cancel-run-confirm"]')?.[0]?.text ?? '';
  expect(/Cancel the run\?/.test(dialog), `the inspector's Cancel on the run-level agent did not ask "Cancel the run?": "${dialog}" (REQ-MONITOR-126)`);
  const confirmed = r.log.indexOf('capture: clicked "[data-testid="cancel-run-confirm"] .btn-danger"');
  expect(confirmed >= 0, 'the confirm click was not recorded');
  const afterConfirm = r.log.slice(confirmed);
  const snapshots = SAMPLES.map((at) => ({ at, snap: probesAt(afterConfirm, at, SNAPSHOT) })).filter((x) => x.snap !== null);
  const pending = snapshots.filter((x) => field(x.snap, 'cancel-run-confirm') !== null).map((x) => x.at);
  const samples = snapshots.filter((x) => field(x.snap, 'cancel-run-confirm') === null).map(({ at, snap }) => ({ at, header: field(snap, 'run-state'), meta: field(snap, 'inspector-meta') })).filter((x) => x.header !== null && x.meta !== null);
  expect(samples.length >= 3, `fewer than three snapshots after the confirmation was handled: ${JSON.stringify(samples)} (still showing the dialog: ${JSON.stringify(pending)})`);
  // REQ-MONITOR-130: whichever surface asks, the same state — the meta line never reads the run-level agent running beside it.
  const split = samples.filter((x) => x.header === 'Cancelling…' && !x.meta.startsWith('cancelling · '));
  expect(split.length === 0, `the inspector's meta line read another state beside the run header's Cancelling…: ${JSON.stringify(split)} (REQ-MONITOR-127/130/052)`);
  const running = samples.filter((x) => x.meta.startsWith('running · '));
  expect(running.length === 0, `the inspector's meta line read the cancelled run's agent running after the confirm: ${JSON.stringify(running)} (REQ-MONITOR-127/130)`);
  // Whether a snapshot lands inside the cancel's window is host timing: recorded, not asserted.
  const cancellingSamples = samples.filter((x) => x.header === 'Cancelling…').length;
  expect(!['running', 'waiting', 'starting', 'pausing', 'cancelling', 'background'].includes(row.execution_status), `the cancelled run ended ${row.execution_status} (${row.stop_reason})`);
  results.cancelRunInspector = { following, before: { header: field(before, 'run-state'), meta: field(before, 'inspector-meta') }, dialog, samples, stillShowingDialog: pending, cancellingSamples, finalStatus: row.execution_status, stopReason: row.stop_reason, png: join(output, 'cancel-run-inspector.png') };
}

// 5. Open an agent under both preferences; the window's lifecycle; a new session destroys it.
const s5 = scenario('open');
{
  const r = await launch('open-off', s5, {
    ROTARIS_SCRIPT: THREE, ROTARIS_CHILD_SCRIPT: 'wait:10000,answer', ROTARIS_CAPTURE_PROMPT: 'open an agent',
    // PD-MONITOR-009: the row is the Overview's table card's, and Open is the graph card's control for the shared selection.
    ROTARIS_CAPTURE_VIEWS: 'overview@3500', ROTARIS_CAPTURE_CLICKS: '.agent-table__row@5000;;[data-testid="mission-open"]@5500',
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

  setPreference(s5, 'interface/agentPopout', true);
  const r2 = await launch('open-on', s5, {
    ROTARIS_SCRIPT: THREE, ROTARIS_CHILD_SCRIPT: 'wait:16000,answer', ROTARIS_CAPTURE_PROMPT: 'pop out an agent',
    ROTARIS_CAPTURE_VIEWS: 'overview@3500',
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
    // One view step where there were two (Mission for the Pop out, then the Overview for "New session"): both stand on the Overview.
    ROTARIS_SCRIPT: 'answer', ROTARIS_CAPTURE_RESUME: 'latest', ROTARIS_CAPTURE_VIEWS: 'overview@2500',
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

// 7. PD-MONITOR-009 clause 6 (2026-11-11). Until then this launch chose the strategy and the depth in two selectors on the
// Mission view's "Delegation settings" card, which wrote their keys per field, and read Settings afterwards. That card is
// drawn on no view now: the graph card's last line shows the configured strategy as text and leads to its one editor. So:
// the card's strategy read (a span, `orchestrator`, the scratch file naming none), with no selector and no depth control on
// the Overview; "Open Runtime settings" pressed, landing on the Settings view at Runtime; there "Delegation strategy" chosen
// and "Depth cap" typed, the save bar reading unsaved until Save writes both keys; Settings shows the same values at the end;
// the pop-out toggle writes its preference, as before. A second launch reads the card's strategy from the file just written.
// The Overview draws its cards once a session is listed (its empty state otherwise), so the launch runs one scripted answer first.
const s7 = scenario('settings');
{
  const card = `(() => { const q = (s) => document.querySelector(s); const strategy = q('[data-testid="mission-strategy"]'); return { kind: 'strategy-card', view: q('.app-shell')?.getAttribute('data-view') ?? null, tag: strategy?.tagName ?? null, text: strategy?.textContent ?? null, line: q('[data-testid="mission-next-run"]')?.textContent ?? null, editable: strategy === null ? null : strategy.matches('select, input, textarea, [contenteditable="true"], [role="combobox"], [role="listbox"]'), controls: document.querySelectorAll(':is([data-testid="mission-graph"], [data-testid="mission-table"]) :is(select, input, [role="combobox"], [role="listbox"])').length, depth: q('[data-testid="mission-depth"]') !== null, settingsCard: q('[data-testid="mission-settings"]') !== null }; })()`;
  const r = await launch('settings', s7, {
    ROTARIS_SCRIPT: 'answer', ROTARIS_CAPTURE_PROMPT: 'one run, so that the Overview draws its cards',
    ROTARIS_CAPTURE_VIEWS: 'overview@3500',
    // The card is read 2.5 s after the Overview is opened, as item 1 reads it, and not the instant it is drawn: the view reads
    // the configuration when it mounts and the card draws a dash until that answers (a reading 321 ms after the view step
    // read "—" on 2026-11-11). The press waits from 6.2 s on, so the reading comes first.
    ROTARIS_CAPTURE_EVAL_AT: `${card}@6000`,
    ROTARIS_CAPTURE_CLICKS: '[data-testid="mission-open-runtime"]@6200~14000;;#max-depth@8400;;.save-bar .btn-primary>>Save@10800;;.nav-list__item>>Interface@12200;;[data-testid="agent-pop-out-toggle"]@12700;;.nav-list__item>>Runtime@13300',
    ROTARIS_CAPTURE_SELECT: '#strategy>>swarm@7800',
    // The depth cap typed as a person types it: the field's text selected, the digit typed over it, Tab to commit the draft.
    ROTARIS_CAPTURE_CHORDS: 'Ctrl+A@8900', ROTARIS_CAPTURE_TYPE_AT: '2@9300', ROTARIS_CAPTURE_KEYS: 'Tab@10000',
    ROTARIS_CAPTURE_PROBE_AT: '.app-shell@7400;;.nav-list__item.is-selected@7400;;.save-bar__status@10400',
    ROTARIS_CAPTURE_AFTER_MS: '14600', ROTARIS_CAPTURE_PROBE: '#strategy;;#max-depth;;[data-testid="agent-pop-out-toggle"];;.save-bar__status;;.nav-list__item.is-selected',
  });
  const shown = evalsOf(r.log).find((e) => e.kind === 'strategy-card');
  expect(shown, 'no reading of the graph card\'s strategy (see settings.log)');
  expect(shown.view === 'overview' && shown.tag === 'SPAN' && shown.text === 'orchestrator' && shown.editable === false, `the graph card's strategy: ${JSON.stringify(shown)} (PD-MONITOR-009 clause 6: the configured strategy, shown and never edited there)`);
  expect(shown.controls === 0 && !shown.depth && !shown.settingsCard, `the Overview's delegation cards still draw a selector or a field: ${JSON.stringify(shown)} (PD-MONITOR-009 clause 6: the selector and the depth control are drawn on no monitoring view)`);
  expect(/capture: clicked "\[data-testid="mission-open-runtime"\]"/.test(r.log), 'the "Open Runtime settings" press was not recorded (see settings.log)');
  const landedView = probesAt(r.log, 7400, '.app-shell')?.[0]?.data?.['data-view'];
  const landedCategory = probesAt(r.log, 7400, '.nav-list__item.is-selected')?.map((p) => p.text) ?? [];
  expect(landedView === 'settings' && JSON.stringify(landedCategory) === JSON.stringify(['Runtime']), `"Open Runtime settings" landed on ${landedView} at ${JSON.stringify(landedCategory)}, not Settings › Runtime (PD-MONITOR-009 clause 6)`);
  const dirty = probesAt(r.log, 10400, '.save-bar__status')?.[0]?.text ?? null;
  expect(dirty === 'Unsaved changes', `the save bar after the two edits and before Save: ${JSON.stringify(dirty)}`);
  const yaml = readFileSync(join(s7.workspace, '.rotaris', 'agents.yaml'), 'utf8');
  expect(/delegation_strategy: swarm/.test(yaml) && /max_depth: 2\b/.test(yaml), `the file after the writes:\n${yaml}`);
  const strategy = endProbe(r.log, '#strategy')?.[0]?.value; const depth = endProbe(r.log, '#max-depth')?.[0]?.value;
  expect(strategy === 'swarm' && depth === '2', `Settings → Runtime shows strategy ${strategy}, depth ${depth}`);
  const saved = endProbe(r.log, '.save-bar__status')?.[0]?.text ?? null;
  expect(saved === 'All changes saved', `the save bar at the end: ${JSON.stringify(saved)}`);
  const prefs = JSON.parse(readFileSync(join(s7.preferences, 'preferences.json'), 'utf8'));
  expect(prefs['interface/agentPopout'] === true, `the toggle did not persist: ${JSON.stringify(prefs)} (REQ-SHELL-073)`);
  expect(unexpected(r.errors).length === 0, `renderer errors: ${unexpected(r.errors).join(' | ')}`);

  // 7b. Relaunched on the same scratch profile, no session focused and one listed: the graph card reads the strategy the file holds.
  // The card draws a dash until the configuration is read, so the reading is taken once the waited-for text has had its
  // 9 s to arrive; a card that never shows it is read all the same, and fails on what it shows.
  const r2 = await launch('settings-card', s7, {
    ROTARIS_CAPTURE_PROBE_AT: '[data-testid="mission-strategy"]>>swarm@~9000',
    ROTARIS_CAPTURE_EVAL_AT: `${card}@9200`,
    ROTARIS_CAPTURE_AFTER_MS: '9600',
  });
  const after = evalsOf(r2.log).find((e) => e.kind === 'strategy-card');
  expect(after && after.view === 'overview' && after.tag === 'SPAN' && after.text === 'swarm', `the graph card after the write: ${JSON.stringify(after ?? null)} — it shows the strategy Settings › Runtime saved (PD-MONITOR-009 clause 6)`);
  results.settings = { cardStrategy: shown.text, cardLine: shown.line, landed: { view: landedView, category: landedCategory[0] }, yamlStrategy: 'swarm', yamlDepth: 2, settingsStrategy: strategy, settingsDepth: depth, saveBar: { afterEdit: dirty, atEnd: saved }, cardStrategyAfter: after.text, popOutPreference: prefs['interface/agentPopout'] };
}

// 8. Reconciliation: a child left `running` on a completed session presents settled on every surface (REQ-MONITOR-211/213).
{
  const dbw = new Database(oneDatabase(s1.local));
  const row = dbw.prepare('SELECT session_id FROM sessions ORDER BY created_at DESC').get();
  dbw.prepare(`INSERT INTO children (session_id, task_id, canonical_name, given_name, persona, state, parent_id, depth, iteration, model_key, category, background, task, depends_on, inherited_context, granted_tools, granted_mcp, spawned_at, tool_calls)
    VALUES (?, 'bg_0000dead', 'zombie', 'Zombie', 'coding-agent', 'running', 'root:1', 1, 1, 'scripted', 'quick', 1, 'a child the run left running', '[]', '[]', '["read_file"]', '{}', '2026-09-05T10:00:00.000Z', 0)`).run(row.session_id);
  dbw.close();
  const r = await launch('reconcile', s1, {
    // PD-MONITOR-009: "every surface" is the Overview's table card, the Workspace's inspector and sidebar tree, and the persona window.
    ROTARIS_CAPTURE_RESUME: 'latest', ROTARIS_CAPTURE_VIEWS: 'overview@2500',
    ROTARIS_CAPTURE_CLICKS: '[data-agent-id="bg_0000dead"]@3500;;[data-testid="mission-open"]@4000;;.inspector__actions .btn>>Pop out@5000',
    ROTARIS_CAPTURE_PROBE_AT: '[data-agent-id="bg_0000dead"]@3800;;.agent-table__row@3800;;[data-testid="inspector-name"]@4600;;[data-testid="inspector-meta"]@4600;;.agent-row[data-task-id="bg_0000dead"]@4600',
    ROTARIS_CAPTURE_PERSONA_PROBE_AT: '[data-testid="persona-agent-name"]@6500;;[data-testid="persona-agent-state"]@6500',
    // The capture ends after the persona probe's paint bound (6.5 s + 5 s), so a late first paint is waited for, not cut off.
    ROTARIS_CAPTURE_AFTER_MS: '12000', ROTARIS_CAPTURE_PROBE: '.agent-row',
  });
  // Found on this launch: opening a stored session runs REQ-ORCH-053's sweep FIRST, which settles the planted row `cancelled`
  // before any surface sees it — REQ-MONITOR-211's outcome-dictated state (`done` for a completed run) never reaches the
  // projection by this route (the reading in ADR-0043's note). What REQ-MONITOR-213 demands is asserted: every surface shows
  // the same settled state and none shows the agent running.
  const tableRow = probesAt(r.log, 3800, '[data-agent-id="bg_0000dead"]')?.[0];
  const settled = tableRow?.data?.['data-state'];
  expect(settled === 'cancelled' || settled === 'done', `the agent table's row: ${JSON.stringify(tableRow)}`);
  const all = (probesAt(r.log, 3800, '.agent-table__row') ?? []).map((p) => p.data['data-state']);
  expect(all.length === 4 && all.every((st) => st === 'done' || st === 'cancelled'), `the table's states: ${JSON.stringify(all)}`);
  const meta = probesAt(r.log, 4600, '[data-testid="inspector-meta"]')?.[0]?.text ?? '';
  expect(probesAt(r.log, 4600, '[data-testid="inspector-name"]')?.[0]?.text === 'zombie' && meta.startsWith(`${settled} · `), `the inspector: "${meta}" against ${settled}`);
  const treeRow = probesAt(r.log, 4600, '.agent-row[data-task-id="bg_0000dead"]')?.[0];
  expect(treeRow?.data?.['data-state'] === settled, `the sidebar tree row: ${JSON.stringify(treeRow)} against ${settled}`);
  // The persona probe reads a painted window: from 6.5 s it waits for the window's first paint (bounded at 5 s) and logs how
  // long it waited. On 2026-10-01, at a load average of about 15, the window painted 1967 and 2093 ms after show — after a
  // single reading at 6.5 s, which read `[]` (docs/archive/defects/mission-proofs-reconcile-launch-probes-the-persona-window-before-its-first-paint.md).
  const pName = personaProbesAt(r.log, 6500, '[data-testid="persona-agent-name"]')?.[0]?.text; const pState = personaProbesAt(r.log, 6500, '[data-testid="persona-agent-state"]')?.[0]?.text;
  const paintWait = (selector) => { const m = r.log.match(new RegExp(`capture: persona-probe-at 6500 ${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} waited (\\d+) ms for the window's first paint(: not observed)?`)); return m ? { waitedMs: Number(m[1]), painted: m[2] === undefined } : { waitedMs: 0, painted: true }; };
  const probeWait = paintWait('[data-testid="persona-agent-state"]');
  const firstPaintMs = Number(/persona "coding-agent" first paint after show: (\d+) ms/.exec(r.log)?.[1] ?? NaN);
  expect(probeWait.painted, `the persona window never painted within 5 s of the 6.5 s probe (first paint after show: ${firstPaintMs} ms)`);
  expect(pName === 'zombie' && pState === settled, `the persona window: ${pName} ${pState} against ${settled} (REQ-MONITOR-213)`);
  const sweep = /(\d+) unfinished child record/.exec(r.log)?.[1] ?? null;
  results.reconcile = { settledBy: settled === 'cancelled' ? 'REQ-ORCH-053 sweep on open (cancelled)' : 'projection (run outcome)', sweepNotice: sweep, table: settled, inspectorMeta: meta, tree: treeRow.data['data-state'], personaWindow: pState, personaFirstPaintAfterShowMs: firstPaintMs, personaProbeWaitedForPaintMs: probeWait.waitedMs };
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
