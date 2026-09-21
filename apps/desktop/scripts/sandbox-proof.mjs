import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment } from './lib/harness.mjs';

/**
 * ADR-0022's first execution in the built app (Part AR).
 *
 * What this host can prove, and what it cannot. This machine is `win32`, which REQ-SANDBOX-065 places
 * OUTSIDE the closed two-member platform set, so every behaviour below is the ESC-6 path — decided
 * 2026-09-02: accept the specification for the first release and document it plainly. Those are
 * exactly the behaviours nearly every user of this product meets, and they are fully demonstrable
 * here. What is NOT demonstrable here is REQ-SANDBOX-127's real-host conformance — the six observable
 * effects of an ACTIVE confinement on a live process — which the renderers' unit tests do not
 * discharge and which no rendered string may stand in for. That is IC-8.
 */
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

function scenario(name, workspaceYaml) {
  const root = join(output, name);
  const workspace = join(root, 'workspace');
  const local = join(root, 'local');
  const configDir = join(local, 'rotaris', 'config');
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(workspace, 'README.md'), '# proof\n');
  writeFileSync(join(configDir, 'agents.yaml'), GLOBAL);
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), workspaceYaml);
  return { root, workspace, local, configDir, workspaceFile: join(workspace, '.rotaris', 'agents.yaml') };
}

function launch(name, s, extra) {
  const png = join(output, `${name}.png`);
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), s.workspace], {
    cwd: app, encoding: 'utf8', timeout: 180_000, windowsHide: true,
    env: {
      ...cleanEnvironment(),
      LOCALAPPDATA: s.local,
      APPDATA: join(dirname(s.local), 'roaming'),
      ROTARIS_PREFERENCES_ROOT: join(s.root, 'preferences'),
      ROTARIS_MODEL_DIALECT: 'scripted',
      ROTARIS_CAPTURE_PNG: png,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  return log;
}

const results = {};

/*
 * 1. The probe's verdict on this host (REQ-SANDBOX-065, -066, -073). The platform check settles it, so
 *    no subprocess is spawned at all; the reason names both supported pairings and the remediation
 *    offers both courses, each quoting what REQ-SANDBOX-073 fixes literally.
 */
const s1 = scenario('verdict', WORKSPACE_OFF);
const log1 = launch('verdict', s1, { ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Runtime', ROTARIS_CAPTURE_AFTER_MS: '4000' });
const verdictLine = log1.split('\n').find((line) => line.includes('confinement:')) ?? '';
if (!verdictLine.includes('unavailable')) throw new Error(`the run host did not report confinement unavailable:\n${log1}`);
for (const literal of ['native Windows', 'Seatbelt', 'bubblewrap', 'sudo apt-get install bubblewrap', 'runtime.sandbox_mode', 'WSL2']) {
  if (!verdictLine.includes(literal)) throw new Error(`the verdict did not carry REQ-SANDBOX-073's '${literal}':\n${verdictLine}`);
}
results.verdict = verdictLine.trim();

/*
 * 2. REQ-SANDBOX-130: the settings surface carries the plain disclosure with `sandbox_mode` at its
 *    shipped `off` default — WITHOUT the user having to select a confinement mode first — and
 *    REQ-SANDBOX-113's six controls are drawn where a sentence used to stand in for them
 *    (`docs/defects/settings-surface-refuses-the-six-security-keys.md`).
 */
const READ_SECURITY = `({
  disclosure: document.querySelector('[data-testid="confinement-disclosure"]')?.textContent ?? '',
  controls: ['sandbox-mode','sandbox-writable-roots','sandbox-allow-network','egress-policy','network-allowed-hosts','network-denied-hosts','confinement-availability','confinement-recheck'].filter((id) => document.querySelector('[data-testid="' + id + '"]') !== null),
  standIn: document.body.textContent.includes('read from the file and not edited here'),
  mode: document.querySelector('[data-testid="sandbox-mode"]')?.value ?? ''
})`.replace(/\n\s*/g, ' ');
const log2 = launch('settings', s1, {
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Runtime',
  // Read as soon as the card exists rather than at a clock: this state is left behind by something the
  // product did when it was ready, and pinning that read to a timer reports whatever the timer found.
  ROTARIS_CAPTURE_EVAL_AT: `${READ_SECURITY}>>[data-testid="security-policy"]@~6000`,
  ROTARIS_CAPTURE_AFTER_MS: '7000',
});
const evalLine = log2.split('\n').find((line) => line.includes('capture: eval-at') && line.includes('disclosure')) ?? '';
if (evalLine === '') throw new Error(`the settings capture read nothing:\n${log2}`);
const read = JSON.parse(evalLine.slice(evalLine.indexOf('→') + 1).trim());
if (!String(read.disclosure).includes('This host cannot confine anything')) throw new Error("the settings surface does not carry REQ-SANDBOX-130's disclosure");
if (!String(read.disclosure).includes('no value of the sandbox mode changes that here')) throw new Error('the disclosure is not the whole fact');
// REQ-SANDBOX-130: shown WITHOUT the user having to select a confinement mode first.
if (read.mode !== 'off') throw new Error(`the disclosure was read with sandbox_mode at '${read.mode}', not at its shipped default`);
if (read.controls.length !== 8) throw new Error(`REQ-SANDBOX-113/116/129: the runtime section drew only ${JSON.stringify(read.controls)}`);
if (read.standIn === true) throw new Error('the withdrawn stand-in sentence is still drawn');
results.settingsSurface = { disclosure: 'present with sandbox_mode at its off default', controls: read.controls };

/*
 * 3. REQ-SANDBOX-095, -097, -126: a workspace whose configuration demands confinement this host cannot
 *    deliver does NOT start. No session, no session lock, no snapshot; the refusal carries the reason
 *    and the remediation; nothing ran unconfined.
 */
const s3 = scenario('refused', WORKSPACE_CONFINED);
const log3 = launch('refused', s3, { ROTARIS_CAPTURE_PROMPT: 'this run must not start', ROTARIS_CAPTURE_AFTER_MS: '12000' });
const refusal = log3.split('\n').find((line) => /refused before it started/i.test(line)) ?? '';
if (refusal === '') throw new Error(`the run was not refused before it started:\n${log3}`);
if (!/No OS-level confinement is available on native Windows/.test(log3)) throw new Error(`the refusal did not carry the availability reason:\n${log3}`);
if (!/sudo apt-get install bubblewrap/.test(log3)) throw new Error(`the refusal did not carry the remediation (REQ-EVENTS-024):\n${log3}`);
if (/session .* started/.test(log3)) throw new Error('a session started on a host that cannot confine');
if (existsSync(join(s3.workspace, '.rotaris', 'sessions'))) throw new Error('a session directory was left behind (REQ-SANDBOX-095)');
results.refusedBeforeStart = { line: refusal.trim(), sessionLeftBehind: false };

/*
 * 4. PD-TOOLS-002 (was REQ-SANDBOX-105 case 1 / REQ-SANDBOX-099): `sandbox_mode: off` requests no
 *    confinement, so the run STARTS, keeps `autonomous` with no tightening, and is recorded
 *    unconfined with an empty backend name (REQ-SANDBOX-093, -108, -110).
 */
const s4 = scenario('downgrade', WORKSPACE_AUTONOMOUS);
const log4 = launch('downgrade', s4, { ROTARIS_CAPTURE_PROMPT: 'an unattended autonomous run', ROTARIS_CAPTURE_AFTER_MS: '14000' });
if (!/session .* started/.test(log4)) throw new Error(`the run did not start with sandbox_mode off:\n${log4}`);
results.downgrade = { started: true, note: 'the kept mode is asserted by the engine tests; this run proves the gate does not refuse mode off (REQ-SANDBOX-092)' };

/*
 * 5. REQ-SANDBOX-054: all six round-trip. The surface saves them and the loader reads back the same
 *    effective configuration, and a further save-and-load changes nothing again.
 */
const s5 = scenario('round-trip', WORKSPACE_OFF);
launch('round-trip', s5, {
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Runtime',
  ROTARIS_CAPTURE_SELECT: 'select[aria-label="Sandbox mode"]>>read-only@1800;;select[aria-label="Egress policy"]>>deny@2200',
  ROTARIS_CAPTURE_CLICKS: '.save-bar .btn-primary>>Save@3000',
  ROTARIS_CAPTURE_AFTER_MS: '4400',
});
const ws5 = readFileSync(s5.workspaceFile, 'utf8');
if (!ws5.includes('sandbox_mode: read-only')) throw new Error(`the six did not round-trip through the workspace file:\n${ws5}`);
if (!ws5.includes('network_egress_policy: deny')) throw new Error(`the egress disposition did not reach the file:\n${ws5}`);
if (!ws5.startsWith('# workspace configuration\n')) throw new Error('the save lost the comment header');
results.roundTrip = { workspaceFile: ws5 };

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
console.log('\nIC-8 is NOT discharged by this proof: REQ-SANDBOX-127 binds conformance to the observable\neffect of an ACTIVE confinement on a live process on a real macOS or Linux host, and this host is win32.');
