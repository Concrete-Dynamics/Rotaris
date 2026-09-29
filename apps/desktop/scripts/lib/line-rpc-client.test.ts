/**
 * `code-intel-proof`'s branch client (ADR-0035 c.1, REQ-MCP-033): a request never outlives the child. Pinned against a
 * fake child process — a branch that exits before answering, one that answers and then exits, one that answers only
 * after the guard killed it — so the proof's section 1 fails in seconds with the child's own exit status and standard
 * error rather than waiting for ever (`docs/defects/fixed/code-intel-proofs-branch-client-waits-forever-on-a-child-that-has-exited.md`).
 */
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error — the client is plain ESM beside the scripts that run it.
import { lineRpcClient, stderrTail, STDERR_TAIL_CHARS } from './line-rpc-client.mjs';

class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode: string | null = null;
  /** The request lines the client wrote, parsed. */
  readonly received: Array<{ id?: number; method: string; params?: unknown }> = [];
  readonly kill = vi.fn((signal: string = 'SIGTERM') => { this.die(null, signal); return true; });

  constructor() {
    super();
    let buf = '';
    this.stdin.setEncoding('utf8');
    this.stdin.on('data', (d: string) => {
      buf += d;
      for (let nl = buf.indexOf('\n'); nl !== -1; nl = buf.indexOf('\n')) { this.received.push(JSON.parse(buf.slice(0, nl))); buf = buf.slice(nl + 1); }
    });
  }

  answer(id: number, result: unknown): void { this.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`); }

  /** The process exits; unless `keepPipe` (a grandchild holding standard output open), its streams close and `close` follows. */
  die(code: number | null, signal: string | null = null, { keepPipe = false } = {}): void {
    if (this.exitCode !== null || this.signalCode !== null) return;
    this.exitCode = code; this.signalCode = signal;
    this.emit('exit', code, signal);
    if (keepPipe) return;
    this.stdout.end(); this.stderr.end();
    setImmediate(() => this.emit('close', code, signal));
  }
}

const tick = () => new Promise((r) => setImmediate(r));
const until = async (cond: () => boolean) => { for (let i = 0; i < 500 && !cond(); i += 1) await new Promise((r) => setTimeout(r, 2)); };
const INIT = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'code-intel-proof', version: '0' } };

describe('a branch that exits before answering fails the request, with its exit and its standard error (ADR-0035 c.1, REQ-MCP-033)', () => {
  it('initialize rejects with the exit status and the stderr the child wrote', async () => {
    const child = new FakeChild();
    const rpc = lineRpcClient(child);
    const init = rpc.send('initialize', INIT);
    child.stderr.write('Running as root without --no-sandbox is not supported\n');
    await tick();
    child.die(133, null);
    const started = Date.now();
    await expect(init).rejects.toThrow(/initialize \(#1\) got no answer: the child exited with code 133 at \d+ ms before answering; standard error: Running as root without --no-sandbox is not supported/);
    // settled on `close`, not at the grace: well inside a second
    expect(Date.now() - started).toBeLessThan(500);
    expect(await rpc.exited).toMatchObject({ code: 133, signal: null });
    expect(rpc.pendingCount).toBe(0);
  });

  it('a signal is named as the signal', async () => {
    const child = new FakeChild();
    const rpc = lineRpcClient(child);
    const init = rpc.send('initialize', INIT);
    child.die(null, 'SIGTRAP');
    await expect(init).rejects.toThrow(/exited with signal SIGTRAP .* standard error was empty/);
  });

  it('when a grandchild keeps standard output open, the request still rejects once the exit grace has passed', async () => {
    const child = new FakeChild();
    const rpc = lineRpcClient(child, { exitGraceMs: 25 });
    const init = rpc.send('initialize', INIT);
    child.die(1, null, { keepPipe: true });
    await expect(init).rejects.toThrow(/exited with code 1/);
  });

  it('a request sent after the exit rejects at once, and a child already gone when the client was made is seen', async () => {
    const child = new FakeChild();
    child.exitCode = 2;
    const rpc = lineRpcClient(child, { exitGraceMs: 10 });
    expect(await rpc.exited).toMatchObject({ code: 2 });
    await until(() => rpc.ended !== null);
    await expect(rpc.send('tools/list', {})).rejects.toThrow(/tools\/list \(#1\) was not sent: the child exited with code 2/);
    expect(child.received).toEqual([]);
  });

  it('a child that fails to start rejects the pending request with the failure and still settles its exit', async () => {
    const child = new FakeChild();
    const rpc = lineRpcClient(child);
    const init = rpc.send('initialize', INIT);
    child.emit('error', Object.assign(new Error('spawn /no/such/electron ENOENT'), { code: 'ENOENT' }));
    await expect(init).rejects.toThrow(/the child failed: spawn \/no\/such\/electron ENOENT/);
    expect(await rpc.exited).toMatchObject({ code: null, signal: null });
  });

  it('a broken standard input is part of the reason, never an unhandled error', async () => {
    const child = new FakeChild();
    const rpc = lineRpcClient(child);
    const init = rpc.send('initialize', INIT);
    child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
    child.die(1);
    await expect(init).rejects.toThrow(/writing to it failed: write EPIPE/);
  });

  it('a long standard error is carried as its tail', () => {
    const long = `${'x'.repeat(STDERR_TAIL_CHARS)}THE-END`;
    expect(stderrTail(long)).toMatch(new RegExp(`^standard error \\(last ${STDERR_TAIL_CHARS} of ${long.length} characters\\): …x+THE-END$`));
    expect(stderrTail('  \n')).toBe('standard error was empty');
  });
});

describe('a branch that answers and then exits is read whole (ADR-0035 c.1, REQ-MCP-033)', () => {
  it('initialize and tools/list resolve, the preamble and the exit are recorded', async () => {
    const child = new FakeChild();
    const rpc = lineRpcClient(child);
    // Electron's CR LF before the first message (ADR-0035: the one tolerated preamble)
    child.stdout.write('\r\n');
    const init = rpc.send('initialize', INIT);
    await until(() => child.received.length === 1);
    expect(child.received[0]).toMatchObject({ id: 1, method: 'initialize' });
    child.answer(1, { serverInfo: { name: 'serena' }, protocolVersion: '2025-06-18' });
    expect(await init).toMatchObject({ serverInfo: { name: 'serena' } });
    rpc.notify('notifications/initialized', {});
    const list = rpc.send('tools/list', {});
    await until(() => child.received.length === 3);
    expect(child.received.map((m) => m.method)).toEqual(['initialize', 'notifications/initialized', 'tools/list']);
    expect(child.received[1]).not.toHaveProperty('id');
    child.stdout.write('not json at all\n');
    child.answer(2, { tools: [{ name: 'list_memories' }] });
    expect(await list).toEqual({ tools: [{ name: 'list_memories' }] });
    rpc.close();
    child.die(0);
    expect(await rpc.exited).toMatchObject({ code: 0, signal: null });
    expect(Buffer.from(rpc.preamble ?? '').toString('hex')).toBe('0d0a');
    expect(rpc.nonJsonLines).toEqual(['not json at all']);
    expect(rpc.firstByteAt).not.toBeNull();
    // after the exit nothing can be answered: the next request rejects at once
    await until(() => rpc.ended !== null);
    await expect(rpc.send('tools/list', {})).rejects.toThrow(/was not sent: the child exited with code 0/);
  });

  it('an answer written as the child exits is still read before the pending requests reject', async () => {
    const child = new FakeChild();
    const rpc = lineRpcClient(child, { exitGraceMs: 200 });
    const init = rpc.send('initialize', INIT);
    await until(() => child.received.length === 1);
    // `exit` can precede the last `data` event: the process is gone, its pipe not yet drained
    child.exitCode = 0;
    child.emit('exit', 0, null);
    child.answer(1, { ok: true });
    child.stdout.end(); child.stderr.end();
    setImmediate(() => child.emit('close', 0, null));
    expect(await init).toEqual({ ok: true });
  });

  it('an error answer rejects with the error the server sent', async () => {
    const child = new FakeChild();
    const rpc = lineRpcClient(child);
    const call = rpc.send('tools/call', { name: 'get_symbols_overview' });
    await until(() => child.received.length === 1);
    child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'no such tool' } })}\n`);
    await expect(call).rejects.toThrow(/tools\/call \(#1\) answered with an error: .*no such tool/);
  });
});

describe('a branch that answers only after the guard is killed, and the late answer is ignored (ADR-0035 c.1, REQ-MCP-033)', () => {
  it('the guard kills the child and rejects every pending request at once', async () => {
    const child = new FakeChild();
    child.kill.mockImplementation(() => true); // the kill is sent; the process has not gone yet
    const rpc = lineRpcClient(child, { guardMs: 30 });
    child.stderr.write('still indexing\n');
    const init = rpc.send('initialize', INIT);
    const list = rpc.send('tools/list', {});
    await expect(init).rejects.toThrow(/initialize \(#1\) got no answer: the guard killed the child after 30 ms \(it has not exited\); standard error: still indexing/);
    await expect(list).rejects.toThrow(/tools\/list \(#2\) got no answer: the guard killed the child after 30 ms/);
    expect(child.kill).toHaveBeenCalledTimes(1);
    // the answer arrives late: nothing is resolved twice, nothing throws, it is counted
    child.answer(1, { serverInfo: { name: 'late' } });
    await until(() => rpc.lateAnswers === 1);
    expect(rpc.lateAnswers).toBe(1);
    child.die(null, 'SIGTERM');
    expect(await rpc.exited).toMatchObject({ code: null, signal: 'SIGTERM' });
  });

  it('close disarms the guard: a child that answered in time is never killed', async () => {
    const child = new FakeChild();
    const rpc = lineRpcClient(child, { guardMs: 30 });
    const init = rpc.send('initialize', INIT);
    await until(() => child.received.length === 1);
    child.answer(1, {});
    await init;
    rpc.close();
    await new Promise((r) => setTimeout(r, 60));
    expect(child.kill).not.toHaveBeenCalled();
    child.die(0);
    expect(await rpc.exited).toMatchObject({ code: 0 });
  });
});
