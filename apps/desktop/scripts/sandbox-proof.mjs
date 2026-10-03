import { accessSync, constants, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join, relative, resolve, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cleanEnvironment, configDirFor, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';

/**
 * ADR-0022's first execution in the built app (Part AR), and IC-8's measurement where the host can give one.
 *
 * What a host can prove, and what it cannot, depends on the host — so the proof asks it rather than assuming
 * the build machine. REQ-SANDBOX-065 chooses the mechanism by `process.platform` ALONE (a closed set of two:
 * `darwin` → Seatbelt, `linux` → bubblewrap), REQ-SANDBOX-066 then looks for the launcher on PATH, and only
 * then is a trial run; the verdict this proof expects is decided the same way, from what this host is and
 * what its PATH holds, and every later scenario runs whichever verdict that was.
 *
 * - `win32` (and any identifier outside the set) is the ESC-6 path — decided 2026-09-02: accept the
 *   specification for the first release and document it plainly. Those are exactly the behaviours nearly
 *   every user of this product meets.
 * - `linux` or `darwin` without the launcher, or with a launcher whose trial fails, is REQ-SANDBOX-073's
 *   launcher-missing or trial-failure verdict, and a run that demands confinement is refused as on Windows.
 * - `linux` or `darwin` whose trial succeeds reports the backend available; the run that demands
 *   confinement STARTS, and scenario 6 runs REQ-SANDBOX-127's six observable effects on a live confined
 *   process through the product's own terminal tool — IC-8's measurement for that platform, and the only
 *   one no rendered string may stand in for. A third confined launch, in a workspace with no `.git`, is
 *   REQ-SANDBOX-077's absent-subpath case: under Seatbelt the name is denied by rule and the commands run;
 *   under bubblewrap, which cannot hide an absent name without creating it on the host, every command is
 *   refused (`sandbox_unavailable`, 126) and the name is still absent afterwards.
 *
 * IC-8 is discharged only when the six effects have been run on a real macOS host AND a real Linux host,
 * so no run of this proof on one platform discharges it (`docs/defects/fixed/
 * sandbox-proof-asserts-the-windows-verdict-on-every-platform.md` is why the proof reads the host).
 */
const require = createRequire(import.meta.url);
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'sandbox-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 180_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 180_000 });
  if (built.status !== 0) throw new Error(`the build failed:\n${built.stdout ?? ''}\n${built.stderr ?? ''}`);
}

/*
 * The verdict this host should produce, decided the way REQ-SANDBOX-066 orders it: the platform, then the
 * launcher on the PATH the application is given, then a trial through the real mechanism. The trial below is
 * the proof's own, run BEFORE the application starts and independently of it: REQ-SANDBOX-070's Linux line
 * (the render of an empty read-only specification) and REQ-SANDBOX-073's Seatbelt line. If the product's
 * reading disagrees with this one, the proof says so rather than adopting either.
 */
const MECHANISMS = { darwin: { name: 'Seatbelt', launcher: 'sandbox-exec' }, linux: { name: 'bubblewrap', launcher: 'bwrap' } };
const mechanism = MECHANISMS[process.platform] ?? null;

function onPath(launcher, pathValue) {
  for (const dir of (pathValue ?? '').split(delimiter).filter((d) => d !== '')) {
    try { accessSync(join(dir, launcher), constants.X_OK); return join(dir, launcher); } catch { /* not in this directory */ }
  }
  return null;
}

function hostTrial() {
  const line = process.platform === 'darwin'
    ? 'sandbox-exec -p "(version 1)(allow default)" /usr/bin/true'
    : "bwrap --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp --unshare-net --die-with-parent -- /bin/sh -c 'true'";
  const trial = spawnSync('/bin/sh', ['-c', line], { encoding: 'utf8', timeout: 5_000, env: cleanEnvironment() });
  return { line, status: trial.status, signal: trial.signal, output: `${trial.stdout ?? ''}${trial.stderr ?? ''}`.trim() };
}

const launcherPath = mechanism === null ? null : onPath(mechanism.launcher, cleanEnvironment().PATH);
const trial = mechanism !== null && launcherPath !== null ? hostTrial() : null;
/** `outside` | `launcher-missing` | `trial-failed` | `available` — the four verdict shapes REQ-SANDBOX-073 and -068 distinguish. */
const expected = mechanism === null ? 'outside' : launcherPath === null ? 'launcher-missing' : trial.status === 0 ? 'available' : 'trial-failed';

/** REQ-SANDBOX-073's literals for the verdict this host gives. Each must appear in the reason or the remediation. */
function literalsFor(shape) {
  if (shape === 'outside') {
    return process.platform === 'win32'
      ? ['native Windows', 'Seatbelt', 'bubblewrap', 'sudo apt-get install bubblewrap', 'runtime.sandbox_mode', 'WSL2']
      : [`'${process.platform}'`, 'macOS', 'Linux'];
  }
  if (shape === 'launcher-missing') {
    return process.platform === 'darwin' ? ['Seatbelt', 'sandbox-exec', '/usr/bin'] : ['bubblewrap', 'bwrap', 'sudo apt-get install bubblewrap', 'sudo dnf install bubblewrap'];
  }
  if (shape === 'trial-failed') {
    return process.platform === 'darwin'
      ? ['Seatbelt', 'sandbox-exec -p "(version 1)(allow default)" /usr/bin/true']
      : ['bubblewrap', 'kernel.apparmor_restrict_unprivileged_userns', '/proc/sys/kernel/unprivileged_userns_clone', 'bwrap --ro-bind / / --proc /proc --unshare-net -- true'];
  }
  return [];
}

const GLOBAL = [
  '# global configuration',
  'models:',
  '  scripted: { provider: scripted, model_id: scripted }   # the verification client',
  'small_model: scripted',
  'medium_model: scripted',
  'large_model: scripted',
  '',
].join('\n');
/** The default posture: confinement `off`, which is the state nearly every user is in (REQ-SANDBOX-048). */
const WORKSPACE_OFF = ['# workspace configuration', 'runtime:', '  permission_mode: ask', '  max_iterations: 1', ''].join('\n');
/** The posture this host cannot deliver (REQ-SANDBOX-095). */
const WORKSPACE_CONFINED = ['# workspace configuration', 'runtime:', '  permission_mode: ask', '  max_iterations: 1', '  sandbox_mode: workspace-write', ''].join('\n');
/** `autonomous`, unattended, unconfined — REQ-SANDBOX-105 case 1. */
const WORKSPACE_AUTONOMOUS = ['# workspace configuration', 'runtime:', '  permission_mode: autonomous', '  max_iterations: 1', '  allow_unsandboxed_autonomous: false', ''].join('\n');
/** REQ-SANDBOX-127's active mode, unattended so the terminal steps run without an approval; `single` so the entry role holds the terminal. */
const workspaceEffects = (allowNetwork) => ['# workspace configuration', 'runtime:', '  permission_mode: autonomous', '  sandbox_mode: workspace-write', `  sandbox_allow_network: ${allowNetwork}`, 'rotaris:', '  delegation_strategy: single', ''].join('\n');

function scenario(name, workspaceYaml) {
  const root = join(output, name);
  const workspace = join(root, 'workspace');
  const local = join(root, 'local');
  // The global configuration directory by the platform that reads it (`configDirFor`), not the Windows spelling alone.
  const configDir = configDirFor(local);
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(workspace, 'README.md'), '# proof\n');
  writeFileSync(join(configDir, 'agents.yaml'), GLOBAL);
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), workspaceYaml);
  return { root, workspace, local, configDir, workspaceFile: join(workspace, '.rotaris', 'agents.yaml') };
}

async function launch(name, s, extra) {
  const png = join(output, `${name}.png`);
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, s.workspace], {
    cwd: app, timeoutMs: 180_000, windowsHide: true,
    env: {
      ...cleanEnvironment(),
      ...proofIsolationEnv({ local: s.local, preferences: join(s.root, 'preferences') }),
      ROTARIS_MODEL_DIALECT: 'scripted',
      ROTARIS_CAPTURE_PNG: png,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  return log;
}

const results = {};

/*
 * 1. The probe's verdict on this host (REQ-SANDBOX-065, -066, -073), against the one this host should give.
 *    Outside the platform set the platform check settles it and no subprocess is spawned; on Linux or macOS
 *    the reason names the one mechanism the platform chose and the remediation is that mechanism's own.
 */
const s1 = scenario('verdict', WORKSPACE_OFF);
const log1 = await launch('verdict', s1, { ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Runtime', ROTARIS_CAPTURE_AFTER_MS: '4000' });
const verdictLine = log1.split('\n').find((line) => line.includes('confinement:')) ?? '';
const hostReading = { platform: process.platform, mechanism: mechanism?.name ?? null, launcher: launcherPath, trial, expected };
if (expected === 'available') {
  if (!verdictLine.includes(`confinement: available (${mechanism.name.toLowerCase()})`)) {
    throw new Error(`this host's own trial succeeded (${trial.line}) but the run host did not report ${mechanism.name} available:\n${verdictLine || log1}`);
  }
} else {
  if (!verdictLine.includes('unavailable')) throw new Error(`the run host did not report confinement unavailable (expected: ${expected}):\n${verdictLine || log1}`);
  for (const literal of literalsFor(expected)) {
    if (!verdictLine.includes(literal)) throw new Error(`the ${expected} verdict did not carry REQ-SANDBOX-073's '${literal}':\n${verdictLine}`);
  }
  // REQ-SANDBOX-065: on Linux or macOS the diagnostic names the platform's own mechanism, never an unsupported platform.
  if (mechanism !== null && /native Windows|not one this product can confine/.test(verdictLine)) throw new Error(`the ${process.platform} verdict claimed an unsupported platform:\n${verdictLine}`);
}
results.host = hostReading;
results.verdict = verdictLine.slice(verdictLine.indexOf('confinement:')).trim();

/*
 * 2. REQ-SANDBOX-130: the settings surface carries the plain disclosure with `sandbox_mode` at its
 *    shipped `off` default — WITHOUT the user having to select a confinement mode first — and
 *    REQ-SANDBOX-113's six controls are drawn where a sentence used to stand in for them
 *    (`docs/defects/fixed/settings-surface-refuses-the-six-security-keys.md`).
 */
const READ_SECURITY = `({
  disclosure: document.querySelector('[data-testid="confinement-disclosure"]')?.textContent ?? '',
  controls: ['sandbox-mode','sandbox-writable-roots','sandbox-allow-network','egress-policy','network-allowed-hosts','network-denied-hosts','confinement-availability','confinement-recheck'].filter((id) => document.querySelector('[data-testid="' + id + '"]') !== null),
  standIn: document.body.textContent.includes('read from the file and not edited here'),
  mode: document.querySelector('[data-testid="sandbox-mode"]')?.value ?? ''
})`.replace(/\n\s*/g, ' ');
const log2 = await launch('settings', s1, {
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Runtime',
  // Read as soon as the card exists rather than at a clock: this state is left behind by something the
  // product did when it was ready, and pinning that read to a timer reports whatever the timer found.
  ROTARIS_CAPTURE_EVAL_AT: `${READ_SECURITY}>>[data-testid="security-policy"]@~6000`,
  ROTARIS_CAPTURE_AFTER_MS: '7000',
});
const evalLine = log2.split('\n').find((line) => line.includes('capture: eval-at') && line.includes('disclosure')) ?? '';
if (evalLine === '') throw new Error(`the settings capture read nothing:\n${log2}`);
const read = JSON.parse(evalLine.slice(evalLine.indexOf('→') + 1).trim());
if (expected === 'outside') {
  if (!String(read.disclosure).includes('This host cannot confine anything')) throw new Error("the settings surface does not carry REQ-SANDBOX-130's disclosure");
  if (!String(read.disclosure).includes('no value of the sandbox mode changes that here')) throw new Error('the disclosure is not the whole fact');
} else if (read.disclosure !== '') {
  // REQ-SANDBOX-130 is the disclosure for a host with NO mechanism at all. On Linux or macOS a mechanism
  // exists (installed or not), and "this host cannot confine anything" would be untrue there.
  throw new Error(`the settings surface drew REQ-SANDBOX-130's no-mechanism disclosure on ${process.platform}, which has one:\n${read.disclosure}`);
}
// REQ-SANDBOX-130: shown WITHOUT the user having to select a confinement mode first.
if (read.mode !== 'off') throw new Error(`the disclosure was read with sandbox_mode at '${read.mode}', not at its shipped default`);
if (read.controls.length !== 8) throw new Error(`REQ-SANDBOX-113/116/129: the runtime section drew only ${JSON.stringify(read.controls)}`);
if (read.standIn === true) throw new Error('the withdrawn stand-in sentence is still drawn');
results.settingsSurface = { disclosure: expected === 'outside' ? 'present with sandbox_mode at its off default' : 'absent: this platform has a mechanism', controls: read.controls };

/*
 * 2b. REQ-SANDBOX-130 on its second surface, the per-session launch dialog, with the same fact as the settings surface
 *     and on the same condition: drawn only where no mechanism exists at all. Where a mechanism exists but is not
 *     usable (launcher missing, trial failed) the dialog carries that mechanism's own reason and remediation instead
 *     (REQ-SANDBOX-119), and where it is available, neither. The dialog drew the disclosure whenever confinement was
 *     not available until 2026-09-29 (`docs/defects/fixed/
 *     the-launch-dialog-draws-the-no-mechanism-disclosure-where-a-mechanism-exists.md`). The select's disabled state
 *     is read too: it says the verdict had arrived when the dialog was read, so an absent text is not a verdict not yet
 *     taken.
 */
const READ_DIALOG = `({
  disclosure: document.querySelector('[data-testid="start-session-disclosure"]')?.textContent ?? '',
  reason: document.querySelector('[data-testid="start-session-sandbox-reason"]')?.textContent ?? '',
  disabled: document.querySelector('[data-testid="start-session-sandbox"]')?.disabled ?? null
})`.replace(/\n\s*/g, ' ');
const log2b = await launch('dialog', s1, {
  ROTARIS_CAPTURE_CLICKS: '.btn>>New session@~6000',
  ROTARIS_CAPTURE_EVAL_AT: `${READ_DIALOG}>>[data-testid="start-session-dialog"]@~9000`,
  ROTARIS_CAPTURE_AFTER_MS: '10000',
});
const dialogLine = log2b.split('\n').find((line) => line.includes('capture: eval-at') && line.includes('disclosure')) ?? '';
if (dialogLine === '') throw new Error(`the launch dialog was not read (did it open?):\n${log2b}`);
const dialogRead = JSON.parse(dialogLine.slice(dialogLine.indexOf('→') + 1).trim());
if (expected === 'outside') {
  if (!String(dialogRead.disclosure).includes('This host cannot confine anything')) throw new Error("the launch dialog does not carry REQ-SANDBOX-130's disclosure");
  if (dialogRead.disclosure !== read.disclosure) throw new Error('the two surfaces carry different disclosures (REQ-SANDBOX-130: the same fact on both)');
} else if (dialogRead.disclosure !== '') {
  throw new Error(`the launch dialog drew REQ-SANDBOX-130's no-mechanism disclosure on ${process.platform}, which has one (the settings surface drew none):\n${dialogRead.disclosure}`);
}
if (expected === 'available') {
  if (dialogRead.disabled !== false) throw new Error(`the launch dialog's sandbox control is not enabled on a host whose confinement is available (disabled: ${dialogRead.disabled})`);
  if (dialogRead.reason !== '') throw new Error(`the launch dialog carried an unavailability reason on a host whose confinement is available:\n${dialogRead.reason}`);
} else {
  if (dialogRead.disabled !== true) throw new Error(`the launch dialog's sandbox control is not disabled on a host that cannot confine (disabled: ${dialogRead.disabled})`);
  // REQ-SANDBOX-119 and REQ-SANDBOX-071: the same reason and remediation scenario 1 read, visible without hovering.
  for (const literal of literalsFor(expected)) {
    if (!String(dialogRead.reason).includes(literal)) throw new Error(`the launch dialog's reason did not carry the ${expected} verdict's '${literal}' (REQ-SANDBOX-119):\n${dialogRead.reason}`);
  }
}
results.launchDialog = { disclosure: dialogRead.disclosure === '' ? 'absent' : 'present', reason: dialogRead.reason, controlDisabled: dialogRead.disabled };

/*
 * 3. REQ-SANDBOX-095, -097, -126: a workspace whose configuration demands confinement this host cannot
 *    deliver does NOT start. No session, no session lock, no snapshot; the refusal carries the reason
 *    and the remediation; nothing ran unconfined. On a host that CAN deliver it the same workspace
 *    starts, and is not refused (REQ-SANDBOX-093) — what that run can and cannot do is scenario 6.
 */
const s3 = scenario('refused', WORKSPACE_CONFINED);
const log3 = await launch('refused', s3, { ROTARIS_CAPTURE_PROMPT: 'this run must not start', ROTARIS_CAPTURE_AFTER_MS: '12000' });
const refusal = log3.split('\n').find((line) => /refused before it started/i.test(line)) ?? '';
if (expected === 'available') {
  if (refusal !== '') throw new Error(`the run was refused on a host whose confinement is available:\n${refusal}`);
  if (!/session .* started/.test(log3)) throw new Error(`the confined run did not start on a host whose confinement is available:\n${log3}`);
  results.refusedBeforeStart = { applicable: false, reason: `${mechanism.name} is available here, so the confined run started (REQ-SANDBOX-093); the refusal path is measured on a host that cannot confine` };
} else {
  if (refusal === '') throw new Error(`the run was not refused before it started:\n${log3}`);
  // REQ-SANDBOX-126: the refusal carries the availability reason and remediation — the same text scenario 1 read.
  for (const literal of literalsFor(expected)) {
    if (!log3.includes(literal)) throw new Error(`the refusal did not carry the ${expected} verdict's '${literal}' (REQ-SANDBOX-126, REQ-EVENTS-024):\n${log3}`);
  }
  if (/session .* started/.test(log3)) throw new Error('a session started on a host that cannot confine');
  if (existsSync(join(s3.workspace, '.rotaris', 'sessions'))) throw new Error('a session directory was left behind (REQ-SANDBOX-095)');
  results.refusedBeforeStart = { line: refusal.trim(), sessionLeftBehind: false };
}

/*
 * 4. PD-TOOLS-002 (was REQ-SANDBOX-105 case 1 / REQ-SANDBOX-099): `sandbox_mode: off` requests no
 *    confinement, so the run STARTS, keeps `autonomous` with no tightening, and is recorded
 *    unconfined with an empty backend name (REQ-SANDBOX-093, -108, -110).
 */
const s4 = scenario('downgrade', WORKSPACE_AUTONOMOUS);
const log4 = await launch('downgrade', s4, { ROTARIS_CAPTURE_PROMPT: 'an unattended autonomous run', ROTARIS_CAPTURE_AFTER_MS: '14000' });
if (!/session .* started/.test(log4)) throw new Error(`the run did not start with sandbox_mode off:\n${log4}`);
results.downgrade = { started: true, note: 'the kept mode is asserted by the engine tests; this run proves the gate does not refuse mode off (REQ-SANDBOX-092)' };

/*
 * 5. REQ-SANDBOX-054: all six round-trip. The surface saves them and the loader reads back the same
 *    effective configuration, and a further save-and-load changes nothing again.
 */
const s5 = scenario('round-trip', WORKSPACE_OFF);
await launch('round-trip', s5, {
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Runtime',
  // Every step waits for what it acts on rather than for a clock: on a first launch the Runtime category can
  // be drawn after the view's own click has looked for it, and a fixed 1800 ms then chose into Models and
  // saved nothing (measured on Linux, 2026-09-28). The category is pressed again when it is there, and Save
  // only once BOTH choices are showing, so it cannot be pressed between them.
  ROTARIS_CAPTURE_CLICKS: '.nav-list__item>>Runtime@~6000;;body:has(select[aria-label="Sandbox mode"] option[value="read-only"]:checked):has(select[aria-label="Egress policy"] option[value="deny"]:checked) .save-bar .btn-primary>>Save@~9000',
  ROTARIS_CAPTURE_SELECT: 'select[aria-label="Sandbox mode"]>>read-only@~8000;;select[aria-label="Egress policy"]>>deny@~8000',
  ROTARIS_CAPTURE_AFTER_MS: '11000',
});
const ws5 = readFileSync(s5.workspaceFile, 'utf8');
if (!ws5.includes('sandbox_mode: read-only')) throw new Error(`the six did not round-trip through the workspace file:\n${ws5}`);
if (!ws5.includes('network_egress_policy: deny')) throw new Error(`the egress disposition did not reach the file:\n${ws5}`);
if (!ws5.startsWith('# workspace configuration\n')) throw new Error('the save lost the comment header');
results.roundTrip = { workspaceFile: ws5 };

/*
 * 6. REQ-SANDBOX-127 — IC-8's measurement, on a host whose confinement is available. Each effect is one
 *    `terminal` call a scripted agent makes in an unattended `workspace-write` run, so the command goes
 *    through the product's own enforcement point (ADR-0022) exactly as a model's would. Every verdict is
 *    read from the HOST side after the run — what exists on disk, what the listener accepted — never from
 *    the confined command's own report of itself, which is kept only as the explanation.
 */
async function effects(name, allowNetwork, preGit) {
  const s = scenario(name, workspaceEffects(allowNetwork));
  const ws = realpathSync(s.workspace);
  if (preGit) { mkdirSync(join(ws, '.git')); writeFileSync(join(ws, '.git', 'HEAD'), 'ref: refs/heads/main\n'); }
  // Outside every writable root and outside every temporary location: beside the workspace, not in it.
  const outside = join(realpathSync(s.root), 'outside');
  mkdirSync(outside, { recursive: true });
  const secret = `readable outside the roots ${Date.now()}`;
  writeFileSync(join(outside, 'readable.txt'), `${secret}\n`);
  // The listener is the host's, in a process of its own. It was put there because `launch` blocked this one for the
  // whole run under `spawnSync` (until 2026-09-29), so a listener here could not have answered while the confined
  // command waited on it; the launch is `spawnBounded`'s now and does not block, and the listener stayed where it
  // was. It counts what it accepted into
  // a file the proof reads afterwards. A confined process in its own network namespace cannot reach the
  // host's loopback at all; one granted the network reaches it like any other process on the host.
  const acceptedFile = join(outside, 'accepted.log');
  const listener = spawn(process.execPath, ['-e', [
    "const { createServer } = require('node:net'); const { appendFileSync } = require('node:fs');",
    `const server = createServer((socket) => { appendFileSync(${JSON.stringify(acceptedFile)}, 'accepted\\n'); socket.end('pong\\n'); });`,
    "server.listen(0, '127.0.0.1', () => console.log(server.address().port));",
  ].join(' ')], { stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((done, fail) => {
    listener.stdout.once('data', (chunk) => done(Number(String(chunk).trim())));
    listener.once('exit', (code) => fail(new Error(`the host listener exited (${code}) before it listened`)));
  });
  writeFileSync(join(outside, 'connect.mjs'), [
    "import { connect } from 'node:net';",
    'const s = connect(Number(process.argv[2]), "127.0.0.1");',
    's.setTimeout(3000, () => { console.log("timeout"); process.exit(3); });',
    's.on("data", (d) => { console.log(`received ${d.toString().trim()}`); process.exit(0); });',
    's.on("error", (e) => { console.log(`error ${e.code ?? e.message}`); process.exit(2); });',
    '',
  ].join('\n'));
  const q = (p) => `'${p.replace(/'/g, "'\\''")}'`;
  const commands = {
    inside: { command: `echo inside > ${q(join(ws, 'inside.txt'))}` },
    outside: { command: `echo outside > ${q(join(outside, 'written.txt'))}; echo "exit=$?" > ${q(join(ws, 'outside.status'))}` },
    git: { command: `mkdir -p ${q(join(ws, '.git', 'hooks'))}; echo planted > ${q(join(ws, '.git', 'planted'))}; echo "exit=$?" > ${q(join(ws, 'git.status'))}` },
    rotaris: { command: `echo planted > ${q(join(ws, '.rotaris', 'planted'))}; echo "exit=$?" > ${q(join(ws, 'rotaris.status'))}` },
    read: { command: `cat ${q(join(outside, 'readable.txt'))} > ${q(join(ws, 'read.txt'))}` },
    network: { command: `${q(process.execPath)} ${q(join(outside, 'connect.mjs'))} ${port} > ${q(join(ws, 'network.txt'))} 2>&1; echo "exit=$?" >> ${q(join(ws, 'network.txt'))}` },
    cwd: { command: `pwd > ${q(join(ws, 'cwd.txt'))}` },
  };
  const log = await launch(name, s, {
    ROTARIS_CAPTURE_PROMPT: 'run the confinement checks', ROTARIS_CAPTURE_PROMPT_MS: '1200',
    ROTARIS_SCRIPT: `${Object.keys(commands).map((k) => `terminal:${k}`).join(',')},answer`,
    ROTARIS_SCRIPT_TERMINAL_ARGS: JSON.stringify(commands),
    ROTARIS_CAPTURE_AFTER_MS: '20000',
  });
  listener.kill();
  const accepted = existsSync(acceptedFile) ? readFileSync(acceptedFile, 'utf8').split('\n').filter((l) => l === 'accepted').length : 0;
  const read = (file) => (existsSync(join(ws, file)) ? readFileSync(join(ws, file), 'utf8').trim() : null);
  if (!/session .* started/.test(log)) throw new Error(`${name}: the confined run did not start:\n${log}`);
  if (read('cwd.txt') === null) throw new Error(`${name}: the scripted terminal steps did not all run (no cwd.txt); see ${name}.log`);
  const e = {
    writeInsideRoot: { passed: read('inside.txt') === 'inside', observed: read('inside.txt') },
    writeOutsideRefused: { passed: !existsSync(join(outside, 'written.txt')), observed: read('outside.status') },
    writeUnderGitRefused: { passed: !existsSync(join(ws, '.git', 'planted')) && !existsSync(join(ws, '.git', 'hooks')), existedBefore: preGit, observed: read('git.status') },
    // REQ-SANDBOX-077 (c), which REQ-SANDBOX-127's third effect cites — a protected subpath absent before the command —
    // is `absentSubpath` below, a launch of its own: under bubblewrap it refuses every command in the root, so the six
    // effects here are measured with `.git` present.
    writeUnderRotarisRefused: { passed: !existsSync(join(ws, '.rotaris', 'planted')), existedBefore: true, observed: read('rotaris.status') },
    readOutsideRoots: { passed: read('read.txt') === secret, observed: read('read.txt') },
    outboundSocket: {
      passed: allowNetwork ? accepted > 0 && /received pong/.test(read('network.txt') ?? '') : accepted === 0 && !/received pong/.test(read('network.txt') ?? ''),
      allowNetwork, acceptedByHost: accepted, observed: read('network.txt'),
    },
    workingDirectoryUnchanged: { passed: read('cwd.txt') === ws, observed: read('cwd.txt'), expected: ws },
  };
  return e;
}

/*
 * REQ-SANDBOX-077 (c), in a workspace with no `.git`: the protected name absent inside the writable root. Under
 * Seatbelt the profile denies the name by rule, so the commands run and only the write under it fails. Under
 * bubblewrap no mount can hide a name that does not exist without a mountpoint at that name, and bubblewrap creates
 * that mountpoint through the writable bind, on the host — which the requirement's closing paragraph forbids — so the
 * backend refuses each command under REQ-SANDBOX-083 instead (measured 2026-09-28; repaired 2026-09-29). Either way
 * the host holds no `.git` afterwards. The refusal is read from the store's `tool_calls`, the host side of it from disk.
 */
async function absentSubpath(name) {
  const s = scenario(name, workspaceEffects(false));
  const ws = realpathSync(s.workspace);
  const q = (p) => `'${p.replace(/'/g, "'\\''")}'`;
  const commands = {
    git: { command: `mkdir -p ${q(join(ws, '.git', 'hooks'))}; echo planted > ${q(join(ws, '.git', 'planted'))}; echo "exit=$?" > ${q(join(ws, 'git.status'))}` },
    inside: { command: `echo inside > ${q(join(ws, 'inside.txt'))}` },
  };
  const log = await launch(name, s, {
    ROTARIS_CAPTURE_PROMPT: 'run the absent-subpath checks', ROTARIS_CAPTURE_PROMPT_MS: '1200',
    ROTARIS_SCRIPT: `${Object.keys(commands).map((k) => `terminal:${k}`).join(',')},answer`,
    ROTARIS_SCRIPT_TERMINAL_ARGS: JSON.stringify(commands),
    ROTARIS_CAPTURE_AFTER_MS: '12000',
  });
  if (!/session .* started/.test(log)) throw new Error(`${name}: the confined run did not start:\n${log}`);
  const Database = require('better-sqlite3');
  const db = new Database(oneDatabase(s.local), { readonly: true });
  let calls;
  try {
    const session = db.prepare('SELECT session_id FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
    calls = db.prepare("SELECT entry FROM tool_calls WHERE session_id = ? AND tool_name = 'terminal' ORDER BY ordinal").all(session.session_id)
      .map((row) => { const entry = JSON.parse(row.entry); return { failureKind: entry.failure_kind ?? null, result: String(entry.result ?? '') }; });
  } finally { db.close(); }
  if (calls.length !== Object.keys(commands).length) throw new Error(`${name}: expected ${Object.keys(commands).length} terminal calls in the store; found ${calls.length}`);
  const refusedEach = calls.every((c) => c.failureKind === 'sandbox_unavailable' && /"exit_code":126/.test(c.result));
  const ranEach = calls.every((c) => c.failureKind === null);
  const exists = (file) => existsSync(join(ws, file));
  const e = {
    absentGitStaysAbsent: { passed: !exists('.git'), observed: exists('.git') ? `a .git remains on the host (${readdirSync(join(ws, '.git')).length} entries)` : 'absent' },
    writeUnderGitRefused: { passed: !exists('.git/planted') && !exists('.git/hooks'), existedBefore: false, observed: exists('git.status') ? readFileSync(join(ws, 'git.status'), 'utf8').trim() : 'the command did not run' },
  };
  if (mechanism.launcher === 'bwrap') {
    // REQ-SANDBOX-077's closing paragraph and REQ-SANDBOX-078: refused, one command at a time, and nothing ran.
    e.eachCommandRefused = { passed: refusedEach, observed: calls.map((c) => c.failureKind ?? 'ran') };
    e.nothingRan = { passed: !exists('inside.txt') && !exists('git.status'), observed: ['inside.txt', 'git.status'].filter(exists) };
    e.causeNamesThePath = { passed: calls.every((c) => c.result.includes(`${join(ws, '.git')} does not exist`)), observed: calls[0]?.result.split('\n')[0] ?? '' };
  } else {
    // Seatbelt denies the absent name by rule, so the commands run and only the write under the name fails.
    e.commandsRan = { passed: ranEach && readFileSync(join(ws, 'inside.txt'), 'utf8').trim() === 'inside', observed: calls.map((c) => c.failureKind ?? 'ran') };
  }
  return e;
}

if (expected === 'available') {
  results.effects = {
    denied: await effects('effects-network-denied', false, true),
    allowed: await effects('effects-network-allowed', true, true),
    absent: await absentSubpath('effects-absent-git'),
  };
  const failed = Object.entries(results.effects).flatMap(([run, e]) => Object.entries(e).filter(([, v]) => !v.passed).map(([k]) => `${run}.${k}`));
  results.effectsVerdict = failed.length === 0 ? `all six REQ-SANDBOX-127 effects, and REQ-SANDBOX-077's absent-subpath case with its no-residue clause, observed under ${mechanism.name} on ${process.platform}` : `FAILED: ${failed.join(', ')}`;
  writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  if (failed.length > 0) throw new Error(`REQ-SANDBOX-127 / -077: ${failed.join(', ')} did not hold under an active confinement; see results.json`);
} else {
  results.effects = { applicable: false, reason: `REQ-SANDBOX-127's effects need an active confinement, and this host's verdict is ${expected} (${results.verdict})` };
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
console.log(expected === 'available'
  ? `\nIC-8 is NOT discharged by this proof alone: REQ-SANDBOX-127 binds each supported platform, and this run measured ${process.platform} only.`
  : `\nIC-8 is NOT discharged by this proof: REQ-SANDBOX-127 binds conformance to the observable effect of an ACTIVE confinement\non a live process on a real macOS or Linux host, and this host's verdict is ${expected}.`);
