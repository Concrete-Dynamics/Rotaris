/**
 * The recording proxy, against a real upstream on loopback.
 *
 * What is pinned here is the ONE property the proxy owes: it must not change what the product experiences. A
 * proxy that buffered a streamed completion would leave every assertion in the live run green while quietly
 * removing the streaming the product is built on — a harness that manufactures a product which only exists
 * while it is being measured, which is the failure mode `codebase.md` records this harness committing twice
 * before. So the streaming case asserts that chunks arrive SEPARATELY and before the upstream has finished,
 * not merely that the bytes are all there at the end.
 *
 * The rest is the record: bodies both ways, the status, and the credential never reaching the file.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — the proxy is plain ESM beside the scripts that run it.
import { startRecordingProxy } from './model-traffic.mjs';

interface Proxy {
  readonly url: string;
  sink: (path: string | null) => void;
  stats: () => { recorded: number; failed: number };
  close: () => Promise<void>;
}

const opened: { servers: Server[]; proxies: Proxy[]; dirs: string[] } = { servers: [], proxies: [], dirs: [] };

afterEach(async () => {
  for (const proxy of opened.proxies) await proxy.close();
  // `closeAllConnections` before `close`: a stalled case deliberately leaves a connection open, and `close`
  // alone waits for it — the teardown would hang on exactly the fault the test just proved works.
  for (const server of opened.servers) {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(() => r(undefined)));
  }
  for (const dir of opened.dirs) rmSync(dir, { recursive: true, force: true });
  opened.servers = [];
  opened.proxies = [];
  opened.dirs = [];
});

/** An upstream on loopback, mounted under `/v1` so the proxy's base-path prefixing is exercised too. */
async function upstream(handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void): Promise<string> {
  const server = createServer(handler);
  opened.servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the upstream did not bind a port');
  return `http://127.0.0.1:${address.port}/v1`;
}

async function proxyTo(upstreamUrl: string, faults: unknown[] = []): Promise<{ proxy: Proxy; sink: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'model-traffic-'));
  opened.dirs.push(dir);
  const proxy = (await startRecordingProxy({ upstreamUrl, redact: (s: string) => s, faults })) as Proxy;
  opened.proxies.push(proxy);
  const sink = join(dir, 'model-traffic.jsonl');
  proxy.sink(sink);
  return { proxy, sink };
}

/** A sink nothing was written to is no records, not an error — the blocked-loop case never creates the file. */
const records = (sink: string): Record<string, unknown>[] =>
  existsSync(sink) ? readFileSync(sink, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Record<string, unknown>) : [];

describe('the live run\'s recording proxy', () => {
  it('forwards a request body and a response body unchanged, and records both', async () => {
    let seenPath = '';
    let seenBody = '';
    const target = await upstream((req, res) => {
      seenPath = req.url ?? '';
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        seenBody = Buffer.concat(chunks).toString('utf8');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'hello' } }] }));
      });
    });
    const { sink } = await proxyTo(target);

    const sent = JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
    const answer = await fetch(`${(opened.proxies[0] as Proxy).url}/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer sk-secret-value-1234567890' }, body: sent,
    });
    const text = await answer.text();

    // The upstream saw the base path prefixed back on, and the body byte for byte.
    expect(seenPath).toBe('/v1/chat/completions');
    expect(seenBody).toBe(sent);
    expect(answer.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ choices: [{ message: { content: 'hello' } }] });

    const [record] = records(sink);
    expect(record['status']).toBe(200);
    expect(record['path']).toBe('/chat/completions');
    expect(record['upstream']).toBe(`${target}/chat/completions`);
    expect(record['requestBody']).toBe(sent);
    expect(JSON.parse(String(record['responseBody']))).toEqual({ choices: [{ message: { content: 'hello' } }] });
    expect(typeof record['ms']).toBe('number');
  });

  it('never writes a credential into the record', async () => {
    const target = await upstream((_req, res) => { res.writeHead(200); res.end('{}'); });
    const { sink } = await proxyTo(target);
    await fetch(`${(opened.proxies[0] as Proxy).url}/chat/completions`, {
      method: 'POST', headers: { authorization: 'Bearer sk-secret-value-1234567890', 'x-api-key': 'sk-another-secret-000000' }, body: '{}',
    });
    const [record] = records(sink);
    const headers = record['requestHeaders'] as Record<string, string>;
    expect(headers['authorization']).toBe('[redacted]');
    expect(headers['x-api-key']).toBe('[redacted]');
    expect(readFileSync(sink, 'utf8')).not.toContain('sk-secret-value');
    expect(readFileSync(sink, 'utf8')).not.toContain('sk-another-secret');
  });

  it('streams: a chunk reaches the client before the upstream has finished answering', async () => {
    // The upstream sends one chunk, waits, then sends the last. A buffering proxy delivers both at the end.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const target = await upstream((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: first\n\n');
      void held.then(() => { res.end('data: [DONE]\n\n'); });
    });
    const { sink } = await proxyTo(target);

    const answer = await fetch(`${(opened.proxies[0] as Proxy).url}/chat/completions`, { method: 'POST', body: '{}' });
    const reader = (answer.body as ReadableStream<Uint8Array>).getReader();

    // The decisive assertion: this read resolves while the upstream is still holding the connection open.
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('first');

    release();
    let rest = '';
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      rest += new TextDecoder().decode(next.value);
    }
    expect(rest).toContain('[DONE]');

    // And the record still holds the whole stream, joined.
    const [record] = records(sink);
    expect(record['responseBody']).toContain('first');
    expect(record['responseBody']).toContain('[DONE]');
  });

  /**
   * The arrangement the live run actually uses, and the one that broke it.
   *
   * The proxy is an in-process HTTP server and the app is a child process. If the harness waits for that child
   * with `spawnSync`, this process's event loop is blocked for the whole scenario and the server answers
   * nothing — the app's first model call hangs until its own wait expires. Both legs are asserted, not just the
   * working one: the failing leg is WHY `launch` in `live-run.mjs` must stay asynchronous, and a test that only
   * pinned the success would not say so. Measured before the repair: 0 requests served in 6 s.
   */
  it('answers a child process only while the parent awaits it asynchronously — not under spawnSync', async () => {
    const target = await upstream((_req, res) => { res.writeHead(200); res.end('{"ok":true}'); });
    const { proxy, sink } = await proxyTo(target);
    const child = (ms: number) => `
      try {
        const r = await fetch('${proxy.url}/chat/completions', { method: 'POST', body: '{}', signal: AbortSignal.timeout(${ms}) });
        console.log('ANSWERED ' + r.status);
      } catch { console.log('NO ANSWER'); }
    `;

    // The blocking form: the loop is held, so the client gives up before anything is served.
    //
    // The CLIENT's outcome is the assertion, not the record count. The connection is not refused — it sits in
    // the listen backlog and is accepted the moment `spawnSync` returns, so a record for the abandoned request
    // usually appears afterwards. That is exactly the shape the live run would have shown: traffic recorded,
    // every model call timed out, and a pack that looked like the endpoint was slow rather than like the
    // harness never answering.
    const blocked = spawnSync(process.execPath, ['--input-type=module', '-e', child(1500)], { encoding: 'utf8', timeout: 20_000 });
    expect(blocked.stdout).toContain('NO ANSWER');

    // The form `launch` uses: spawn, and await the close event.
    const answered = await new Promise<string>((resolve) => {
      const proc = spawn(process.execPath, ['--input-type=module', '-e', child(8000)]);
      let out = '';
      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', (c: string) => { out += c; });
      proc.on('close', () => resolve(out));
    });
    expect(answered).toContain('ANSWERED 200');
    expect(records(sink).some((r) => r['status'] === 200)).toBe(true);
  }, 40_000);

  /**
   * The fault rules. Each is the mechanism behind one `faults`-scenario check, and each pins the thing that
   * makes a fault a REPRODUCTION rather than a coincidence: that it fires on the call the rule names, and on
   * no other. `docs/defects/single-retry-stream-stall-aborted-a-76-minute-run.md` and the exit-trace gap are
   * the two frictions `live-run.mjs` has always had to record as "not inducible on demand"; these are what
   * make the first of them inducible.
   */
  describe('fault injection', () => {
    it('answers an injected status on the named call only, and never contacts the upstream for it', async () => {
      let reached = 0;
      const target = await upstream((_req, res) => { reached += 1; res.writeHead(200); res.end('{"ok":true}'); });
      const { proxy, sink } = await proxyTo(target, [{ kind: 'status', at: 2, status: 429 }]);

      const call = () => fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: '{}' });
      expect((await call()).status).toBe(200);
      expect((await call()).status).toBe(429);
      expect((await call()).status).toBe(200);

      // The injected call never went upstream: two of the three reached the endpoint, not three.
      expect(reached).toBe(2);
      const all = records(sink);
      expect(all.map((r) => r['status'])).toEqual([200, 429, 200]);
      expect(all[1]['fault']).toMatchObject({ kind: 'status', at: 2, status: 429 });
      // The rule is spent: it fired once, at the call it named.
      expect(proxy.stats().faultsFired).toEqual([{ kind: 'status', at: 2, path: '/chat/completions' }]);
    });

    it('cuts the connection mid-stream, after the chunk the rule names', async () => {
      const target = await upstream((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: one\n\n');
        setTimeout(() => res.write('data: two\n\n'), 20);
        setTimeout(() => res.end('data: [DONE]\n\n'), 40);
      });
      const { proxy, sink } = await proxyTo(target, [{ kind: 'cut', at: 1, afterChunks: 1 }]);

      // The client sees the connection die, not a clean end. Whether that surfaces as a rejected `fetch` or a
      // rejected body read depends on how much had flushed when the socket went, and both are the same fault —
      // so the assertion is that the call cannot be completed, not which of the two ways it fails.
      await expect((async () => {
        const answer = await fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: '{}' });
        return await answer.text();
      })()).rejects.toThrow();
      expect(records(sink)[0]['fault']).toMatchObject({ kind: 'cut', at: 1 });
    });

    it('stalls: the bytes stop, the connection stays open, and nothing closes it', async () => {
      const target = await upstream((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: one\n\n');
        setTimeout(() => res.write('data: two\n\n'), 20);
        setTimeout(() => res.end('data: [DONE]\n\n'), 40);
      });
      // A hold longer than this test: the assertion is that the client is still WAITING, which is the whole
      // shape of the stall — the product cannot tell it from a slow model except by an idle bound of its own.
      const { proxy } = await proxyTo(target, [{ kind: 'stall', at: 1, afterChunks: 1, holdMs: 60_000 }]);

      // An AbortController, not `reader.cancel()`: cancelling a reader whose socket is deliberately wedged
      // waits on that socket, so the teardown would hang on the fault under test.
      const ac = new AbortController();
      const answer = await fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: '{}', signal: ac.signal });
      const reader = (answer.body as ReadableStream<Uint8Array>).getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toContain('one');

      // The second read never settles. If the proxy had closed or ended the stream, this would resolve.
      const pending = reader.read().then(() => 'settled').catch(() => 'aborted');
      const settled = await Promise.race([pending, new Promise((r) => setTimeout(() => r('still waiting'), 1_000))]);
      expect(settled).toBe('still waiting');
      expect(proxy.stats().faultsFired).toHaveLength(1);
      // Abort and move on: `pending` already carries its own catch, and awaiting a read on a wedged socket is
      // the hang this fault exists to create.
      ac.abort();
    }, 20_000);

    it('leaves every other call untouched when no rule matches', async () => {
      const target = await upstream((_req, res) => { res.writeHead(200); res.end('{"ok":true}'); });
      const { proxy, sink } = await proxyTo(target, [{ kind: 'status', at: 99, status: 500 }]);
      expect((await fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: '{}' })).status).toBe(200);
      expect(records(sink)[0]['fault']).toBeUndefined();
      expect(proxy.stats().faultsFired).toEqual([]);
    });
  });

  it('records the hop failing, and answers 502 rather than hanging', async () => {
    // An upstream that is not listening: the port is bound and released before the proxy is pointed at it.
    const target = await upstream((_req, res) => res.end());
    await new Promise((r) => opened.servers[0].close(() => r(undefined)));
    opened.servers = [];
    const { proxy, sink } = await proxyTo(target);

    const answer = await fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: '{}' });
    expect(answer.status).toBe(502);
    const [record] = records(sink);
    expect(record['status']).toBeNull();
    expect(typeof record['error']).toBe('string');
    expect(proxy.stats().failed).toBe(1);
  });
});
