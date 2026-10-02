/**
 * `pnpm terminal-proof` — Part AM, ADR-0047's first execution: the terminal grid, the pop-out window's content and the
 * transcript preview against a SCRIPTED frame source (no producer exists in this worktree; AL builds it beside).
 *
 *   1. The unit suite: the closed key vocabulary, the five rules, the wheel arithmetic, the selection extraction, the
 *      audit buffer, the geometry guard, the labels, and the display emulator over frames (`terminal.test.ts`), plus the
 *      contracts suite that asserts the terminal tokens clear their floors in every palette.
 *   2. The page: `packages/ui/src/terminal/proof-entry.tsx` bundled with esbuild — the SAME sources the renderer
 *      bundles — with the design system's CSS, the shell's, xterm's and the bundled fonts, into `.proof/terminal-proof/page/`.
 *      No renderer role exists for it because `renderer/main.tsx` is wave 2's; this is a verification bundle only.
 *   3. Electron on `terminal-proof/main.cjs`: a 900×620 window, real key/wheel/pointer input, DOM and pixel readings,
 *      `results.json`, two screenshots for the design check.
 *
 * Evidence under `.proof/terminal-proof/`. `--skip-tests` skips step 1.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cleanEnvironment, hostSwitches } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'terminal-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);

const results = { generatedAt: new Date().toISOString(), platform: process.platform };

// ── 1. The unit suite ──────────────────────────────────────────────────────────────────────────────────────────
if (!process.argv.includes('--skip-tests')) {
  // Part AL2 adds main's two suites: the delivery limiter (with defect AL2-1's regression) and the window registry.
  const args = ['exec', 'vitest', 'run', 'packages/ui/src/terminal/terminal.test.ts', 'packages/contracts/src/contracts.test.ts', 'apps/desktop/src/main/terminal.test.ts', 'apps/desktop/src/main/terminal-window.test.ts'];
  const test = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', `pnpm ${args.join(' ')}`], { cwd: repo, encoding: 'utf8', timeout: 240_000 })
    : spawnSync('pnpm', args, { cwd: repo, encoding: 'utf8', timeout: 240_000 });
  writeFileSync(join(output, 'tests.log'), `${test.stdout ?? ''}\n${test.stderr ?? ''}`);
  results.unitTests = { passed: test.status === 0 };
  if (test.status !== 0) { console.error(test.stdout, test.stderr); throw new Error(`unit suite exited ${test.status ?? test.signal ?? 'unknown'}`); }
}

// ── 2. The page ────────────────────────────────────────────────────────────────────────────────────────────────
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
// Under `out/`, which the lint's ignore list already covers (`**/out/**`): the bundle is not source and must not be linted.
const page = join(output, 'out');
mkdirSync(page, { recursive: true });
const alias = Object.fromEntries(['kernel', 'contracts', 'ui-core', 'ui'].map((name) => [`@rotaris/${name}`, join(repo, 'packages', name, 'src', 'index.ts')]));
await esbuild.build({
  entryPoints: [join(repo, 'packages', 'ui', 'src', 'terminal', 'proof-entry.tsx')],
  bundle: true, format: 'esm', platform: 'browser', target: 'chrome130', jsx: 'automatic', sourcemap: 'inline',
  outfile: join(page, 'proof.js'), alias, define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.woff2': 'file' }, logLevel: 'warning',
});
// The design system's sheets, the shell's, and the fonts with their `@design-assets` references re-pointed.
const designSystem = join(repo, 'docs', 'design', 'system');
const assets = join(repo, 'docs', 'design', 'assets');
for (const name of ['base.css', 'components.css', 'motif.css']) copyFileSync(join(designSystem, name), join(page, name));
for (const name of ['colors.css', 'typography.css', 'spacing.css', 'effects.css']) copyFileSync(join(designSystem, 'tokens', name), join(page, `tokens-${name}`));
copyFileSync(join(repo, 'packages', 'ui', 'src', 'shell.css'), join(page, 'shell.css'));
const fonts = readFileSync(join(repo, 'packages', 'ui', 'src', 'fonts.css'), 'utf8').replaceAll('@design-assets/', `${pathToFileURL(assets).href}/`);
writeFileSync(join(page, 'fonts.css'), fonts);
const bundledCss = existsSync(join(page, 'proof.css')) ? '<link rel="stylesheet" href="./proof.css" />' : '';
writeFileSync(join(page, 'index.html'), [
  '<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="color-scheme" content="dark" /><title>terminal-proof</title>',
  '<link rel="stylesheet" href="./fonts.css" /><link rel="stylesheet" href="./tokens-colors.css" /><link rel="stylesheet" href="./tokens-typography.css" /><link rel="stylesheet" href="./tokens-spacing.css" /><link rel="stylesheet" href="./tokens-effects.css" />',
  '<link rel="stylesheet" href="./base.css" /><link rel="stylesheet" href="./components.css" /><link rel="stylesheet" href="./motif.css" /><link rel="stylesheet" href="./shell.css" />',
  bundledCss,
  '<style>body{margin:0;background:var(--rt-bg)}.terminal-proof{display:flex;flex-direction:row;align-items:flex-start}.terminal-proof__window{flex:none;overflow:hidden;box-sizing:border-box}.terminal-proof__window .term-window{height:100%}.terminal-proof__transcript{flex:none;height:620px;overflow:hidden;box-sizing:border-box;padding:12px;border-left:1px solid var(--rt-border)}</style>',
  '</head><body><div id="root"></div><script type="module" src="./proof.js"></script></body></html>',
].join('\n'));

// ── 2b. Part AL2: the run-host half of the REQ-SHELL-166 section, bundled for Node ─────────────────────────────
// The product's own modules (the terminal manager over node-pty, the run host's terminal handler, main's delivery
// limiter, the relay) in one CommonJS bundle the Electron half spawns as a Node child; node-pty and every other
// package stay external and resolve from the repository's `node_modules`, so the native binary is the one the tests use.
const nodeAlias = Object.fromEntries(['kernel', 'contracts', 'platform', 'shell', 'agent-tools', 'engine', 'config', 'store', 'model', 'hooks', 'providers', 'mcp', 'workspace'].map((name) => [`@rotaris/${name}`, join(repo, 'packages', name, 'src', 'index.ts')]));
await esbuild.build({
  entryPoints: [join(repo, 'apps', 'desktop', 'scripts', 'terminal-proof', 'harness.mjs')],
  bundle: true, platform: 'node', format: 'cjs', target: 'node24', sourcemap: 'inline',
  outfile: join(page, 'harness.cjs'), alias: nodeAlias, packages: 'external', logLevel: 'warning',
});

// ── 3. Electron ────────────────────────────────────────────────────────────────────────────────────────────────

const run = await spawnBounded(electron, [join(repo, 'apps', 'desktop', 'scripts', 'terminal-proof', 'main.cjs'), ...hostSwitches], {
  cwd: repo, timeoutMs: 400_000, windowsHide: true,
  env: {
    ...cleanEnvironment(), TERMINAL_PROOF_OUT: output, TERMINAL_PROOF_PAGE: join(page, 'index.html'), ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    // Part AL2: the live section's two halves.
    TERMINAL_PROOF_HARNESS: join(page, 'harness.cjs'), TERMINAL_PROOF_PRELOAD: join(repo, 'apps', 'desktop', 'scripts', 'terminal-proof', 'preload.cjs'), TERMINAL_PROOF_REPO: repo,
  },
});
writeFileSync(join(output, 'electron.log'), `${run.stdout ?? ''}\n${run.stderr ?? ''}`);
const resultsFile = join(output, 'results.json');
// An overrun is a failure named with the launch's last words, even when a results.json from part-way was written.
const overran = run.overran ? `${overrunMessage('the terminal proof\'s Electron launch', run, `${run.stdout}\n${run.stderr}`)}\n(see electron.log)` : null;
const read = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : { passed: false, failures: [`no results.json (exit ${run.status ?? run.signal})`], results: {} };
const electronResults = overran === null ? read : { ...read, passed: false, failures: [overran, ...(read.failures ?? [])] };
results.electron = { exit: run.status, ...electronResults };
writeFileSync(join(output, 'summary.json'), `${JSON.stringify(results, null, 2)}\n`);

const items = Object.entries(electronResults.results ?? {}).filter(([, v]) => v && typeof v === 'object' && 'pass' in v);
console.log(`terminal-proof: ${items.filter(([, v]) => v.pass).length}/${items.length} assertions passed`);
// Part AL2: REQ-SHELL-166's figures, in the log as well as in results.json.
const live = electronResults.results?.live ?? {};
console.log(`terminal-proof live (REQ-SHELL-166): ${JSON.stringify({ echo: live.echo, endInput: live.endInput && { ms: live.endInput.ms, exitCode: live.endInput.exitCode }, interrupt: live.interrupt && { ms: live.interrupt.ms, exitCode: live.interrupt.exitCode }, resize: live.resize, midCommandResize: live.midCommandResize, resizeRepaint: live.resizeRepaint, throughput: live.throughput, threeSurfaces: live.threeSurfaces, delivery: live.delivery })}`);
// Part T2: REQ-SHELL-102 measured in motion as well as at rest — the samples taken while the stream was writing.
console.log(`terminal-proof motion (REQ-SHELL-102): ${JSON.stringify(live.motion)}`);
if (!electronResults.passed || run.status !== 0) {
  console.error(JSON.stringify(electronResults.failures, null, 2));
  console.error((run.stderr ?? '').slice(-2000));
  process.exit(1);
}
console.log(`terminal-proof PASSED ${resultsFile}`);
