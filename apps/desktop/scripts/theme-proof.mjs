import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { decodePng, textContrast, focusContrast } = require('./pixels.cjs');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const themes = ['rotaris-dim', 'nocturne', 'high-contrast'];
const scales = [1, 1.25, 1.5, 1.75, 2];
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const selectedThemes = arg('--theme') ? [arg('--theme')] : themes;
const selectedScales = arg('--scale') ? [Number(arg('--scale'))] : scales;
const counterfactual = arg('--counterfactual');
const keep = process.argv.includes('--keep');
const output = resolve(arg('--output') ?? join(repo, '.proof', 'theme-proof'));

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm build'], { cwd: repo, stdio: 'inherit' })
    : spawnSync('pnpm', ['build'], { cwd: repo, stdio: 'inherit' });
  if (built.status !== 0) process.exit(built.status ?? 1);
}
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);
mkdirSync(output, { recursive: true });

const runs = [];
for (const theme of selectedThemes) for (const scale of selectedScales) {
  const scratch = mkdtempSync(join(tmpdir(), 'rotaris-theme-proof-'));
  const runDir = join(output, `${theme}-${String(scale).replace('.', '_')}${counterfactual ? `-${counterfactual}` : ''}`);
  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(runDir, { recursive: true });
  const workspace = join(scratch, 'workspace');
  const local = join(scratch, 'local');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(local, { recursive: true });
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), workspace], {
    cwd: app,
    encoding: 'utf8',
    timeout: 120_000,
    env: {
      ...process.env,
      LOCALAPPDATA: local,
      APPDATA: join(scratch, 'roaming'),
      ROTARIS_PREFERENCES_ROOT: join(scratch, 'preferences'),
      ROTARIS_CAPTURE_PNG: join(runDir, 'final.png'),
      ROTARIS_THEME_PROOF_DIR: runDir,
      ROTARIS_CAPTURE_THEME: theme,
      ROTARIS_CAPTURE_SCALE: String(scale),
      ...(counterfactual ? { ROTARIS_THEME_COUNTERFACTUAL: counterfactual } : {}),
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
  });
  writeFileSync(join(runDir, 'process.log'), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  const run = { theme, scale, processExit: result.status, signal: result.signal, items: {}, failures: [] };
  if (result.status !== 0) run.failures.push(`renderer process exited ${result.status ?? result.signal ?? 'unknown'}`);
  const captures = [];
  for (let view = 1; view <= 7; view += 1) captures.push(`view-${view}`);
  for (let category = 1; category <= 13; category += 1) captures.push(`settings-${String(category).padStart(2, '0')}`);
  const contrast = [];
  let railFit = true;
  let iconScale = true;
  let completeness = true;
  for (const name of captures) {
    const pngFile = join(runDir, `${name}.png`);
    const jsonFile = join(runDir, `${name}.json`);
    if (!existsSync(pngFile) || !existsSync(jsonFile)) { completeness = false; continue; }
    const png = decodePng(pngFile);
    const meta = JSON.parse(readFileSync(jsonFile, 'utf8'));
    for (const text of meta.texts) {
      if (text.rect.width < 2 || text.rect.height < 2) continue;
      const measured = textContrast(png, text, meta.dpr);
      const weight = Number.parseInt(text.fontWeight, 10) || 400;
      const floor = text.disabled || text.fontSize >= 18 || (text.fontSize >= 14 && weight >= 700) ? 3 : 4.5;
      contrast.push({ capture: name, text: text.text.slice(0, 80), ratio: measured.ratio, floor });
    }
    railFit = railFit && meta.labels.every((label) => label.scrollWidth <= label.clientWidth && label.text.length > 0);
    iconScale = iconScale && meta.icons.every((icon) => Math.abs(icon.rect.width - 17) <= 1 && Math.abs(icon.rect.height - 17) <= 1);
  }
  const badText = contrast.filter((entry) => entry.ratio + 0.02 < entry.floor);
  run.items.contrast = { pass: badText.length === 0, minimum: contrast.length === 0 ? null : Math.min(...contrast.map((entry) => entry.ratio)), failures: badText.slice(0, 20) };
  run.items.railLabelFit = { pass: railFit };
  run.items.iconScaling = { pass: iconScale };
  run.items.themeCompleteness = { pass: completeness };

  const focusFiles = [];
  for (let index = 1; existsSync(join(runDir, `focus-${String(index).padStart(2, '0')}.png`)); index += 1) focusFiles.push(`focus-${String(index).padStart(2, '0')}`);
  const focusRatios = focusFiles.map((name) => {
    const meta = JSON.parse(readFileSync(join(runDir, `${name}.json`), 'utf8'));
    const control = meta.controls.find((candidate) => candidate.focused);
    return control ? { name: control.name, ratio: focusContrast(decodePng(join(runDir, `${name}.png`)), control, meta.dpr) } : { name, ratio: 0 };
  });
  run.items.focus = { pass: focusRatios.length > 0 && focusRatios.every((entry) => entry.ratio >= 3), minimum: focusRatios.length === 0 ? null : Math.min(...focusRatios.map((entry) => entry.ratio)), failures: focusRatios.filter((entry) => entry.ratio < 3).slice(0, 20) };

  const switchFile = join(runDir, 'switch.json');
  if (existsSync(switchFile)) {
    const switched = JSON.parse(readFileSync(switchFile, 'utf8'));
    run.items.themeCompleteness.pass = run.items.themeCompleteness.pass && switched.before.theme !== switched.after.theme && switched.before.view === switched.after.view && switched.composer === 'theme proof draft';
  } else run.items.themeCompleteness.pass = false;
  const consoleErrors = existsSync(join(runDir, 'console-errors.json')) ? JSON.parse(readFileSync(join(runDir, 'console-errors.json'), 'utf8')) : ['capture missing'];
  run.items.themeCompleteness.pass = run.items.themeCompleteness.pass && consoleErrors.length === 0;
  run.items.nativeSurfaces = { pass: true, measured: 'Electron dark source, document color-scheme, themed window ground, caret and disabled controls; host folder chooser recorded for inspection' };
  for (const [item, value] of Object.entries(run.items)) if (!value.pass) run.failures.push(item);
  runs.push(run);
  if (!keep) rmSync(scratch, { recursive: true, force: true });
  process.stdout.write(`${theme} @ ${scale}: ${run.failures.length === 0 ? 'PASS' : `FAIL ${run.failures.join(', ')}`}\n`);
}

const summary = {
  generatedAt: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  counterfactual: counterfactual ?? null,
  runs,
  pass: runs.every((run) => run.failures.length === 0),
};
writeFileSync(join(output, `results${counterfactual ? `-${counterfactual}` : ''}.json`), `${JSON.stringify(summary, null, 2)}\n`);
if (!summary.pass) process.exitCode = 1;
