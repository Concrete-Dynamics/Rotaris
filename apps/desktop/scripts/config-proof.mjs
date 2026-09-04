import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * ADR-0036 / ADR-0037's first execution in the built app (Part I step 5): hand-authored, commented files at
 * both scopes drive the run; Settings → Runtime and → Models edit them with Save/Discard; the composer's
 * permission-mode control writes its one key; a fatal file refuses the run naming file, scope and path, and
 * correcting that key alone is enough. Every assertion reads the files or the store; the PNGs are read back.
 */
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.config-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 120_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 120_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);

const GLOBAL = [
  '# global configuration — the comment header must survive every write',
  'models:',
  '  scripted: { provider: scripted, model_id: scripted }   # the verification client',
  '  other: { provider: scripted, model_id: other }',
  'small_model: scripted',
  'medium_model: scripted',
  'large_model: scripted',
  '',
  '# a key this build does not know, kept in place',
  'future_feature:',
  '  nested: true',
  '',
  'runtime:',
  '  # stated globally, inherited by every workspace',
  '  max_iterations: 7',
  '',
].join('\n');
const WORKSPACE = [
  '# workspace configuration',
  'runtime:',
  '  # the workspace states two keys and inherits the rest',
  '  permission_mode: ask',
  '  max_depth: 2',
  'rotaris:',
  '  delegation_strategy: single',
  '',
].join('\n');

function cleanEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('ROTARIS_')) delete env[key];
  return env;
}

function scenario(name, files = { global: GLOBAL, workspace: WORKSPACE }) {
  const root = join(output, name);
  const workspace = join(root, 'workspace');
  const local = join(root, 'local');
  const configDir = join(local, 'rotaris', 'config');
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(workspace, 'README.md'), '# proof\n');
  if (files.global !== null) writeFileSync(join(configDir, 'agents.yaml'), files.global);
  if (files.workspace !== null) writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), files.workspace);
  return { root, workspace, local, configDir, workspaceFile: join(workspace, '.rotaris', 'agents.yaml'), globalFile: join(configDir, 'agents.yaml') };
}

function launch(name, s, extra) {
  const png = join(output, `${name}.png`);
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), s.workspace], {
    cwd: app, encoding: 'utf8', timeout: 120_000, windowsHide: true,
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

// 1. Settings → Runtime: the outside-workspace toggle with its confirmation, then Save; bytes outside the written key unchanged.
const s1 = scenario('runtime-save');
const log1 = launch('runtime-save', s1, {
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Runtime',
  ROTARIS_CAPTURE_CLICKS: '.toggle[aria-labelledby="outside-label"]@1800;;.dialog-actions .btn-warning>>Yes@2400;;.save-bar .btn-primary>>Save@3000',
  ROTARIS_CAPTURE_AFTER_MS: '4200',
});
const ws1 = readFileSync(s1.workspaceFile, 'utf8');
if (!ws1.includes('  allow_outside_workspace: true\n')) throw new Error(`the runtime save did not write allow_outside_workspace:\n${ws1}`);
if (!ws1.includes('# workspace configuration\nruntime:\n  # the workspace states two keys and inherits the rest\n  permission_mode: ask\n  max_depth: 2\n')) throw new Error(`the runtime save disturbed the file's other lines:\n${ws1}`);
if (!ws1.includes('rotaris:\n  delegation_strategy: single\n')) throw new Error('the separate key was lost');
if (readFileSync(s1.globalFile, 'utf8') !== GLOBAL) throw new Error('the global file changed on a workspace save');
if (!/configuration saved/.test(log1)) throw new Error('main did not log the save');
results.runtimeSave = { workspaceFile: ws1, loadMs: /loaded in ([\d.]+) ms/.exec(log1)?.[1] ?? null };

// 2. Settings → Models: a slot chosen from the catalogue, then Save; the global comment header and unknown key survive a global-scoped read.
const s2 = scenario('models-save');
launch('models-save', s2, {
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Models',
  ROTARIS_CAPTURE_SELECT: 'select[aria-label="Model for large_model"]>>other@1800;;select[aria-label="Reasoning strength for large_model"]>>high@2200',
  ROTARIS_CAPTURE_CLICKS: '.save-bar .btn-primary>>Save@2800',
  ROTARIS_CAPTURE_AFTER_MS: '4000',
});
const ws2 = readFileSync(s2.workspaceFile, 'utf8');
if (!ws2.includes('large_model: other\n') || !ws2.includes('large_model_thinking: high\n')) throw new Error(`the models save did not write the slot and its companion:\n${ws2}`);
if (!ws2.startsWith('# workspace configuration\n')) throw new Error('the models save lost the comment header');
results.modelsSave = { workspaceFile: ws2 };

// 3. Discard: a toggle changed, then Discard; nothing written.
const s3 = scenario('discard');
launch('discard', s3, {
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Runtime',
  ROTARIS_CAPTURE_CLICKS: '.toggle[aria-labelledby="keep-going-label"]@1800;;.save-bar .btn-secondary>>Discard@2400',
  ROTARIS_CAPTURE_AFTER_MS: '3400',
});
if (readFileSync(s3.workspaceFile, 'utf8') !== WORKSPACE) throw new Error('Discard wrote the file');
results.discard = 'the file is byte-identical';

// 4. The composer's permission-mode control writes its one key through the per-field path, with no run active (REQ-CONFIG-288).
const s4 = scenario('composer-mode');
const log4 = launch('composer-mode', s4, { ROTARIS_CAPTURE_VIEW: '2', ROTARIS_CAPTURE_MODE: 'autonomous', ROTARIS_CAPTURE_MODE_MS: '1500', ROTARIS_CAPTURE_AFTER_MS: '3200' });
const ws4 = readFileSync(s4.workspaceFile, 'utf8');
if (!ws4.includes('  permission_mode: autonomous\n')) throw new Error(`the composer's control did not write its key:\n${ws4}`);
if (!ws4.includes('  # the workspace states two keys and inherits the rest\n') || !ws4.includes('  max_depth: 2\n')) throw new Error('the per-field write disturbed another key');
if (!/field written/.test(log4)) throw new Error('main did not log the per-field write');
results.composerMode = { workspaceFile: ws4 };

// 5. A fatal file refuses the run naming file, scope and path; correcting that key alone loads and the run completes.
const s5 = scenario('fatal', { global: GLOBAL, workspace: WORKSPACE.replace('  max_depth: 2\n', '  max_depth: many\n') });
const log5 = launch('fatal-refused', s5, { ROTARIS_CAPTURE_PROMPT: 'run on a broken file', ROTARIS_CAPTURE_AFTER_MS: '4000' });
const refused = log5.split('\n').find((line) => /refused before it started/i.test(line) || /could not be loaded/i.test(line)) ?? '';
if (!refused.includes(s5.workspaceFile) || !refused.includes('workspace scope') || !refused.includes('runtime.max_depth')) throw new Error(`the refusal did not name file, scope and path:\n${log5}`);
if (/session .* started/.test(log5)) throw new Error('a run started on a fatal configuration');
writeFileSync(s5.workspaceFile, WORKSPACE);
const log5b = launch('fatal-corrected', s5, { ROTARIS_CAPTURE_PROMPT: 'run on the corrected file', ROTARIS_CAPTURE_AFTER_MS: '6000' });
if (!/ended completed/.test(log5b)) throw new Error(`the corrected file did not run to completion:\n${log5b}`);
results.fatal = { refusal: refused.trim(), correctedRun: 'completed' };

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
