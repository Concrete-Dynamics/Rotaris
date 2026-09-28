/**
 * The fetch proof (Part N): ADR-0023's second first execution — the `fetch` tool behind the real run host, its
 * egress policy read from the workspace's SAVED configuration at each call (REQ-SANDBOX-038). Scripted client,
 * scratch store, one `node:http` server on 127.0.0.1 that RECORDS EVERY REQUEST PATH, and seven launches against
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
 *                    run level (REQ-SANDBOX-021).
 *
 * Each scenario asserts the tool row's observation from the store's `tool_calls` and the server's request log, and
 * reads the run host's `fetch: egress policy read … in N ms` line for the per-call load's cost.
 * Evidence under `.proof/fetch-proof/`: one log per launch, `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
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
let port = 0;
const server = createServer((req, res) => {
  seen.push(req.url ?? '');
  if (req.url === '/ok') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('line one\nline two\nline three\n'); return; }
  if (req.url === '/redirect') { res.writeHead(302, { location: `http://localhost:${port}/ok` }); res.end(); return; }
  if (req.url === '/404') { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('no such page\n'); return; }
  if (req.url === '/slow') { held.push(res); return; }
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
function saveConfiguration(runtime) {
  const lines = ['# scratch configuration written by the fetch proof', 'models:', '  scripted: { provider: scripted, model_id: scripted }', 'small_model: scripted', 'medium_model: scripted', 'large_model: scripted', 'mcp_servers:', '  code_intelligence: { enabled: false }', 'runtime:']; // the code_intelligence entry off: its discovery costs every run start about 4.5 s since Part T (ADR-0035's note, finding 6)
  for (const [key, value] of Object.entries(runtime)) lines.push(`  ${key}: ${Array.isArray(value) ? `[${value.map((v) => JSON.stringify(v)).join(', ')}]` : String(value)}`);
  lines.push('');
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), lines.join('\n'));
}

/** The launch is ASYNCHRONOUS: this process serves the HTTP routes while Electron runs, so a synchronous wait would starve them (the proof's own first finding). */
function spawnElectron(env) {
  return new Promise((resolveLaunch) => {
    const child = spawn(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], { cwd: app, windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.setEncoding('utf8'); child.stderr.on('data', (d) => { stderr += d; });
    const killer = setTimeout(() => { child.kill(); }, 150_000);
    child.on('close', (status, signal) => { clearTimeout(killer); resolveLaunch({ status, signal, stdout, stderr }); });
  });
}

async function launch(name, url, runtime) {
  saveConfiguration(runtime);
  seen.length = 0;
  const result = await spawnElectron({
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
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}`);
  const db = new Database(oneDatabase(local), { readonly: true });
  const session = db.prepare('SELECT session_id, execution_status, stop_reason FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
  const rows = db.prepare("SELECT status, is_error, entry FROM tool_calls WHERE session_id = ? AND tool_name = 'fetch' ORDER BY ordinal").all(session.session_id);
  const approvals = db.prepare("SELECT COUNT(*) AS n FROM events WHERE session_id = ? AND kind = 'approval.requested'").get(session.session_id).n;
  db.close();
  if (session.execution_status !== 'completed') throw new Error(`${name}: the run ended ${session.execution_status} (${session.stop_reason})`);
  if (rows.length !== 1) throw new Error(`${name}: expected one fetch tool row; found ${rows.length}`);
  const entry = JSON.parse(rows[0].entry);
  const loads = [...log.matchAll(/egress policy read from the saved configuration in ([\d.]+) ms/g)].map((m) => Number(m[1]));
  if (loads.length !== 1) throw new Error(`${name}: expected one per-call policy read in the log; found ${loads.length}`);
  const diagnostic = (() => { const m = /\[fetch_diagnostic\]\n(\{.*\})/.exec(entry.result); return m ? JSON.parse(m[1]) : null; })();
  return { name, session: session.session_id, status: rows[0].status, isError: rows[0].is_error === 1, failureKind: entry.failure_kind ?? null, result: entry.result, diagnostic, seen: [...seen], approvals, loadMs: loads[0] };
}
const expectText = (r, re) => { if (!re.test(r.result)) throw new Error(`${r.name}: the observation did not match ${re}:\n${r.result}`); };
const results = {};
try {
  // 1. autonomous, the shipped policy (ask default, empty lists): a loopback fetch succeeds under the mode default.
  const ok = await launch('ok', `${origin}/ok`, { permission_mode: 'autonomous' });
  if (ok.isError || ok.failureKind !== null) throw new Error(`ok: the fetch failed: ${ok.result}`);
  expectText(ok, new RegExp(`^url: ${origin}/ok\\nfinal_url: ${origin}/ok\\nstatus_code: 200\\ncontent_type: text/plain\\ntruncated: false\\n\\nline one\\nline two\\nline three$`));
  if (ok.seen.join(',') !== '/ok') throw new Error(`ok: the server saw ${JSON.stringify(ok.seen)}`);
  results.ok = { status: ok.status, lines: 3, truncated: false, seen: ok.seen, loadMs: ok.loadMs };

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
  results.timeout = { failureKind: slow.failureKind, timeoutSeconds: slow.diagnostic.timeout_seconds, seen: slow.seen, loadMs: slow.loadMs };

  const loads = Object.values(results).map((r) => r.loadMs);
  results.policyRead = { perCallMs: loads, medianMs: [...loads].sort((a, b) => a - b)[Math.floor(loads.length / 2)], maxMs: Math.max(...loads) };
} finally {
  await stopServer();
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
