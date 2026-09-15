/**
 * Improvement lifecycle proof (REQ-LIBRARY-001/059..078/109..130/155/164..176).
 *
 * Six isolated verification launches cover the contracts and configuration,
 * durable store, analyst and capture, desktop coordinator, Git executor and
 * rollback, and the renderer/run-host composition. Every child receives a
 * fresh Vitest process, so module state cannot leak between lifecycle lanes.
 * Evidence lands under `.proof/improvements-proof/`.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const output = resolve(repo, '.proof', 'improvements-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') {
  throw new Error(`proof output escaped the repository: ${output}`);
}
rmSync(output, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
mkdirSync(output, { recursive: true });

const run = (name, command, args, timeout = 300_000) => {
  const child = spawnSync(command, args, {
    cwd: repo,
    encoding: 'utf8',
    timeout,
    windowsHide: true,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  const log = `${child.stdout ?? ''}\n${child.stderr ?? ''}`;
  writeFileSync(resolve(output, `${name}.log`), log);
  const status = child.status;
  const outcome = { name, status, signal: child.signal ?? null, passed: status === 0 };
  if (!outcome.passed) throw new Error(`${name} exited ${status ?? child.signal ?? 'unknown'}; see ${name}.log`);
  return outcome;
};

if (!process.argv.includes('--skip-build')) {
  const build = process.platform === 'win32'
    ? run('build', 'cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], 360_000)
    : run('build', 'pnpm', ['--filter', '@rotaris/desktop', 'build'], 360_000);
  if (!build.passed) throw new Error('desktop build failed');
}

const vitest = resolve(repo, 'node_modules', 'vitest', 'vitest.mjs');
if (!existsSync(vitest)) throw new Error(`Vitest executable is absent: ${vitest}`);
const launches = [
  ['01-contracts-config', [
    'packages/contracts/src/improvements.test.ts',
    'packages/config/src/writers.test.ts',
    'packages/config/src/snapshot.test.ts',
  ]],
  ['02-store', [
    'packages/workspace/src/improvements/handles.test.ts',
    'packages/store/src/store.test.ts',
  ]],
  ['03-analysis', [
    'packages/engine/src/improvements',
  ]],
  ['04-coordinator', [
    'apps/desktop/src/main/improvements.test.ts',
    'apps/desktop/src/run-host/launch.test.ts',
  ]],
  ['05-executor-rollback', [
    'packages/workspace/src/improvements/executor.test.ts',
    'packages/workspace/src/git/checkpoints.test.ts',
  ]],
  ['06-desktop-surface', [
    'packages/ui/src/library/library.test.ts',
    'apps/desktop/src/main/improvement-export.test.ts',
    'packages/engine/src/run/run.test.ts',
  ]],
].map(([name, files]) => run(name, process.execPath, [vitest, 'run', ...files, '--reporter=verbose']));

writeFileSync(resolve(output, 'results.json'), `${JSON.stringify({ launches }, null, 2)}\n`);
console.log(`improvements proof PASSED — six launches; evidence under ${relative(repo, output)}`);
