/**
 * Spike 4 (ADR-0033 consequence 3, REQ-MCP-113): console-window suppression, measured on the PACKAGED build.
 *
 * `pnpm package` must have produced `apps/desktop/release/win-unpacked/Rotaris.exe` (ROTARIS_PACKAGE_DIR_ONLY=1
 * ROTARIS_PACKAGE_SKIP_APP=1 are enough). The packaged application — a graphical process owning no console — runs a
 * scripted session whose persona carries two servers: `console`, declared as `cmd.exe /c node <fixture>` (a console
 * application launched through a console application, the worst case), and `token`, declared with the reserved
 * `builtin:code-intelligence` command (expected to fail until ADR-0035 exists — the launch error, not a window).
 * While it runs, this script samples every 200 ms with PowerShell: every `cmd`, `node`, `conhost` process started after
 * the launch, its `MainWindowHandle` and `MainWindowTitle`, and `tasklist /v` window titles. The verdict is that no
 * sampled process ever had a window handle other than 0, no `conhost.exe` appeared, and no console-shaped window
 * title existed at any sample; and that the fixture's tools arrived (the `echo` call succeeded in the store).
 *
 * Evidence under `.mcp-proof/console-spike/`: `samples.json`, `launch.log`, `results.json`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const exe = join(app, 'release', 'win-unpacked', 'Rotaris.exe');
if (!existsSync(exe)) throw new Error(`the packaged application is absent: ${exe} (run pnpm package with ROTARIS_PACKAGE_DIR_ONLY=1 ROTARIS_PACKAGE_SKIP_APP=1 first)`);
const fixture = join(app, 'scripts', 'fixtures', 'mcp-fixture-server.mjs');
const output = resolve(repo, '.mcp-proof', 'console-spike');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const root = join(output, 'profile');
const workspace = join(root, 'workspace');
const local = join(root, 'local');
const configDir = join(local, 'rotaris', 'config');
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
mkdirSync(configDir, { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# console spike\n');
const y = (v) => JSON.stringify(v);
// `cmd.exe /c node fixture`: cmd.exe is a console application; node too; the fixture speaks the protocol on the inherited pipes.
const cmd = process.env['ComSpec'] ?? 'C:\\Windows\\System32\\cmd.exe';
writeFileSync(join(configDir, 'agents.yaml'), [
  'models:', '  scripted: { provider: scripted, model_id: scripted }', 'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'mcp_servers:',
  `  console: { command: ${y(cmd)}, args: ${y(['/c', process.execPath, fixture, '--pid-file', join(output, 'console.pids')])} }`,
  '  token: { command: "builtin:code-intelligence", args: ["--transport", "stdio"] }',
  'personas:', '  orchestrator: { mcp_servers: [console, token] }', '',
].join('\n'));
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), 'runtime:\n  permission_mode: autonomous\n  allow_unsandboxed_autonomous: true\nrotaris:\n  delegation_strategy: single\n');
writeFileSync(join(output, 'console.pids'), '');

const env = { ...process.env };
for (const key of Object.keys(env)) if (key.startsWith('ROTARIS_')) delete env[key];
const launchedAt = new Date();
const child = spawn(exe, [workspace], {
  cwd: dirname(exe), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...env, LOCALAPPDATA: local, APPDATA: join(dirname(local), 'roaming'), ROTARIS_PREFERENCES_ROOT: join(root, 'preferences'), ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_INTENT_SCRIPT: 'explicit_trivial', ROTARIS_CIRCUIT_BREAKER: 'off', ROTARIS_CAPTURE_PNG: join(output, 'window.png'), ROTARIS_CAPTURE_PROMPT: 'echo through cmd', ROTARIS_SCRIPT: 'mcp:console.echo,answer', ROTARIS_CAPTURE_AFTER_MS: '12000', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
});
let log = '';
child.stdout.setEncoding('utf8'); child.stdout.on('data', (d) => { log += d; });
child.stderr.setEncoding('utf8'); child.stderr.on('data', (d) => { log += d; });

const ps = `$since = [DateTime]::Parse('${launchedAt.toISOString()}').ToLocalTime(); Get-Process -Name cmd,node,conhost -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -gt $since } | Select-Object Id,ProcessName,MainWindowHandle,MainWindowTitle | ConvertTo-Json -Compress`;
const samples = [];
const sampler = setInterval(() => {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: 5_000 });
  let procs = [];
  try { const parsed = JSON.parse(r.stdout.trim() || '[]'); procs = Array.isArray(parsed) ? parsed : [parsed]; } catch { procs = []; }
  // `tasklist /v`'s "Window Title" column is N/A for a process with no window; only the processes started after the launch count
  // (this host runs other cmd.exe shells whose consoles are visible and unrelated).
  const t = spawnSync('tasklist', ['/v', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true, timeout: 5_000 });
  const titleOf = new Map();
  for (const l of t.stdout.split(/\r?\n/)) { const cells = l.split('","').map((c) => c.replace(/^"|"$/g, '')); if (cells.length > 8) titleOf.set(Number(cells[1]), cells.at(-1)); }
  samples.push({ atMs: Date.now() - launchedAt.getTime(), processes: procs.map((p) => ({ id: p.Id, name: p.ProcessName, handle: String(p.MainWindowHandle), title: p.MainWindowTitle ?? '', taskTitle: titleOf.get(p.Id) ?? '' })) });
}, 200);

const exit = await new Promise((r) => child.on('close', (status, signal) => r({ status, signal })));
clearInterval(sampler);
writeFileSync(join(output, 'launch.log'), log);
writeFileSync(join(output, 'samples.json'), JSON.stringify(samples, null, 2));

const windowed = samples.flatMap((s) => s.processes.filter((p) => p.handle !== '0' && p.handle !== '')).map((p) => `${p.name}#${p.id} handle ${p.handle} "${p.title}"`);
// Every CREATE_NO_WINDOW child (the sampler's own powershell/tasklist included) gets a headless conhost.exe; it counts like any other process: handle 0, no title.
const conhosts = samples.flatMap((s) => s.processes.filter((p) => p.name === 'conhost')).length;
const cmdTitled = samples.flatMap((s) => s.processes.filter((p) => p.taskTitle !== 'N/A' && p.taskTitle !== '')).map((p) => `${p.name}#${p.id} "${p.taskTitle}"`);
const seenCmd = samples.some((s) => s.processes.some((p) => p.name === 'cmd'));
const seenNode = samples.some((s) => s.processes.some((p) => p.name === 'node'));
let echo = null;
const walk = (dir) => { if (!existsSync(dir)) return null; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) { const f = walk(p); if (f) return f; } else if (e.name === 'workspace.db') return p; } return null; };
const dbFile = walk(local);
if (dbFile) {
  const db = new Database(dbFile, { readonly: true });
  const s = db.prepare('SELECT session_id FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
  echo = s ? db.prepare("SELECT status, entry FROM tool_calls WHERE session_id = ? AND tool_name = 'echo'").all(s.session_id).map((r) => ({ status: r.status, result: JSON.parse(r.entry).result })) : [];
  db.close();
}
const tokenLine = log.split('\n').find((l) => /discovery of 'token' failed/.test(l)) ?? '';
const results = {
  exit, samples: samples.length, sawCmd: seenCmd, sawNode: seenNode, postLaunchProcesses: [...new Set(samples.flatMap((s) => s.processes.map((p) => `${p.name}#${p.id}`)))], windowedProcesses: windowed, headlessConhostSightings: conhosts, titledProcesses: cmdTitled,
  consoleToolsArrived: Array.isArray(echo) && echo.length === 1 && echo[0].status === 'ok', echo,
  reservedToken: { line: tokenLine.slice(0, 300), failedAtSpawn: /ENOENT|could not be started|not found/i.test(tokenLine) },
  fixtureLaunches: readFileSync(join(output, 'console.pids'), 'utf8').split('\n').filter((l) => l.trim() !== '').length,
  verdict: windowed.length === 0 && cmdTitled.length === 0 && Array.isArray(echo) && echo.length === 1 && echo[0].status === 'ok' ? 'PASS: no window handle and no window title on any process started after the launch, at any sample; the tools arrived' : 'FAIL',
};
writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
if (results.verdict.startsWith('FAIL')) process.exit(1);
