/**
 * The fetch proof (Part N): ADR-0023's second first execution — the `fetch` tool behind the real run host, its
 * egress policy read from the workspace's SAVED configuration at each call (REQ-SANDBOX-038). Scripted client,
 * scratch store, one `node:http` server on 127.0.0.1 that RECORDS EVERY REQUEST PATH, and eight launches against
 * one scratch profile, the workspace's `agents.yaml` rewritten between them (a saved edit takes effect on the
 * next fetch with no restart — which is also what proves REQ-SANDBOX-038):
 *
 *   1. ok          — autonomous, the shipped policy: `/ok` → the five header lines and three body lines, truncated false.
 *   2. ask-local   — `ask` mode: the same loopback URL resolves allow through `ask:fetch-local-host` with no
 *                    dialog — no `approval.requested` event (REQ-SANDBOX-041).
 *   3. redirect    — `/redirect` (302 → `http://localhost:<port>/ok`, a DIFFERENT host name) with no allow list →
 *                    `egress_redirect_denied`; the server saw `/redirect` only (REQ-SANDBOX-028).
 *   4. allow-list  — the same with `network_allowed_hosts: [localhost]` → followed; `final_url` on localhost.
 *   5. denied      — `network_denied_hosts: ['127.0.0.1']` → `egress_denied`; THE SERVER SAW NOTHING (REQ-SANDBOX-022).
 *   6. 404         — `/404` → `http_error`, status 404, the body rendered under `[fetch_output]` (REQ-TOOLS-092).
 *   7. timeout     — `/slow` (never answers) with `tool_call_timeout: 1` → `timeout`, `timeout_seconds` 1 from the
 *                    run level (REQ-SANDBOX-021); its `terminal_timeout` issue names the fetch, never a terminal command
 *                    (REQ-SESSION-136, finacc3 A2-08).
 *   9. cancelled   — `/cut` (never answers) under a 60 s deadline; once the server holds the request the application is
 *                    quit by SIGTERM, a quit outside any window: the fetch is recorded `interrupted`, `InterruptedError`,
 *                    "cancelled by the run", and files neither `tool_error` nor `terminal_timeout` (PD-TOOLS-013
 *                    revision 2, OQ-238). Until revision 2 it read `network_error` and filed a `tool_error` warning.
 *
 * Launch 1 also reads the instructions the model port received (`ROTARIS_CAPTURE_MODEL_REQUESTS`): the run is
 * `explicit_trivial`, so the coordinator is told to do the work itself (OQ-202 as ruled, PD-ORCH-006), and its playbook's
 * ROUTE slot is the entry role's own, never the `routed` text a delegated specialist reads (K3 of the live run at c2fdd6a).
 * Launch 8, `swarm-granted`, saves `rotaris.delegation_strategy: swarm` and reads the same capture: on the `explicit_trivial`
 * run the mapping grants the bundle, so the coordinator's first request carries the direct-work statement, no
 * `## Run override: swarm` heading, and offers `write_file`, `terminal` and `delegate` (PD-ORCH-006 revision 3, OQ-205 as
 * ruled, R-072).
 *
 * Each scenario asserts the tool row's observation from the store's `tool_calls` and the server's request log, and
 * reads the run host's `fetch: egress policy read … in N ms` line for the per-call load's cost.
 * Evidence under `.proof/fetch-proof/`: one log per launch, `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { cleanEnvironment, findDatabases, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'fetch-proof');
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

// The server: every request path recorded; `/slow` is held open until the proof ends.
const seen = [];
const held = [];
/** Scenario 9's hook: called when the server holds `/cut`, so the quit lands while the fetch is in flight. */
let onCut = null;
let port = 0;
const server = createServer((req, res) => {
  seen.push(req.url ?? '');
  if (req.url === '/ok') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('line one\nline two\nline three\n'); return; }
  if (req.url === '/redirect') { res.writeHead(302, { location: `http://localhost:${port}/ok` }); res.end(); return; }
  if (req.url === '/404') { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('no such page\n'); return; }
  if (req.url === '/slow') { held.push(res); return; }
  if (req.url === '/cut') { held.push(res); onCut?.(); return; }
  res.writeHead(500); res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
port = server.address().port;
const origin = `http://127.0.0.1:${port}`;
const stopServer = async () => { for (const res of held) { try { res.writeHead(200); res.end('late\n'); } catch { /* */ } } server.closeAllConnections(); await new Promise((r) => server.close(() => r())); };

const root = join(output, 'profile');
const workspace = join(root, 'workspace');
const local = join(root, 'local');
const preferences = join(root, 'preferences');
mkdirSync(workspace, { recursive: true });
mkdirSync(local, { recursive: true });
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# Fetch proof workspace\n');

/** REQ-SANDBOX-038: the workspace file is REWRITTEN between launches; the next fetch reads it — no restart of anything but the proof's own launch. */
function saveConfiguration(runtime, strategy = null) {
  const lines = ['# scratch configuration written by the fetch proof', 'models:', '  scripted: { provider: scripted, model_id: scripted }', 'small_model: scripted', 'medium_model: scripted', 'large_model: scripted', 'mcp_servers:', '  code_intelligence: { enabled: false }', 'runtime:']; // the code_intelligence entry off: its discovery costs every run start about 4.5 s since Part T (ADR-0035's note, finding 6)
  for (const [key, value] of Object.entries(runtime)) lines.push(`  ${key}: ${Array.isArray(value) ? `[${value.map((v) => JSON.stringify(v)).join(', ')}]` : String(value)}`);
  if (strategy !== null) lines.push('rotaris:', `  delegation_strategy: ${strategy}`);
  lines.push('');
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), lines.join('\n'));
}

/**
 * The launch is ASYNCHRONOUS: this process serves the HTTP routes while Electron runs, so a synchronous wait would starve
 * them (the proof's own first finding). It is `spawnBounded`'s since 2026-09-30: its own bound was a bare `child.kill()`
 * at 150 s — SIGTERM, no SIGKILL, no overrun flag — and the application answers SIGTERM with `quit: exiting with status
 * 0`, so an overrun passed `launch`'s status check as a clean exit and failed later, misattributed, at the store
 * (`docs/defects/fixed/proofs-launched-through-spawnsync-cannot-end-an-overrun-launch.md`).
 */
function spawnElectron(env, onSpawn = null) {
  return spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], { timeoutMs: 150_000, cwd: app, env, onSpawn });
}

async function launch(name, url, runtime, extra = {}, strategy = null) {
  saveConfiguration(runtime, strategy);
  seen.length = 0;
  const result = await spawnElectron({
    ...extra,
    ...cleanEnvironment(), ...proofIsolationEnv({ local, preferences }),
    ROTARIS_MODEL_DIALECT: 'scripted', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    // REQ-ORCH-016: the direct-work grant is what hands the entry role `fetch` (no built-in persona declares it).
    ROTARIS_INTENT_SCRIPT: 'explicit_trivial',
    ROTARIS_SCRIPT: `fetch:${url},answer`,
    ROTARIS_CAPTURE_PROMPT: `Fetch ${url}`, ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500',
    ROTARIS_CAPTURE_PNG: join(output, `${name}.png`),
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(overrunMessage(name, result, log));
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}`);
  const db = new Database(oneDatabase(local), { readonly: true });
  const session = db.prepare('SELECT session_id, execution_status, stop_reason FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
  const rows = db.prepare("SELECT status, is_error, entry FROM tool_calls WHERE session_id = ? AND tool_name = 'fetch' ORDER BY ordinal").all(session.session_id);
  const approvals = db.prepare("SELECT COUNT(*) AS n FROM events WHERE session_id = ? AND kind = 'approval.requested'").get(session.session_id).n;
  const issues = db.prepare('SELECT kind, message, evidence_ref FROM issues WHERE session_id = ? ORDER BY ordinal').all(session.session_id);
  db.close();
  if (session.execution_status !== 'completed') throw new Error(`${name}: the run ended ${session.execution_status} (${session.stop_reason})`);
  if (rows.length !== 1) throw new Error(`${name}: expected one fetch tool row; found ${rows.length}`);
  const entry = JSON.parse(rows[0].entry);
  const loads = [...log.matchAll(/egress policy read from the saved configuration in ([\d.]+) ms/g)].map((m) => Number(m[1]));
  if (loads.length !== 1) throw new Error(`${name}: expected one per-call policy read in the log; found ${loads.length}`);
  const diagnostic = (() => { const m = /\[fetch_diagnostic\]\n(\{.*\})/.exec(entry.result); return m ? JSON.parse(m[1]) : null; })();
  return { name, session: session.session_id, callId: entry.call_id, status: rows[0].status, isError: rows[0].is_error === 1, failureKind: entry.failure_kind ?? null, result: entry.result, diagnostic, seen: [...seen], approvals, issues, loadMs: loads[0] };
}
const expectText = (r, re) => { if (!re.test(r.result)) throw new Error(`${r.name}: the observation did not match ${re}:\n${r.result}`); };
const results = {};
try {
  // 1. autonomous, the shipped policy (ask default, empty lists): a loopback fetch succeeds under the mode default.
  const modelRequests = join(output, 'ok.model-requests.jsonl');
  writeFileSync(modelRequests, '');
  const ok = await launch('ok', `${origin}/ok`, { permission_mode: 'autonomous' }, { ROTARIS_CAPTURE_MODEL_REQUESTS: modelRequests });
  if (ok.isError || ok.failureKind !== null) throw new Error(`ok: the fetch failed: ${ok.result}`);
  expectText(ok, new RegExp(`^url: ${origin}/ok\\nfinal_url: ${origin}/ok\\nstatus_code: 200\\ncontent_type: text/plain\\ntruncated: false\\n\\nline one\\nline two\\nline three$`));
  if (ok.seen.join(',') !== '/ok') throw new Error(`ok: the server saw ${JSON.stringify(ok.seen)}`);
  /*
   * OQ-202 as ruled (R-071, PD-ORCH-006): the run grants the coordinator the direct-work bundle, so the instructions the
   * model port received tell it to do the work itself, and no longer that it modifies no files and runs no commands.
   */
  const orchestratorCalls = readFileSync(modelRequests, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l)).filter((c) => c.who === 'orchestrator');
  if (orchestratorCalls.length === 0) throw new Error('ok: the model port recorded no orchestrator call, so the instructions are unobserved');
  const system = orchestratorCalls[0].system;
  if (!system.includes('For this run you hold the tools to read and write files and run commands yourself')) throw new Error(`ok: the direct-work run's instructions do not say the coordinator does the work itself:\n${system}`);
  if (system.includes('you do not modify files or run commands yourself')) throw new Error(`ok: the direct-work run's instructions still forbid the tools it is granted:\n${system}`);
  // K3 of the default live run at c2fdd6a: the root's ROUTE slot is the entry role's, never the routed specialist's.
  // Coupled to the built-in wording of `ROUTE.entry` and `ROUTE.routed` in packages/engine/src/playbooks/catalogue.ts:
  // re-wording either there means re-wording these two strings here, and in live-run.mjs's frictions check.
  if (system.includes('the coordinator routed it to you') || !system.includes('ROUTE: Your assignment is the request itself')) throw new Error(`ok: the root's playbook does not give the entry role its own ROUTE wording:\n${system}`);
  results.ok = { status: ok.status, lines: 3, truncated: false, seen: ok.seen, loadMs: ok.loadMs, directWorkInstructions: true, entryRoute: true };

  // 2. ask mode: loopback resolves allow through `ask:fetch-local-host`, no dialog (REQ-SANDBOX-040/041).
  const askLocal = await launch('ask-local', `${origin}/ok`, { permission_mode: 'ask' });
  if (askLocal.isError) throw new Error(`ask-local: the fetch failed: ${askLocal.result}`);
  if (askLocal.approvals !== 0) throw new Error(`ask-local: ${askLocal.approvals} approval.requested event(s) were recorded for a loopback fetch`);
  if (askLocal.status !== 'ok') throw new Error(`ask-local: the tool row is ${askLocal.status}`);
  results.askLocal = { status: askLocal.status, approvals: 0, seen: askLocal.seen, loadMs: askLocal.loadMs };

  // 3. a redirect onto `localhost` — a new host under the shipped `ask` default — is refused; the server saw /redirect only.
  const redirect = await launch('redirect', `${origin}/redirect`, { permission_mode: 'autonomous' });
  if (redirect.failureKind !== 'egress_redirect_denied') throw new Error(`redirect: failure_kind ${redirect.failureKind}:\n${redirect.result}`);
  expectText(redirect, /the destination host localhost was never approved for this request/);
  if (redirect.seen.join(',') !== '/redirect') throw new Error(`redirect: the server saw ${JSON.stringify(redirect.seen)}`);
  results.redirect = { failureKind: redirect.failureKind, errorClass: redirect.diagnostic?.error_class, seen: redirect.seen, loadMs: redirect.loadMs };

  // 4. the allow list saved: the same redirect is followed; final_url on localhost.
  const allowed = await launch('allow-list', `${origin}/redirect`, { permission_mode: 'autonomous', network_allowed_hosts: ['localhost'] });
  if (allowed.isError) throw new Error(`allow-list: the fetch failed: ${allowed.result}`);
  expectText(allowed, new RegExp(`^url: ${origin}/redirect\\nfinal_url: http://localhost:${port}/ok\\nstatus_code: 200`));
  if (allowed.seen.join(',') !== '/redirect,/ok') throw new Error(`allow-list: the server saw ${JSON.stringify(allowed.seen)}`);
  results.allowList = { finalUrl: allowed.diagnostic?.final_url ?? `http://localhost:${port}/ok`, seen: allowed.seen, loadMs: allowed.loadMs };

  // 5. the deny list saved: the named host is refused and the server sees nothing (REQ-SANDBOX-022).
  const denied = await launch('denied', `${origin}/ok`, { permission_mode: 'autonomous', network_denied_hosts: ['127.0.0.1'] });
  if (denied.failureKind !== 'egress_denied') throw new Error(`denied: failure_kind ${denied.failureKind}:\n${denied.result}`);
  expectText(denied, /Network egress to 127\.0\.0\.1 was refused: it matches '127\.0\.0\.1' on runtime\.network_denied_hosts\./);
  if (denied.seen.length !== 0) throw new Error(`denied: the server saw ${JSON.stringify(denied.seen)} — a denied host must observe zero requests`);
  if (denied.diagnostic?.error_class !== 'NetworkEgressDenied') throw new Error(`denied: error_class ${denied.diagnostic?.error_class}`);
  results.denied = { failureKind: denied.failureKind, errorClass: denied.diagnostic.error_class, seen: denied.seen, loadMs: denied.loadMs };

  // 6. a 404: http_error, the status, the body under [fetch_output].
  const notFound = await launch('404', `${origin}/404`, { permission_mode: 'autonomous' });
  if (notFound.failureKind !== 'http_error' || !notFound.isError) throw new Error(`404: failure_kind ${notFound.failureKind}, is_error ${notFound.isError}:\n${notFound.result}`);
  if (notFound.diagnostic?.status_code !== 404 || notFound.diagnostic?.detail !== 'HTTP request completed with status code 404.') throw new Error(`404: the diagnostic is ${JSON.stringify(notFound.diagnostic)}`);
  expectText(notFound, /\[fetch_output\]\nno such page$/);
  results.notFound = { failureKind: notFound.failureKind, statusCode: notFound.diagnostic.status_code, seen: notFound.seen, loadMs: notFound.loadMs };

  // 7. a route that never answers with tool_call_timeout: 1 → timeout from the run level (REQ-SANDBOX-021).
  const slow = await launch('timeout', `${origin}/slow`, { permission_mode: 'autonomous', tool_call_timeout: 1 });
  if (slow.failureKind !== 'timeout') throw new Error(`timeout: failure_kind ${slow.failureKind}:\n${slow.result}`);
  if (slow.diagnostic?.timeout_seconds !== 1) throw new Error(`timeout: timeout_seconds ${slow.diagnostic?.timeout_seconds}`);
  expectText(slow, /did not complete within 1 s, the deadline supplied by the owning run's runtime\.tool_call_timeout\./);
  if (slow.seen.join(',') !== '/slow') throw new Error(`timeout: the server saw ${JSON.stringify(slow.seen)}`);
  // REQ-SESSION-136: the timeout files `terminal_timeout` referencing the fetch, in the fetch's own words: no terminal
  // command ran (finacc3 A2-08; until then the message read "A terminal command exceeded its timeout.").
  const timedOut = slow.issues.filter((i) => i.evidence_ref === `tool_call_evidence#${slow.callId}`);
  if (timedOut.length !== 1 || timedOut[0].kind !== 'terminal_timeout' || timedOut[0].message !== "The 'fetch' call did not complete within its time allowance.") throw new Error(`timeout: the issue does not name the fetch that timed out (finacc3 A2-08): ${JSON.stringify(slow.issues)}`);
  results.timeout = { failureKind: slow.failureKind, timeoutSeconds: slow.diagnostic.timeout_seconds, seen: slow.seen, issue: timedOut[0].message, loadMs: slow.loadMs };

  // 8. PD-ORCH-006 revision 3 (OQ-205 as ruled, R-072): a `swarm` run the mapping grants the direct-work bundle is told to
  // do the work itself, carries no `swarm` layer, and is offered the bundle with `delegate` in it.
  const swarmRequests = join(output, 'swarm-granted.model-requests.jsonl');
  writeFileSync(swarmRequests, '');
  const swarmGranted = await launch('swarm-granted', `${origin}/ok`, { permission_mode: 'autonomous' }, { ROTARIS_CAPTURE_MODEL_REQUESTS: swarmRequests }, 'swarm');
  if (swarmGranted.isError) throw new Error(`swarm-granted: the fetch failed: ${swarmGranted.result}`);
  const swarmCalls = readFileSync(swarmRequests, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l)).filter((c) => c.who === 'orchestrator');
  if (swarmCalls.length === 0) throw new Error('swarm-granted: the model port recorded no orchestrator call, so the instructions are unobserved');
  const swarmSystem = swarmCalls[0].system;
  if (!swarmSystem.includes('For this run you hold the tools to read and write files and run commands yourself')) throw new Error(`swarm-granted: the granted run's instructions do not say the coordinator does the work itself:\n${swarmSystem}`);
  if (swarmSystem.includes('## Run override: `swarm`')) throw new Error(`swarm-granted: the granted run carries the swarm layer beside the direct-work statement:\n${swarmSystem}`);
  const offered = swarmCalls[0].tools ?? [];
  for (const tool of ['write_file', 'terminal', 'delegate']) if (!offered.includes(tool)) throw new Error(`swarm-granted: the granted run was not offered ${tool}: ${offered.join(', ')}`);
  results.swarmGranted = { directWorkInstructions: true, swarmLayer: false, offered: offered.length, loadMs: swarmGranted.loadMs };

  // 9. PD-TOOLS-013 revision 2 (OQ-238): a fetch the run cancels — here the application's quit by SIGTERM while the server
  // holds the request — reads `interrupted`, `InterruptedError`, and files no issue. A quit leaves the session at rest, not
  // `completed`, so this scenario reads the store itself rather than through `launch`.
  {
    saveConfiguration({ permission_mode: 'autonomous', tool_call_timeout: 60 });
    seen.length = 0;
    let app = null;
    let quitAt = null;
    onCut = () => { setTimeout(() => { quitAt = Date.now(); try { if (app?.pid) process.kill(app.pid, 'SIGTERM'); } catch { /* already gone */ } }, 300); };
    const result = await spawnElectron({
      ...cleanEnvironment(), ...proofIsolationEnv({ local, preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ROTARIS_INTENT_SCRIPT: 'explicit_trivial',
      ROTARIS_SCRIPT: `fetch:${origin}/cut,answer`,
      ROTARIS_CAPTURE_PROMPT: `Fetch ${origin}/cut`, ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500',
      // The capture mode is what types the prompt; the quit lands before its wait is satisfied, so no picture is taken.
      ROTARIS_CAPTURE_PNG: join(output, 'cancelled.png'),
    }, (child) => { app = child; });
    onCut = null;
    const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    writeFileSync(join(output, 'cancelled.log'), log);
    if (result.overran) throw new Error(overrunMessage('cancelled', result, log));
    if (quitAt === null) throw new Error(`cancelled: the server never held /cut, so no quit was sent (saw ${JSON.stringify(seen)})`);
    if (result.status !== 0) throw new Error(`cancelled: the quit by SIGTERM exited ${result.status ?? result.signal ?? 'unknown'}`);
    const db = new Database(oneDatabase(local), { readonly: true });
    const session = db.prepare('SELECT session_id, execution_status FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
    const rows = db.prepare("SELECT status, is_error, elapsed_ms, entry FROM tool_calls WHERE session_id = ? AND tool_name = 'fetch' ORDER BY ordinal").all(session.session_id);
    const issues = db.prepare('SELECT kind, evidence_ref FROM issues WHERE session_id = ? ORDER BY ordinal').all(session.session_id);
    db.close();
    if (rows.length !== 1) throw new Error(`cancelled: expected one fetch tool row; found ${rows.length}`);
    const entry = JSON.parse(rows[0].entry);
    const diagnostic = (() => { const m = /\[fetch_diagnostic\]\n(\{.*\})/.exec(entry.result ?? ''); return m ? JSON.parse(m[1]) : null; })();
    if (rows[0].status !== 'failed' || entry.failure_kind !== 'interrupted') throw new Error(`cancelled: the cut fetch reads ${rows[0].status} / ${entry.failure_kind}, not failed / interrupted:\n${entry.result}`);
    if (diagnostic?.error_class !== 'InterruptedError' || diagnostic?.detail !== `The fetch of ${origin}/cut was cancelled by the run before it completed.`) throw new Error(`cancelled: the diagnostic is ${JSON.stringify(diagnostic)}`);
    if ('outcome_kind' in entry) throw new Error(`cancelled: the record carries outcome_kind ${entry.outcome_kind} (OQ-208: a fetch carries none)`);
    const own = issues.filter((i) => i.evidence_ref === `tool_call_evidence#${entry.call_id}`);
    if (own.length !== 0) throw new Error(`cancelled: the cut fetch filed ${JSON.stringify(own)}`);
    if (seen.join(',') !== '/cut') throw new Error(`cancelled: the server saw ${JSON.stringify(seen)}`);
    results.cancelled = { failureKind: entry.failure_kind, errorClass: diagnostic.error_class, elapsedMs: Math.round(rows[0].elapsed_ms ?? 0), sessionStatus: session.execution_status, issues: own.length, seen: [...seen] };
  }

  const loads = Object.values(results).map((r) => r.loadMs).filter((ms) => typeof ms === 'number');
  results.policyRead = { perCallMs: loads, medianMs: [...loads].sort((a, b) => a - b)[Math.floor(loads.length / 2)], maxMs: Math.max(...loads) };
} finally {
  await stopServer();
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
