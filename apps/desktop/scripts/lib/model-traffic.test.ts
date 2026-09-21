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
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  for (const server of opened.servers) await new Promise((r) => server.close(() => r(undefined)));
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

async function proxyTo(upstreamUrl: string): Promise<{ proxy: Proxy; sink: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'model-traffic-'));
  opened.dirs.push(dir);
  const proxy = (await startRecordingProxy({ upstreamUrl, redact: (s: string) => s })) as Proxy;
  opened.proxies.push(proxy);
  const sink = join(dir, 'model-traffic.jsonl');
  proxy.sink(sink);
  return { proxy, sink };
}

const records = (sink: string): Record<string, unknown>[] =>
  readFileSync(sink, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Record<string, unknown>);

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
