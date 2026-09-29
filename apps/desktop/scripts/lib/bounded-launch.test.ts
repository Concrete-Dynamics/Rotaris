/**
 * R-062: a proof's launch cannot outlive its bound. Pinned against REAL child processes, because what is being pinned
 * is what the operating system does with the signals: a child that exits by itself, one that takes SIGTERM, one that
 * ignores it (the shape `resilience-proof`'s override launch had, alive 649 s after a 180 s timeout), and a process
 * group whose member outlives its leader. `spawnBounded` is pinned the same way, including the shape that made
 * `spawnSync` hang: the quit path's own line must still reach the proof after SIGTERM, because the pipes stay open —
 * and a proof killed by a signal mid-launch takes its launch with it, though the launch leads its own process group.
 * No product code runs here.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the module is plain ESM beside the scripts that run it.
import { endOverrun, exitWithin, logTail, overrunMessage, spawnBounded } from './bounded-launch.mjs';

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

  it('spawnBounded returns a launch that ends by itself as spawnSync would, with nothing overrun', async () => {
    const r = await spawnBounded(process.execPath, ['-e', "console.log('out'); console.error('err'); process.exit(4);"], { timeoutMs: 10_000 });
    expect(r).toMatchObject({ status: 4, signal: null, overran: null });
    expect(r.stdout).toBe('out\n');
    expect(r.stderr).toBe('err\n');
  });

  it('spawnBounded keeps the pipes open across SIGTERM, so the quit path\'s own line reaches the proof', async () => {
    // What `spawnSync`'s timeout breaks: it closes its ends of the pipes as it signals, the line below meets EPIPE,
    // and the product's uncaught-exception handler loops on it (`docs/defects/fixed/a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md`, repaired 2026-09-29).
    const r = await spawnBounded(process.execPath, ['-e', "process.on('SIGTERM', () => { console.log('quit: requested (before-quit)'); process.exit(0); }); console.log('ready'); setInterval(() => {}, 1000);"], { timeoutMs: 800, graceMs: 5_000 });
    expect(r.overran).toMatchObject({ timeoutMs: 800, endedBy: 'SIGTERM' });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('ready\nquit: requested (before-quit)\n');
    expect(overrunMessage('fixture', r, r.stdout)).toMatch(/^fixture overran its 800 ms bound: SIGTERM ended it after \d+ ms\.\n--- the launch's last words ---\nready\nquit: requested \(before-quit\)$/);
  });

  it.skipIf(!POSIX)('spawnBounded ends a launch that ignores SIGTERM with SIGKILL, and the failure names both and the log tail', async () => {
    const started = Date.now();
    const r = await spawnBounded(process.execPath, ['-e', "process.on('SIGTERM', () => console.log('ignored SIGTERM')); console.log('waiting on a condition that cannot come'); setInterval(() => {}, 1000);"], { timeoutMs: 500, graceMs: 500 });
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(r.overran).toMatchObject({ timeoutMs: 500, endedBy: 'SIGKILL' });
    expect(r.signal).toBe('SIGKILL');
    expect(r.stdout).toContain('ignored SIGTERM');
    expect(overrunMessage('override', r, r.stdout)).toContain('override overran its 500 ms bound: SIGTERM did not end it within');
    expect(overrunMessage('override', r, r.stdout)).toContain('waiting on a condition that cannot come');
  });

  it.skipIf(!POSIX)('spawnBounded returns once the process has exited even while a helper it started holds standard output', async () => {
    // A grandchild inherits the pipe and outlives its parent; `close` never comes while it lives. The launch has ended,
    // so the proof moves on after a short bound instead of waiting for the helper. The group is cleaned up here.
    const started = Date.now();
    const r = await spawnBounded(process.execPath, ['-e', "const { spawn } = require('node:child_process'); const g = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: ['ignore', 'inherit', 'inherit'] }); console.log('helper ' + g.pid); process.exit(0);"], { timeoutMs: 10_000 });
    expect(r).toMatchObject({ status: 0, overran: null });
    expect(Date.now() - started).toBeLessThan(6_000);
    const helper = Number(/helper (\d+)/.exec(r.stdout)?.[1] ?? 0);
    if (helper > 0) { try { process.kill(helper, 'SIGKILL'); } catch { /* gone */ } }
  });

  it.skipIf(!POSIX).each(['SIGINT', 'SIGTERM', 'SIGHUP'] as const)('a proof that dies of %s mid-launch takes its spawnBounded launch with it, and still dies of the signal', async (sig) => {
    // The launch leads its own process group, so a signal to the proof's group (Ctrl+C) no longer reaches it, and Node
    // emits no `exit` on a fatal signal: without the proof's own handler the launch outlived the proof in another session.
    const dir = mkdtempSync(join(tmpdir(), 'bounded-signal-'));
    const pidFile = join(dir, 'launch.pid');
    const module = pathToFileURL(join(import.meta.dirname, 'bounded-launch.mjs')).href;
    const launch = `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`;
    const proof = spawn(process.execPath, ['--input-type=module', '-e',
      `const { spawnBounded } = await import(${JSON.stringify(module)}); await spawnBounded(process.execPath, ['-e', ${JSON.stringify(launch)}], { timeoutMs: 60_000 });`,
    ], { stdio: 'ignore', detached: true });
    try {
      for (let i = 0; i < 200 && !existsSync(pidFile); i += 1) await new Promise((r) => setTimeout(r, 50));
      const launched = Number(readFileSync(pidFile, 'utf8'));
      expect(alive(launched)).toBe(true);
      const died = new Promise<{ code: number | null; signal: string | null }>((resolve) => proof.once('exit', (code, signal) => resolve({ code, signal })));
      process.kill(-proof.pid!, sig); // the proof's whole group, as a terminal sends it
      expect(await died).toEqual({ code: null, signal: sig });
      for (let i = 0; i < 50 && alive(launched); i += 1) await new Promise((r) => setTimeout(r, 50));
      expect(alive(launched)).toBe(false);
    } finally {
      try { process.kill(-proof.pid!, 'SIGKILL'); } catch { /* gone */ }
      if (existsSync(pidFile)) { try { process.kill(Number(readFileSync(pidFile, 'utf8')), 'SIGKILL'); } catch { /* gone */ } }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('logTail keeps the last non-empty lines', () => {
    expect(logTail('a\n\nb\nc\n', 2)).toBe('b\nc');
  });
});
