/**
 * The MCP proof (Part S): ADR-0033 and ADR-0034's first execution behind the real run host — the hand-written
 * fixture server (`fixtures/mcp-fixture-server.mjs`) declared three ways (global YAML, a workspace `.mcp.json`
 * with an envFile and an unknown key, a workspace YAML overlay), a persona carrying the three with a grant, a
 * denial and a rename, one stored secret, and fifteen launches against one scratch profile:
 *
 *   1. discovery   — the prompt's MCP section character-exact and equal to the callable set; the inert grant reported
 *                    once; gamma's unknown key warned once per load; the discovery file byte-identical after the run;
 *                    the system prompt the model port received closes the workspace's `AGENTS.md` with the end comment
 *                    before the section's heading, so the heading is not read as the file's own (REQ-WORKSPACE-043 with
 *                    REQ-MCP-101; nothing stood between them until 2026-10-06, finding H4 of the duress run at 27a5127);
 *                    every handshake tells the server `rotaris` at the version `apps/desktop/package.json` declares
 *                    (REQ-STARTUP-158 — the client carried a literal `0.1.0` until 2026-09-27).
 *   2. call        — `echo` end to end (tool.start before tool.finish, the result text, the row succeeded); `slow` beyond
 *                    `request_timeout: 2` fails naming the server and the connection serves the following `echo` (003/069);
 *                    its `terminal_timeout` issue names the call, never a terminal command (REQ-SESSION-136, finacc3 A2-08).
 *  2b. schema      — `echo` without its required `text` is refused at the gate (`invalid_request`, REQ-TOOLS-032's text, a
 *                    `tool_error` issue referencing it) and never reaches the fixture; `beta_echo` with an extra property
 *                    reaches it exactly as written (live-run finding G3).
 *  2c. cancel      — the application quit by SIGTERM while the fixture holds `slow` (60 s, under a 120 s allowance): the call
 *                    reads failed / `interrupted`, "The call to 'slow' on MCP server 'alpha' was cancelled by the run before it
 *                    completed; it was not retried.", files no `tool_error` or `terminal_timeout` issue, and counts under
 *                    `summary.md`'s `interrupted` bucket (PD-TOOLS-013 revision 2 (c), (d)). `cancel-throw` is the same with
 *                    the run host's `ROTARIS_CAPTURE_THROW_ON_ABORT=slow`, an executor that throws on the cancel: the gate's
 *                    "The 'slow' call was cancelled by the run before it completed." (revision 2 (a)). Since fin42 (N51).
 *   3. one process — two children calling alpha concurrently share one connection and one fixture process; a third
 *                    child after they end uses the same pid (067/068). The children's persona carries a `tool_restrictions`
 *                    list naming `read_file` and `echo`, and each child's row records that grant — `read_file` alone of its
 *                    native tools and `echo` alone under alpha — not its declared tools (REQ-MCP-065 with REQ-TOOLS-006;
 *                    the row recorded the declared set until 2026-10-01).
 *  3b. empty grant — a child whose `tool_restrictions` names `echo` alone: its row records an empty native grant marked
 *                    `recorded`, and the inspector, the child selected, lists no native tool and `echo` used under alpha
 *                    (REQ-MONITOR-049/060; the declared tools stood in for that empty grant until 2026-10-01). Driven.
 *   4. narrowing   — `--rename-after` withdraws `extra` mid-run; calling it is refused; the prompt is not re-rendered.
 *   5. crash       — `--crash-after` fails the call in flight, one warning issue, the next call re-establishes (069).
 *   6. drop rules  — an unknown server, an unavailable command, `enabled: false`, a server whose tool discovery fails
 *                    and a session toggle off from the Settings category → absent from the run, the row's wording, the
 *                    child's recorded evidence and its inspector, the failed server drawn "dropped — discovery-failed"
 *                    with no tools (114 with 042; drawn "connected" until 2026-10-03), its failure one warning on one
 *                    line carrying its stderr and no restated fact in the log (048, finding U4); a relaunch shows the
 *                    override gone (115). Driven: each step waits for its condition.
 *   7. settings    — Check status → checking then healthy/unreachable, the button disabled while probing, probed twice
 *                    → the fixture contacted twice (054); the secrets card masked and scoped; the PNG. The `.cmd`
 *                    runner's health (REQ-MCP-113's wrap) is asserted on win32 only and stated not applicable elsewhere.
 *                    Driven, as 6 is.
 *   8. fatal YAML  — a stdio entry without a command and a bad request_timeout: both reported, the load rejected; the
 *                    same defects in `.mcp.json` drop the entries and the run proceeds.
 *   9. exit bound  — a server that never answers initialize: discovery returns empty at ≤ 35 s (read from the REQ-MCP-048
 *                    warning, the failure's one record since 2026-10-03) and the application exits.
 *
 * Evidence under `.proof/mcp-proof/`: one log and PNG per launch, `<name>.steps.json` for each driven launch (every
 * step, when it ran, what it answered), `results.json`. `--skip-build` skips the build.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, configDirFor, findDatabases, hostSwitches, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { choose, startApp, stopApp, stopOverrunMessage, until } from './lib/driver.mjs';
import { restatedFacts } from './lib/restated-facts.mjs';

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
// By the platform that reads it (`configDirFor`), never the Windows spelling alone: off Windows the product reads
// `<XDG_CONFIG_HOME>/rotaris`, so a file written at `<local>/rotaris/config` was never opened and launch 1 failed on
// the shipped grant (`docs/defects/fixed/mcp-proof-writes-its-global-configuration-where-posix-never-reads-it.md`).
const configDir = configDirFor(local);
const preferences = join(root, 'preferences');
const pids = join(output, 'pids');
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
mkdirSync(configDir, { recursive: true });
mkdirSync(pids, { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# MCP proof workspace\n');
// The workspace is a repository of its own, as a project is: the skill catalog's project walk stops at the nearest `.git`
// (REQ-WORKSPACE-051), and without one it climbed to this checkout's root and listed the repository's own skills
// (docs/defects/fixed/the-mcp-proofs-runs-list-the-repositorys-own-skills-in-their-catalog.md).
if (!existsSync(join(workspace, '.git'))) {
  const init = spawnSync('git', ['init', '-q'], { cwd: workspace, encoding: 'utf8', timeout: 30_000 });
  if (init.status !== 0) throw new Error(`git init in the proof's workspace exited ${init.status ?? init.signal}: ${init.stderr}`);
}
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

async function launch(name, extra, { files = {}, timeout = 150_000 } = {}) {
  writeFileSync(join(configDir, 'agents.yaml'), files.global ?? globalYaml());
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), files.workspace ?? WORKSPACE);
  writeFileSync(join(workspace, '.mcp.json'), files.mcpJson ?? MCP_JSON);
  resetPids();
  const png = join(output, `${name}.png`);
  const started = Date.now();
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
    cwd: app, timeoutMs: timeout, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local, preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_INTENT_SCRIPT: 'explicit_trivial', ROTARIS_CIRCUIT_BREAKER: 'off', ROTARIS_CAPTURE_PNG: png,
      PROOF_SHELL_VALUE: 'from-the-shell', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      // PD-MONITOR-002: a child's stderr is `debug`, which the application log leaves out at its `info` default. This
      // proof counts those lines and asserts no stored secret reaches ANY log line, so it records every level.
      ROTARIS_APP_LOG_LEVEL: 'debug',
      ...extra,
    },
  });
  const elapsedMs = Date.now() - started;
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
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

/**
 * Launches 6 and 7 are DRIVEN (`lib/driver.mjs`), not scheduled: every click, choice and read waits for the condition
 * it needs. Their first form fired `ROTARIS_CAPTURE_CLICKS`/`_PROBE_AT`/`_SELECT` at fixed offsets from the window's
 * load, and on a loaded host the drop-rules launch clicked a toggle that was not on screen yet and read `[]` at
 * 3,200 ms, then — on another run — probed the relaunch's row at 2,500 ms before it was drawn: two reds about
 * REQ-MCP-115 the product had not earned
 * (`docs/defects/fixed/mcp-proofs-drop-rules-launch-clicks-at-a-fixed-offset.md`). The assertions are the same ones.
 *
 * Each step is recorded in `<name>.steps.json` beside the launch's log — when it began (`at`), how long it took (`ms`)
 * and what it answered — so a red names the step that did not happen. The launch is bounded (`boundMs`) and ended by
 * `stopApp`, whose closing picture and quit are each bounded and which ends (SIGTERM, a grace, SIGKILL) and reports an
 * application that does not exit on the driver's quit rather than leaving it running beside the next launch; a launch
 * whose driver never answers is ended by `startApp` itself.
 */
const SETTLED = new Set(['completed', 'failed', 'stopped', 'interrupted', 'paused', 'paused_message_limit']);
async function drivenLaunch(name, extra, { files = {}, boundMs = 150_000 } = {}, steps) {
  writeFileSync(join(configDir, 'agents.yaml'), files.global ?? globalYaml());
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), files.workspace ?? WORKSPACE);
  writeFileSync(join(workspace, '.mcp.json'), files.mcpJson ?? MCP_JSON);
  resetPids();
  const png = join(output, `${name}.png`);
  const appLog = join(root, 'app.log');
  rmSync(appLog, { force: true });
  const trail = [];
  const started = Date.now();
  const launched = await startApp({
    root, workspace, timeoutMs: 60_000,
    extra: {
      ROTARIS_INTENT_SCRIPT: 'explicit_trivial', ROTARIS_CIRCUIT_BREAKER: 'off', PROOF_SHELL_VALUE: 'from-the-shell',
      // As `launch` above: every level, because this proof asserts no stored secret reaches ANY log line (PD-MONITOR-002).
      ROTARIS_APP_LOG_LEVEL: 'debug',
      ...extra,
    },
  });
  const step = async (label, pending) => {
    const at = Date.now() - started;
    try {
      const value = await pending;
      trail.push({ at, ms: Date.now() - started - at, label, value });
      return value;
    } catch (cause) {
      trail.push({ at, ms: Date.now() - started - at, label, error: cause instanceof Error ? cause.message : String(cause) });
      throw cause;
    }
  };
  let value;
  let failure = null;
  let bound;
  try {
    value = await Promise.race([
      steps(launched.driver, step),
      new Promise((_, reject) => { bound = setTimeout(() => reject(new Error(`the steps did not finish within ${boundMs} ms`)), boundMs); }),
    ]);
  } catch (cause) {
    failure = cause;
  } finally {
    clearTimeout(bound);
  }
  // The closing picture and the quit are each bounded inside `stopApp`: a main process that stopped answering its
  // driver is ended (SIGTERM, a grace, SIGKILL), not waited on.
  const stopped = await stopApp(launched, { screenshot: png });
  const log = existsSync(appLog) ? readFileSync(appLog, 'utf8') : '';
  writeFileSync(join(output, `${name}.log`), log);
  writeFileSync(join(output, `${name}.steps.json`), `${JSON.stringify(trail, null, 2)}\n`);
  if (failure) throw new Error(`${name}: ${failure.message}; see ${name}.log and ${name}.steps.json`);
  if (stopped.overran) throw new Error(`${stopOverrunMessage(name, stopped, log)}\n(see ${name}.log)`);
  if (stopped.exit.code !== 0) throw new Error(`${name} exited ${stopped.exit.code ?? stopped.exit.signal} on the driver's quit; see ${name}.log`);
  return { log, value, elapsedMs: Date.now() - started, png };
}
/** Settings → MCP Servers as a person reaches it: Ctrl+7 (REQ-SHELL-049), then the category by its name. */
async function openMcpSettings(d, step) {
  await step('the shell', d.waitFor('.app-shell', { timeoutMs: 60_000 }));
  await step('Ctrl+7', d.chord('Ctrl+7'));
  await step('the Settings view', d.waitFor('.app-shell[data-view="settings"]'));
  await step('the MCP Servers category', d.click('.nav-list__item', { text: 'MCP Servers' }));
  await step('the configured servers card', d.waitFor('[data-mcp-servers]'));
}
/** The prompt as the packaged prompt seam types it — Ctrl+2, Ctrl+L, the text, Enter — each once its condition holds. */
async function typePrompt(d, step, prompt) {
  await step('Ctrl+2', d.chord('Ctrl+2'));
  await step('the composer', d.waitFor('.composer__input'));
  await step('Ctrl+L', d.chord('Ctrl+L'));
  await step('the caret in the composer', until(() => d.eval(`document.activeElement?.classList.contains('composer__input') === true`), (v) => v === true, { what: 'the composer holding focus' }));
  await step('the prompt', d.type(prompt, { enter: true }));
}
/** The newest session's id, or null — read before a prompt, so the wait below cannot mistake an earlier launch's run for this one. */
function latestSessionId() {
  const [path] = findDatabases(local);
  if (!path) return null;
  const db = new Database(path, { readonly: true });
  try { return latestSession(db)?.session_id ?? null; } finally { db.close(); }
}
/** The newest session when it is not `before`, else null. */
function sessionAfter(before) {
  const [path] = findDatabases(local);
  if (!path) return null;
  const db = new Database(path, { readonly: true });
  try {
    const s = latestSession(db);
    return s && s.session_id !== before ? s : null;
  } finally { db.close(); }
}
/**
 * The probing state in ONE renderer turn, once the button says it is probing: the button's text and state and every
 * row's health text, together. Bounded at 15 s; a timeout is answered, not thrown, so the assertion names what it saw.
 */
const PROBING_SNAPSHOT = `new Promise((resolve) => {
  const started = performance.now();
  const tick = () => {
    const b = document.querySelector('button[data-action="check-status"]');
    const text = (b?.textContent || '').trim();
    if (text === 'Checking…') {
      resolve(JSON.stringify({ button: text, disabled: b.disabled, rows: [...document.querySelectorAll('tr[data-mcp-server] [data-health-text]')].map((x) => (x.textContent || '').trim()), waitedMs: Math.round(performance.now() - started) }));
      return;
    }
    if (performance.now() - started > 15000) { resolve(JSON.stringify({ timeout: true, button: text })); return; }
    setTimeout(tick, 20);
  };
  tick();
})`;
/** A probe round is over when the button is enabled and reads `Check status` again and no row still says `Checking…`. */
const ROUND_OVER = `(() => {
  const b = document.querySelector('button[data-action="check-status"]');
  if (!b || b.disabled || b.textContent.trim() !== 'Check status') return false;
  return ![...document.querySelectorAll('tr[data-mcp-server] [data-health-text]')].some((x) => (x.textContent || '').trim() === 'Checking…');
})()`;

// ---- 1. Discovery and the prompt -----------------------------------------------------------------------------
{
  writeFileSync(join(workspace, '.mcp.json'), MCP_JSON);
  const before = sha(join(workspace, '.mcp.json'));
  const clients = join(output, 'alpha.clients.jsonl');
  writeFileSync(clients, '');
  // The live run's shape: one instruction file whose own heading is a `#`, then the MCP section — nothing else between.
  const agentsMd = join(workspace, 'AGENTS.md');
  const agentsText = '# Working in this workspace\n\nThe MCP proof\'s instruction file. It names no server.';
  writeFileSync(agentsMd, `${agentsText}\n`);
  const modelRequests = join(output, 'discovery.model-requests.jsonl');
  writeFileSync(modelRequests, '');
  // The instruction file is this launch's alone: it is taken away whether the launch succeeds or throws, so a failed launch 1
  // never leaves it for the launches after it to read.
  let r;
  try {
    r = await launch('discovery', { ROTARIS_CAPTURE_PROMPT: 'call echo on alpha', ROTARIS_SCRIPT: 'mcp:alpha.echo,answer', ROTARIS_CAPTURE_AFTER_MS: '9000', ROTARIS_CAPTURE_MODEL_REQUESTS: modelRequests }, { files: { global: globalYaml({ alphaFlags: ['--client-file', clients] }) } });
  } finally {
    rmSync(agentsMd, { force: true });
  }
  if (sha(join(workspace, '.mcp.json')) !== before) throw new Error('the discovery file changed across the load (REQ-MCP-027)');
  // REQ-WORKSPACE-043 with REQ-MCP-101: the file is closed before the section (finding H4 of the duress run at 27a5127).
  const orchestratorCalls = readFileSync(modelRequests, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l)).filter((c) => c.who === 'orchestrator');
  if (orchestratorCalls.length === 0) throw new Error('the model port recorded no orchestrator call, so the prompt is unobserved');
  const system = orchestratorCalls[0].system;
  const fileStart = system.indexOf(`<!-- source: ${agentsMd} -->\n${agentsText}`);
  if (fileStart < 0) throw new Error(`the orchestrator's prompt does not carry AGENTS.md whole after its source comment:\n${system}`);
  const fileEnd = fileStart + `<!-- source: ${agentsMd} -->\n${agentsText}`.length;
  /*
   * The file is followed at once by the closing comment, and the MCP section at once by that: the live run's shape, where the
   * workspace declares no skill. The workspace is a repository of its own (`git init` above), so the skill catalog's project
   * walk (REQ-WORKSPACE-051) stops there; until 2026-10-06 it walked up to this checkout's root and every run's prompt listed
   * the repository's own development skills (`build-ui`, …) between the two
   * (docs/defects/fixed/the-mcp-proofs-runs-list-the-repositorys-own-skills-in-their-catalog.md).
   */
  const END = '<!-- end of instruction files: nothing below this line is part of them -->';
  const boundary = system.slice(fileEnd, fileEnd + END.length + 4);
  if (boundary !== `\n\n${END}\n\n`) throw new Error(`nothing closes AGENTS.md; after its last line stands ${JSON.stringify(system.slice(fileEnd, fileEnd + 200))}`);
  const headingAt = system.indexOf('## MCP servers', fileEnd);
  if (headingAt < fileEnd + boundary.length) throw new Error(`the MCP section does not follow the closed instruction files in the orchestrator's prompt:\n${system}`);
  const repositorySkills = readdirSync(join(repo, '.agents', 'skills'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).filter((name) => system.includes(name));
  if (/Portable skills available/.test(system) || repositorySkills.length > 0) throw new Error(`the orchestrator's prompt carries a skill catalog the workspace never declared (${repositorySkills.join(', ') || 'a catalog'}): the project walk left the workspace`);
  // PD-TOOLS-012 revision 2 (OQ-230): one unit stands between them, the product statement every agent receives last — one
  // paragraph naming the product's own directories — and nothing else.
  const between = system.slice(fileEnd + boundary.length, headingAt);
  if (!/^Product directories: [^\n]+\n\n$/.test(between) || !between.includes('`.rotaris/`') || !between.includes('info/exclude')) throw new Error(`something other than the product statement stands between the closed instruction files and the MCP section: ${JSON.stringify(between)}`);
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
  // REQ-STARTUP-158: the run host's handshakes (the discovery and the session's connection) name the declared version.
  const declared = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).version;
  const told = readFileSync(clients, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
  if (told.length < 2 || told.some((c) => c?.name !== 'rotaris' || c?.version !== declared)) throw new Error(`the MCP handshakes did not name rotaris ${declared} (REQ-STARTUP-158): ${JSON.stringify(told)}`);
  results.discovery = { section, promptBoundary: boundary, repositorySkillsInPrompt: repositorySkills, callable, inertReports: inert.length, loads, unknownKeyWarnings: weird, discoveryMs: Object.fromEntries(disc.map((l) => [/discovery of '(\w+)'/.exec(l)[1], Number(/in (\d+) ms/.exec(l)?.[1])])), fileByteIdentical: true, stderrLines: env.length, clientInfo: told };
}

// ---- 2. A call end to end, and the allowance ------------------------------------------------------------------
{
  const r = await launch('call', { ROTARIS_CAPTURE_PROMPT: 'slow then echo', ROTARIS_SCRIPT: 'mcp:alpha.slow,mcp:alpha.echo,answer', ROTARIS_CAPTURE_AFTER_MS: '12000' }, { files: { global: globalYaml({ alphaTimeout: 2 }) } });
  const db = new Database(oneDatabase(), { readonly: true });
  const s = latestSession(db);
  const slow = toolRows(db, s.session_id, 'slow');
  const echo = toolRows(db, s.session_id, 'echo');
  const starts = eventOrdinals(db, s.session_id, 'tool.start');
  const finishes = eventOrdinals(db, s.session_id, 'tool.finish');
  const issues = db.prepare('SELECT kind, message, evidence_ref FROM issues WHERE session_id = ? ORDER BY ordinal').all(s.session_id);
  db.close();
  if (slow.length !== 1 || slow[0].status !== 'failed' || !/alpha.*did not answer.*within its allowance of 2 s/.test(String(slow[0].entry.result ?? slow[0].entry.error ?? ''))) throw new Error(`slow did not fail on its allowance: ${JSON.stringify(slow)}`);
  if (echo.length !== 1 || echo[0].status !== 'ok') throw new Error(`echo after the timeout did not succeed: ${JSON.stringify(echo)}`);
  // REQ-SESSION-136: the timeout files `terminal_timeout` referencing the call, in the call's own words: no terminal command
  // ran (finacc3 A2-08; until then the message read "A terminal command exceeded its timeout.").
  const timedOut = issues.filter((i) => i.evidence_ref === `tool_call_evidence#${slow[0].entry.call_id}`);
  if (timedOut.length !== 1 || timedOut[0].kind !== 'terminal_timeout' || /terminal/i.test(timedOut[0].message) || !/^The '[^']*slow' call did not complete within its time allowance\.$/.test(timedOut[0].message)) throw new Error(`the MCP timeout's issue does not name the call that timed out (finacc3 A2-08): ${JSON.stringify(issues)}`);
  if (starts.length < 2 || finishes.length < 2 || starts[0].ordinal >= finishes[0].ordinal) throw new Error('tool.start was not observed before tool.finish');
  const connected = lines(r.log, /mcp alpha: connected for the session/);
  if (connected.length !== 1) throw new Error(`alpha connected ${connected.length} times; the connection should have served both calls`);
  const firstCall = /in (\d+) ms/.exec(connected[0])?.[1];
  results.call = { slow: slow[0].status, slowText: String(slow[0].entry.result ?? '').slice(0, 160), timeoutIssue: timedOut[0].message, echo: echo[0].status, startBeforeFinish: true, connectMs: Number(firstCall), sessionLaunches: pidLines('alpha').length };
}

// ---- 2b. A call that fails the advertised input schema is refused at the gate -----------------------------------
/*
 * REQ-TOOLS-032 for an MCP tool (live-run finding G3, default run at 27a5127): the model is handed the server's own
 * `inputSchema`, and a call that fails it is refused at the gate as `invalid_request` with a `tool_error` issue and never
 * sent; a valid call reaches the server exactly as written. Until 2026-10-06 the gate checked an MCP call against a
 * permissive record and `{}` for `echo` (whose schema requires `text`) was sent
 * (docs/defects/fixed/an-mcp-tool-call-that-fails-its-advertised-input-schema-reaches-the-server.md). The fixture's
 * `--call-file` writes every `tools/call` it receives, so "never sent" and "unchanged" are read at the server.
 */
{
  const calls = { alpha: join(output, 'schema.alpha.calls'), beta: join(output, 'schema.beta.calls') };
  for (const f of Object.values(calls)) writeFileSync(f, '');
  const asWritten = { text: 'sent as written', note: { kept: true } };
  const r = await launch('schema', {
    ROTARIS_CAPTURE_PROMPT: 'an invalid echo, then a valid one', ROTARIS_SCRIPT: 'mcp:alpha.echo,mcp:beta.beta_echo,answer', ROTARIS_CAPTURE_AFTER_MS: '9000',
    ROTARIS_SCRIPT_MCP_ARGS: JSON.stringify({ echo: {}, beta_echo: asWritten }),
  }, { files: { global: globalYaml({ alphaFlags: ['--call-file', calls.alpha], betaFlags: ['--call-file', calls.beta] }) } });
  const db = new Database(oneDatabase(), { readonly: true });
  const s = latestSession(db);
  const echo = toolRows(db, s.session_id, 'echo');
  const betaEcho = toolRows(db, s.session_id, 'beta_echo');
  const issues = db.prepare('SELECT kind, evidence_ref FROM issues WHERE session_id = ? ORDER BY ordinal').all(s.session_id);
  db.close();
  const received = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
  const alphaCalls = received(calls.alpha);
  const betaCalls = received(calls.beta);
  const refusal = String(echo[0]?.entry.result ?? '');
  if (echo.length !== 1 || echo[0].status !== 'failed' || echo[0].entry.failure_kind !== 'invalid_request') throw new Error(`echo without its required text was not refused as invalid_request: ${JSON.stringify(echo)}`);
  if (!refusal.startsWith("The arguments for 'echo' do not match its schema (text: ") || !refusal.endsWith('Re-issue the call with corrected arguments.')) throw new Error(`the refusal is not REQ-TOOLS-032's text: ${refusal}`);
  if (!issues.some((i) => i.kind === 'tool_error' && i.evidence_ref === `tool_call_evidence#${echo[0].entry.call_id}`)) throw new Error(`the refusal filed no tool_error issue referencing it: ${JSON.stringify(issues)}`);
  if (alphaCalls.length !== 0) throw new Error(`the refused call reached the server: ${JSON.stringify(alphaCalls)}`);
  if (betaEcho.length !== 1 || betaEcho[0].status !== 'ok') throw new Error(`the valid call did not succeed: ${JSON.stringify(betaEcho)}`);
  if (JSON.stringify(betaCalls) !== JSON.stringify([{ name: 'echo', arguments: asWritten }])) throw new Error(`the valid call did not reach the server as written: ${JSON.stringify(betaCalls)}`);
  if (lines(r.log, /could not be compiled/).length !== 0) throw new Error('a fixture schema was reported uncompilable');
  results.schema = { refused: { status: echo[0].status, failureKind: echo[0].entry.failure_kind, text: refusal.slice(0, 200), reachedServer: alphaCalls.length }, valid: { status: betaEcho[0].status, receivedAsWritten: true } };
}

// ---- 2c. A call the run cancels in flight ---------------------------------------------------------------------
/*
 * PD-TOOLS-013 revision 2 (OQ-238; N51 of the 2026-10-13 survey): every tool call its run's signal cuts off reads
 * `interrupted` and files no outcome-driven issue. fin34 built (a) the gate's catch and (c) the MCP executor's catch and
 * pinned them by unit cases; no launch had cut an MCP call or a throwing executor in the built app. Both launches below
 * hold `slow` in flight at the fixture (`{ ms: 60000 }`, under a 120 s allowance so the allowance can never be read
 * first) and quit the application by SIGTERM once the fixture has received the call — a quit outside any window, as
 * `fetch-proof`'s `cancelled` launch does — then read the store and the session's `summary.md`:
 *
 *   cancel        — (c): the MCP executor's own catch, "The call to 'slow' on MCP server 'alpha' was cancelled by the run
 *                   before it completed; it was not retried."
 *   cancel-throw  — (a): the same call with `ROTARIS_CAPTURE_THROW_ON_ABORT=slow` (`src/run-host/throw-on-abort.ts`, a seam
 *                   compiled out of a packaged build), whose executor rejects once its signal aborts, as an executor that
 *                   throws on the cancel does; the gate's catch reads it "The 'slow' call was cancelled by the run before
 *                   it completed."
 *
 * Each must be recorded failed with failure kind `interrupted` and no `outcome_kind` (OQ-208: an MCP call carries none),
 * file no `tool_error` and no `terminal_timeout` issue at all, and count under `summary.md`'s `interrupted` bucket with a
 * Tool errors line of 0 (REQ-SESSION-139 and REQ-SESSION-136 as revision 2 narrows them).
 */
const cutTexts = {
  cancel: "The call to 'slow' on MCP server 'alpha' was cancelled by the run before it completed; it was not retried.",
  'cancel-throw': "The 'slow' call was cancelled by the run before it completed.",
};
async function cancelLaunch(name, extra) {
  const calls = join(output, `${name}.alpha.calls`);
  writeFileSync(calls, '');
  writeFileSync(join(configDir, 'agents.yaml'), globalYaml({ alphaFlags: ['--call-file', calls], alphaTimeout: 120 }));
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), WORKSPACE);
  writeFileSync(join(workspace, '.mcp.json'), MCP_JSON);
  resetPids();
  let child = null;
  let quitAt = null;
  // The fixture appends each `tools/call` it receives to the call file: the quit is sent 300 ms after `slow` arrives.
  const watch = setInterval(() => {
    if (quitAt !== null || child === null) return;
    const received = readFileSync(calls, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
    if (!received.some((c) => c.name === 'slow')) return;
    quitAt = Date.now() + 300;
    setTimeout(() => { try { process.kill(child.pid, 'SIGTERM'); } catch { /* already gone */ } }, 300);
  }, 100);
  const started = Date.now();
  let result;
  try {
    result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
      cwd: app, timeoutMs: 150_000, windowsHide: true, onSpawn: (c) => { child = c; },
      env: {
        ...cleanEnvironment(), ...proofIsolationEnv({ local, preferences }),
        ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_INTENT_SCRIPT: 'explicit_trivial', ROTARIS_CIRCUIT_BREAKER: 'off',
        ROTARIS_CAPTURE_PROMPT: 'call slow on alpha, then answer', ROTARIS_SCRIPT: 'mcp:alpha.slow,answer', ROTARIS_SCRIPT_MCP_ARGS: JSON.stringify({ slow: { ms: 60_000 } }),
        // The capture types the prompt; the quit lands before its wait is satisfied, so no picture is taken.
        ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500', ROTARIS_CAPTURE_PNG: join(output, `${name}.png`),
        PROOF_SHELL_VALUE: 'from-the-shell', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', ROTARIS_APP_LOG_LEVEL: 'debug',
        ...extra,
      },
    });
  } finally {
    clearInterval(watch);
  }
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (quitAt === null) throw new Error(`${name}: the fixture never received slow, so no quit was sent; see ${name}.log`);
  if (result.status !== 0) throw new Error(`${name}: the quit by SIGTERM exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  const dbPath = oneDatabase();
  const db = new Database(dbPath, { readonly: true });
  const s = latestSession(db);
  const slow = db.prepare("SELECT status, is_error, elapsed_ms, entry FROM tool_calls WHERE session_id = ? AND tool_name = 'slow' ORDER BY ordinal").all(s.session_id).map((r) => ({ ...r, entry: JSON.parse(r.entry) }));
  const issues = db.prepare('SELECT kind, message, evidence_ref FROM issues WHERE session_id = ? ORDER BY ordinal').all(s.session_id);
  db.close();
  const summaryFile = join(dirname(dbPath), 'sessions', s.session_id, 'summary.md');
  const summary = existsSync(summaryFile) ? readFileSync(summaryFile, 'utf8') : null;
  if (summary !== null) writeFileSync(join(output, `${name}.summary.md`), summary);
  return { session: s, slow, issues, summary, elapsedMs: Date.now() - started, quitAtMs: quitAt - started };
}
function cancelReading(name, r) {
  const row = r.slow[0];
  if (r.slow.length !== 1) throw new Error(`${name}: expected one slow row; found ${JSON.stringify(r.slow)}`);
  const text = String(row.entry.result ?? '');
  if (row.status !== 'failed' || row.entry.failure_kind !== 'interrupted') throw new Error(`${name}: the cut call reads ${row.status} / ${row.entry.failure_kind}, not failed / interrupted (PD-TOOLS-013 revision 2): ${text}`);
  if (text !== cutTexts[name]) throw new Error(`${name}: the cut call's text is not revision 2's:\n  got      ${JSON.stringify(text)}\n  expected ${JSON.stringify(cutTexts[name])}`);
  if ('outcome_kind' in row.entry) throw new Error(`${name}: the record carries outcome_kind ${row.entry.outcome_kind} (OQ-208: an MCP call carries none)`);
  const outcomeIssues = r.issues.filter((i) => i.kind === 'tool_error' || i.kind === 'terminal_timeout');
  if (outcomeIssues.length !== 0) throw new Error(`${name}: the cut call filed an outcome-driven issue (REQ-SESSION-136 as revision 2 narrows it): ${JSON.stringify(outcomeIssues)}`);
  if (r.summary === null) throw new Error(`${name}: the session ${r.session.session_id} (${r.session.execution_status}) left no summary.md`);
  const outcomes = /^- Tool outcomes: (.*)$/m.exec(r.summary)?.[1] ?? '';
  if (!/\binterrupted 1\b/.test(outcomes) || /\btool_error [1-9]/.test(outcomes)) throw new Error(`${name}: summary.md's Tool outcomes line does not count the cut call under interrupted (REQ-SESSION-139 revision 2): ${JSON.stringify(outcomes)}`);
  const toolErrors = /^- Tool errors: (.*)$/m.exec(r.summary)?.[1] ?? '';
  if (!/^0 \(/.test(toolErrors)) throw new Error(`${name}: summary.md's Tool errors line counts the cut call: ${JSON.stringify(toolErrors)}`);
  return { status: row.status, failureKind: row.entry.failure_kind, text, elapsedMs: Math.round(row.elapsed_ms ?? 0), sessionStatus: r.session.execution_status, issues: r.issues.map((i) => i.kind), summaryOutcomes: outcomes, summaryToolErrors: toolErrors, quitAtMs: r.quitAtMs, launchMs: r.elapsedMs };
}
{
  results.cancel = cancelReading('cancel', await cancelLaunch('cancel', {}));
  results.cancelThrow = cancelReading('cancel-throw', await cancelLaunch('cancel-throw', { ROTARIS_CAPTURE_THROW_ON_ABORT: 'slow' }));
}

// ---- 3. One connection per server per session ---------------------------------------------------------------
{
  const r = await launch('one-process', {
    ROTARIS_CAPTURE_PROMPT: 'fan out', ROTARIS_SCRIPT: 'plan,delegate:coding-agent:one,delegate:coding-agent:two,wait:2500,delegate:coding-agent:three,wait:2500,answer', ROTARIS_CHILD_SCRIPT: 'mcp:alpha.echo,answer', ROTARIS_CAPTURE_AFTER_MS: '16000', ROTARIS_INTENT_SCRIPT: 'moderate_feature',
  }, { files: { global: globalYaml({ personas: { 'coding-agent': '{ mcp_servers: [alpha], tool_restrictions: { coding-agent: [read_file, echo] } }' } }), workspace: WORKSPACE.replace('  delegation_strategy: single\n', '  delegation_strategy: orchestrator\n') } });
  const db = new Database(oneDatabase(), { readonly: true });
  const s = latestSession(db);
  const echo = toolRows(db, s.session_id, 'echo');
  const children = db.prepare('SELECT canonical_name, state, granted_tools, granted_mcp FROM children WHERE session_id = ? ORDER BY spawned_at').all(s.session_id);
  db.close();
  const connected = lines(r.log, /mcp alpha: connected for the session \(pid (\d+)/).map((l) => /pid (\d+)/.exec(l)[1]);
  if (echo.length !== 3 || echo.some((e) => e.status !== 'ok')) throw new Error(`three children should each have called echo once: ${JSON.stringify(echo.map((e) => e.status))}`);
  if (connected.length !== 1) throw new Error(`alpha was connected ${connected.length} times for one session (REQ-MCP-067)`);
  const launches = pidLines('alpha');
  // One discovery launch plus exactly one session launch.
  if (launches.length !== 2) throw new Error(`alpha was launched ${launches.length} times (one discovery, one session expected)`);
  const evidence = JSON.parse(children[0].granted_mcp);
  if (!evidence.granted?.alpha?.includes('echo') || !evidence.servers?.some((x) => x.name === 'alpha' && x.fate === 'connected')) throw new Error(`the child's evidence is wrong: ${children[0].granted_mcp}`);
  // REQ-MCP-065 with REQ-TOOLS-006: each row records the grant its port put in force — what the allowed-tool list left.
  for (const c of children) {
    const tools = JSON.parse(c.granted_tools);
    const mcp = JSON.parse(c.granted_mcp);
    if (JSON.stringify(tools) !== '["read_file"]') throw new Error(`${c.canonical_name}'s recorded native grant is not what tool_restrictions left: ${c.granted_tools}`);
    if (JSON.stringify(mcp.granted) !== '{"alpha":["echo"]}') throw new Error(`${c.canonical_name}'s recorded MCP grant is not what tool_restrictions left: ${JSON.stringify(mcp.granted)}`);
  }
  results.oneProcess = { children: children.map((c) => `${c.canonical_name}:${c.state}`), sessionPid: connected[0], launches: launches.length, evidence, grantedTools: children.map((c) => JSON.parse(c.granted_tools)) };
}

// ---- 3b. A grant the controls left empty of native tools ------------------------------------------------------
/*
 * REQ-MONITOR-049/060 with REQ-TOOLS-006 and REQ-MCP-065: a child whose `tool_restrictions` list names only `echo` keeps no
 * native tool. Its row records that empty grant (marked `recorded`), and the inspector, with the child selected, lists no
 * native tool and `echo` under alpha. Until 2026-10-01 the empty list read as "no grant recorded" and the inspector listed
 * the persona's declared tools as granted (docs/defects/fixed/a-grant-the-controls-left-empty-reads-as-no-grant-recorded.md).
 * Driven, as 6 is: the selection and every read wait for their condition.
 */
{
  const r = await drivenLaunch('empty-native-grant', { ROTARIS_SCRIPT: 'delegate:coding-agent:four,answer', ROTARIS_CHILD_SCRIPT: 'mcp:alpha.echo,answer', ROTARIS_INTENT_SCRIPT: 'moderate_feature' }, {
    files: { global: globalYaml({ personas: { 'coding-agent': '{ mcp_servers: [alpha], tool_restrictions: { coding-agent: [echo] } }' } }), workspace: WORKSPACE.replace('  delegation_strategy: single\n', '  delegation_strategy: orchestrator\n') },
  }, async (d, step) => {
    await step('the shell', d.waitFor('.app-shell', { timeoutMs: 60_000 }));
    const before = latestSessionId();
    await typePrompt(d, step, 'delegate to four');
    const session = await step('the run settled', until(() => sessionAfter(before), (s) => s !== null && SETTLED.has(s.execution_status), { timeoutMs: 90_000, what: 'a new session settling' }));
    await step('four in the tree', d.waitFor('.agent-row__task', { text: 'four' }));
    await step('select four', d.click('.agent-row__task', { text: 'four' }));
    await step('the inspector shows four', d.waitFor('[data-testid="inspector-name"]', { text: 'four' }));
    await step('alpha in the inspector', d.waitFor('.inspector__mcp[data-mcp-server="alpha"] .chip'));
    const native = await step('the native tools field', d.probe('[data-testid="inspector-chips"]'));
    const nativeChips = await step('the native chips', d.probe('[data-testid="inspector-chips"] .chip'));
    const alpha = await step('the alpha chips', d.probe('.inspector__mcp[data-mcp-server="alpha"] .chip'));
    return { session, native: native[0]?.text ?? null, nativeChips: nativeChips.map((c) => c.data['data-tool']), alpha: alpha.map((c) => `${c.data['data-tool']}:${c.data['data-state']}`) };
  });
  const db = new Database(oneDatabase(), { readonly: true });
  const four = db.prepare('SELECT canonical_name, state, granted_tools, granted_mcp FROM children WHERE session_id = ?').all(r.value.session.session_id);
  db.close();
  if (four.length !== 1 || four[0].canonical_name !== 'four') throw new Error(`expected the one child four: ${JSON.stringify(four)}`);
  const recorded = JSON.parse(four[0].granted_mcp);
  if (four[0].granted_tools !== '[]' || recorded.recorded !== true || JSON.stringify(recorded.granted) !== '{"alpha":["echo"]}') throw new Error(`four's row does not record the empty native grant beside echo: ${four[0].granted_tools} ${four[0].granted_mcp}`);
  if (r.value.nativeChips.length !== 0) throw new Error(`the inspector lists native tools the controls removed (REQ-MONITOR-049/060): ${JSON.stringify(r.value.nativeChips)}`);
  if (!/No tools resolved\./.test(r.value.native ?? '')) throw new Error(`the native tools field does not say it holds none: ${JSON.stringify(r.value.native)}`);
  if (JSON.stringify(r.value.alpha) !== '["echo:used"]') throw new Error(`alpha's chips are not echo, used: ${JSON.stringify(r.value.alpha)}`);
  results.emptyNativeGrant = { row: { grantedTools: JSON.parse(four[0].granted_tools), grantedMcp: recorded }, inspector: { native: r.value.native, nativeChips: r.value.nativeChips, alpha: r.value.alpha }, sessionStatus: r.value.session.execution_status, png: r.png };
}

// ---- 4. Narrowing ---------------------------------------------------------------------------------------------
{
  const r = await launch('narrowing', { ROTARIS_CAPTURE_PROMPT: 'echo then extra', ROTARIS_SCRIPT: 'mcp:alpha.echo,wait:2000,mcp:alpha.extra,answer', ROTARIS_CAPTURE_AFTER_MS: '12000' }, { files: { global: globalYaml({ alphaFlags: ['--rename-after', '300'] }) } });
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
  const r = await launch('crash', { ROTARIS_CAPTURE_PROMPT: 'slow then echo after a crash', ROTARIS_SCRIPT: 'mcp:alpha.slow,mcp:alpha.echo,mcp:beta.beta_echo,answer', ROTARIS_CAPTURE_AFTER_MS: '14000' }, { files: { global: globalYaml({ alphaFlags: ['--crash-after', '200'] }) } });
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
  // `broken` launches and exits before it answers `initialize`, two lines on its standard error: its tool discovery fails
  // (REQ-MCP-042/048), and REQ-MCP-114 records it dropped for that reason — until 2026-10-03 it was recorded and drawn
  // "connected" (`docs/defects/fixed/an-mcp-server-whose-tool-discovery-failed-reads-as-connected.md`).
  const brokenServer = `  broken: { command: ${y(node)}, args: ${y(['-e', "process.stderr.write('broken: first stderr line\\nbroken: second stderr line\\n'); process.exit(3)"])} }`;
  const global6 = globalYaml({ personas: { 'coding-agent': '{ mcp_servers: [alpha, beta, nope, ghost, off, broken] }' } })
    .replace('  orchestrator: { mcp_servers: [alpha, beta, gamma], mcp_tools: { beta: [echo, nothing, extra] } }', '  orchestrator: { mcp_servers: [alpha, beta, nope, ghost, off, broken] }')
    .replace('  ghost: { command: no-such-command-xyz }\n', `  ghost: { command: no-such-command-xyz }\n${brokenServer}\n`);
  if (!global6.includes('  broken: ')) throw new Error('the drop-rules configuration lost its broken server');
  const r = await drivenLaunch('drop-rules', { ROTARIS_SCRIPT: 'delegate:coding-agent:one,answer', ROTARIS_CHILD_SCRIPT: 'mcp:alpha.echo,answer', ROTARIS_INTENT_SCRIPT: 'moderate_feature' }, { files: { global: global6, workspace: WORKSPACE.replace('  delegation_strategy: single\n', '  delegation_strategy: orchestrator\n') } }, async (d, step) => {
    await openMcpSettings(d, step);
    const before = latestSessionId();
    // REQ-MCP-115: the session toggle, clicked once its row is on screen; the wording is read once the row SAYS it is
    // overridden, not at an offset that hoped the click had landed (the red of 2026-09-28 read `[]` at 3,200 ms).
    await step('toggle beta off for this session', d.click('button[aria-label="Enable beta for this session"]'));
    await step('beta reports the override', d.waitFor('tr[data-mcp-server="beta"][data-overridden="yes"]'));
    const enablement = await step('the overridden row\'s wording', d.probe('tr[data-mcp-server="beta"] [data-enablement]'));
    await typePrompt(d, step, 'delegate once');
    const session = await step('the run settled', until(() => sessionAfter(before), (s) => s !== null && SETTLED.has(s.execution_status), { timeoutMs: 90_000, what: 'a new session settling' }));
    // REQ-MCP-114: the child's inspector reads each carried server's fate from the run's recorded evidence.
    await step('one in the tree', d.waitFor('.agent-row__task', { text: 'one' }));
    await step('select one', d.click('.agent-row__task', { text: 'one' }));
    await step('the inspector shows one', d.waitFor('[data-testid="inspector-name"]', { text: 'one' }));
    await step('broken in the inspector', d.waitFor('.inspector__mcp[data-mcp-server="broken"]'));
    const inspector = await step('the inspector\'s MCP servers', d.probe('.inspector__mcp'));
    return { wording: enablement[0]?.text ?? '', session, inspector: inspector.map((x) => ({ server: x.data['data-mcp-server'], fate: x.data['data-fate'], text: x.text })) };
  });
  const wording = r.value.wording;
  if (!/Overridden for this session/.test(wording) || !/not persistent/.test(wording) || !/enabled in the configuration file/.test(wording)) throw new Error(`the overridden row's wording is wrong: ${wording}`);
  const db = new Database(oneDatabase(), { readonly: true });
  const s = r.value.session;
  const children = db.prepare('SELECT canonical_name, granted_mcp FROM children WHERE session_id = ?').all(s.session_id);
  const issues = db.prepare("SELECT message FROM issues WHERE session_id = ? AND kind = 'mcp_config'").all(s.session_id).map((i) => i.message);
  db.close();
  if (children.length === 0) throw new Error(`the run ${s.session_id} (${s.execution_status}) recorded no child`);
  const evidence = JSON.parse(children[0].granted_mcp);
  const fates = Object.fromEntries(evidence.servers.map((x) => [x.name, x.reason ?? x.fate]));
  if (fates.alpha !== 'connected' || fates.beta !== 'disabled' || fates.nope !== 'not-configured' || fates.ghost !== 'unavailable' || fates.off !== 'disabled' || fates.broken !== 'discovery-failed') throw new Error(`the recorded fates are wrong: ${JSON.stringify(fates)}`);
  const shown = Object.fromEntries(r.value.inspector.map((x) => [x.server, x]));
  if (shown.broken?.fate !== 'dropped' || !/dropped — discovery-failed/.test(shown.broken.text) || !/No tools granted\./.test(shown.broken.text)) throw new Error(`the inspector does not draw broken dropped for failed discovery with no tools (REQ-MCP-114): ${JSON.stringify(shown.broken)}`);
  if (shown.alpha?.fate !== 'connected' || /dropped/.test(shown.alpha.text)) throw new Error(`the inspector does not draw alpha connected: ${JSON.stringify(shown.alpha)}`);
  if (!issues.some((m) => /'broken' failed tool discovery/.test(m))) throw new Error(`the failed discovery was not recorded as an issue (REQ-MCP-042): ${JSON.stringify(issues)}`);
  // Finding U4: the failure is one record — `ToolDiscovery`'s REQ-MCP-048 warning — on one physical line that keeps broken's
  // two stderr lines; the run host does not say it again (`restated-facts.mjs` knows that restatement).
  const brokenWarnings = lines(r.log, /mcp broken: tool discovery failed/);
  if (brokenWarnings.length !== 1 || !/first stderr line \| broken: second stderr line/.test(brokenWarnings[0]) || !/^\[main [^\]]+\] warning run host: mcp broken: tool discovery failed in \d+ ms \(/.test(brokenWarnings[0])) throw new Error(`broken's discovery failure is not one warning on one line carrying its stderr: ${JSON.stringify(brokenWarnings)}`);
  const restated = restatedFacts(r.log);
  if (restated.length > 0) throw new Error(`a fact reached the log twice: ${restated.map((x) => `line ${x.line}, ${x.fact} (owner: ${x.owner}): ${x.text}`).join(' | ')}`);
  if (Object.keys(evidence.granted).sort().join() !== 'alpha') throw new Error(`granted should hold alpha only: ${JSON.stringify(evidence.granted)}`);
  if (!issues.some((m) => /'nope', which is not configured/.test(m))) throw new Error('the missing-server warning was not recorded as an issue');
  if (!issues.some((m) => /'ghost' is unavailable/.test(m))) throw new Error('the unavailable warning was not recorded as an issue');
  if (issues.some((m) => /'off'/.test(m) || /'beta'/.test(m))) throw new Error(`a disabled server produced an issue: ${JSON.stringify(issues)}`);
  const detailed = lines(r.log, /raw command 'no-such-command-xyz'/).length;
  const perPersona = lines(r.log, /'ghost' is unavailable/).length;
  if (detailed !== 1) throw new Error(`the detailed unavailable line appeared ${detailed} times in one process (once expected)`);
  if (perPersona < 2) throw new Error(`the per-persona warning appeared ${perPersona} times (two personas resolved)`);
  // Relaunch: the override is gone (REQ-MCP-115). The row is read once it is on screen, not at 2,500 ms.
  const again = await drivenLaunch('drop-rules-relaunch', {}, { files: { global: global6 } }, async (d, step) => {
    await openMcpSettings(d, step);
    await step('the beta row', d.waitFor('tr[data-mcp-server="beta"]'));
    return step('beta after the relaunch', d.probe('tr[data-mcp-server="beta"]'));
  });
  const row = again.value[0]?.data ?? {};
  if (row['data-overridden'] !== 'no' || row['data-enabled'] !== 'yes') throw new Error(`after a relaunch beta should be back to its configured value: ${JSON.stringify(again.value)}`);
  results.dropRules = { fates, inspector: r.value.inspector, brokenWarning: brokenWarnings[0], granted: evidence.granted, issues, detailedLineCount: detailed, perPersonaWarnings: perPersona, overriddenWording: wording.slice(0, 200), sessionStatus: s.execution_status, relaunchOverrideGone: true, relaunchRow: row };
}

// ---- 7. The Settings category ---------------------------------------------------------------------------------
{
  const r = await drivenLaunch('settings', {}, {}, async (d, step) => {
    await openMcpSettings(d, step);
    // The button is drawn disabled until the rows are listed (`rows.length === 0`), and a click on a disabled button is
    // no press at all — so the first click waits for the fixtures' rows as well as for the button.
    await step('the fixture rows', d.waitFor('tr[data-mcp-server="gamma"]'));
    await step('Check status enabled', until(() => d.eval(`(() => { const b = document.querySelector('button[data-action="check-status"]'); return b !== null && !b.disabled && b.textContent.trim() === 'Check status'; })()`), (v) => v === true, { what: 'an enabled Check status' }));
    await step('Check status (first round)', d.click('button[data-action="check-status"]', { text: 'Check status' }));
    // REQ-MCP-054: the probing state, read in ONE renderer turn once the button says so, so the button and the rows
    // are the same moment — the fixed 2,000 ms read of the first form sampled whatever the machine had reached by then.
    const during = JSON.parse(await step('the probing state', d.eval(PROBING_SNAPSHOT)));
    await step('the first round finished', until(() => d.eval(ROUND_OVER), (v) => v === true, { timeoutMs: 60_000, what: 'the first probe round finishing' }));
    const chosen = await step('the secrets select → alpha', choose(d, 'select[aria-label="Secrets for"]', 'alpha'));
    await step('the masked secret', d.waitFor('[data-mask]'));
    await step('Check status (second round)', d.click('button[data-action="check-status"]', { text: 'Check status' }));
    await step('the second round started', d.waitFor('button[data-action="check-status"]', { text: 'Checking…' }));
    await step('the second round finished', until(() => d.eval(ROUND_OVER), (v) => v === true, { timeoutMs: 60_000, what: 'the second probe round finishing' }));
    const probed = {};
    for (const selector of ['tr[data-mcp-server]', 'tr[data-mcp-server] [data-health-text]', 'button[data-action="check-status"]', '[data-secret-row]', '[data-mask]', '[data-expected]', '[data-scope]', '[data-line]']) {
      probed[selector] = await step(`probe ${selector}`, d.probe(selector));
    }
    return { during, chosen, probed };
  });
  const { during, probed } = r.value;
  if (during.timeout || during.button !== 'Checking…') throw new Error(`the button did not read Checking… while probing: ${JSON.stringify(during)}`);
  if (!during.rows.some((t) => /Checking…/.test(t))) throw new Error(`no row showed checking during the probe: ${JSON.stringify(during.rows)}`);
  const rows = probed['tr[data-mcp-server]'];
  const health = Object.fromEntries(rows.map((x) => [x.data['data-mcp-server'], x.data['data-health']]));
  if (health.alpha !== 'healthy' || health.beta !== 'healthy' || health.gamma !== 'healthy') throw new Error(`the fixtures should be healthy: ${JSON.stringify(health)}`);
  // REQ-MCP-113 through the built application: the `.cmd` runner standing in for `browser` is reached through cmd.exe and answers.
  // The wrap is a Windows rule (a `.cmd` runner is what `npx` is there, and cmd.exe is what runs it), so off win32 this one
  // check is NOT APPLICABLE and is stated so rather than failed: a POSIX kernel cannot execute `runner.cmd`, the row's health
  // is recorded as observed, and the rest of the launch — the probing states, the masked secret, its scope — is measured.
  const cmdRunner = process.platform === 'win32'
    ? { applicable: true, health: health.browser }
    : { applicable: false, health: health.browser, reason: `not applicable on ${process.platform}: REQ-MCP-113's .cmd wrap is a Windows rule and cmd.exe does not exist here; the row's health is recorded, not asserted` };
  if (cmdRunner.applicable && health.browser !== 'healthy') throw new Error(`the .cmd runner standing in for browser should probe healthy through the wrap: ${JSON.stringify(health)}`);
  if (!cmdRunner.applicable) console.log(`[mcp-proof] 7 settings: the .cmd runner check is ${cmdRunner.reason} (observed: ${health.browser})`);
  if (health.ghost !== 'unreachable' || health.off !== 'unreachable') throw new Error(`the unavailable and the not-installed servers should be unreachable: ${JSON.stringify(health)}`);
  const texts = probed['tr[data-mcp-server] [data-health-text]'].map((x) => x.text);
  if (!texts.some((t) => /Healthy · 5 tools/.test(t))) throw new Error(`no healthy row shows its tool count: ${JSON.stringify(texts)}`);
  const button = probed['button[data-action="check-status"]'][0];
  if (!button || button.text !== 'Check status') throw new Error(`the button did not re-enable: ${JSON.stringify(button)}`);
  if (pidLines('alpha').length !== 2) throw new Error(`alpha was contacted ${pidLines('alpha').length} times by two probes (REQ-MCP-054)`);
  const masks = probed['[data-mask]'].map((x) => x.text);
  if (masks.length !== 1 || masks[0] !== '***') throw new Error(`the secret is not masked with the one marker: ${JSON.stringify(masks)}`);
  const scopes = probed['[data-scope]'].map((x) => x.text);
  const expected = probed['[data-expected]'].map((x) => `${x.data['data-expected']}:${x.data['data-satisfied']}`);
  if (scopes[0] !== 'Global') throw new Error(`the secret's scope is wrong: ${JSON.stringify(scopes)}`);
  if (expected.join(',') !== 'ALPHA_KEY:yes,FROM_SHELL:no') throw new Error(`the expected-keys hint is wrong: ${JSON.stringify(expected)}`);
  const linesShown = probed['[data-line]'].map((x) => x.text);
  if (linesShown.some((l) => /sk-proof-secret/.test(l))) throw new Error('a stored secret value reached a rendered line');
  if (/sk-proof-secret-value-1234/.test(r.log)) throw new Error('the stored secret value appeared in a log line');
  const unreachable = rows.find((x) => x.data['data-mcp-server'] === 'ghost');
  results.settings = { health, cmdRunner, during, secretsChooser: r.value.chosen.kind, healthTexts: texts, probesPerServer: pidLines('alpha').length, mask: masks[0], scope: scopes[0], expected, ghostDetail: unreachable?.text?.slice(0, 160) ?? '', png: r.png };
}

// ---- 8. Fatal YAML defects; the same in the discovery file --------------------------------------------------
{
  const broken = `${globalYaml()}\n`.replace('mcp_servers:\n', 'mcp_servers:\n  nocmd: { type: stdio }\n  badtimeout: { command: node, request_timeout: -1 }\n');
  const r = await launch('fatal', { ROTARIS_CAPTURE_PROMPT: 'run on a broken file', ROTARIS_CAPTURE_AFTER_MS: '4000' }, { files: { global: broken } });
  const refusal = lines(r.log, /could not be loaded/)[0] ?? '';
  if (!/mcp_servers\.nocmd\.command/.test(refusal) || !/mcp_servers\.badtimeout\.request_timeout/.test(refusal)) throw new Error(`the refusal did not report both defects: ${refusal}`);
  if (/session .* started/.test(r.log)) throw new Error('a run started on a fatal configuration');
  const mcpJson = `{\n  "mcpServers": {\n    "nocmd": { "type": "stdio" },\n    "empty": { "command": "" },\n    "gamma": { "command": ${y(node)}, "args": ${y([fixture])} }\n  }\n}\n`;
  const r2 = await launch('fatal-discovered', { ROTARIS_CAPTURE_PROMPT: 'run with dropped discovered entries', ROTARIS_SCRIPT: 'mcp:gamma.gamma_echo,answer', ROTARIS_CAPTURE_AFTER_MS: '9000' }, { files: { mcpJson } });
  const dropped = lines(r2.log, /the entry is dropped \(REQ-MCP-023\)/);
  if (dropped.length < 2) throw new Error(`the discovered defects were not dropped: ${dropped.length}`);
  if (!/ended completed/.test(r2.log)) throw new Error('the run with dropped discovered entries did not complete');
  results.fatal = { refusal: refusal.slice(0, 400), droppedDiscovered: dropped.length / Math.max(1, lines(r2.log, /configuration: loaded in/).length), discoveredRunCompleted: true };
}

// ---- 9. Exit under an outstanding discovery -------------------------------------------------------------------
{
  // The run's first port waits on the mute server's discovery; the bound fires at 35 s, the run proceeds with alpha listed bare,
  // and the user closes the window at 40 s — the exit must follow without waiting on anything. A run still active then is
  // asked about first (REQ-STARTUP-046), and the box is answered Yes.
  const r = await launch('exit-bound', { ROTARIS_CAPTURE_PROMPT: 'a server that never answers', ROTARIS_SCRIPT: 'mcp:alpha.echo,answer', ROTARIS_CAPTURE_AFTER_MS: '60000', ROTARIS_CAPTURE_QUIT_MS: '40000', ROTARIS_CAPTURE_ANSWERS: '1' }, { files: { global: globalYaml({ alphaFlags: ['--never-init'] }) }, timeout: 120_000 });
  // The failure's one record is `ToolDiscovery`'s REQ-MCP-048 warning, which carries the time; the run host's own
  // "discovery of 'alpha' failed … in N ms" restated it until 2026-10-03 and is gone (finding U4).
  const disc = lines(r.log, /mcp alpha: tool discovery failed in \d+ ms/)[0] ?? '';
  const ms = Number(/failed in (\d+) ms/.exec(disc)?.[1] ?? NaN);
  if (!(ms >= 34_000 && ms <= 35_500)) throw new Error(`discovery did not return at the 35 s bound: ${disc}`);
  if (!/mcp: surface for orchestrator — callable alpha\[\]/.test(r.log)) throw new Error('the run did not proceed with alpha listed bare after the bound');
  const quitAt = 40_000;
  if (r.elapsedMs > quitAt + 15_000) throw new Error(`the application took ${r.elapsedMs} ms to exit after the quit at ${quitAt} ms`);
  results.exitBound = { discoveryMs: ms, launchMs: r.elapsedMs, quitAtMs: quitAt, exitAfterQuitMs: r.elapsedMs - quitAt, exited: true };
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
