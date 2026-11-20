/**
 * `pnpm proofs:run`: one build, then the proof suites several at a time. What is held here is the part that decides —
 * the arguments, the command a proof is run by, the pool and the summary; the launches themselves are the proofs' own.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROOFS } from '../proof-registry/registry.mjs';
import { commandFor, defaultJobs, isGreen, parseArgs, runPool, summary } from './run.mjs';

const root = join(import.meta.dirname, '..', '..');
const scripts = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;

describe('proofs:run — arguments', () => {
  it('reads the proofs, the plan, the jobs and the build switch, and keeps what it does not know', () => {
    expect(parseArgs(['mission-proof', 'todo-proof', '--jobs=4', '--no-build'])).toEqual({ ids: ['mission-proof', 'todo-proof'], plan: false, base: null, jobs: 4, build: false, help: false, unknown: [] });
    expect(parseArgs(['--plan', '--base=origin/main'])).toMatchObject({ ids: [], plan: true, base: 'origin/main', jobs: null, build: true });
    expect(parseArgs(['--jobs=0', '--fast']).unknown).toEqual(['--jobs=0', '--fast']);
  });

  it('runs a third of the cores at once, and never none', () => {
    expect([1, 2, 4, 8, 24].map(defaultJobs)).toEqual([1, 1, 1, 2, 8]);
  });
});

describe('proofs:run — the command a proof is run by', () => {
  it('is its pnpm script, told to skip the build where the registry says the script reads that flag', () => {
    expect(commandFor('mission-proof', scripts)).toEqual({ file: 'apps/desktop/scripts/mission-proof.mjs', args: ['--skip-build'] });
    expect(commandFor('todo-proof', scripts)).toEqual({ file: 'apps/desktop/scripts/todo-proof.mjs', args: [] });
  });

  it('exists for every proof the registry holds, so none can be planned and not run', () => {
    for (const proof of PROOFS) expect(() => commandFor(proof.id, scripts), proof.id).not.toThrow();
  });

  it('refuses an id the registry does not know, and one whose script is not a node script', () => {
    expect(() => commandFor('no-such-proof', scripts)).toThrow(/not a proof the registry knows/);
    expect(() => commandFor('mission-proof', { 'mission-proof': 'pnpm something' })).toThrow(/is not `node <script>.mjs`/);
  });
});

describe('proofs:run — the pool', () => {
  it('keeps at most the given number running, runs every proof, and answers in the order asked', async () => {
    let running = 0;
    let most = 0;
    const release: (() => void)[] = [];
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const done = runPool({
      ids,
      jobs: 2,
      start: (id) => new Promise((settle) => {
        running += 1;
        most = Math.max(most, running);
        release.push(() => { running -= 1; settle({ status: id === 'c' ? 1 : 0 }); });
      }),
    });
    // Two start at once; each release lets the next one in.
    for (let turn = 0; turn < ids.length; turn += 1) {
      await new Promise((r) => setImmediate(r));
      expect(running).toBeLessThanOrEqual(2);
      release.shift()!();
    }
    const results = await done;
    expect(most).toBe(2);
    expect(results.map((r) => [r.id, r.status])).toEqual([['a', 0], ['b', 0], ['c', 1], ['d', 0], ['e', 0]]);
  });

  it('a red stops nothing, and a proof that could not be started is a red of that proof', async () => {
    const started: string[] = [];
    const results = await runPool({
      ids: ['a', 'b', 'c'],
      jobs: 1,
      start: async (id) => { started.push(id); if (id === 'a') throw new Error('spawn failed'); return { status: id === 'b' ? 3 : 0, signal: null }; },
    });
    expect(started).toEqual(['a', 'b', 'c']);
    expect(results.map((r) => r.status)).toEqual([null, 3, 0]);
  });
});

describe('proofs:run — the summary', () => {
  it('names every proof with its time, and the reds again on a line of their own', () => {
    const text = summary([
      { id: 'a-proof', status: 0, signal: null, durationMs: 61_000 },
      { id: 'b-proof', status: 1, signal: null, durationMs: 30_000 },
      { id: 'c-proof', status: null, signal: 'SIGTERM', durationMs: 5_000 },
    ], 62_000);
    expect(text).toContain('green  a-proof  61s');
    expect(text).toContain('RED    b-proof  30s  (exit 1)');
    expect(text).toContain('RED    c-proof  5s  (SIGTERM)');
    expect(text).toContain('1 green, 2 red in 62s (96s one after another)');
    expect(text).toContain('proofs:run: red: b-proof, c-proof');
  });

  it('a proof red beside the others and green alone is green, and is named as one that needed the second reading', () => {
    const results = [
      { id: 'a-proof', status: 0, signal: null, durationMs: 10_000 },
      { id: 'b-proof', status: 1, signal: null, durationMs: 40_000, alone: { status: 0, signal: null, durationMs: 160_000 } },
      { id: 'c-proof', status: 1, signal: null, durationMs: 16_000, alone: { status: 1, signal: null, durationMs: 16_000 } },
    ];
    expect(results.map(isGreen)).toEqual([true, true, false]);
    const text = summary(results, 200_000);
    expect(text).toContain('green  b-proof  40s  (exit 1) beside the others; alone 160s');
    expect(text).toContain('RED    c-proof  16s  (exit 1) beside the others; alone 16s  (exit 1)');
    expect(text).toContain('2 green, 1 red in 200s');
    expect(text).toContain('proofs:run: green only alone: b-proof');
    expect(text).toContain('proofs:run: red: c-proof');
  });

  it('says nothing of reds when there are none', () => {
    expect(summary([{ id: 'a-proof', status: 0, signal: null, durationMs: 1_000 }], 1_000)).not.toContain('red:');
  });
});
