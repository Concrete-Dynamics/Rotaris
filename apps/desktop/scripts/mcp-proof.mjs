/**
 * The MCP proof (Part S): ADR-0033 and ADR-0034's first execution behind the real run host — the hand-written
 * fixture server (`fixtures/mcp-fixture-server.mjs`) declared three ways (global YAML, a workspace `.mcp.json`
 * with an envFile and an unknown key, a workspace YAML overlay), a persona carrying the three with a grant, a
 * denial and a rename, one stored secret, and nine launches against one scratch profile:
 *
 *   1. discovery   — the prompt's MCP section character-exact and equal to the callable set; the inert grant reported
 *                    once; gamma's unknown key warned once per load; the discovery file byte-identical after the run.
 *   2. call        — `echo` end to end (tool.start before tool.finish, the result text, the row succeeded); `slow` beyond
 *                    `request_timeout: 2` fails naming the server and the connection serves the following `echo` (003/069).
 *   3. one process — two children calling alpha concurrently share one connection and one fixture process; a third
 *                    child after they end uses the same pid (067/068).
 *   4. narrowing   — `--rename-after` withdraws `extra` mid-run; calling it is refused; the prompt is not re-rendered.
 *   5. crash       — `--crash-after` fails the call in flight, one warning issue, the next call re-establishes (069).
 *   6. drop rules  — an unknown server, an unavailable command, `enabled: false`, and a session toggle off from the
 *                    Settings category → absent from the run, the row's wording, the child's recorded evidence; a
 *                    relaunch shows the override gone (115).
 *   7. settings    — Check status → checking then healthy/unreachable, the button disabled while probing, probed twice
 *                    → the fixture contacted twice (054); the secrets card masked and scoped; the PNG.
 *   8. fatal YAML  — a stdio entry without a command and a bad request_timeout: both reported, the load rejected; the
 *                    same defects in `.mcp.json` drop the entries and the run proceeds.
 *   9. exit bound  — a server that never answers initialize: discovery returns empty at ≤ 35 s and the application exits.
 *
 * Evidence under `.proof/mcp-proof/`: one log and PNG per launch, `results.json`. `--skip-build` skips the build.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, proofIsolationEnv } from './lib/harness.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const fixture = join(app, 'scripts', 'fixtures', 'mcp-fixture-server.mjs');
const output = resolve(repo, '.proof', 'mcp-proof');
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

const root = join(output, 'profile');
const workspace = join(root, 'workspace');
const local = join(root, 'local');
const configDir = join(local, 'rotaris', 'config');
const preferences = join(root, 'preferences');
const pids = join(output, 'pids');
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
mkdirSync(configDir, { recursive: true });
mkdirSync(pids, { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# MCP proof workspace\n');
writeFileSync(join(workspace, '.env'), 'GAMMA_FROM_FILE=filed\n');
const y = (v) => JSON.stringify(v);
const node = process.execPath;
// The merge of Parts R and S (2026-09-05): the shipped `browser` default is `npx -y <pkg>` — a `.cmd` runner on Windows and a
// package download on first use. The proof overrides it with a `.cmd` runner over the fixture, so the wrap of REQ-MCP-113 is
// exercised through the built application (the settings probe reaches the fixture through cmd.exe) and no proof touches the
// network. The entry keeps the default's `enabled: false`; the field-wise merge of REQ-MCP-025 replaces its command and args.
const runnerCmd = join(output, 'runner.cmd');
writeFileSync(runnerCmd, `@echo off\r\n"${node}" %*\r\n`);

/** The global file: two stdio servers over the fixture, the persona grants; rewritten per launch with the fixture flags. */
function globalYaml({ alphaFlags = [], betaFlags = [], alphaTimeout = null, personas = {} } = {}) {
  const alphaArgs = [fixture, '--pid-file', join(pids, 'alpha.pids'), ...alphaFlags];
  const betaArgs = [fixture, '--pid-file', join(pids, 'beta.pids'), ...betaFlags];
  const lines = [
    '# scratch configuration written by the MCP proof',
    'models:', '  scripted: { provider: scripted, model_id: scripted }',
    'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
    // Part T (2026-09-06): the shipped `code_intelligence` entry is enabled and carried by twelve built-in personas, so the
    // discovery-ahead of every process's first run would start the bundled runtime (~4 s) before this proof's fixtures are
    // listed and its 9 s windows would close early. This proof measures the fixtures; the runtime is `pnpm code-intel-proof`'s.
    'mcp_servers:', '  code_intelligence: { enabled: false }',
    `  alpha: { command: ${y(node)}, args: ${y(alphaArgs)}, env: { ALPHA_KEY: placeholder, FROM_SHELL: "${'${PROOF_SHELL_VALUE}'}" }${alphaTimeout === null ? '' : `, request_timeout: ${alphaTimeout}`} }`,
    `  beta: { command: ${y(node)}, args: ${y(betaArgs)}, disabled_tools: [fail], tool_name_map: { extra: renamed_extra } }`,
    '  off: { command: node, args: [nothing.js], enabled: false }',
    '  ghost: { command: no-such-command-xyz }',
    `  browser: { command: ${y(runnerCmd)}, args: ${y([fixture, '--pid-file', join(pids, 'browser.pids')])} }`,
    'personas:',
    '  orchestrator: { mcp_servers: [alpha, beta, gamma], mcp_tools: { beta: [echo, nothing, extra] } }',
    ...Object.entries(personas).map(([role, v]) => `  ${role}: ${v}`),
    '',
  ];
  return lines.join('\n');
}
const WORKSPACE = ['# workspace configuration', 'runtime:', '  permission_mode: autonomous', '  allow_unsandboxed_autonomous: true', 'rotaris:', '  delegation_strategy: single', ''].join('\n');
const MCP_JSON = `{\n  "mcpServers": {\n    "gamma": { "command": ${y(node)}, "args": ${y([fixture, '--pid-file', join(pids, 'gamma.pids')])}, "envFile": ".env", "weird": true }\n  }\n}\n`;
writeFileSync(join(configDir, 'secrets.yaml'), 'alpha:\n  ALPHA_KEY: "sk-proof-secret-value-1234"\n');


function oneDatabase() {
  const found = [];
  const walk = (dir) => { if (!existsSync(dir)) return; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name === 'workspace.db') found.push(p); } };
  walk(local);
  if (found.length !== 1) throw new Error(`expected one workspace database below ${local}; found ${found.length}`);
  return found[0];
}
function resetPids() { for (const f of ['alpha', 'beta', 'gamma', 'browser']) writeFileSync(join(pids, `${f}.pids`), ''); }
const pidLines = (name) => readFileSync(join(pids, `${name}.pids`), 'utf8').split('\n').filter((l) => l.trim() !== '');
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

function launch(name, extra, { files = {}, timeout = 150_000 } = {}) {
  writeFileSync(join(configDir, 'agents.yaml'), files.global ?? globalYaml());
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), files.workspace ?? WORKSPACE);
  writeFileSync(join(workspace, '.mcp.json'), files.mcpJson ?? MCP_JSON);
  resetPids();
  const png = join(output, `${name}.png`);
  const started = Date.now();
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), workspace], {
    cwd: app, encoding: 'utf8', timeout, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local, preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_INTENT_SCRIPT: 'explicit_trivial', ROTARIS_CIRCUIT_BREAKER: 'off', ROTARIS_CAPTURE_PNG: png,
      PROOF_SHELL_VALUE: 'from-the-shell', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const elapsedMs = Date.now() - started;
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  return { log, elapsedMs, png };
}
const lines = (log, re) => log.split('\n').filter((l) => re.test(l));
function latestSession(db) {
  return db.prepare('SELECT session_id, execution_status, stop_reason FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
}
function toolRows(db, sessionId, tool) {
  return db.prepare(`SELECT ordinal, status, is_error, entry FROM tool_calls WHERE session_id = ? AND tool_name = ? ORDER BY ordinal`).all(sessionId, tool).map((r) => ({ ...r, entry: JSON.parse(r.entry) }));
}
function eventOrdinals(db, sessionId, kind) {
  return db.prepare('SELECT ordinal, payload FROM events WHERE session_id = ? AND kind = ? ORDER BY ordinal').all(sessionId, kind);
}
const results = {};

// ---- 1. Discovery and the prompt -----------------------------------------------------------------------------
{
  writeFileSync(join(workspace, '.mcp.json'), MCP_JSON);
  const before = sha(join(workspace, '.mcp.json'));
  const r = launch('discovery', { ROTARIS_CAPTURE_PROMPT: 'call echo on alpha', ROTARIS_SCRIPT: 'mcp:alpha.echo,answer', ROTARIS_CAPTURE_AFTER_MS: '9000' });
  if (sha(join(workspace, '.mcp.json')) !== before) throw new Error('the discovery file changed across the load (REQ-MCP-027)');
  const surface = lines(r.log, /mcp: surface for orchestrator/);
  if (surface.length === 0) throw new Error(`no surface line:\n${r.log}`);
  const first = surface[0];
  const section = JSON.parse(first.slice(first.indexOf('section ') + 'section '.length));
  const expectedSection = [
    '## MCP servers', '',
    '- **`alpha`**', '  - `echo` — Echo the text back.', '  - `extra` — Present until the list changes.', '  - `fail`', '  - `lsp_init` — Initialise against a root.', '  - `slow` — Answer after a delay.',
    '- **`beta`**', '  - `beta_echo` — Echo the text back.', '  - `renamed_extra` — Present until the list changes.',
    '- **`gamma`**', '  - `gamma_echo` — Echo the text back.', '  - `gamma_extra` — Present until the list changes.', '  - `gamma_fail`', '  - `gamma_lsp_init` — Initialise against a root.', '  - `gamma_slow` — Answer after a delay.',
  ].join('\n');
  if (section !== expectedSection) throw new Error(`the MCP section is not character-exact:\n--- got\n${section}\n--- expected\n${expectedSection}`);
  const callable = /callable (.*?); dropped/.exec(first)[1];
  if (callable !== 'alpha[echo,extra,fail,lsp_init,slow] beta[beta_echo,renamed_extra] gamma[gamma_echo,gamma_extra,gamma_fail,gamma_lsp_init,gamma_slow]') throw new Error(`the callable set differs from the section: ${callable}`);
  const inert = lines(r.log, /grants 'nothing' on server 'beta'.*inert/);
  if (inert.length !== 1) throw new Error(`the inert grant was reported ${inert.length} times, not once`);
  const loads = lines(r.log, /configuration: loaded in/).length;
  const weird = lines(r.log, /server 'gamma' carries the key 'weird'/).length;
  if (loads < 1 || weird !== loads) throw new Error(`gamma's unknown key warned ${weird} times over ${loads} loads`);
  const disc = lines(r.log, /mcp: discovery of '/);
  const db = new Database(oneDatabase(), { readonly: true });
  const s = latestSession(db);
  const echo = toolRows(db, s.session_id, 'echo');
  db.close();
  if (s.execution_status !== 'completed') throw new Error(`the run ended ${s.execution_status}`);
  if (echo.length !== 1 || echo[0].status !== 'ok' || !String(echo[0].entry.result ?? '').includes('hello from the scripted agent')) throw new Error(`echo did not succeed: ${JSON.stringify(echo)}`);
  const env = lines(r.log, /stderr/);
  results.discovery = { section, callable, inertReports: inert.length, loads, unknownKeyWarnings: weird, discoveryMs: Object.fromEntries(disc.map((l) => [/discovery of '(\w+)'/.exec(l)[1], Number(/in (\d+) ms/.exec(l)?.[1])])), fileByteIdentical: true, stderrLines: env.length };
}

// ---- 2. A call end to end, and the allowance ------------------------------------------------------------------
{
  const r = launch('call', { ROTARIS_CAPTURE_PROMPT: 'slow then echo', ROTARIS_SCRIPT: 'mcp:alpha.slow,mcp:alpha.echo,answer', ROTARIS_CAPTURE_AFTER_MS: '12000' }, { files: { global: globalYaml({ alphaTimeout: 2 }) } });
  const db = new Database(oneDatabase(), { readonly: true });
  const s = latestSession(db);
  const slow = toolRows(db, s.session_id, 'slow');
  const echo = toolRows(db, s.session_id, 'echo');
  const starts = eventOrdinals(db, s.session_id, 'tool.start');
  const finishes = eventOrdinals(db, s.session_id, 'tool.finish');
  db.close();
  if (slow.length !== 1 || slow[0].status !== 'failed' || !/alpha.*did not answer.*within its allowance of 2 s/.test(String(slow[0].entry.result ?? slow[0].entry.error ?? ''))) throw new Error(`slow did not fail on its allowance: ${JSON.stringify(slow)}`);
  if (echo.length !== 1 || echo[0].status !== 'ok') throw new Error(`echo after the timeout did not succeed: ${JSON.stringify(echo)}`);
  if (starts.length < 2 || finishes.length < 2 || starts[0].ordinal >= finishes[0].ordinal) throw new Error('tool.start was not observed before tool.finish');
  const connected = lines(r.log, /mcp alpha: connected for the session/);
  if (connected.length !== 1) throw new Error(`alpha connected ${connected.length} times; the connection should have served both calls`);
  const firstCall = /in (\d+) ms/.exec(connected[0])?.[1];
  results.call = { slow: slow[0].status, slowText: String(slow[0].entry.result ?? '').slice(0, 160), echo: echo[0].status, startBeforeFinish: true, connectMs: Number(firstCall), sessionLaunches: pidLines('alpha').length };
}

// ---- 3. One connection per server per session ---------------------------------------------------------------
{
  const r = launch('one-process', {
    ROTARIS_CAPTURE_PROMPT: 'fan out', ROTARIS_SCRIPT: 'delegate:coding-agent:one,delegate:coding-agent:two,wait:2500,delegate:coding-agent:three,wait:2500,answer', ROTARIS_CHILD_SCRIPT: 'mcp:alpha.echo,answer', ROTARIS_CAPTURE_AFTER_MS: '16000', ROTARIS_INTENT_SCRIPT: 'moderate_feature',
  }, { files: { global: globalYaml({ personas: { 'coding-agent': '{ mcp_servers: [alpha] }' } }), workspace: WORKSPACE.replace('  delegation_strategy: single\n', '  delegation_strategy: orchestrator\n') } });
  const db = new Database(oneDatabase(), { readonly: true });
  const s = latestSession(db);
  const echo = toolRows(db, s.session_id, 'echo');
  const children = db.prepare('SELECT canonical_name, state, granted_mcp FROM children WHERE session_id = ? ORDER BY spawned_at').all(s.session_id);
  db.close();
  const connected = lines(r.log, /mcp alpha: connected for the session \(pid (\d+)/).map((l) => /pid (\d+)/.exec(l)[1]);
  if (echo.length !== 3 || echo.some((e) => e.status !== 'ok')) throw new Error(`three children should each have called echo once: ${JSON.stringify(echo.map((e) => e.status))}`);
  if (connected.length !== 1) throw new Error(`alpha was connected ${connected.length} times for one session (REQ-MCP-067)`);
  const launches = pidLines('alpha');
  // One discovery launch plus exactly one session launch.
  if (launches.length !== 2) throw new Error(`alpha was launched ${launches.length} times (one discovery, one session expected)`);
  const evidence = JSON.parse(children[0].granted_mcp);
  if (!evidence.granted?.alpha?.includes('echo') || !evidence.servers?.some((x) => x.name === 'alpha' && x.fate === 'connected')) throw new Error(`the child's evidence is wrong: ${children[0].granted_mcp}`);
  results.oneProcess = { children: children.map((c) => `${c.canonical_name}:${c.state}`), sessionPid: connected[0], launches: launches.length, evidence };
}

// ---- 4. Narrowing ---------------------------------------------------------------------------------------------
{
  const r = launch('narrowing', { ROTARIS_CAPTURE_PROMPT: 'echo then extra', ROTARIS_SCRIPT: 'mcp:alpha.echo,wait:2000,mcp:alpha.extra,answer', ROTARIS_CAPTURE_AFTER_MS: '12000' }, { files: { global: globalYaml({ alphaFlags: ['--rename-after', '300'] }) } });
  const db = new Database(oneDatabase(), { readonly: true });
  const s = latestSession(db);
  const extra = toolRows(db, s.session_id, 'extra');
  db.close();
  const withdrawn = lines(r.log, /'extra' withdrawn from orchestrator's callable set/);
  if (withdrawn.length !== 1) throw new Error(`the narrowing was not logged once: ${withdrawn.length}`);
  if (extra.length !== 1 || extra[0].status !== 'failed' || !/Unknown tool 'extra'/.test(String(extra[0].entry.result ?? ''))) throw new Error(`the withdrawn tool was not refused: ${JSON.stringify(extra)}`);
  const sections = lines(r.log, /mcp: surface for orchestrator/).length;
  if (sections !== 1) throw new Error(`the prompt was rendered ${sections} times (a narrowing must not re-render it)`);
  results.narrowing = { withdrawnOnce: true, refused: extra[0].status, promptRenders: sections };
}

// ---- 5. Unreachable after connect ---------------------------------------------------------------------------
{
  const r = launch('crash', { ROTARIS_CAPTURE_PROMPT: 'slow then echo after a crash', ROTARIS_SCRIPT: 'mcp:alpha.slow,mcp:alpha.echo,mcp:beta.beta_echo,answer', ROTARIS_CAPTURE_AFTER_MS: '14000' }, { files: { global: globalYaml({ alphaFlags: ['--crash-after', '200'] }) } });
  const db = new Database(oneDatabase(), { readonly: true });
  const s = latestSession(db);
  const slow = toolRows(db, s.session_id, 'slow');
  const echo = toolRows(db, s.session_id, 'echo');
  const issues = db.prepare("SELECT message FROM issues WHERE session_id = ? AND kind = 'mcp_config'").all(s.session_id).map((i) => i.message);
  const betaEcho = toolRows(db, s.session_id, 'beta_echo');
  db.close();
  if (slow.length !== 1 || slow[0].status !== 'failed') throw new Error(`the in-flight call did not fail: ${JSON.stringify(slow)}`);
  if (echo.length !== 1 || echo[0].status !== 'ok' || betaEcho.length !== 1 || betaEcho[0].status !== 'ok') throw new Error(`the calls after the crash did not both succeed: ${JSON.stringify([...echo, ...betaEcho].map((e) => e.status))}`);
  const unreachable = issues.filter((m) => /alpha.*unreachable/.test(m));
  if (unreachable.length !== 1) throw new Error(`the unreachable warning was recorded ${unreachable.length} times: ${JSON.stringify(issues)}`);
  const connected = lines(r.log, /mcp alpha: connected for the session/).length;
  if (connected !== 2) throw new Error(`alpha should have been connected twice (before and after the crash), was ${connected}`);
  results.crash = { slow: slow[0].status, echoes: [...echo, ...betaEcho].map((e) => e.status), unreachableIssues: unreachable.length, alphaConnections: connected, alphaLaunches: pidLines('alpha').length };
}

// ---- 6. Drop rules, the session toggle, the relaunch --------------------------------------------------------
{
  const global6 = globalYaml({ personas: { 'coding-agent': '{ mcp_servers: [alpha, beta, nope, ghost, off] }' } }).replace('  orchestrator: { mcp_servers: [alpha, beta, gamma], mcp_tools: { beta: [echo, nothing, extra] } }', '  orchestrator: { mcp_servers: [alpha, beta, nope, ghost, off] }');
  const r = launch('drop-rules', {
    ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'MCP Servers',
    ROTARIS_CAPTURE_CLICKS: 'button[aria-label="Enable beta for this session"]@2200',
    ROTARIS_CAPTURE_PROBE_AT: 'tr[data-mcp-server="beta"] [data-enablement]@3200',
    ROTARIS_CAPTURE_PROMPT: 'delegate once', ROTARIS_CAPTURE_PROMPT_MS: '3600', ROTARIS_SCRIPT: 'delegate:coding-agent:one,answer', ROTARIS_CHILD_SCRIPT: 'mcp:alpha.echo,answer', ROTARIS_INTENT_SCRIPT: 'moderate_feature',
    ROTARIS_CAPTURE_AFTER_MS: '14000',
  }, { files: { global: global6, workspace: WORKSPACE.replace('  delegation_strategy: single\n', '  delegation_strategy: orchestrator\n') } });
  const wording = lines(r.log, /probe-at 3200/)[0] ?? '';
  if (!/Overridden for this session/.test(wording) || !/not persistent/.test(wording) || !/enabled in the configuration file/.test(wording)) throw new Error(`the overridden row's wording is wrong: ${wording}`);
  const db = new Database(oneDatabase(), { readonly: true });
  const s = latestSession(db);
  const children = db.prepare('SELECT canonical_name, granted_mcp FROM children WHERE session_id = ?').all(s.session_id);
  const issues = db.prepare("SELECT message FROM issues WHERE session_id = ? AND kind = 'mcp_config'").all(s.session_id).map((i) => i.message);
  db.close();
  const evidence = JSON.parse(children[0].granted_mcp);
  const fates = Object.fromEntries(evidence.servers.map((x) => [x.name, x.reason ?? x.fate]));
  if (fates.alpha !== 'connected' || fates.beta !== 'disabled' || fates.nope !== 'not-configured' || fates.ghost !== 'unavailable' || fates.off !== 'disabled') throw new Error(`the recorded fates are wrong: ${JSON.stringify(fates)}`);
  if (Object.keys(evidence.granted).sort().join() !== 'alpha') throw new Error(`granted should hold alpha only: ${JSON.stringify(evidence.granted)}`);
  if (!issues.some((m) => /'nope', which is not configured/.test(m))) throw new Error('the missing-server warning was not recorded as an issue');
  if (!issues.some((m) => /'ghost' is unavailable/.test(m))) throw new Error('the unavailable warning was not recorded as an issue');
  if (issues.some((m) => /'off'/.test(m) || /'beta'/.test(m))) throw new Error(`a disabled server produced an issue: ${JSON.stringify(issues)}`);
  const detailed = lines(r.log, /raw command 'no-such-command-xyz'/).length;
  const perPersona = lines(r.log, /'ghost' is unavailable/).length;
  if (detailed !== 1) throw new Error(`the detailed unavailable line appeared ${detailed} times in one process (once expected)`);
  if (perPersona < 2) throw new Error(`the per-persona warning appeared ${perPersona} times (two personas resolved)`);
  // Relaunch: the override is gone (REQ-MCP-115).
  const again = launch('drop-rules-relaunch', { ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'MCP Servers', ROTARIS_CAPTURE_PROBE: 'tr[data-mcp-server="beta"]', ROTARIS_CAPTURE_AFTER_MS: '2500' }, { files: { global: global6 } });
  const probe = lines(again.log, /capture: probe tr\[data-mcp-server="beta"\]/)[0] ?? '';
  if (!/"data-overridden":"no"/.test(probe) || !/"data-enabled":"yes"/.test(probe)) throw new Error(`after a relaunch beta should be back to its configured value: ${probe}`);
  results.dropRules = { fates, granted: evidence.granted, issues, detailedLineCount: detailed, perPersonaWarnings: perPersona, overriddenWording: wording.slice(wording.indexOf('→') + 1).trim().slice(0, 200), relaunchOverrideGone: true };
}

// ---- 7. The Settings category ---------------------------------------------------------------------------------
{
  const r = launch('settings', {
    ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'MCP Servers',
    // Part T (2026-09-06): the shipped `code_intelligence` row is probed too (available unconditionally, REQ-MCP-037) and the
    // bundled runtime answers in ~4.2 s, so a probe round takes ~5 s; the second click and the capture wait for it.
    ROTARIS_CAPTURE_CLICKS: 'button[data-action="check-status"]@1800;;button[data-action="check-status"]@12000',
    ROTARIS_CAPTURE_SELECT: 'select[aria-label="Secrets for"]>>alpha@9000',
    ROTARIS_CAPTURE_PROBE_AT: 'button[data-action="check-status"]@2000;;tr[data-mcp-server] [data-health-text]@2000',
    ROTARIS_CAPTURE_PROBE: 'tr[data-mcp-server];;tr[data-mcp-server] [data-health-text];;button[data-action="check-status"];;[data-secret-row];;[data-mask];;[data-expected];;[data-scope];;[data-line]',
    ROTARIS_CAPTURE_AFTER_MS: '19000',
  });
  const during = lines(r.log, /probe-at 2000 button/)[0] ?? '';
  if (!/Checking…/.test(during)) throw new Error(`the button did not read Checking… while probing: ${during}`);
  const duringRows = lines(r.log, /probe-at 2000 tr\[data-mcp-server\] \[data-health-text\]/)[0] ?? '';
  if (!/Checking…/.test(duringRows)) throw new Error(`no row showed checking during the probe: ${duringRows}`);
  const rows = JSON.parse((lines(r.log, /capture: probe tr\[data-mcp-server\] →/)[0] ?? '').split(' → ')[1] ?? '[]');
  const health = Object.fromEntries(rows.map((x) => [x.data['data-mcp-server'], x.data['data-health']]));
  if (health.alpha !== 'healthy' || health.beta !== 'healthy' || health.gamma !== 'healthy') throw new Error(`the fixtures should be healthy: ${JSON.stringify(health)}`);
  // REQ-MCP-113 through the built application: the `.cmd` runner standing in for `browser` is reached through cmd.exe and answers.
  if (health.browser !== 'healthy') throw new Error(`the .cmd runner standing in for browser should probe healthy through the wrap: ${JSON.stringify(health)}`);
  if (health.ghost !== 'unreachable' || health.off !== 'unreachable') throw new Error(`the unavailable and the not-installed servers should be unreachable: ${JSON.stringify(health)}`);
  const texts = JSON.parse((lines(r.log, /capture: probe tr\[data-mcp-server\] \[data-health-text\] →/)[0] ?? '').split(' → ')[1] ?? '[]').map((x) => x.text);
  if (!texts.some((t) => /Healthy · 5 tools/.test(t))) throw new Error(`no healthy row shows its tool count: ${JSON.stringify(texts)}`);
  const button = JSON.parse((lines(r.log, /capture: probe button\[data-action="check-status"\] →/)[0] ?? '').split(' → ')[1] ?? '[]')[0];
  if (!button || button.text !== 'Check status') throw new Error(`the button did not re-enable: ${JSON.stringify(button)}`);
  if (pidLines('alpha').length !== 2) throw new Error(`alpha was contacted ${pidLines('alpha').length} times by two probes (REQ-MCP-054)`);
  const masks = JSON.parse((lines(r.log, /capture: probe \[data-mask\] →/)[0] ?? '').split(' → ')[1] ?? '[]').map((x) => x.text);
  if (masks.length !== 1 || masks[0] !== '***') throw new Error(`the secret is not masked with the one marker: ${JSON.stringify(masks)}`);
  const scopes = JSON.parse((lines(r.log, /capture: probe \[data-scope\] →/)[0] ?? '').split(' → ')[1] ?? '[]').map((x) => x.text);
  const expected = JSON.parse((lines(r.log, /capture: probe \[data-expected\] →/)[0] ?? '').split(' → ')[1] ?? '[]').map((x) => `${x.data['data-expected']}:${x.data['data-satisfied']}`);
  if (scopes[0] !== 'Global') throw new Error(`the secret's scope is wrong: ${JSON.stringify(scopes)}`);
  if (expected.join(',') !== 'ALPHA_KEY:yes,FROM_SHELL:no') throw new Error(`the expected-keys hint is wrong: ${JSON.stringify(expected)}`);
  const linesShown = JSON.parse((lines(r.log, /capture: probe \[data-line\] →/)[0] ?? '').split(' → ')[1] ?? '[]').map((x) => x.text);
  if (linesShown.some((l) => /sk-proof-secret/.test(l))) throw new Error('a stored secret value reached a rendered line');
  if (/sk-proof-secret-value-1234/.test(r.log)) throw new Error('the stored secret value appeared in a log line');
  const unreachable = rows.find((x) => x.data['data-mcp-server'] === 'ghost');
  results.settings = { health, healthTexts: texts, probesPerServer: pidLines('alpha').length, mask: masks[0], scope: scopes[0], expected, ghostDetail: unreachable?.text?.slice(0, 160) ?? '', png: r.png };
}

// ---- 8. Fatal YAML defects; the same in the discovery file --------------------------------------------------
{
  const broken = `${globalYaml()}\n`.replace('mcp_servers:\n', 'mcp_servers:\n  nocmd: { type: stdio }\n  badtimeout: { command: node, request_timeout: -1 }\n');
  const r = launch('fatal', { ROTARIS_CAPTURE_PROMPT: 'run on a broken file', ROTARIS_CAPTURE_AFTER_MS: '4000' }, { files: { global: broken } });
  const refusal = lines(r.log, /could not be loaded/)[0] ?? '';
  if (!/mcp_servers\.nocmd\.command/.test(refusal) || !/mcp_servers\.badtimeout\.request_timeout/.test(refusal)) throw new Error(`the refusal did not report both defects: ${refusal}`);
  if (/session .* started/.test(r.log)) throw new Error('a run started on a fatal configuration');
  const mcpJson = `{\n  "mcpServers": {\n    "nocmd": { "type": "stdio" },\n    "empty": { "command": "" },\n    "gamma": { "command": ${y(node)}, "args": ${y([fixture])} }\n  }\n}\n`;
  const r2 = launch('fatal-discovered', { ROTARIS_CAPTURE_PROMPT: 'run with dropped discovered entries', ROTARIS_SCRIPT: 'mcp:gamma.gamma_echo,answer', ROTARIS_CAPTURE_AFTER_MS: '9000' }, { files: { mcpJson } });
  const dropped = lines(r2.log, /the entry is dropped \(REQ-MCP-023\)/);
  if (dropped.length < 2) throw new Error(`the discovered defects were not dropped: ${dropped.length}`);
  if (!/ended completed/.test(r2.log)) throw new Error('the run with dropped discovered entries did not complete');
  results.fatal = { refusal: refusal.slice(0, 400), droppedDiscovered: dropped.length / Math.max(1, lines(r2.log, /configuration: loaded in/).length), discoveredRunCompleted: true };
}

// ---- 9. Exit under an outstanding discovery -------------------------------------------------------------------
{
  // The run's first port waits on the mute server's discovery; the bound fires at 35 s, the run proceeds with alpha listed bare,
  // and the user closes the window at 40 s — the exit must follow without waiting on anything.
  const r = launch('exit-bound', { ROTARIS_CAPTURE_PROMPT: 'a server that never answers', ROTARIS_SCRIPT: 'mcp:alpha.echo,answer', ROTARIS_CAPTURE_AFTER_MS: '60000', ROTARIS_CAPTURE_QUIT_MS: '40000' }, { files: { global: globalYaml({ alphaFlags: ['--never-init'] }) }, timeout: 120_000 });
  const disc = lines(r.log, /mcp: discovery of 'alpha' failed/)[0] ?? '';
  const ms = Number(/in (\d+) ms/.exec(disc)?.[1] ?? NaN);
  if (!(ms >= 34_000 && ms <= 35_500)) throw new Error(`discovery did not return at the 35 s bound: ${disc}`);
  if (!/mcp: surface for orchestrator — callable alpha\[\]/.test(r.log)) throw new Error('the run did not proceed with alpha listed bare after the bound');
  const quitAt = 40_000;
  if (r.elapsedMs > quitAt + 15_000) throw new Error(`the application took ${r.elapsedMs} ms to exit after the quit at ${quitAt} ms`);
  results.exitBound = { discoveryMs: ms, launchMs: r.elapsedMs, quitAtMs: quitAt, exitAfterQuitMs: r.elapsedMs - quitAt, exited: true };
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
