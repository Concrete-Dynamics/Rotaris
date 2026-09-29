/**
 * R-062: the driver client's waiting and ending, pinned without the app. `stopApp` and `connectOrEnd` are pinned
 * against REAL child processes and a REAL socket that accepts and never answers — the shape of a main process that
 * has stopped serving its driver — because what is pinned is that no step of ending a driven launch waits without a
 * bound; and that a store wait a proof has given up on stops polling.
 * No product code runs here.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error — the module is plain ESM beside the scripts that run it.
import { connect, connectOrEnd, stopApp, stopOverrunMessage, until, within } from './driver.mjs';

const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch { return false; } };
const cleanups: (() => void)[] = [];
afterEach(() => { while (cleanups.length > 0) cleanups.pop()!(); });

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'driver-test-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A node child that stays up until signalled; `onTerm` is what it does with SIGTERM. */
function sleeper(onTerm = 'process.exit(0)'): ChildProcess {
  const child = spawn(process.execPath, ['-e', `process.on('SIGTERM', () => { ${onTerm} }); setInterval(() => {}, 1000);`], { stdio: 'ignore' });
  cleanups.push(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } });
  return child;
}

/**
 * A loopback driver endpoint. `answer` null: it accepts and never replies (a main process that stopped serving).
 * Otherwise it replies `{ ok: true }` to every request.
 */
async function endpoint(dir: string, { answer }: { answer: boolean }): Promise<string> {
  const sockets: Socket[] = [];
  const server: Server = createServer((socket) => {
    sockets.push(socket);
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      for (let nl = buffer.indexOf('\n'); nl !== -1; nl = buffer.indexOf('\n')) {
        const request = JSON.parse(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (answer) socket.write(`${JSON.stringify({ id: request.id, ok: true, value: null })}\n`);
      }
    });
    socket.on('error', () => undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => { for (const s of sockets) s.destroy(); server.close(); });
  const file = join(dir, 'endpoint.json');
  writeFileSync(file, JSON.stringify({ port: (server.address() as { port: number }).port, token: 't' }));
  return file;
}

describe('R-062: a driven launch ends within a bound', () => {
  it('within answers null when the request is not answered in time, and the value or the error when it is', async () => {
    expect(await within(new Promise(() => undefined), 50)).toBeNull();
    expect(await within(Promise.resolve(7), 50)).toEqual({ value: 7 });
    const refused = await within(Promise.reject(new Error('no')), 50);
    expect((refused as { error: Error }).error.message).toBe('no');
  });

  it('stopApp ends a launch whose driver accepts and never answers — the picture, the quit, SIGTERM — and says so', async () => {
    const dir = scratch();
    const driver = await connect(await endpoint(dir, { answer: false }), { timeoutMs: 5_000 });
    const child = sleeper();
    const started = Date.now();
    const stopped = await stopApp({ child, driver }, { graceMs: 300, quitMs: 300, screenshot: join(dir, 'end.png') });
    // 300 (picture) + 300 (quit) + 300 (exit) + SIGTERM's answer: bounded, where the first form waited on the quit forever.
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(stopped.screenshot).toBe('unanswered within 300 ms');
    expect(stopped.quitAnswered).toBe(false);
    expect(stopped.overran).toMatchObject({ quitAnswered: false, quitMs: 300, afterQuitMs: 300, endedBy: 'SIGTERM' });
    expect(alive(child.pid!)).toBe(false);
    expect(stopOverrunMessage('override', stopped, 'first\nlast words\n')).toMatch(/^override did not answer the driver's quit within 300 ms, nor exit 300 ms after it: SIGTERM ended it after \d+ ms\.\n--- the launch's last words ---\nfirst\nlast words$/);
  });

  it.skipIf(process.platform === 'win32')('stopApp SIGKILLs a launch that neither answers nor takes SIGTERM', async () => {
    const dir = scratch();
    const driver = await connect(await endpoint(dir, { answer: false }), { timeoutMs: 5_000 });
    const child = sleeper('/* ignored */');
    await new Promise((r) => setTimeout(r, 200)); // the handler in place before the signal
    const started = Date.now();
    const stopped = await stopApp({ child, driver }, { graceMs: 300, quitMs: 300 });
    expect(Date.now() - started).toBeLessThan(8_000);
    expect(stopped.overran).toMatchObject({ endedBy: 'SIGKILL' });
    expect(stopped.exit).toEqual({ code: null, signal: 'SIGKILL' });
    expect(stopOverrunMessage('launch', stopped, 'x')).toContain('SIGTERM did not end it within');
  });

  it('stopApp reports nothing overrun for a launch that answers the quit and exits', async () => {
    const dir = scratch();
    const driver = await connect(await endpoint(dir, { answer: true }), { timeoutMs: 5_000 });
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 100);'], { stdio: 'ignore' });
    const stopped = await stopApp({ child, driver }, { graceMs: 5_000, quitMs: 1_000, screenshot: join(dir, 'end.png') });
    expect(stopped).toMatchObject({ overran: null, quitAnswered: true, screenshot: 'taken', exit: { code: 0, signal: null } });
  });

  it('connectOrEnd ends a launch that writes no endpoint, before the failure is thrown, and names what ended it', async () => {
    const dir = scratch();
    const log = join(dir, 'app.log');
    writeFileSync(log, 'booting\nstill booting\n');
    const child = sleeper();
    await new Promise((r) => setTimeout(r, 200));
    const failure = await connectOrEnd(child, join(dir, 'endpoint.json'), log, { timeoutMs: 300, graceMs: 2_000 }).then(() => null, (e: Error) => e);
    expect(failure?.message).toMatch(/wrote no driver endpoint .* within 300 ms; the launch was ended: SIGTERM ended it after \d+ ms\n--- the app's last words ---\nbooting\nstill booting$/);
    // Ended BEFORE the throw: nothing is left holding the proof's event loop open.
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  });
});

describe('R-062: a wait given up on stops', () => {
  it('until stops at its next poll once its signal is aborted', async () => {
    const controller = new AbortController();
    const waiting = until(async () => 'draft', () => false, { timeoutMs: 60_000, intervalMs: 10, what: 'the session settling', signal: controller.signal });
    controller.abort(new Error('the launch was given up'));
    await expect(waiting).rejects.toThrow('the session settling: abandoned (the launch was given up)');
  });
});
