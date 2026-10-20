/**
 * The live run's wait on a launch ends within the launch's bound, even when a process the launch started keeps its pipes
 * open (`docs/defects/fixed/a-live-run-launch-overrun-leaves-no-results-or-failed-session-export.md`, part c). Pinned
 * against REAL children, because what is pinned is what the operating system does with inherited handles: a grandchild
 * that inherited the child's standard output and error holds them past the child's own end, so a wait on `close` lasts as
 * long as the grandchild does. No product code runs here.
 */
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the module is plain ESM beside the scripts that run it.
import { settleLaunch } from './settle-launch.mjs';

/** How long the grandchild keeps the pipes: far past every bound below, so a wait on it is unmistakable. */
const HOLD_MS = 60_000;
/**
 * A child that starts a grandchild sharing its pipes, says the grandchild's pid, then either exits or never does. The
 * grandchild is `detached`: on Windows libuv puts a child it spawns otherwise into a job object that ends it with its
 * parent (measured 2026-10-20: `close` then came 3 ms after `exit`), and no Electron utility process is in one, so only a
 * detached grandchild is the shape the defect met; on POSIX it inherits the descriptors either way.
 */
const parentBody = (exit: boolean) => `
const { spawn } = require('node:child_process');
const g = spawn(process.execPath, ['-e', 'setTimeout(() => {}, ${HOLD_MS})'], { stdio: ['ignore', 'inherit', 'inherit'], detached: true });
g.unref();
console.log('grandchild ' + g.pid);
${exit ? "setTimeout(() => process.exit(0), 100);" : 'setInterval(() => {}, 1000);'}
`;
const grandchildOf = (stdout: string): number | null => { const m = /grandchild (\d+)/.exec(stdout); return m === null ? null : Number(m[1]); };
const end = (pid: number | null) => { if (pid !== null) { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } } };

describe('settleLaunch: the live run waits on a launch no longer than its bound (defect part c)', () => {
  it('a launch that exits while a grandchild keeps its pipes settles after the drain, not when the grandchild lets go', async () => {
    const child = spawn(process.execPath, ['-e', parentBody(true)], { stdio: ['ignore', 'pipe', 'pipe'] });
    const started = Date.now();
    const r = await settleLaunch(child, { timeoutMs: 30_000, drainMs: 1_000 });
    const took = Date.now() - started;
    end(grandchildOf(r.stdout));
    // On `close` this waited the grandchild's 60 s; on `exit` and the drain it takes about one second.
    expect(took).toBeLessThan(15_000);
    expect(r.status).toBe(0);
    expect(r.timedOut).toBe(false);
    expect(r.pipesHeld).toBe(true);
    // What the launch wrote before it exited is kept.
    expect(grandchildOf(r.stdout)).not.toBeNull();
  }, 40_000);

  it('a launch that overruns its bound while a grandchild keeps its pipes is killed and settled as an overrun, within the bound and the drain', async () => {
    const child = spawn(process.execPath, ['-e', parentBody(false)], { stdio: ['ignore', 'pipe', 'pipe'] });
    const started = Date.now();
    const r = await settleLaunch(child, { timeoutMs: 1_500, drainMs: 1_000 });
    const took = Date.now() - started;
    end(grandchildOf(r.stdout));
    expect(took).toBeLessThan(15_000);
    expect(r.timedOut).toBe(true);
    // An overrun is never a clean exit: `spawnSync`'s shape, a null status and the signal the harness sent.
    expect(r.status).toBeNull();
    expect(r.signal).toBe('SIGKILL');
    expect(r.pipesHeld).toBe(true);
  }, 40_000);

  it('a launch that exits and lets go of its pipes settles on close, with everything it wrote and no pipe held', async () => {
    const child = spawn(process.execPath, ['-e', "process.stdout.write('one\\n'); process.stderr.write('two\\n'); process.exitCode = 3;"], { stdio: ['ignore', 'pipe', 'pipe'] });
    const r = await settleLaunch(child, { timeoutMs: 30_000, drainMs: 20_000 });
    expect(r.status).toBe(3);
    expect(r.stdout).toBe('one\n');
    expect(r.stderr).toBe('two\n');
    expect(r.pipesHeld).toBe(false);
    expect(r.timedOut).toBe(false);
  }, 40_000);

  it('a launch that cannot start settles at once with a null status and the cause on its standard error', async () => {
    const child = spawn('no-such-binary-rotaris-live-run', [], { stdio: ['ignore', 'pipe', 'pipe'] });
    const r = await settleLaunch(child, { timeoutMs: 30_000 });
    expect(r.status).toBeNull();
    expect(r.stderr).toMatch(/ENOENT/);
  }, 40_000);

  it('refuses a launch with no bound', () => {
    expect(() => settleLaunch({}, { timeoutMs: 0 })).toThrow(/positive timeoutMs/);
  });
});
