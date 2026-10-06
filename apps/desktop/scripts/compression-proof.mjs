import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, configDirFor, findDatabases, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';

/**
 * Part AH's first execution in the built app: context compression (ADR-0060; REQ-ORCH-093,
 * REQ-MONITOR-076..086, REQ-CONFIG-132..135). Four launches against the scripted client's `fail:context`
 * and `tokens:<n>` steps, asserting the store's timeline, its issues, the transcript's reason row and the
 * order of the model calls in the log. `pnpm compression-proof`.
 *
 *   1. rejection      — a context rejection condenses and retries; the run completes on the compressed context.
 *   2. automatic      — the reported prompt count crosses the threshold; compression runs BEFORE the next call.
 *   3. compressor-down— the compressing pass fails; the ORIGINAL rejection is what surfaces and the run fails.
 *   4. twice-only     — a rejection that survives two condensations fails the step (at most twice for one call).
 *   5. child-count    — a delegated child crosses the threshold and compresses once: the Mission view's agent table draws
 *                       that child's compression count, 1, in its Compressions column (REQ-MONITOR-281/086).
 *   6. root-and-child — the root and its child each cross the threshold and compress once: the inspector's ring caption
 *                       and the run-level agent's persona window draw the run-wide count, 2, the root's own included
 *                       (REQ-MONITOR-086/281, OQ-159's recorded reading).
 *   7. after-a-move   — the root starts on alpha (capacity 10,000), meets insufficient quota and moves to its same-tier
 *                       candidate beta (capacity 1,000); a 900-token step on beta compresses at beta's 600-token
 *                       trigger (REQ-MONITOR-078/079/080; since fin10 — before, the trigger stayed alpha's 6,000 and no
 *                       pass ran).
 *   8. excluded-before-pass — the root on alpha (a 600-token trigger) delegates; its child's quota answer on alpha excludes
 *                       it while the root's held call is in flight; that call reports 900 tokens. The root's next step
 *                       moves it to beta (a 60,000-token trigger) BEFORE its compression check, so no pass runs
 *                       (REQ-MONITOR-194 with REQ-MONITOR-080; the repair round of 2026-10-03 — before, the pass ran at
 *                       alpha's trigger, then the root moved).
 */
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32'
  ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe')
  : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'compression-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`the proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 180_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 180_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`the desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
if (!existsSync(electron)) throw new Error(`the Electron executable is absent: ${electron}`);




/**
 * A scratch workspace on the scripted provider. `max_input_tokens: 1000` with `threshold_percentage: 60`
 * puts REQ-CONFIG-134's trigger at 600 tokens, so the `tokens:900` step crosses it; `preserve_recent_turns: 1`
 * leaves a compressible middle in the short conversations these scenarios build. The shipped
 * `code_intelligence` entry is off: its ~4.5 s discovery per run start (ADR-0035's note) distorts nothing
 * this proof measures and costs every launch (the lesson of `codebase.md`'s "verifying a part" section).
 */
function scenario(name, compressorLines, opts = {}) {
  const root = join(output, name);
  const workspace = join(root, 'workspace');
  const local = join(root, 'local');
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  mkdirSync(local, { recursive: true });
  writeFileSync(join(workspace, 'README.md'), '# proof\n');
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
    'models:',
    `  alpha: { provider: scripted, model_id: alpha, max_input_tokens: ${opts.alphaInputTokens ?? 1000} }`,
    ...(opts.brokenCompressor ? ['  broken: { provider: scripted, model_id: broken }'] : []),
    'small_model: alpha', 'medium_model: alpha', 'large_model: alpha',
    'runtime:', '  permission_mode: autonomous', ...(opts.delegates ? ['  max_depth: 2'] : []),
    'compressor:', ...compressorLines,
    'mcp_servers:', '  code_intelligence: { enabled: false }',
    // `single` withholds `delegate` (delegation_runtime_absent); scenario 5 needs a child, so it keeps the default strategy.
    ...(opts.delegates ? [] : ['rotaris:', '  delegation_strategy: single']), '',
  ].join('\n'));
  if (opts.beta) {
    // The per-user discovery snapshot names `scripted-b/beta` as that provider's pick for every tier, so beta is alpha's
    // same-tier candidate on a different provider (REQ-NOTIFY-082), as resilience-proof's `same-tier` scenario sets it up.
    // Its `context_window` (1,000) is the capacity the trigger reads for it (`snapshotLayer` → `max_input_tokens`).
    const configDir = configDirFor(local);
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'project_settings.yaml'), [
      'version: 1', 'providers:', '  scripted-b:', '    id: scripted-b', '    display_name: Scripted B', '    family: scripted', '    authenticated: true',
      '    discovered_at: 2026-09-05T00:00:00Z', '    small_model: scripted-b/beta', '    medium_model: scripted-b/beta', '    large_model: scripted-b/beta',
      '    models:', `      - { id: scripted-b/beta, discovered_at: 2026-09-05T00:00:00Z, capabilities: {}, limits: { context_window: ${opts.betaWindow ?? 1000} }, pricing: {} }`, '',
    ].join('\n'));
  }
  return { root, workspace, local };
}
async function launch(name, s, extra, opts = {}) {
  const png = join(output, `${name}.png`);
  const started = Date.now();
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, s.workspace], {
    cwd: app, timeoutMs: opts.timeout ?? 180_000, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local: s.local, preferences: join(s.root, 'preferences') }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  return { log, png, elapsedMs: Date.now() - started };
}
function open(s) { return new Database(oneDatabase(s.local), { readonly: true }); }
const session = (db) => db.prepare('SELECT session_id, execution_status, stop_reason FROM sessions ORDER BY created_at DESC').get();
const timeline = (db, sid) => db.prepare('SELECT name, message, metadata FROM timeline WHERE session_id = ? ORDER BY ordinal').all(sid);
const issues = (db, sid) => db.prepare('SELECT kind, severity, message, metadata FROM issues WHERE session_id = ? ORDER BY ordinal').all(sid);
const systemRows = (db, sid) => db.prepare("SELECT body FROM transcript_rows WHERE session_id = ? AND kind = 'system' ORDER BY row_index").all(sid).map((r) => r.body);
const modelCalls = (log) => [...log.matchAll(/scripted model call: ([^\s]+) \((\w[\w-]*)\)/g)].map((m) => ({ model: m[1], who: m[2] }));
const compressedLines = (log) => [...log.matchAll(/context compressed for [^\n]+/g)].map((m) => m[0]);
const results = {};
const expect = (cond, message) => { if (!cond) throw new Error(message); };
/** REQ-CONFIG-135: the four inputs and the resulting token number, each its own field. */
function assertFourInputs(entry, where) {
  const meta = JSON.parse(entry.metadata);
  for (const field of ['threshold_percentage', 'capacity', 'advertised_input_limit', 'default_threshold', 'trigger_tokens']) {
    expect(meta[field] !== undefined, `${where}: the compression entry carries no ${field}: ${entry.metadata}`);
  }
  expect(meta.threshold_percentage === 60, `${where}: the threshold percentage is not the configured 60: ${entry.metadata}`);
  expect(meta.capacity === 1000, `${where}: the capacity did not come from the model's max_input_tokens: ${entry.metadata}`);
  expect(meta.trigger_tokens === 600, `${where}: REQ-CONFIG-134's trigger is not 60 % of 1000: ${entry.metadata}`);
  return meta;
}

// 1. A context rejection: condense, retry, complete on the compressed context (REQ-ORCH-093, REQ-MONITOR-077).
const s1 = scenario('rejection', ['  threshold_percentage: 60', '  preserve_recent_turns: 1']);
{
  const r = await launch('rejection', s1, { ROTARIS_SCRIPT: 'glob,glob,glob,glob,fail:context,answer', ROTARIS_CAPTURE_PROMPT: 'read the repository four times, then answer', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '800' });
  const db = open(s1);
  const row = session(db);
  const entries = timeline(db, row.session_id);
  const kinds = issues(db, row.session_id);
  const rows = systemRows(db, row.session_id);
  db.close();
  expect(row.execution_status === 'completed', `the run did not complete after the condensation: ${JSON.stringify(row)}`);
  const entry = entries.find((t) => t.name === 'context_compressed');
  expect(entry !== undefined, `no context_compressed entry: ${entries.map((t) => t.name).join(',')}`);
  const meta = assertFourInputs(entry, 'rejection');
  expect(meta.trigger === 'rejection', `the compression was not attributed to the rejection: ${entry.metadata}`);
  // The MESSAGE count is what a compression is judged by: on a conversation this small the summary and its
  // framing cost more characters than the two messages they replaced, so the token figure can rise (ADR-0060).
  expect(meta.after_messages < meta.before_messages, `the compressed context holds no fewer messages: ${entry.metadata}`);
  expect(kinds.some((i) => i.kind === 'llm_bad_request'), `no llm_bad_request issue: ${kinds.map((i) => i.kind).join(',')}`);
  expect(rows.some((b) => /Context compressed for/.test(b)), `no transcript reason row: ${JSON.stringify(rows)}`);
  expect(modelCalls(r.log).some((c) => c.who === 'compressor'), 'the compressing model was never called');
  results.rejection = { status: row.execution_status, metadata: meta, row: rows.find((b) => /Context compressed for/.test(b)) ?? null, png: r.png, elapsedMs: r.elapsedMs };
}

// 2. The threshold: the reported prompt count crosses it and compression runs BEFORE the next call (REQ-MONITOR-076/081).
const s2 = scenario('automatic', ['  threshold_percentage: 60', '  preserve_recent_turns: 1']);
{
  const r = await launch('automatic', s2, { ROTARIS_SCRIPT: 'glob,glob,glob,tokens:900,answer', ROTARIS_CAPTURE_PROMPT: 'work until the context fills', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '800' });
  const db = open(s2);
  const row = session(db);
  const entries = timeline(db, row.session_id);
  db.close();
  expect(row.execution_status === 'completed', `the run did not complete: ${JSON.stringify(row)}`);
  const entry = entries.find((t) => t.name === 'context_compressed');
  expect(entry !== undefined, `the threshold did not fire: ${entries.map((t) => t.name).join(',')}`);
  const meta = assertFourInputs(entry, 'automatic');
  expect(meta.trigger === 'automatic', `the compression was not attributed to the threshold: ${entry.metadata}`);
  // REQ-MONITOR-081: the provider's own last-prompt figure was available and was preferred over the estimate.
  expect(meta.count_source === 'provider', `the trigger read an estimate while a provider figure existed: ${entry.metadata}`);
  expect(meta.counted_tokens === 900, `the trigger did not read the reported 900 tokens: ${entry.metadata}`);
  // REQ-MONITOR-076: BEFORE the call — the compressing call sits between the 900-token step and the last one.
  const who = modelCalls(r.log).map((c) => c.who);
  const at = who.indexOf('compressor');
  expect(at > 0 && at < who.length - 1, `the compression did not sit before a later model call: ${who.join(',')}`);
  results.automatic = { status: row.execution_status, metadata: meta, calls: who, png: r.png, elapsedMs: r.elapsedMs };
}

// 3. The compressing pass itself fails: the ORIGINAL rejection is what surfaces (REQ-ORCH-093).
const s3 = scenario('compressor-down', ['  model: broken', '  threshold_percentage: 60', '  preserve_recent_turns: 1'], { brokenCompressor: true });
{
  const r = await launch('compressor-down', s3, { ROTARIS_SCRIPT: 'glob,glob,glob,glob,fail:context,answer', ROTARIS_COMPRESSOR_SCRIPT: 'fail', ROTARIS_CAPTURE_PROMPT: 'the compressor is down', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '800' });
  const db = open(s3);
  const row = session(db);
  const entries = timeline(db, row.session_id).map((t) => t.name);
  const kinds = issues(db, row.session_id);
  db.close();
  expect(row.execution_status === 'failed', `a failed condensation did not fail the run: ${JSON.stringify(row)}`);
  expect(!entries.includes('context_compressed'), `a failed condensation was recorded as a compression: ${entries.join(',')}`);
  const failure = kinds.find((i) => i.kind === 'compression_failed');
  expect(failure !== undefined, `no compression_failed issue: ${kinds.map((i) => i.kind).join(',')}`);
  expect(kinds.some((i) => i.kind === 'llm_bad_request'), 'the original rejection was not recorded');
  expect(/prompt is too long/.test(r.log), 'the original rejection is not what surfaced');
  expect(compressedLines(r.log).length === 0, 'a compression was reported although none happened');
  results.compressorDown = { status: row.execution_status, failure: JSON.parse(failure.metadata), png: r.png, elapsedMs: r.elapsedMs };
}

// 4. At most twice for one call (REQ-ORCH-093).
const s4 = scenario('twice-only', ['  threshold_percentage: 60', '  preserve_recent_turns: 1']);
{
  const r = await launch('twice-only', s4, { ROTARIS_SCRIPT: 'glob,glob,glob,glob,fail:context,fail:context,fail:context,fail:context', ROTARIS_CAPTURE_PROMPT: 'never fits', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '800' });
  const db = open(s4);
  const row = session(db);
  const entries = timeline(db, row.session_id).filter((t) => t.name === 'context_compressed');
  db.close();
  expect(row.execution_status === 'failed', `a rejection that survived two condensations did not fail the run: ${JSON.stringify(row)}`);
  const compressorCalls = modelCalls(r.log).filter((c) => c.who === 'compressor').length;
  expect(compressorCalls === 2, `the ladder condensed ${compressorCalls} time(s), not twice`);
  expect(entries.length === 2, `${entries.length} compression entries were recorded, not two`);
  results.twiceOnly = { status: row.execution_status, compressorCalls, png: r.png, elapsedMs: r.elapsedMs };
}

// 5. A child's compression count in the Mission table (REQ-MONITOR-281/086;
// docs/defects/fixed/the-mission-table-says-the-record-carries-no-compression-count.md): the table's cell read `not recorded`
// whatever the record held. The child crosses the threshold once; its row reads 1 under the column that names the unit.
const s5 = scenario('child-count', ['  threshold_percentage: 60', '  preserve_recent_turns: 1'], { delegates: true });
{
  const r = await launch('child-count', s5, {
    ROTARIS_SCRIPT: 'delegate:coding-agent:alpha,answer', ROTARIS_CHILD_SCRIPT: 'glob,glob,glob,tokens:900,answer', ROTARIS_CAPTURE_PROMPT: 'a child fills its context',
    ROTARIS_CAPTURE_VIEWS: '3@1500', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '1500',
    ROTARIS_CAPTURE_PROBE: '.agent-table thead th;;.agent-table__row;;.agent-table__compressions',
  });
  const db = open(s5);
  const row = session(db);
  const entries = timeline(db, row.session_id).filter((t) => t.name === 'context_compressed');
  const kids = db.prepare('SELECT task_id, canonical_name, state FROM children WHERE session_id = ?').all(row.session_id);
  db.close();
  expect(row.execution_status === 'completed', `the run did not complete: ${JSON.stringify(row)}`);
  expect(entries.length === 1, `${entries.length} compression entries were recorded, not one: ${JSON.stringify(entries)}`);
  expect(kids.length === 1, `one child was expected: ${JSON.stringify(kids)}`);
  const endProbe = (selector) => { const m = r.log.match(new RegExp(`capture: probe ${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} → (\\[.*\\])`)); return m ? JSON.parse(m[1]) : null; };
  const headers = (endProbe('.agent-table thead th') ?? []).map((p) => p.text);
  const rows = endProbe('.agent-table__row') ?? [];
  const cells = (endProbe('.agent-table__compressions') ?? []).map((p) => p.text);
  expect(headers.includes('Compressions') && headers.includes('Tool calls'), `the table's headers do not name the units: ${JSON.stringify(headers)} (REQ-MONITOR-281)`);
  expect(rows.length === 1 && rows[0].data['data-agent-id'] === kids[0].task_id, `the table's rows: ${JSON.stringify(rows.map((p) => p.data))}`);
  expect(JSON.stringify(cells) === JSON.stringify(['1']), `the child's compressions cell reads ${JSON.stringify(cells)}, not "1" (REQ-MONITOR-281/086)`);
  results.childCount = { status: row.execution_status, child: kids[0].canonical_name, compressionEntries: entries.length, headers, cells, png: r.png, elapsedMs: r.elapsedMs };
}

// 6. The run-wide count on the inspector and the persona window (REQ-MONITOR-086/281;
// docs/defects/fixed/the-inspector-and-a-persona-window-show-per-agent-metrics-without-the-compression-count.md): neither drew
// a compression count, and the run-level agent's summed the children's alone, so the root's own compression was counted
// nowhere. The root compresses before it delegates, the child once; the run-level agent reads 2 across the run on both. The
// run-level agent is popped out of the inspector as soon as it is shown — the root holds its delegating call 3 s
// (`wait:3000`), because the inspector follows the latest author and the first run of this scenario popped out the child,
// which had written its first row in the 230 ms between the match and the click — and the orchestrator's window, which
// keeps the run-level agent while the inspector follows the child, is read once it holds the final figure, or at the bound.
const s6 = scenario('root-and-child', ['  threshold_percentage: 60', '  preserve_recent_turns: 1'], { delegates: true });
{
  const RUN_WIDE = '2 compressions across the run.';
  const r = await launch('root-and-child', s6, {
    ROTARIS_SCRIPT: 'glob,glob,glob,tokens:900,wait:3000,delegate:coding-agent:alpha,answer', ROTARIS_CHILD_SCRIPT: 'glob,glob,glob,tokens:900,answer', ROTARIS_CAPTURE_PROMPT: 'the root and a child fill their contexts',
    ROTARIS_CAPTURE_CLICKS: '.inspector__body:not(.inspector__body--empty) .inspector__actions .btn>>Pop out@~60000',
    ROTARIS_CAPTURE_PERSONA_PROBE_AT: `[data-testid="persona-compressions"]>>${RUN_WIDE}@~60000;;[data-testid="persona-agent-name"]@~60000`,
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '3000',
    ROTARIS_CAPTURE_PROBE: '[data-testid="inspector-name"];;[data-testid="inspector-compressions"];;[data-testid="inspector-meta"]',
  });
  const db = open(s6);
  const row = db.prepare('SELECT session_id, execution_status, compressions FROM sessions ORDER BY created_at DESC').get();
  const entries = timeline(db, row.session_id).filter((t) => t.name === 'context_compressed').map((t) => JSON.parse(t.metadata).agent);
  const kids = db.prepare('SELECT task_id, canonical_name FROM children WHERE session_id = ?').all(row.session_id);
  db.close();
  expect(row.execution_status === 'completed', `the run did not complete: ${JSON.stringify(row)}`);
  expect(kids.length === 1, `one child was expected: ${JSON.stringify(kids)}`);
  expect(entries.length === 2 && entries.includes(kids[0].canonical_name) && entries.some((a) => a !== kids[0].canonical_name), `a compression of the root and one of the child were expected: ${JSON.stringify(entries)}`);
  expect(row.compressions === 2, `the session's aggregate is ${row.compressions}, not 2 (REQ-SESSION-139)`);
  const endProbe = (selector) => { const m = r.log.match(new RegExp(`capture: probe ${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} → (\\[.*\\])`)); return m ? JSON.parse(m[1]) : null; };
  const personaProbe = (selector) => { const m = r.log.match(new RegExp(`capture: persona-probe-at ~60000 ${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} → (\\[.*\\]|null)`)); return m ? JSON.parse(m[1]) : null; };
  const inspectorName = endProbe('[data-testid="inspector-name"]')?.[0]?.text;
  const inspector = endProbe('[data-testid="inspector-compressions"]')?.[0]?.text;
  const meta = endProbe('[data-testid="inspector-meta"]')?.[0]?.text ?? '';
  expect(/clicked "Pop out"/.test(r.log), 'the run-level agent was never popped out of the inspector');
  const persona = personaProbe('[data-testid="persona-compressions"]')?.[0]?.text;
  const personaName = personaProbe('[data-testid="persona-agent-name"]')?.[0]?.text;
  expect(inspectorName === 'orchestrator' && inspector === RUN_WIDE, `the inspector at the end: ${inspectorName}, "${inspector}" — not "${RUN_WIDE}" (REQ-MONITOR-086/281)`);
  // REQ-MONITOR-052's meta line keeps its form: the count is an element of its own.
  expect(/^done · .+ · \d+ tool calls?$/.test(meta), `the inspector's meta line: "${meta}" (REQ-MONITOR-052)`);
  expect(personaName === 'orchestrator' && persona === RUN_WIDE, `the run-level agent's persona window: ${personaName}, "${persona}" — not "${RUN_WIDE}" (REQ-MONITOR-086/281)`);
  results.rootAndChild = { status: row.execution_status, compressedAgents: entries, sessionAggregate: row.compressions, inspector: { name: inspectorName, compressions: inspector, meta }, personaWindow: { name: personaName, compressions: persona }, png: r.png, elapsedMs: r.elapsedMs };
}

// 7. REQ-MONITOR-080 / REQ-MONITOR-078/079 (the repair of the-root-compresses-on-the-model-its-turn-started-on-after-its-cell-moves):
// the root's compression follows its cell. Alpha (10,000 tokens: a 6,000-token trigger) refuses on quota; the root moves to
// beta (1,000: 600), its same-tier candidate on another provider, within the same turn; the 900-token step on beta crosses
// beta's trigger, so the next step compresses first, with beta's figures in the entry. Before the repair the trigger was
// alpha's, captured when the turn started, and no pass ran. The compressing model is the configured `compressor.model` — its
// default, the `small_model` alias, alpha here — which REQ-MONITOR-080 lets win over the agent's own; with none configured it
// is the cell's (ladder.test.ts pins that). Since OQ-189's ruling (PD-MONITOR-008, 2026-10-06) a configured compressor held
// out of quota yields to the agent's own model, so the pass runs on beta, which is asserted; until then it was reported only
// and went to alpha.
const s7 = scenario('after-a-move', ['  threshold_percentage: 60', '  preserve_recent_turns: 1'], { alphaInputTokens: 10_000, beta: true });
{
  const r = await launch('after-a-move', s7, { ROTARIS_SCRIPT: 'fail:quota,glob,glob,glob,tokens:900,answer', ROTARIS_CAPTURE_PROMPT: 'move, then fill the context', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '800' });
  const db = open(s7);
  const row = session(db);
  const entries = timeline(db, row.session_id);
  db.close();
  expect(row.execution_status === 'completed', `the run did not complete: ${JSON.stringify(row)}`);
  const moved = entries.find((t) => t.name === 'quota_fallback_model');
  expect(moved !== undefined && JSON.parse(moved.metadata).to_model === 'beta', `the root did not move to beta: ${entries.map((t) => t.name).join(',')}`);
  const entry = entries.find((t) => t.name === 'context_compressed');
  expect(entry !== undefined, `no pass ran after the move (the trigger was not beta's): ${entries.map((t) => t.name).join(',')}`);
  const meta = JSON.parse(entry.metadata);
  expect(meta.capacity === 1000 && meta.trigger_tokens === 600 && meta.advertised_input_limit === 1000 && meta.counted_tokens === 900, `the entry does not carry beta's figures: ${entry.metadata}`);
  const calls = modelCalls(r.log);
  const compressor = calls.filter((c) => c.who === 'compressor').map((c) => c.model);
  expect(compressor.length === 1, `not exactly one pass reached the compressing model: ${JSON.stringify(calls)}`);
  // OQ-189's ruling (R-071, PD-MONITOR-008): the configured compressor (alpha) is held out of quota with nothing replacing it,
  // so the pass compresses on the root's own model, beta; until 2026-10-06 it went to alpha, as configured.
  expect(/\/beta$/.test(compressor[0] ?? ''), `the pass did not compress on the root's own model: ${JSON.stringify(compressor)}`);
  results.afterAMove = { status: row.execution_status, move: JSON.parse(moved.metadata), metadata: meta, compressorModel: compressor[0], calls, png: r.png, elapsedMs: r.elapsedMs };
}

// 8. REQ-MONITOR-194 with REQ-MONITOR-080 (the repair round of 2026-10-03 on
// docs/defects/fixed/an-agent-calls-a-pair-the-session-recorded-out-of-quota-when-no-override-replaces-it.md): the root's cell is
// settled before its compression check. The root delegates on alpha (1,000 tokens: a 600-token trigger), then holds its next
// call 3 s (`wait:3000`); the child's call, held 1 s, meets insufficient quota on alpha, which excludes it session-wide. The
// root's held call — sent before the exclusion — reports 900 tokens. At the root's next step its cell is on an excluded pair:
// it moves to beta (100,000: 60,000) before the check, so 900 tokens trigger nothing. Before the repair the check ran first,
// at alpha's 600-token trigger, and a pass ran (on the configured compressor slot), and only then did the root move.
const s8 = scenario('excluded-before-pass', ['  threshold_percentage: 60', '  preserve_recent_turns: 1'], { delegates: true, beta: true, betaWindow: 100_000 });
{
  const r = await launch('excluded-before-pass', s8, {
    ROTARIS_SCRIPT: 'delegate:coding-agent:side,wait:3000,tokens:900,answer,answer', ROTARIS_CHILD_SCRIPT: 'wait:1000,fail:quota,answer',
    ROTARIS_CAPTURE_PROMPT: 'delegate, then fill the context after the child excludes alpha', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '800',
  });
  const db = open(s8);
  const row = session(db);
  const entries = timeline(db, row.session_id);
  db.close();
  expect(row.execution_status === 'completed', `the run did not complete: ${JSON.stringify(row)}`);
  const exhausted = entries.filter((t) => t.name === 'model_exhausted').map((t) => JSON.parse(t.metadata));
  expect(exhausted.length === 1 && exhausted[0].model === 'alpha', `alpha was not excluded once: ${JSON.stringify(exhausted)}`);
  const moves = entries.filter((t) => t.name === 'quota_fallback_model').map((t) => JSON.parse(t.metadata));
  const rootMove = moves.find((m) => m.agent === 'orchestrator');
  expect(rootMove !== undefined && rootMove.to_model === 'beta' && rootMove.pre_call === true, `the root did not move to beta before a call: ${JSON.stringify(moves)}`);
  const passes = entries.filter((t) => t.name === 'context_compressed').map((t) => JSON.parse(t.metadata));
  expect(passes.length === 0, `a pass ran on the excluded alpha's trigger before the root moved: ${JSON.stringify(passes)}`);
  const calls = modelCalls(r.log);
  const rootCalls = calls.filter((c) => c.who === 'orchestrator').map((c) => c.model);
  // The first two root calls were sent before the exclusion; every later one is on beta.
  expect(rootCalls.length > 2 && rootCalls.slice(2).every((m) => /\/beta$/.test(m)), `the root called alpha after the exclusion: ${JSON.stringify(rootCalls)}`);
  expect(calls.every((c) => c.who !== 'compressor'), `a pass reached a compressing model: ${JSON.stringify(calls)}`);
  results.excludedBeforePass = { status: row.execution_status, rootMove, exhausted, passes, rootCalls, calls, png: r.png, elapsedMs: r.elapsedMs };
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
