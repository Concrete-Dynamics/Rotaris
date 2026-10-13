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
import { drainGroup, endOverrun, exitWithin, logTail, overrunMessage, spawnBounded } from './bounded-launch.mjs';

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

/** A process's state letter from `/proc/<pid>/stat` (`R`, `S`, `Z`, …), or `null` when it has no entry: on Linux only. */
const PROC = process.platform === 'linux' && existsSync('/proc/self/stat');
function procState(pid: number): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3); // the field after `(comm)`, which may hold `)`
  } catch {
    return null;
  }
}

/**
 * Whether the process is still running. One that has exited but is not yet reaped is a zombie, and `kill(pid, 0)` still
 * finds it; once its parent is gone only PID 1 reaps it, which this container's init did 1.7 to 1.8 s after a dead
 * proof's launch had become one (measured 2026-10-01), later under load. A zombie runs nothing and holds nothing but its
 * pid, so where `/proc` says so it counts as gone; elsewhere `kill(pid, 0)` decides.
 */
function alive(pid: number): boolean {
  if (PROC) {
    const state = procState(pid);
    return state !== null && state !== 'Z' && state !== 'X';
  }
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/**
 * Whether the process is gone within `ms`, polled on a deadline. The bound asks THAT the process dies, not how fast a
 * loaded host gets round to it — well inside the 30 s test timeout, and far past anything a live handler needs.
 */
const GONE_WITHIN_MS = 15_000;
async function goneWithin(pid: number, ms = GONE_WITHIN_MS): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (alive(pid)) {
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 50));
  }
  return true;
}

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
    // The SIGKILL lands at once; the grandchild, orphaned, is reaped by PID 1 on its own schedule, so wait on a deadline.
    expect(await goneWithin(grandchild)).toBe(true);
  });

  it('spawnBounded returns a launch that ends by itself as spawnSync would, with nothing overrun', async () => {
    const r = await spawnBounded(process.execPath, ['-e', "console.log('out'); console.error('err'); process.exit(4);"], { timeoutMs: 10_000 });
    expect(r).toMatchObject({ status: 4, signal: null, overran: null });
    expect(r.stdout).toBe('out\n');
    expect(r.stderr).toBe('err\n');
  });

  it.skipIf(!POSIX)('spawnBounded keeps the pipes open across SIGTERM, so the quit path\'s own line reaches the proof', async () => {
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
      // Not "within 2.5 s": the launch dies at once, and a loaded host's PID 1 reaps it when it reaps it
      // (`docs/defects/fixed/the-signal-test-gives-a-dead-proofs-launch-two-and-a-half-seconds-to-be-gone.md`).
      expect(await goneWithin(launched)).toBe(true);
    } finally {
      try { process.kill(-proof.pid!, 'SIGKILL'); } catch { /* gone */ }
      if (existsSync(pidFile)) { try { process.kill(Number(readFileSync(pidFile, 'utf8')), 'SIGKILL'); } catch { /* gone */ } }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!PROC)('counts a process that has exited but is not yet reaped as gone, where kill(pid, 0) still finds it', async () => {
    // `sh` starts a child and execs into `sleep`, which never waits for it, so the child, once it exits, stays a zombie.
    // The child must not exit before the exec: a shell that is still a shell reaps it, and no zombie is left. So it blocks
    // on a pipe from the test (fd 3: a non-interactive shell gives an asynchronous list /dev/null as its standard input),
    // and the test closes its end only once the holder reads as `sleep`.
    const holder = spawn('sh', ['-c', '(read _ <&3) & echo $!; exec sleep 30'], { stdio: ['ignore', 'pipe', 'ignore', 'pipe'] });
    const until = async (done: () => boolean, ms = 10_000): Promise<void> => {
      for (const deadline = Date.now() + ms; !done() && Date.now() < deadline;) await new Promise((r) => setTimeout(r, 20));
    };
    const comm = (pid: number): string | null => { try { return readFileSync(`/proc/${pid}/comm`, 'utf8').trim(); } catch { return null; } };
    try {
      const zombie = await new Promise<number>((resolve) => holder.stdout!.once('data', (d) => resolve(Number(String(d).trim()))));
      expect(zombie).toBeGreaterThan(0);
      await until(() => comm(holder.pid!) === 'sleep');
      expect(comm(holder.pid!)).toBe('sleep');
      expect(alive(zombie)).toBe(true); // still blocked on the pipe: running, so not gone
      (holder.stdio[3] as NodeJS.WritableStream & { destroy(): void }).destroy(); // EOF: the child's `read` returns and it exits
      await until(() => procState(zombie) === 'Z');
      expect(procState(zombie)).toBe('Z');
      expect(() => process.kill(zombie, 0)).not.toThrow(); // what the check used to ask, and why it waited on PID 1's reaping
      expect(alive(zombie)).toBe(false);
    } finally {
      holder.kill('SIGKILL');
    }
  });

  /*
   * finacc3 A2-19 (docs/defects/fixed/a-proof-exits-while-processes-of-the-app-it-launched-still-run.md): a launch's main
   * process exited and the proof moved on while the rest of its process group still ran — Electron's zygotes, its GPU,
   * utility and renderer processes, and a `git diff --numstat` the Git view had started — so the next proof could meet
   * them. A launch now ends with its whole group: what outlives the leader by the grace is ended with SIGKILL and named.
   */
  it.skipIf(!POSIX)('spawnBounded ends a member of the launch\'s group that outlives a leader which exited by itself, and names it', async () => {
    const r = await spawnBounded(process.execPath, ['-e', "const { spawn } = require('node:child_process'); const g = spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);\", 'lingering-member'], { stdio: 'ignore' }); console.log('member ' + g.pid); process.exit(0);"], { timeoutMs: 10_000, groupGraceMs: 300 });
    const member = Number(/member (\d+)/.exec(r.stdout)?.[1] ?? 0);
    try {
      expect(member).toBeGreaterThan(0);
      expect(r).toMatchObject({ status: 0, overran: null });
      expect(r.group).toMatchObject({ endedBy: 'SIGKILL' });
      expect(r.group.lingered.some((l: string) => l.includes('lingering-member'))).toBe(true);
      expect(await goneWithin(member, 5_000)).toBe(true);
    } finally {
      try { process.kill(member, 'SIGKILL'); } catch { /* gone */ }
    }
  });

  /*
   * fin34 (docs/defects/fixed/a-proof-can-exit-while-a-setup-step-the-app-started-in-its-own-process-group-is-still-ending.md):
   * the product starts a project-setup step leading a process group of its own, which the group drain never reached, so a
   * proof could exit — and the next one start — while the step was still ending. The drain now finds what the launch
   * started by the mark its environment carries, and ends what outlives the grace.
   */
  it.skipIf(!PROC)('spawnBounded ends what the launch started in a process group of its own once it outlives the grace, and names it', async () => {
    const mark = `/tmp/bounded-launch-mark-${process.pid}-${Date.now()}`;
    const leader = "const { spawn } = require('node:child_process'); const g = spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);\", 'own-group-step'], { stdio: 'ignore', detached: true }); g.unref(); console.log('step ' + g.pid); process.exit(0);";
    const r = await spawnBounded(process.execPath, ['-e', leader], { timeoutMs: 10_000, groupGraceMs: 300, env: { ...process.env, XDG_DATA_HOME: mark } });
    const step = Number(/step (\d+)/.exec(r.stdout)?.[1] ?? 0);
    try {
      expect(step).toBeGreaterThan(0);
      // The launch's own group left at once: the step leads another group, which the group drain does not reach.
      expect(r.group).toMatchObject({ endedBy: null, lingered: [] });
      expect(r.group.ownGroups).toMatchObject({ endedBy: 'SIGKILL' });
      expect(r.group.ownGroups.lingered.some((l: string) => l.includes('own-group-step'))).toBe(true);
      expect(await goneWithin(step, 5_000)).toBe(true);
    } finally {
      try { process.kill(step, 'SIGKILL'); } catch { /* gone */ }
    }
  }, 30_000);

  it.skipIf(!PROC)('what the launch started in a group of its own and ends within the grace is left alone', async () => {
    const mark = `/tmp/bounded-launch-mark-${process.pid}-${Date.now()}-quick`;
    const leader = "const { spawn } = require('node:child_process'); const g = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 400)'], { stdio: 'ignore', detached: true }); g.unref(); process.exit(0);";
    const r = await spawnBounded(process.execPath, ['-e', leader], { timeoutMs: 10_000, groupGraceMs: 300, env: { ...process.env, XDG_DATA_HOME: mark } });
    expect(r.group.ownGroups === null || r.group.ownGroups.endedBy === null).toBe(true);
  }, 30_000);

  it.skipIf(!POSIX)('a proof with nothing else left to wait on still finishes the drain: its top-level await settles', async () => {
    // The first form waited on unreferenced timers: a scratch loop's `await spawnBounded(…)` ended its process with exit
    // 13, "unsettled top-level await", the moment the leader was gone and only the drain was left.
    const module = pathToFileURL(join(import.meta.dirname, 'bounded-launch.mjs')).href;
    const leader = "const { spawn } = require('node:child_process'); spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);\"], { stdio: 'ignore' }); process.exit(0);";
    const proof = spawn(process.execPath, ['--input-type=module', '-e',
      `const { spawnBounded } = await import(${JSON.stringify(module)}); const r = await spawnBounded(process.execPath, ['-e', ${JSON.stringify(leader)}], { timeoutMs: 10_000, groupGraceMs: 300 }); console.log('drained ' + r.group.endedBy);`,
    ], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    proof.stdout!.setEncoding('utf8').on('data', (c: string) => { out += c; });
    const exit = await new Promise<number | null>((resolve) => proof.once('exit', (code) => resolve(code)));
    expect({ exit, out: out.trim() }).toEqual({ exit: 0, out: 'drained SIGKILL' });
  });

  it.skipIf(!POSIX)('drainGroup leaves a group whose members end inside the grace alone, and says nothing lingered', async () => {
    const leader = await child(
      "const { spawn } = require('node:child_process');"
      + " spawn(process.execPath, ['-e', 'setTimeout(() => {}, 200)'], { stdio: 'ignore' });"
      + " console.log('ready'); setTimeout(() => process.exit(0), 50);",
      { detached: true },
    );
    await exitWithin(leader, 5_000);
    const drained = await drainGroup(leader, { graceMs: 5_000 });
    // Left by itself well inside the grace: a member that has exited and waits on PID 1's reaping counts as gone.
    expect(drained).toMatchObject({ endedBy: null, lingered: [] });
    expect(drained.afterMs).toBeLessThan(5_000);
  });

  it('logTail keeps the last non-empty lines', () => {
    expect(logTail('a\n\nb\nc\n', 2)).toBe('b\nc');
  });
});
