/**
 * The code-intelligence proof (Part T): ADR-0035's first execution behind the real run host — the bundled runtime
 * (`pnpm code-intel:bundle`, run here if the marker is absent), the pre-bootstrap branch, the generated manifest, the
 * client's owed halves and the project setup, in seven launches against one scratch profile:
 *
 *   1. branch     — the development entry with the token → JSON-RPC only on standard output (the bytes before the
 *                   first `{` recorded and asserted to be Electron's CR LF and nothing else), no window, the runtime's
 *                   own exit status propagated (the server exits 0 on stdin's end; an unknown subcommand exits 2);
 *                   the same against `win-unpacked` under ROTARIS_CODE_INTEL_PACKAGED=1.
 *   2. discovery  — a run whose persona carries `code_intelligence` → the connection made through the token, the
 *                   manifest's names listed, the prompt section carrying the 12-name grant and the memories block,
 *                   the binding probe's success, `granted_mcp` on the child row.
 *   3. binding    — the launch line carries the two appended arguments; `tools/list` under a project holds no
 *                   project-switching or configuration-introspection tool (launch 1's listing, 22 names).
 *   4. call       — `get_symbols_overview` scripted against a TypeScript file → the symbols named; tool.start before
 *                   tool.finish. Needs the runtime's TypeScript language server, which it provisions on first use
 *                   (IC-7); the runtime's home is kept across proof runs so the second run is warm.
 *   5. setup      — the action in the MCP category: three `succeeded` and the marker; again → creation skipped; a
 *                   workspace without code → `skipped-no-code` twice; an entry without the launch subcommand → the
 *                   non-retryable text; a cancel while creating → `not-attempted`.
 *   6. drift      — the manifest generator's `--check` against a doctored module → refused.
 *   7. contained  — (packaged only) the packaged executable with the token, outbound blocked, a fresh runtime home:
 *                   tools/list answers; the symbol overview either answers or names what the runtime tried to fetch.
 *
 * Evidence under `.code-intel-proof/`: one log and PNG per launch, `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { cleanEnvironment } from './lib/harness.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = join(repo, 'node_modules', 'electron', 'dist', 'electron.exe');
const mainEntry = join(app, 'out', 'main', 'index.js');
const packagedExe = join(app, 'release', 'win-unpacked', 'Rotaris.exe');
const packaged = process.env['ROTARIS_CODE_INTEL_PACKAGED'] === '1';
const output = resolve(repo, '.code-intel-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
const TOKEN = 'builtin:code-intelligence';
// `--steps=1,2` runs a subset (the launches are long); `--keep` leaves the previous evidence and merges results.json.
const stepsArg = process.argv.find((a) => a.startsWith('--steps='));
const wanted = new Set((stepsArg ? stepsArg.slice('--steps='.length) : '1,2,3,4,5,6,7').split(',').map((s) => s.trim()));
const want = (n) => wanted.has(String(n));
const keepOutput = process.argv.includes('--keep');

// The runtime's per-user home (the language servers it provisions live there) is kept across proof runs: everything else is wiped.
const root = join(output, 'profile');
const local = join(root, 'local');
const runtimeHome = join(local, 'rotaris', 'data', 'code-intelligence');
const keep = join(repo, '.code-intel-proof-home.tmp');
let previous = {};
if (keepOutput && existsSync(join(output, 'results.json'))) { try { previous = JSON.parse(readFileSync(join(output, 'results.json'), 'utf8')); } catch { previous = {}; } }
if (!keepOutput) {
  if (existsSync(runtimeHome)) { rmSync(keep, { recursive: true, force: true }); renameSync(runtimeHome, keep); }
  rmSync(output, { recursive: true, force: true });
  mkdirSync(join(local, 'rotaris', 'data'), { recursive: true });
  if (existsSync(keep)) renameSync(keep, runtimeHome);
}
mkdirSync(join(local, 'rotaris', 'data'), { recursive: true });

// The bundle, then the build.
const marker = join(app, 'resources', 'code-intelligence', 'bundle.json');
if (!existsSync(marker)) {
  const b = spawnSync(process.execPath, [join(app, 'scripts', 'code-intelligence', 'bundle.mjs')], { cwd: repo, encoding: 'utf8', stdio: 'inherit', timeout: 900_000 });
  if (b.status !== 0) throw new Error(`the bundle step exited ${b.status ?? b.signal}`);
}
const bundle = JSON.parse(readFileSync(marker, 'utf8'));
if (!process.argv.includes('--skip-build')) {
  const built = spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 180_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);
if (packaged && !existsSync(packagedExe)) throw new Error(`ROTARIS_CODE_INTEL_PACKAGED=1 but ${packagedExe} is absent (pnpm package with ROTARIS_PACKAGE_DIR_ONLY=1 ROTARIS_PACKAGE_SKIP_APP=1)`);

const workspace = join(root, 'workspace');
const noCode = join(root, 'workspace-nocode');
const configDir = join(local, 'rotaris', 'config');
const preferences = join(root, 'preferences');
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
mkdirSync(join(workspace, 'src'), { recursive: true });
mkdirSync(join(noCode, '.rotaris'), { recursive: true });
mkdirSync(configDir, { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# code-intelligence proof workspace\n');
writeFileSync(join(workspace, 'src', 'index.ts'), 'export interface Greeter { name: string }\nexport function greet(g: Greeter): string { return `hi ${g.name}`; }\nexport class Counter { private n = 0; bump(): number { return ++this.n; } }\n');
writeFileSync(join(noCode, 'README.md'), '# no code here\n');
for (const ws of [workspace, noCode]) spawnSync('git', ['init', '-q'], { cwd: ws, stdio: 'ignore' });
const WORKSPACE = ['# workspace configuration', 'runtime:', '  permission_mode: autonomous', '  allow_unsandboxed_autonomous: true', 'rotaris:', '  delegation_strategy: single', ''].join('\n');
const GLOBAL = ['# scratch configuration written by the code-intelligence proof', 'models:', '  scripted: { provider: scripted, model_id: scripted }', 'small_model: scripted', 'medium_model: scripted', 'large_model: scripted', ''].join('\n');
/** REQ-MCP-036/099: an entry whose arguments hold no launch subcommand — the non-retryable failure. */
const GLOBAL_BROKEN = `${GLOBAL}mcp_servers:\n  code_intelligence: { args: ["--transport", "stdio"] }\n`;

function databases() {
  const found = [];
  const walk = (dir) => { if (!existsSync(dir)) return; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name === 'workspace.db') found.push(p); } };
  walk(join(local, 'rotaris', 'data', 'workspaces'));
  if (found.length < 1) throw new Error(`no workspace database below ${local}`);
  return found.sort();
}
const lines = (log, re) => log.split('\n').filter((l) => re.test(l));
/**
 * The session THIS launch produced, taken across every store rather than from one of them.
 *
 * The sixty-eighth defect: the proof drives two workspaces - `workspace`, which holds the TypeScript file, and
 * `workspace-nocode`, which holds none - and the product keys a store directory by a hash of the workspace path.
 * The read was "the last workspace.db by path sort", which names whichever hash sorts last and not the workspace the
 * launch was given: `workspace` hashes to v1-08b5... and `workspace-nocode` to v1-fb8c..., so section 4 read the
 * no-code store, found no `get_symbols_overview` row in it, and reported the call as unmade while its own run log
 * held the language server's answer. Sorted hashes are stable within a checkout and arbitrary across checkouts,
 * which is why the same bytes passed in the worktree they were written in and failed in the main tree.
 */
function sessionFrom(r) {
  let best = null;
  for (const path of databases()) {
    const db = new Database(path, { readonly: true });
    const session = db.prepare('SELECT session_id, created_at, execution_status, stop_reason FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
    if (session && (best === null || session.created_at > best.session.created_at)) { best?.db.close(); best = { db, session, path }; } else db.close();
  }
  if (best === null) throw new Error(`no session in any workspace database below ${local}`);
  if (best.session.created_at < r.startedAt) throw new Error(`the newest session (${best.session.created_at}, ${best.path}) predates the launch at ${r.startedAt}: this launch wrote none`);
  return best;
}
function toolRows(db, sessionId, tool) { return db.prepare('SELECT ordinal, status, is_error, entry FROM tool_calls WHERE session_id = ? AND tool_name = ? ORDER BY ordinal').all(sessionId, tool).map((r) => ({ ...r, entry: JSON.parse(r.entry) })); }
function eventOrdinals(db, sessionId, kind) { return db.prepare('SELECT ordinal, payload FROM events WHERE session_id = ? AND kind = ? ORDER BY ordinal').all(sessionId, kind); }

function launch(name, extra, { ws = workspace, global = GLOBAL, timeout = 150_000 } = {}) {
  writeFileSync(join(configDir, 'agents.yaml'), global);
  writeFileSync(join(ws, '.rotaris', 'agents.yaml'), WORKSPACE);
  const png = join(output, `${name}.png`);
  const started = Date.now();
  const result = spawnSync(electron, [mainEntry, ws], {
    cwd: app, encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    env: {
      ...cleanEnvironment(), LOCALAPPDATA: local, APPDATA: join(dirname(local), 'roaming'), ROTARIS_PREFERENCES_ROOT: preferences,
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_INTENT_SCRIPT: 'explicit_trivial', ROTARIS_CIRCUIT_BREAKER: 'off', ROTARIS_CAPTURE_PNG: png,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const elapsedMs = Date.now() - started;
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  return { log, elapsedMs, png, startedAt: new Date(started).toISOString() };
}

/** A raw JSON-RPC client over the branch (launch 1 and launch 7): the bytes before the first '{', the listing, one call, the exit status. */
async function branch({ exe, before, tail, ws, env, call = null, callTimeoutMs = 120_000, sample = true }) {
  const t0 = Date.now();
  const launchedAt = new Date();
  const child = spawn(exe, [...before, TOKEN, '--', ...tail], { env, cwd: ws, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let out = Buffer.alloc(0); let stderr = ''; let preamble = null; let firstByteAt = null; const nonJson = [];
  const pending = new Map(); let id = 0;
  child.stderr.setEncoding('utf8'); child.stderr.on('data', (d) => { stderr += d; });
  const send = (method, params) => new Promise((res, rej) => { const my = ++id; pending.set(my, { res, rej }); child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: my, method, params })}\n`); });
  child.stdout.on('data', (d) => {
    if (firstByteAt === null) firstByteAt = Date.now() - t0;
    out = Buffer.concat([out, d]);
    for (;;) {
      const nl = out.indexOf(10); if (nl === -1) return;
      const line = out.subarray(0, nl); out = out.subarray(nl + 1);
      const text = line.toString('utf8');
      if (preamble === null) { const b = text.indexOf('{'); if (b === -1) { preamble = (preamble ?? '') + text + '\n'; continue; } preamble = (preamble ?? '') + text.slice(0, b); }
      if (text.trim() === '') continue;
      let m; try { m = JSON.parse(text); } catch { nonJson.push(text.slice(0, 200)); continue; }
      if (m.id !== undefined && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.rej(new Error(JSON.stringify(m.error))); else p.res(m.result); }
    }
  });
  const ps = `$since = [DateTime]::Parse('${launchedAt.toISOString()}').ToLocalTime(); Get-Process -Name electron,Rotaris,python,conhost,node -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -gt $since } | Select-Object Id,ProcessName,MainWindowHandle,MainWindowTitle | ConvertTo-Json -Compress`;
  const samples = [];
  const sampler = sample ? setInterval(() => {
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: 5_000 });
    let procs = []; try { const parsed = JSON.parse(r.stdout.trim() || '[]'); procs = Array.isArray(parsed) ? parsed : [parsed]; } catch { procs = []; }
    samples.push({ atMs: Date.now() - t0, processes: procs.map((p) => ({ id: p.Id, name: p.ProcessName, handle: String(p.MainWindowHandle), title: p.MainWindowTitle ?? '' })) });
  }, 300) : null;
  const result = {};
  const guard = setTimeout(() => { child.kill(); }, callTimeoutMs + 60_000);
  try {
    const init = await send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'code-intel-proof', version: '0' } });
    result.initializeMs = Date.now() - t0; result.serverName = init.serverInfo?.name; result.protocol = init.protocolVersion;
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
    const tools = await send('tools/list', {});
    result.toolsListMs = Date.now() - t0; result.toolNames = tools.tools.map((t) => t.name).sort();
    if (call) {
      const c0 = Date.now();
      const r = await Promise.race([send('tools/call', { name: call.name, arguments: call.args }), new Promise((_, rej) => setTimeout(() => rej(new Error(`no answer to ${call.name} within ${callTimeoutMs} ms`)), callTimeoutMs))]);
      result.call = { name: call.name, ms: Date.now() - c0, isError: r.isError ?? false, text: (r.content ?? []).map((c) => c.text ?? '').join('\n').slice(0, 800) };
    }
  } catch (e) { result.error = String(e.message ?? e); }
  child.stdin.end();
  const exit = await new Promise((res) => { const t = setTimeout(() => { child.kill(); res({ code: null, signal: 'killed-after-30s' }); }, 30_000); child.on('exit', (c, s) => { clearTimeout(t); res({ code: c, signal: s, atMs: Date.now() - t0 }); }); });
  clearTimeout(guard);
  if (sampler) clearInterval(sampler);
  result.exit = exit;
  result.firstStdoutByteMs = firstByteAt;
  result.bytesBeforeFirstBrace = Buffer.from(preamble ?? '').toString('hex');
  result.nonJsonStdoutLines = nonJson;
  result.windowed = [...new Set(samples.flatMap((s) => s.processes.filter((p) => p.handle !== '0' && p.handle !== '')).map((p) => `${p.name}#${p.id} handle ${p.handle} "${p.title}"`))];
  result.postLaunchProcesses = [...new Set(samples.flatMap((s) => s.processes.filter((p) => p.name !== 'conhost').map((p) => p.name)))];
  result.samples = samples.length;
  result.fetchLines = stderr.split(/\r?\n/).filter((l) => /npm install|uvx|Failed to fetch|Could not find|not installed|download|Installing/i.test(l)).map((l) => l.replace(/^.*? - /, '').slice(0, 220)).slice(0, 12);
  result.stderrBytes = stderr.length;
  return result;
}
async function exitStatus({ exe, before, env }) {
  const r = spawnSync(exe, [...before, TOKEN, '--', 'no-such-subcommand'], { env, encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  return { code: r.status, stdout: r.stdout ?? '', stderrTail: (r.stderr ?? '').trim().split(/\r?\n/).at(-1) ?? '' };
}
const SERVER_TAIL = (ws) => ['start-mcp-server', '--transport', 'stdio', '--context', 'ide', '--project', ws];
const results = { ...previous, bundle: { python: bundle.python, distribution: bundle.distribution, version: bundle.version, bytes: bundle.size.bytes, files: bundle.size.files, compiled: bundle.compiled, trimmed: bundle.trimmed } };
const baseEnv = { ...cleanEnvironment(), LOCALAPPDATA: local, APPDATA: join(dirname(local), 'roaming'), ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' };

// ---- 1. the branch guard (ADR-0035 c.1) ------------------------------------------------------------------------
if (want(1)) {
  const dev = await branch({ exe: electron, before: [mainEntry], tail: SERVER_TAIL(noCode), ws: noCode, env: baseEnv });
  if (dev.error) throw new Error(`branch (dev): ${dev.error}`);
  if (!/^(0d0a|0a|)$/.test(dev.bytesBeforeFirstBrace)) throw new Error(`branch (dev): ${dev.bytesBeforeFirstBrace} on standard output before the first '{' (Electron's CR LF is the one tolerated preamble)`);
  if (dev.nonJsonStdoutLines.length !== 0) throw new Error(`branch (dev): non-JSON on standard output: ${JSON.stringify(dev.nonJsonStdoutLines)}`);
  if (dev.windowed.length !== 0) throw new Error(`branch (dev): a window appeared: ${dev.windowed.join('; ')}`);
  if (dev.exit.code !== 0) throw new Error(`branch (dev): the server's exit on stdin end was ${JSON.stringify(dev.exit)}, not 0`);
  if (!dev.toolNames.includes('list_memories') || dev.toolNames.includes('activate_project') || dev.toolNames.includes('get_current_config')) throw new Error(`branch (dev): the listing under a project is wrong: ${dev.toolNames.join(' ')}`);
  const status = await exitStatus({ exe: electron, before: [mainEntry], env: baseEnv });
  if (status.code !== 2) throw new Error(`branch (dev): an unknown subcommand exited ${status.code}, not the runtime's 2 (${status.stderrTail})`);
  results.branch = { dev: { ...dev, unknownSubcommandExit: status.code, unknownSubcommandStderr: status.stderrTail } };
  if (packaged) {
    const pk = await branch({ exe: packagedExe, before: [], tail: SERVER_TAIL(noCode), ws: noCode, env: baseEnv });
    if (pk.error) throw new Error(`branch (packaged): ${pk.error}`);
    if (!/^(0d0a|0a|)$/.test(pk.bytesBeforeFirstBrace) || pk.nonJsonStdoutLines.length !== 0) throw new Error(`branch (packaged): standard output is not clean: ${pk.bytesBeforeFirstBrace} ${JSON.stringify(pk.nonJsonStdoutLines)}`);
    if (pk.windowed.length !== 0) throw new Error(`branch (packaged): a window appeared: ${pk.windowed.join('; ')}`);
    if (pk.exit.code !== 0) throw new Error(`branch (packaged): exit ${JSON.stringify(pk.exit)}`);
    const pstatus = await exitStatus({ exe: packagedExe, before: [], env: baseEnv });
    if (pstatus.code !== 2) throw new Error(`branch (packaged): an unknown subcommand exited ${pstatus.code}`);
    results.branch.packaged = { ...pk, unknownSubcommandExit: pstatus.code };
  }
  console.log(`[code-intel-proof] 1 branch: tools/list at ${dev.toolsListMs} ms (dev), ${dev.toolNames.length} tools, preamble ${dev.bytesBeforeFirstBrace || 'none'}, exit ${dev.exit.code}; unknown subcommand → ${status.code}${packaged ? `; packaged tools/list at ${results.branch.packaged.toolsListMs} ms` : ''}`);
}

// ---- 2. discovery through the token, the grant, the block, the probe; 3. the binding -------------------------------
if (want(2) || want(3)) {
  const r = launch('discovery', { ROTARIS_CAPTURE_PROMPT: 'list the project memories', ROTARIS_SCRIPT: 'mcp:code_intelligence.list_memories,answer', ROTARIS_CAPTURE_AFTER_MS: '25000' }, { ws: noCode, timeout: 180_000 });
  const surface = lines(r.log, /mcp: surface for orchestrator/);
  if (surface.length === 0) throw new Error(`discovery: no surface line:\n${r.log.slice(-3000)}`);
  const first = surface[0];
  const section = JSON.parse(first.slice(first.indexOf('section ') + 'section '.length));
  const callable = /callable (.*?); dropped/.exec(first)[1];
  const ci = /code_intelligence\[([^\]]*)\]/.exec(callable)?.[1]?.split(',') ?? [];
  if (ci.length !== 12) throw new Error(`discovery: the orchestrator's grant holds ${ci.length} names, not 12: ${callable}`);
  if (!section.includes('Project memories:')) throw new Error(`discovery: the memories block is absent from the section:\n${section}`);
  if (!section.includes('- **`code_intelligence`**')) throw new Error(`discovery: the server is not listed with tools:\n${section}`);
  const launchLine = lines(r.log, /mcp code_intelligence: launching /)[0] ?? lines(r.log, /mcp probe:code_intelligence: launching |mcp discovery:code_intelligence: launching /)[0] ?? '';
  const anyLaunch = lines(r.log, /launching .*builtin:code-intelligence/);
  if (anyLaunch.length === 0) throw new Error(`discovery: no launch line for the token:\n${r.log.slice(-2000)}`);
  if (!anyLaunch.every((l) => l.includes(`--project ${noCode}`))) throw new Error(`binding: a launch line lacks the appended project path:\n${anyLaunch.join('\n')}`);
  if (!anyLaunch.every((l) => l.includes(`${TOKEN} --`))) throw new Error(`binding: a launch line lacks the token-first form:\n${anyLaunch.join('\n')}`);
  const connected = lines(r.log, /mcp code_intelligence: connected for the session/)[0] ?? '';
  if (!/hook code_intelligence:ok/.test(connected)) throw new Error(`discovery: the binding probe did not succeed: ${connected || '(no connected line)'}\n${lines(r.log, /code_intelligence/).slice(-10).join('\n')}`);
  const discoveryMs = Number(/discovery of 'code_intelligence' listed (\d+) tool\(s\) in (\d+) ms/.exec(r.log)?.[2]);
  const listed = Number(/discovery of 'code_intelligence' listed (\d+) tool\(s\)/.exec(r.log)?.[1]);
  const { db, session: s } = sessionFrom(r);
  const calls = toolRows(db, s.session_id, 'list_memories');
  const children = db.prepare('SELECT canonical_name, granted_mcp FROM children WHERE session_id = ?').all(s.session_id);
  db.close();
  if (s.execution_status !== 'completed') throw new Error(`discovery: the run ended ${s.execution_status}`);
  if (calls.length !== 1 || calls[0].status !== 'ok') throw new Error(`discovery: list_memories did not succeed: ${JSON.stringify(calls)}`);
  const evidence = children.length > 0 ? JSON.parse(children[0].granted_mcp) : null;
  if (evidence && (evidence.granted?.code_intelligence?.length ?? 0) !== 12) throw new Error(`discovery: granted_mcp holds ${evidence.granted?.code_intelligence?.length} names: ${children[0].granted_mcp}`);
  results.discovery = { grant: ci, listed, discoveryMs, connectMs: Number(/in (\d+) ms/.exec(connected)?.[1]), hook: /hook code_intelligence:(\w+)/.exec(connected)?.[1], sectionHasBlock: true, childEvidence: evidence ? evidence.granted.code_intelligence.length : 'no child row', launches: anyLaunch.length, elapsedMs: r.elapsedMs };
  results.binding = { launchLine: (launchLine || anyLaunch[0]).slice(launchLine.indexOf('mcp')).slice(0, 400), projectSwitchingWithheld: !(results.branch?.dev?.toolNames ?? []).includes('activate_project'), listingUnderProject: results.branch?.dev?.toolNames?.length ?? null, isolatedTree: 'not exercised: the proof starts no isolated session (the start-session dialog flow of the Git proof); the binding reads the root the run was configured with' };
  console.log(`[code-intel-proof] 2 discovery: ${listed} listed in ${discoveryMs} ms, grant 12, block present, probe ${results.discovery.hook}, connect ${results.discovery.connectMs} ms; 3 binding: ${anyLaunch.length} launch line(s) carry --project`);
}

// ---- 4. a real call against a TypeScript file -----------------------------------------------------------------------
if (want(4)) {
  const r = launch('call', { ROTARIS_CAPTURE_PROMPT: 'overview of src/index.ts', ROTARIS_SCRIPT: 'mcp:code_intelligence.get_symbols_overview,answer', ROTARIS_SCRIPT_MCP_ARGS: JSON.stringify({ get_symbols_overview: { relative_path: 'src/index.ts' } }), ROTARIS_CAPTURE_AFTER_MS: '240000' }, { timeout: 330_000 });
  const { db, session: s } = sessionFrom(r);
  const calls = toolRows(db, s.session_id, 'get_symbols_overview');
  const starts = eventOrdinals(db, s.session_id, 'tool.start');
  const finishes = eventOrdinals(db, s.session_id, 'tool.finish');
  db.close();
  const text = String(calls[0]?.entry?.result ?? calls[0]?.entry?.error ?? '');
  if (calls.length !== 1 || calls[0].status !== 'ok' || !/Greeter/.test(text) || !/greet/.test(text) || !/Counter/.test(text)) throw new Error(`call: get_symbols_overview did not name the symbols: ${JSON.stringify(calls).slice(0, 800)}\n${lines(r.log, /npm|language server|Language server/i).slice(-8).join('\n')}`);
  if (starts.length < 1 || finishes.length < 1 || starts[0].ordinal >= finishes[0].ordinal) throw new Error('call: tool.start was not observed before tool.finish');
  const fetched = lines(r.log, /Running command 'npm install|Installing\.\.\./).map((l) => l.replace(/^.*? - /, '').slice(0, 200));
  results.call = { status: calls[0].status, text: text.slice(0, 300), startBeforeFinish: true, elapsedMs: r.elapsedMs, languageServerProvisioned: fetched };
  console.log(`[code-intel-proof] 4 call: ${text.slice(0, 120)} (${r.elapsedMs} ms; ${fetched.length} provisioning line(s))`);
}

// ---- 5. project setup from the MCP category ------------------------------------------------------------------------
const SETUP_ENV = (after, extra = {}) => ({ ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'MCP Servers', ROTARIS_CAPTURE_CLICKS: 'button[data-action="setup-start"]@2500', ROTARIS_CAPTURE_PROBE: '[data-setup-step];;[data-setup-message];;[data-setup-refused];;[data-setup-invocation];;[data-language-server-store];;[data-language-server]', ROTARIS_CAPTURE_AFTER_MS: String(after), ...extra });
function setupSteps(log) {
  const probe = lines(log, /capture: probe \[data-setup-step\]/).at(-1) ?? '';
  const found = JSON.parse(probe.slice(probe.indexOf('→') + 2) || '[]');
  return found.map((f) => ({ id: f.data['data-setup-step'], status: f.data['data-step-status'], text: f.text }));
}
function setupMessage(log) {
  const probe = lines(log, /capture: probe \[data-setup-message\]/).at(-1) ?? '';
  const found = JSON.parse(probe.slice(probe.indexOf('→') + 2) || '[]');
  return found.map((f) => f.text).join(' | ');
}
const setupLog = (log) => lines(log, /mcp setup:/).map((l) => l.slice(l.indexOf('mcp setup:')).slice(0, 240));
if (want(5)) {
  // The runtime auto-creates its project marker when a server is started with `--project` (launches 1–4 did), so the
  // marker is removed first: this launch must run the creation step for real, not skip it.
  rmSync(join(workspace, '.serena'), { recursive: true, force: true });
  const r = launch('setup', SETUP_ENV(90_000), { timeout: 200_000 });
  const steps = setupSteps(r.log);
  if (steps.map((s) => s.status).join(',') !== 'succeeded,succeeded,succeeded') throw new Error(`setup: ${JSON.stringify(steps)}\n${setupLog(r.log).join('\n')}`);
  if (/creation skipped/.test(steps[0].text)) throw new Error(`setup: creation was skipped on a workspace without a marker: ${steps[0].text}`);
  if (!existsSync(join(workspace, '.serena', 'project.yml'))) throw new Error('setup: the marker file is absent after creation');
  const message = setupMessage(r.log);
  if (!/Completed/.test(message)) throw new Error(`setup: the outcome reads '${message}'`);
  const times = Object.fromEntries(setupLog(r.log).map((l) => /mcp setup: (\w+) succeeded[^(]*\((\d+) ms\)/.exec(l)).filter(Boolean).map((m) => [m[1], Number(m[2])]));
  results.setup = { first: { steps: steps.map((s) => s.status), message, times, elapsedMs: r.elapsedMs, png: r.png } };
  // REQ-MCP-118 (ESC-32 / IC-7): the disclosure is on the card — the store path under the profile's data directory, and every
  // declared package with its version — and it is TRUE to the runtime: launch 4's provisioning lines named a declared version.
  const probeOf = (sel) => { const p = lines(r.log, new RegExp(`capture: probe \\[${sel}\\]`)).at(-1) ?? ''; return JSON.parse(p.slice(p.indexOf('→') + 2) || '[]'); };
  const store = probeOf('data-language-server-store').map((f) => f.text).join('');
  const declared = probeOf('data-language-server').map((f) => ({ name: f.data['data-language-server'], version: f.data['data-version'], language: f.data['data-language'], text: f.text }));
  if (!store.includes(join(root, 'local')) && !/code-intelligence/.test(store)) throw new Error(`disclosure: the store path is missing or wrong: '${store}'`);
  if (declared.length < 3 || !declared.every((d) => /^\d+\.\d+\.\d+$/.test(d.version) && d.text.includes(d.name) && d.text.includes(d.version) && /licence/.test(d.text))) throw new Error(`disclosure: the declared servers are incomplete: ${JSON.stringify(declared)}`);
  const provisioned = results.call?.languageServerProvisioned ?? previous.call?.languageServerProvisioned ?? [];
  const named = declared.filter((d) => provisioned.some((l) => l.includes(`${d.name}@${d.version}`)));
  if (provisioned.length > 0 && named.length === 0) throw new Error(`disclosure: launch 4 provisioned ${JSON.stringify(provisioned)} and none of it is a declared package`);
  if (!existsSync(store)) console.log(`[code-intel-proof] 5 disclosure: the store ${store} does not exist yet (no language provisioned in this profile)`);
  results.disclosure = { store, storeExists: existsSync(store), declared: declared.map((d) => `${d.language}: ${d.name} ${d.version}`), trueToRuntime: provisioned.length === 0 ? 'not exercised' : named.map((d) => `${d.name}@${d.version}`) };
  console.log(`[code-intel-proof] 5 disclosure: ${declared.length} declared, store ${results.disclosure.storeExists ? 'present' : 'absent'}, true to the runtime: ${JSON.stringify(results.disclosure.trueToRuntime)}`);
  console.log(`[code-intel-proof] 5 setup: ${steps.map((s) => s.status).join(' ')} — ${message} (${JSON.stringify(times)})`);
}
if (want(5)) {
  const r = launch('setup-again', SETUP_ENV(60_000), { timeout: 150_000 });
  const steps = setupSteps(r.log);
  // Say what was found rather than indexing into nothing. A launch that emits no setup line at all — the 150 s
  // timeout reached on a loaded machine, or the window dying before the first step — used to fail here as
  // `Cannot read properties of undefined (reading 'status')`, which names neither the scenario nor the cause. The
  // assertions below are unchanged; only the silence is given words (merge 2's proof pass, the same shape as AJ2-2).
  if (steps.length === 0) throw new Error(`setup-again: the launch logged no setup step within its window; exit ${r.status ?? 'unknown'}, ${r.log.length} log bytes`);
  if (steps[0].status !== 'succeeded' || !/creation skipped/.test(steps[0].text)) throw new Error(`setup-again: creation was not skipped: ${JSON.stringify(steps[0])}`);
  if (steps.map((s) => s.status).join(',') !== 'succeeded,succeeded,succeeded') throw new Error(`setup-again: ${JSON.stringify(steps)}`);
  results.setup.again = { steps: steps.map((s) => s.status), creation: steps[0].text.slice(0, 160) };
  console.log(`[code-intel-proof] 5 setup again: creation skipped — ${steps[0].text.slice(0, 80)}`);
}
if (want(5)) {
  rmSync(join(noCode, '.serena'), { recursive: true, force: true });
  const r = launch('setup-nocode', SETUP_ENV(40_000), { ws: noCode, timeout: 120_000 });
  const steps = setupSteps(r.log);
  if (steps.map((s) => s.status).join(',') !== 'succeeded,skipped-no-code,skipped-no-code') throw new Error(`setup-nocode: ${JSON.stringify(steps)}\n${setupLog(r.log).join('\n')}`);
  if (/creation skipped/.test(steps[0].text)) throw new Error(`setup-nocode: creation was skipped: ${steps[0].text}`);
  if (!existsSync(join(noCode, '.serena', 'project.yml'))) throw new Error('setup-nocode: creation still runs in a workspace without code, and the marker is absent');
  results.setup.noCode = { steps: steps.map((s) => s.status), message: setupMessage(r.log) };
  console.log(`[code-intel-proof] 5 setup no-code: ${steps.map((s) => s.status).join(' ')}`);
}
if (want(5)) {
  const r = launch('setup-broken', SETUP_ENV(12_000), { global: GLOBAL_BROKEN, timeout: 90_000 });
  const message = setupMessage(r.log);
  const refused = setupLog(r.log).find((l) => /refused/.test(l)) ?? '';
  if (!/not a local launch/.test(message) || !/not a local launch/.test(refused)) throw new Error(`setup-broken: the non-retryable text is missing: '${message}' / '${refused}'`);
  const steps = setupSteps(r.log);
  if (steps.map((s) => s.status).join(',') !== 'not-attempted,not-attempted,not-attempted') throw new Error(`setup-broken: ${JSON.stringify(steps)}`);
  results.setup.broken = { message, refused: refused.slice(0, 300), steps: steps.map((s) => s.status) };
  console.log(`[code-intel-proof] 5 setup broken entry: ${message.slice(0, 120)}`);
}
if (want(5)) {
  // Cancel while `create` runs (the runtime's import alone takes seconds): the step in flight is terminated, the rest not attempted.
  rmSync(join(noCode, '.serena'), { recursive: true, force: true });
  const r = launch('setup-cancel', SETUP_ENV(30_000, { ROTARIS_CAPTURE_CLICKS: 'button[data-action="setup-start"]@2500;;button[data-action="setup-cancel"]@3300' }), { ws: noCode, timeout: 120_000 });
  const steps = setupSteps(r.log);
  const message = setupMessage(r.log);
  if (steps.map((s) => s.status).join(',') !== 'failed,not-attempted,not-attempted' || !/Cancelled/.test(message)) throw new Error(`setup-cancel: ${JSON.stringify(steps)} — '${message}'\n${setupLog(r.log).join('\n')}`);
  results.setup.cancel = { steps: steps.map((s) => s.status), message, detail: steps[0].text.slice(0, 200) };
  console.log(`[code-intel-proof] 5 setup cancel: ${steps.map((s) => s.status).join(' ')} — ${message}`);
}

// ---- 6. manifest drift ---------------------------------------------------------------------------------------------
if (want(6)) {
  const module = join(repo, 'packages', 'config', 'src', 'mcp', 'code-intelligence-manifest.generated.ts');
  const original = readFileSync(module, 'utf8');
  const doctored = original.replace("symbolLookup: 'find_symbol'", "symbolLookup: 'find_symbols'");
  if (doctored === original) throw new Error('drift: the module could not be doctored');
  writeFileSync(module, doctored);
  let check;
  try { check = spawnSync(process.execPath, [join(app, 'scripts', 'code-intelligence', 'manifest.mjs'), '--check'], { cwd: repo, encoding: 'utf8', timeout: 180_000, windowsHide: true }); } finally { writeFileSync(module, original); }
  if (check.status === 0) throw new Error('drift: the check accepted a doctored module');
  const clean = spawnSync(process.execPath, [join(app, 'scripts', 'code-intelligence', 'manifest.mjs'), '--check'], { cwd: repo, encoding: 'utf8', timeout: 180_000, windowsHide: true });
  if (clean.status !== 0) throw new Error(`drift: the check refused the committed module:\n${clean.stderr}`);
  results.drift = { doctoredRefused: true, refusal: (check.stderr ?? '').trim().slice(0, 300), committedAccepted: true };
  console.log(`[code-intel-proof] 6 drift: refused — ${results.drift.refusal.slice(0, 100)}`);
}

// ---- 7. self-containment (packaged only) ---------------------------------------------------------------------------
if (want(7) && packaged) {
  const fresh = join(output, 'fresh-local');
  mkdirSync(fresh, { recursive: true });
  const ws2 = join(output, 'workspace-contained');
  mkdirSync(join(ws2, 'src'), { recursive: true });
  writeFileSync(join(ws2, 'src', 'index.ts'), 'export function contained(): number { return 1; }\n');
  spawnSync('git', ['init', '-q'], { cwd: ws2, stdio: 'ignore' });
  const blocked = { ...baseEnv, LOCALAPPDATA: fresh, HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9', ALL_PROXY: 'http://127.0.0.1:9', NO_PROXY: '', npm_config_proxy: 'http://127.0.0.1:9', npm_config_https_proxy: 'http://127.0.0.1:9', npm_config_offline: 'true', npm_config_cache: join(fresh, 'npm-cache-empty') };
  const c = await branch({ exe: packagedExe, before: [], tail: SERVER_TAIL(ws2), ws: ws2, env: blocked, call: { name: 'get_symbols_overview', args: { relative_path: 'src/index.ts' } }, callTimeoutMs: 120_000, sample: false });
  results.contained = { toolsListMs: c.toolsListMs, toolCount: c.toolNames?.length, call: c.call ?? null, error: c.error ?? null, fetchLines: c.fetchLines, exit: c.exit, verdict: c.call && !c.call.isError && /contained/.test(c.call.text) ? 'answered without fetching' : 'the runtime tried to fetch (IC-7 evidence)' };
  console.log(`[code-intel-proof] 7 contained: ${results.contained.verdict}; ${c.fetchLines.length} fetch line(s)`);
  // ESC-32 / IC-7 adopted: what the packaged runtime tried to fetch with outbound blocked must be a DECLARED package at its
  // declared version — the disclosure of REQ-MCP-118 is what the user was told, and it must be what happens.
  const declaredPins = (previous.disclosure?.declared ?? results.disclosure?.declared ?? []).map((d) => d.replace(/^.*: /, '').replace(' ', '@'));
  const tried = c.fetchLines.filter((l) => /npm install|uvx/.test(l));
  if (tried.length > 0 && declaredPins.length > 0 && !tried.some((l) => declaredPins.some((p) => l.includes(p)))) throw new Error(`contained: the runtime tried ${JSON.stringify(tried)}, none of which the disclosure declared (${declaredPins.join(', ')})`);
  results.contained.declaredFetch = tried.length === 0 ? 'nothing fetched' : declaredPins.filter((p) => tried.some((l) => l.includes(p)));
} else if (want(7)) {
  results.contained = 'skipped: ROTARIS_CODE_INTEL_PACKAGED is not set (the packaged binary is needed)';
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(`[code-intel-proof] PASSED → ${join(output, 'results.json')}`);
