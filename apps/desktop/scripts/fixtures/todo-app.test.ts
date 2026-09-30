/**
 * The live run's workspace (`fixtures/todo-app`) names the command that runs its tests, in three places the agents
 * read: `src/todos.js`'s header, `README.md` and `AGENTS.md`. Every `node --test …` command it names must pass as
 * named on the Node the repository runs on. `src/todos.js` said "`node --test src/` runs it", which fails on Node 24
 * with MODULE_NOT_FOUND (a directory argument is read as a module path), and six terminal calls of the first live run
 * of 2026-09-29 went on finding one that worked (live-run finding H2; R-067).
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const fixture = join(__dirname, 'todo-app');
const WHERE = ['src/todos.js', 'README.md', 'AGENTS.md'];

/** Every backticked `node --test …` command a file names, or a fenced line that is one. */
function commandsIn(text: string): string[] {
  const inline = [...text.matchAll(/`(node --test[^`]*)`/g)].map((m) => m[1]!.trim());
  const fenced = text.split('\n').map((line) => line.trim()).filter((line) => /^node --test\b/.test(line));
  return [...new Set([...inline, ...fenced])];
}

describe('the todo-app fixture names a test command that works (live-run finding H2)', () => {
  let dir: string;
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-todo-fixture-')); cpSync(fixture, dir, { recursive: true }); });
  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

  const named = WHERE.flatMap((file) => commandsIn(readFileSync(join(fixture, file), 'utf8')).map((command) => [file, command] as const));

  it('names at least one, in the source header an agent reads first', () => {
    expect(named.some(([file]) => file === 'src/todos.js')).toBe(true);
  });

  // Each case spawns a Node that runs the fixture's suite, the slowest cases here on a loaded host: the child's own
  // bound is 60 s, and the case's is set above it so the case reports the child's failure rather than its own timeout.
  it.each(named)('%s: `%s` passes from the repository root on this Node', (_file, command) => {
    const args = command.split(/\s+/).slice(1);
    const run = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', timeout: 60_000 });
    expect(run.status, `${command}\n${run.stdout}\n${run.stderr}`).toBe(0);
    expect(run.stdout).toMatch(/(#|ℹ) pass [1-9]/);
  }, 90_000);
});
