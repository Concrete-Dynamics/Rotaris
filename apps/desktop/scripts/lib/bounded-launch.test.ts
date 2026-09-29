/**
 * R-062: a proof's launch cannot outlive its bound. Pinned against REAL child processes, because what is being pinned
 * is what the operating system does with the signals: a child that exits by itself, one that takes SIGTERM, one that
 * ignores it (the shape `resilience-proof`'s override launch had, alive 649 s after a 180 s timeout), and a process
 * group whose member outlives its leader. No product code runs here.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the module is plain ESM beside the scripts that run it.
import { endOverrun, exitWithin } from './bounded-launch.mjs';

const POSIX = process.platform !== 'win32';

/**
 * A node child running `body`, resolved once it has printed `ready` — so a handler it installs is in place first.
 * `said` holds what it printed up to then.
 */
function child(body: string, { detached = false } = {}): Promise<ChildProcess & { said: string }> {
  const proc = spawn(process.execPath, ['-e', body], { stdio: ['ignore', 'pipe', 'inherit'], detached });
  return new Promise((resolve, reject) => {
    let out = '';
    proc.stdout!.setEncoding('utf8').on('data', (chunk: string) => { out += chunk; if (out.includes('ready')) resolve(Object.assign(proc, { said: out })); });
    proc.once('error', reject);
    proc.once('exit', (code) => { if (!out.includes('ready')) reject(new Error(`the child exited ${code} before it was ready`)); });
  });
}

const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch { return false; } };

describe('R-062: ending a proof launch within its bound', () => {
  it('reports the exit of a process that ends by itself, and null for one still running at the bound', async () => {
    const quick = await child("console.log('ready'); setTimeout(() => process.exit(3), 50);");
    expect(await exitWithin(quick, 5_000)).toEqual({ code: 3, signal: null });
    // Already exited: answered at once from the fields, not by waiting for an event that has been and gone.
    expect(await exitWithin(quick, 1)).toEqual({ code: 3, signal: null });
    const slow = await child("console.log('ready'); setInterval(() => {}, 1000);");
    expect(await exitWithin(slow, 200)).toBeNull();
    slow.kill('SIGKILL');
  });

  it('ends a process that takes SIGTERM with SIGTERM, inside the grace', async () => {
    const polite = await child("process.on('SIGTERM', () => process.exit(0)); console.log('ready'); setInterval(() => {}, 1000);");
    const ended = await endOverrun(polite, { graceMs: 5_000 });
    expect(ended.endedBy).toBe('SIGTERM');
    expect(ended.afterTermMs).toBeLessThan(5_000);
    expect(polite.pid !== undefined && alive(polite.pid)).toBe(false);
  });

  it.skipIf(!POSIX)('ends a process that ignores SIGTERM with SIGKILL once the grace has run, and says so', async () => {
    const deaf = await child("process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000);");
    const started = Date.now();
    const ended = await endOverrun(deaf, { graceMs: 600 });
    expect(ended.endedBy).toBe('SIGKILL');
    expect(ended.exit).toEqual({ code: null, signal: 'SIGKILL' });
    expect(ended.afterTermMs).toBeGreaterThanOrEqual(550);
    expect(Date.now() - started).toBeLessThan(6_000);
  });

  it.skipIf(!POSIX)('with `group`, the SIGKILL reaches a member of the process group that outlives its leader', async () => {
    // The leader starts a grandchild that ignores SIGTERM too, and reports its pid; both ignore SIGTERM.
    const leader = await child(
      "const { spawn } = require('node:child_process');"
      + " const g = spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);\"], { stdio: 'ignore' });"
      + " process.on('SIGTERM', () => {}); console.log('pid ' + g.pid + ' ready'); setInterval(() => {}, 1000);",
      { detached: true },
    );
    const grandchild = Number(/pid (\d+)/.exec(leader.said)?.[1] ?? 0);
    expect(grandchild).toBeGreaterThan(0);
    const ended = await endOverrun(leader, { graceMs: 400, group: true });
    expect(ended.endedBy).toBe('SIGKILL');
    // The kernel reaps the grandchild on its own schedule; give it a moment rather than assert on the same tick.
    for (let i = 0; i < 50 && alive(grandchild); i += 1) await new Promise((r) => setTimeout(r, 50));
    expect(alive(grandchild)).toBe(false);
  });
});
