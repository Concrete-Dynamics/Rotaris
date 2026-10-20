import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { millis, type MachineId } from '@rotaris/kernel';
import { nodeClocks } from './clock.js';
import type * as Document from './document.js';

/**
 * ADR-0055: "the endpoint is listening before the record is written, not after" (REQ-STARTUP-161, REQ-STARTUP-164).
 * `exclusiveCreate` is wrapped so the test stands where a second launch stands: at the very moment the record is
 * written, it looks for the endpoint the record names and connects to it. Until fin34 the record came first and the
 * connection was refused (`docs/defects/fixed/the-instance-record-is-written-before-its-endpoint-listens.md`).
 */
type Watcher = (target: string, content: string) => void;
let atRecordWrite: Watcher | undefined;
vi.mock('./document.js', async (importOriginal) => {
  const original = await importOriginal<typeof Document>();
  return {
    ...original,
    exclusiveCreate: (target: string, content: string) => {
      atRecordWrite?.(target, content);
      return original.exclusiveCreate(target, content);
    },
  };
});
const { claimInstance } = await import('./instance.js');
const { probePid } = await import('./liveness.js');

const clocks = nodeClocks();
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-order-')); });
afterEach(() => { atRecordWrite = undefined; rmSync(dir, { recursive: true, force: true }); });

const deps = (pid: number) => ({
  recordFile: join(dir, 'instance.json'), endpointDir: dir, socketDir: dir, machineId: 'machine-test' as MachineId, pid,
  wall: clocks.wall, timers: clocks.timers, handOverIntervalMs: millis(2_000), onHandOver: () => undefined,
});

describe('the claim\'s order — ADR-0055, REQ-STARTUP-161, REQ-STARTUP-164', () => {
  it.skipIf(process.platform === 'win32')('the endpoint the record names is already accepting when the record is written', async () => {
    const seen: { endpoint: string; existed: boolean; connected: Promise<boolean> }[] = [];
    atRecordWrite = (_target, content) => {
      const endpoint = (JSON.parse(content) as { endpoint: string }).endpoint;
      // What a second launch reading the record at this instant does: connect to the address it names.
      const connected = new Promise<boolean>((resolve) => {
        const sock = connect(endpoint);
        sock.once('connect', () => { sock.destroy(); resolve(true); });
        sock.once('error', () => resolve(false));
      });
      seen.push({ endpoint, existed: existsSync(endpoint), connected });
    };
    const claim = await claimInstance(deps(process.pid));
    expect(claim.outcome).toBe('instance');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.existed).toBe(true);
    expect(await seen[0]?.connected).toBe(true);
    if (claim.outcome === 'instance') await claim.close();
  });

  it.skipIf(process.platform === 'win32')('a launch that loses the claim closes the endpoint it opened first: no socket of its own is left', async () => {
    const first = await claimInstance(deps(process.ppid));
    if (first.outcome !== 'instance') throw new Error(first.outcome);
    const second = await claimInstance(deps(process.pid), { workspace: '/w' });
    expect(second.outcome).toBe('handed-over');
    const sockets = readdirSync(dir).filter((f) => f.endsWith('.sock'));
    expect(sockets).toEqual([first.record.endpoint.slice(dir.length + 1)]);
    await first.close();
    expect(readdirSync(dir).filter((f) => f.endsWith('.sock'))).toEqual([]);
  });

  // OQ-248 (R-072, 2026-10-13): what an attempt creates to hold its endpoint is the record's, and a launch that is handed over
  // leaves nothing behind — on the temporary-directory fallback too, where the directory below the temporary one was shared
  // and never removed (docs/defects/fixed/a-handed-over-launch-can-leave-the-private-socket-directory-behind.md).
  it.skipIf(process.platform === 'win32')('on the temporary-directory fallback a handed-over launch leaves nothing behind, and the instance takes its own directory with it when it closes', async () => {
    const temp = join(dir, 'tmp');
    mkdirSync(temp);
    const deep = join(dir, 'a'.repeat(60), 'b'.repeat(60));
    mkdirSync(deep, { recursive: true });
    const fallback = (pid: number) => {
      // As production claims: no socket directory of its own, no runtime directory, a data directory too deep for a socket.
      const { socketDir: _named, ...rest } = deps(pid);
      return { ...rest, endpointDir: deep, tempDirs: [temp], env: {} };
    };
    const first = await claimInstance(fallback(process.ppid));
    if (first.outcome !== 'instance') throw new Error(first.outcome);
    const own = dirname(first.record.endpoint);
    expect(dirname(own)).toBe(temp);
    const second = await claimInstance(fallback(process.pid), { workspace: '/w' });
    expect(second.outcome).toBe('handed-over');
    // Only the instance's own directory, holding only its own socket.
    expect(readdirSync(temp)).toEqual([basename(own)]);
    expect(readdirSync(own)).toEqual([basename(first.record.endpoint)]);
    await first.close();
    expect(readdirSync(temp)).toEqual([]);
  });
});

/**
 * The same order on Windows, where the endpoint is a named pipe (the Windows ARM64 session's C6, 2026-10-21). A pipe is not a
 * file: `existsSync` on one opens it as a client and spends one of its connections, so these cases ask only by connecting.
 */
const WIN = process.platform === 'win32';
/** Whether a client can connect to `endpoint` now: true when the pipe is listening, false when it is gone. */
const accepts = (endpoint: string): Promise<boolean> => new Promise((resolve) => {
  const sock = connect(endpoint);
  sock.once('connect', () => { sock.destroy(); resolve(true); });
  sock.once('error', () => resolve(false));
});
const PIPE = (pid: number) => new RegExp(String.raw`^\\\\\.\\pipe\\rotaris-[0-9a-f]{16}-${pid}-[0-9a-f]{8}$`);

describe('the claim\'s order on Windows, over a named pipe — ADR-0055, REQ-STARTUP-161, REQ-STARTUP-164, OQ-248', () => {
  it.runIf(WIN)('(a) the pipe the record names is already accepting when the record is written, and is named for this data directory and pid', async () => {
    const seen: { endpoint: string; connected: Promise<boolean> }[] = [];
    atRecordWrite = (_target, content) => {
      const endpoint = (JSON.parse(content) as { endpoint: string }).endpoint;
      seen.push({ endpoint, connected: accepts(endpoint) });
    };
    const claim = await claimInstance(deps(process.pid));
    expect(claim.outcome).toBe('instance');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.endpoint).toMatch(PIPE(process.pid));
    expect(await seen[0]?.connected).toBe(true);
    if (claim.outcome === 'instance') await claim.close();
  });

  it.runIf(WIN)('(b) a launch that loses the claim closes the pipe it opened first, and the directory holds only the record', async () => {
    const first = await claimInstance(deps(process.ppid));
    if (first.outcome !== 'instance') throw new Error(first.outcome);
    const opened: string[] = [];
    atRecordWrite = (_target, content) => { opened.push((JSON.parse(content) as { endpoint: string }).endpoint); };
    const second = await claimInstance(deps(process.pid), { workspace: 'C:\w' });
    expect(second.outcome).toBe('handed-over');
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatch(PIPE(process.pid));
    expect(await accepts(opened[0]!)).toBe(false);
    expect(readdirSync(dir)).toEqual(['instance.json']);
    expect(await accepts(first.record.endpoint)).toBe(true);
    await first.close();
    expect(await accepts(first.record.endpoint)).toBe(false);
  });

  it.runIf(WIN)('(c) a holder ended with TerminateProcess leaves no pipe, and the next claim takes the record', async () => {
    // A holder in a process of its own: it listens on a pipe named as the claim names one, then writes the record naming it.
    const holder = spawn(process.execPath, ['-e', String.raw`
      const { createHash, randomBytes } = require('node:crypto'); const { createServer } = require('node:net'); const { writeFileSync } = require('node:fs');
      const dir = ${JSON.stringify(dir)};
      const endpoint = '\\\\.\\pipe\\rotaris-' + createHash('sha256').update(dir).digest('hex').slice(0, 16) + '-' + process.pid + '-' + randomBytes(4).toString('hex');
      createServer(() => undefined).listen(endpoint, () => {
        writeFileSync(require('node:path').join(dir, 'instance.json'), JSON.stringify({ pid: process.pid, host: 'machine-test', acquired_at: new Date().toISOString(), endpoint }) + '\n');
        process.stdout.write(endpoint + '\n');
      });
      setInterval(() => undefined, 1000);
    `], { stdio: ['ignore', 'pipe', 'inherit'] });
    const endpoint = await new Promise<string>((resolve) => { holder.stdout!.once('data', (d: Buffer) => resolve(d.toString().trim())); });
    expect(endpoint).toMatch(PIPE(holder.pid!));
    expect(await accepts(endpoint)).toBe(true);
    const exited = new Promise((resolve) => holder.once('exit', resolve));
    holder.kill(); // Windows: TerminateProcess
    await exited;
    expect(await accepts(endpoint)).toBe(false);
    const claim = await claimInstance(deps(process.pid));
    expect(claim.outcome).toBe('instance');
    if (claim.outcome === 'instance') {
      expect(claim.record.pid).toBe(process.pid);
      await claim.close();
    }
  });

  it.runIf(WIN)('(d) probePid reads a process dead once it has exited, and once it is terminated while another process holds its handle', async () => {
    const codeOf = (pid: number): string => { try { process.kill(pid, 0); return 'alive'; } catch (e) { return (e as NodeJS.ErrnoException).code ?? 'unknown'; } };
    const exitedChild = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
    await new Promise((resolve) => exitedChild.once('exit', resolve));
    expect(probePid(exitedChild.pid!)).toBe('dead');
    const afterExit = codeOf(exitedChild.pid!);

    // A second process holds a handle on the target, as a task manager or a debugger would, before the target is terminated.
    const target = spawn(process.execPath, ['-e', 'setInterval(() => undefined, 1000)'], { stdio: 'ignore' });
    const keeper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$p = Get-Process -Id ${target.pid}; $null = $p.Handle; 'held'; Start-Sleep -Seconds 60`], { stdio: ['ignore', 'pipe', 'ignore'] });
    try {
      await new Promise((resolve) => { keeper.stdout!.once('data', resolve); });
      const ended = new Promise((resolve) => target.once('exit', resolve));
      target.kill();
      await ended;
      expect(probePid(target.pid!)).toBe('dead');
      const whileHeld = codeOf(target.pid!);
      // Which code Windows answered is the reading (ESRCH or EINVAL; probePid reads both as dead on win32).
      expect(['ESRCH', 'EINVAL']).toContain(afterExit);
      expect(['ESRCH', 'EINVAL']).toContain(whileHeld);
      console.log(`probePid on Windows: after exit ${afterExit}; terminated with a handle held ${whileHeld}`);
    } finally {
      keeper.kill();
    }
  }, 30_000);
});
