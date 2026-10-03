/** Part AD proof: normalized source priority, write-through edits, stable backend ids and the four-glyph pane. */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { backendIdChecks } from './lib/backend-id-minting.mjs';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const output = join(repo, '.proof', 'todo-proof');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const args = ['exec', 'vitest', 'run', 'packages/engine/src/todo-view.test.ts', 'packages/engine/src/run/todo.test.ts', 'packages/engine/src/control.test.ts', 'packages/agent-tools/src/tools/tools.test.ts', 'packages/ui/src/todo.test.ts'];
const test = process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', `pnpm ${args.join(' ')}`], { cwd: repo, encoding: 'utf8', timeout: 180_000 })
  : spawnSync('pnpm', args, { cwd: repo, encoding: 'utf8', timeout: 180_000 });
writeFileSync(join(output, 'tests.log'), `${test.stdout ?? ''}\n${test.stderr ?? ''}`);

const pane = readFileSync(join(repo, 'packages/ui/src/TodoPane.tsx'), 'utf8');
const engine = readFileSync(join(repo, 'packages/engine/src/todo-view.ts'), 'utf8');
const engineSource = (path) => readFileSync(join(repo, 'packages/engine/src', path), 'utf8');
// REQ-CHAT-089: every backend task and phase id through the one minter, read where it lives (`lib/backend-id-minting.mjs`);
// what the minter yields is measured by `run/todo.test.ts` above.
const idChecks = backendIdChecks({ todo: engineSource('run/todo.ts'), run: engineSource('run/run.ts'), sessions: engineSource('sessions.ts'), todoView: engine });
const results = {
  testsPassed: test.status === 0,
  sourceNamed: /sourceLabel/.test(pane) && /Child plan/.test(engine) && /Agent plan/.test(engine) && /Planner plan/.test(engine),
  fourGlyphs: ['✓', '◌', '○', '⊘'].every((glyph) => pane.includes(glyph)),
  localIdsRendererOnly: pane.includes('local-${nextLocalId++}') && !engine.includes('local-'),
  stableBackendIds: Object.values(idChecks).every(Boolean),
  unchangedRefreshPreserved: /seen !== fingerprint/.test(pane),
  writeThroughSources: /source === 'planner'/.test(readFileSync(join(repo, 'packages/engine/src/run/run.ts'), 'utf8')) && /source === 'child'/.test(readFileSync(join(repo, 'packages/engine/src/sessions.ts'), 'utf8')),
};
results.passed = Object.values(results).every(Boolean);
results.stableBackendIdChecks = idChecks;
writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
if (!results.passed) {
  console.error(JSON.stringify(results, null, 2));
  process.exit(1);
}
console.log(`todo-proof PASSED ${join(output, 'results.json')}`);
