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
import { emptyCompletion, startRecordingProxy } from './model-traffic.mjs';
import { usageOf } from './duress-checks.mjs';
import { AiSdkModelClient, type StreamPart } from '@rotaris/model';
import { millis } from '@rotaris/kernel';

interface Proxy {
  readonly url: string;
  sink: (path: string | null) => void;
  stats: () => { recorded: number; failed: number; faultsFired: unknown[]; faultsDeclared: number };
  totals: () => { recorded: number; failed: number; faultsFired: unknown[]; faultsDeclared: number };
  setFaults: (rules: unknown[]) => void;
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

  /*
   * Finding U6 of the duress live run at 1763f7f: two complete responses over the 1 MB body cap lost their closing usage
   * chunk with the cut (traffic lines 77 and 234), so the duress figures read 2 calls and 20,787 output tokens short of the
   * store. The body is still capped; the usage is read from the whole body and kept on the record.
   */
  it('keeps a response\'s usage when its body is over the cap and recorded truncated (U6)', async () => {
    const delta = `data: ${JSON.stringify({ choices: [{ delta: { content: 'x'.repeat(4_000) } }] })}\n\n`;
    const usage = `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 93_461, total_tokens: 103_652, completion_tokens: 10_191, completion_tokens_details: { reasoning_tokens: 9_870 } } })}\n\n`;
    const target = await upstream((req, res) => {
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        for (let i = 0; i < 260; i += 1) res.write(delta);
        res.end(`${usage}data: [DONE]\n\n`);
      });
    });
    const { sink } = await proxyTo(target);
    const answer = await fetch(`${(opened.proxies[0] as Proxy).url}/chat/completions`, { method: 'POST', body: '{}' });
    const text = await answer.text();
    // The product received the whole answer, its usage included: the cap is the record's, never the client's.
    expect(text.length).toBeGreaterThan(1_000_000);
    expect(text).toContain('"completion_tokens":10191');
    const [record] = records(sink);
    expect(record['outcome']).toBe('complete');
    expect(String(record['responseBody'])).toMatch(/…\[truncated: \d+ bytes total\]$/);
    expect(String(record['responseBody'])).not.toContain('completion_tokens');
    expect(record['usage']).toEqual({ prompt_tokens: 93_461, completion_tokens: 10_191, reasoning_tokens: 9_870 });
    expect(usageOf(record)).toEqual({ promptTokens: 93_461, completionTokens: 10_191, reasoningTokens: 9_870 });
  });

  it('records no usage for a body that carries none', async () => {
    const target = await upstream((req, res) => { req.resume(); req.on('end', () => { res.writeHead(200); res.end('{"choices":[]}'); }); });
    const { sink } = await proxyTo(target);
    await (await fetch(`${(opened.proxies[0] as Proxy).url}/chat/completions`, { method: 'POST', body: '{}' })).text();
    const [record] = records(sink);
    expect(record['usage']).toBeUndefined();
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
   * no other. `docs/defects/fixed/single-retry-stream-stall-aborted-a-76-minute-run.md` and the exit-trace gap are
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

    /*
     * The record of a stalled call must exist WHILE it is stalled, not only once the hold expires.
     *
     * Found by the first live execution, 2026-09-22: the product's idle bound fired at 120 s and the run
     * recovered, so the launch ended long before the proxy's 300 s hold — the timer never ran, and the one
     * call the whole `faults-stall` scenario is about was the one call absent from the evidence pack (five
     * `model request POST` lines against four records). A record written only on release is a record that
     * exists only when nobody needed it.
     */
    it('records a stalled call at the moment it stalls, not only when the hold expires', async () => {
      const target = await upstream((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: one\n\n');
        setTimeout(() => res.write('data: two\n\n'), 20);
        setTimeout(() => res.end('data: [DONE]\n\n'), 40);
      });
      // A hold far longer than this test: if the record only appeared on release, nothing would be here.
      const { proxy, sink } = await proxyTo(target, [{ kind: 'stall', at: 1, afterChunks: 1, holdMs: 600_000 }]);

      const ac = new AbortController();
      const answer = await fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: '{"m":"x"}', signal: ac.signal });
      const reader = (answer.body as ReadableStream<Uint8Array>).getReader();
      await reader.read();
      // Give the upstream's second write time to arrive and trip the stall branch.
      await new Promise((r) => setTimeout(r, 300));

      const written = records(sink);
      expect(written).toHaveLength(1);
      expect(written[0]['outcome']).toBe('stalled');
      expect(written[0]['fault']).toMatchObject({ kind: 'stall', at: 1 });
      // What had arrived before the silence is part of the record; that is the evidence a reader needs.
      expect(String(written[0]['responseBody'])).toContain('one');
      ac.abort();
    }, 20_000);

    /*
     * Live-run finding H4 (2026-09-29): `results.json` read `faultsFired: []` and `faultsDeclared: 0` for a run in
     * which a 429, a 500 and a stall had fired, because the summary read the per-launch figures after the `faults`
     * scenario's closing `setFaults([])` had emptied them. The run's figures must survive every replacement.
     */
    it('keeps the run-wide fault figures through every setFaults, while the per-launch ones reset (H4)', async () => {
      const target = await upstream((_req, res) => { res.writeHead(200); res.end('{"ok":true}'); });
      const { proxy } = await proxyTo(target, [{ kind: 'status', at: 1, status: 429 }, { kind: 'status', at: 2, status: 500 }]);
      const call = () => fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: '{}' });
      expect((await call()).status).toBe(429);
      expect((await call()).status).toBe(500);
      proxy.setFaults([{ kind: 'status', at: 1, status: 503 }]);
      expect((await call()).status).toBe(503);
      proxy.setFaults([]);

      // The launch's own pair resets with its rules, which is what a scenario reads about the launch it ran …
      expect(proxy.stats().faultsFired).toEqual([]);
      expect(proxy.stats().faultsDeclared).toBe(0);
      // … and the run's pair does not.
      expect(proxy.totals().faultsDeclared).toBe(3);
      expect(proxy.totals().faultsFired).toEqual([
        { kind: 'status', at: 1, path: '/chat/completions' },
        { kind: 'status', at: 2, path: '/chat/completions' },
        { kind: 'status', at: 1, path: '/chat/completions' },
      ]);
      expect(proxy.totals().recorded).toBe(3);
    });

    /*
     * `pace` (the `faults-args` launch; docs/defects/fixed/a-child-streaming-a-long-tool-call-is-reported-stalled.md): every
     * event carrying a piece of a tool call's arguments is held `delayMs` behind the one before it, so one step streams a
     * long tool call; nothing is dropped or reordered, and the record says how many pieces were paced and over what span.
     */
    it('paces each tool-call piece of every call, passes the rest at once, and records the paced span', async () => {
      const piece = (args: string) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: args } }] } }] })}\n\n`;
      const body = ['data: {"choices":[{"index":0,"delta":{"content":"Writing."}}]}\n\n', ...['{"pa', 'th":"a', '.md"}'].map(piece), 'data: [DONE]\n\n'].join('');
      // The upstream answers in one write, splitting an event across two chunks to exercise the reassembly.
      const target = await upstream((_req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(body.slice(0, 70)); setTimeout(() => res.end(body.slice(70)), 5); });
      const { proxy, sink } = await proxyTo(target, [{ kind: 'pace', every: true, delayMs: 60 }]);
      const started = Date.now();
      const first = await (await fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: '{}' })).text();
      const tookMs = Date.now() - started;
      expect(first).toBe(body);
      expect(tookMs).toBeGreaterThanOrEqual(3 * 60 - 10);
      const paced = records(sink)[0]['paced'] as { events: number; firstAt: number; lastAt: number };
      expect(paced.events).toBe(3);
      expect(paced.lastAt - paced.firstAt).toBeGreaterThanOrEqual(2 * 60 - 10);
      expect(records(sink)[0]['fault']).toMatchObject({ kind: 'pace', at: 'every', delayMs: 60 });
      // A second call of the same launch is paced too; a call with no piece is passed whole and fires nothing.
      expect(await (await fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: '{}' })).text()).toBe(body);
      expect(proxy.stats().faultsFired).toHaveLength(2);
    });

    it('a fired `pace` names the path its call was counted on, as every other fired rule does', async () => {
      const piece = `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] } }] })}\n\n`;
      const target = await upstream((_req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(`${piece}data: [DONE]\n\n`); });
      // The first rule watching the call decides its key: here a `status` rule on `/completions`, never reached.
      const { proxy } = await proxyTo(target, [{ kind: 'status', at: 99, status: 500, path: '/completions' }, { kind: 'pace', every: true, delayMs: 5 }]);
      await (await fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: '{}' })).text();
      expect(proxy.stats().faultsFired).toEqual([{ kind: 'pace', at: 'every', path: '/completions' }]);
    });

    it('a `pace` rule passes a call with no tool-call piece at once and records nothing paced', async () => {
      const target = await upstream((_req, res) => { res.writeHead(200); res.end('{"ok":true}'); });
      const { proxy, sink } = await proxyTo(target, [{ kind: 'pace', every: true, delayMs: 5_000 }]);
      const started = Date.now();
      expect(await (await fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: '{}' })).text()).toBe('{"ok":true}');
      expect(Date.now() - started).toBeLessThan(2_000);
      expect(records(sink)[0]['paced']).toEqual({ events: 0, firstAt: null, lastAt: null });
      expect(proxy.stats().faultsFired).toEqual([]);
    });

    /*
     * fin42 (N56, PD-ORCH-009 revision 2): the root's empty answer, chosen by what the request carries. The calls whose body
     * holds `when` and not `unless` are answered with a completion that has no content and no tool call, finished `stop`, up
     * to `times` of them; every other call, before and after, reaches the endpoint unchanged.
     */
    it('`empty` answers the calls whose body it names with an empty `stop` completion, up to `times`, and forwards the rest', async () => {
      const bodies: string[] = [];
      const target = await upstream((req, res) => {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => { bodies.push(body); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); });
      });
      const { proxy, sink } = await proxyTo(target, [{ kind: 'empty', when: 'ROOT-MARK', unless: 'classify', times: 2 }]);
      const call = (body: unknown) => fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, type: r.headers.get('content-type'), text: await r.text() }));

      const classifier = await call({ model: 'm', stream: false, messages: [{ role: 'system', content: 'classify ROOT-MARK' }] });
      const first = await call({ model: 'm', stream: true, messages: [{ role: 'system', content: 'ROOT-MARK' }] });
      const other = await call({ model: 'm', stream: true, messages: [{ role: 'system', content: 'a child' }] });
      const second = await call({ model: 'm', stream: false, messages: [{ role: 'system', content: 'ROOT-MARK again' }] });
      const third = await call({ model: 'm', stream: true, messages: [{ role: 'system', content: 'ROOT-MARK once more' }] });

      // Forwarded unchanged: the classifier (`unless`), the child (no `when`) and the root's third call (`times` spent).
      expect([classifier.text, other.text, third.text]).toEqual(['{"ok":true}', '{"ok":true}', '{"ok":true}']);
      expect(bodies.map((b) => JSON.parse(b).messages[0].content)).toEqual(['classify ROOT-MARK', 'a child', 'ROOT-MARK once more']);
      // The streamed empty answer: well-formed events, no content, no tool call, `stop`, then [DONE].
      expect(first.type).toBe('text/event-stream');
      const events = first.text.split('\n\n').filter((e) => e.startsWith('data: ')).map((e) => e.slice('data: '.length));
      expect(events.at(-1)).toBe('[DONE]');
      const chunks = events.slice(0, -1).map((e) => JSON.parse(e) as { choices: { delta: { content?: string; tool_calls?: unknown }; finish_reason: string | null }[] });
      expect(chunks.flatMap((c) => c.choices.map((x) => x.delta.content ?? '')).join('')).toBe('');
      expect(chunks.some((c) => c.choices.some((x) => x.delta.tool_calls !== undefined))).toBe(false);
      expect(chunks.flatMap((c) => c.choices.map((x) => x.finish_reason)).filter((r) => r !== null)).toEqual(['stop']);
      // The unstreamed one: one JSON body, empty content, `stop`.
      expect(second.type).toBe('application/json');
      expect(JSON.parse(second.text).choices[0]).toEqual({ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' });

      const all = records(sink);
      expect(all.map((r) => (r['fault'] as { kind?: string } | undefined)?.kind ?? null)).toEqual([null, 'empty', null, 'empty', null]);
      expect(all[1]).toMatchObject({ status: 200, outcome: 'complete', fault: { kind: 'empty', at: 1, when: 'ROOT-MARK' } });
      expect(String(all[1]['requestBody'])).toContain('ROOT-MARK');
      expect(proxy.stats().faultsFired).toEqual([{ kind: 'empty', at: 1, path: '/chat/completions' }, { kind: 'empty', at: 2, path: '/chat/completions' }]);
    });

    it('the product\'s model client reads the `empty` answer as a turn that finished `stop` with no text and no tool call', async () => {
      const answer = emptyCompletion(JSON.stringify({ model: 'acme-1', stream: true }));
      const client = new AiSdkModelClient({
        timers: { after: (d: number, fn: () => void) => { const h = setTimeout(fn, d); return { cancel: () => clearTimeout(h) }; }, every: (p: number, fn: () => void) => { const h = setInterval(fn, p); return { cancel: () => clearInterval(h) }; } },
        monotonic: { now: () => millis(performance.now()) },
        baseUrl: 'https://acme.example/v1',
        fetch: async () => new Response(answer.body, { status: 200, headers: { 'content-type': answer.contentType } }),
      });
      const parts: StreamPart[] = [];
      for await (const r of client.stream({ model: { providerId: 'acme', modelId: 'acme-1', dialect: 'chat' }, messages: [{ role: 'user', content: [{ kind: 'text', text: 'hi' }] }], thinking: 'unset', signal: new AbortController().signal, timeoutMs: 5_000, retries: 0, resolveCredential: async () => 'k' })) {
        if (!r.ok) throw new Error(r.error.headline);
        parts.push(r.value);
      }
      expect(parts.filter((p) => p.kind === 'text' || p.kind === 'tool-call')).toEqual([]);
      expect(parts.at(-1)).toEqual({ kind: 'finish', reason: 'stop' });
    });

    it('leaves every other call untouched when no rule matches', async () => {
      const target = await upstream((_req, res) => { res.writeHead(200); res.end('{"ok":true}'); });
      const { proxy, sink } = await proxyTo(target, [{ kind: 'status', at: 99, status: 500 }]);
      expect((await fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: '{}' })).status).toBe(200);
      expect(records(sink)[0]['fault']).toBeUndefined();
      expect(proxy.stats().faultsFired).toEqual([]);
    });
  });

  /**
   * A call the product lets go of, and a call the harness closes on (live-run findings H1 and H-g, 2026-09-29).
   *
   * The first live run's two timed-out intent classifiers, its loop classifier and six analyses the quit cancelled
   * all ran to completion AT THE ENDPOINT after the product had aborted them, and were written `outcome: complete`
   * into the NEXT scenario's traffic file: the proxy destroyed its upstream request only when the client request
   * emitted `error`, which a client closing its connection does not do, and it wrote to whichever sink was current
   * when the call ended. The duress run's pack held 201 `model request POST` lines against 200 records — the call
   * in flight at the deadline was never written, because `close()` wrote nothing. Each case below is red on that
   * form of the proxy.
   */
  describe('a call the client lets go of, and a call in flight at close (H1, H-g)', () => {
    /** An upstream that answers headers and one chunk, then holds the stream open until the test lets go. */
    async function holdingUpstream(): Promise<{ target: string; upstreamClosed: Promise<void> }> {
      let closed: () => void = () => undefined;
      const upstreamClosed = new Promise<void>((resolve) => { closed = resolve; });
      const target = await upstream((req, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: one\n\n');
        // The endpoint's side of the socket closing is the only way it learns the call was abandoned.
        req.socket.on('close', () => closed());
      });
      return { target, upstreamClosed };
    }
    const within = <T>(promise: Promise<T>, ms: number): Promise<T | 'timed out'> =>
      Promise.race([promise, new Promise<'timed out'>((r) => setTimeout(() => r('timed out'), ms))]);

    it('a client abort mid-stream destroys the upstream request, and the record says aborted', async () => {
      const { target, upstreamClosed } = await holdingUpstream();
      const { proxy, sink } = await proxyTo(target);

      const ac = new AbortController();
      const answer = await fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: '{"m":"x"}', signal: ac.signal });
      const reader = (answer.body as ReadableStream<Uint8Array>).getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toContain('one');
      ac.abort();

      // The endpoint stops answering because the product did: nothing further is generated, and nothing billed.
      expect(await within(upstreamClosed, 5_000)).toBeUndefined();
      await new Promise((r) => setTimeout(r, 50));
      const written = records(sink);
      expect(written).toHaveLength(1);
      expect(written[0]['outcome']).toBe('aborted');
      expect(written[0]['status']).toBe(200);
      // What had arrived before the client let go is part of the record.
      expect(String(written[0]['responseBody'])).toContain('one');
      expect(written[0]['requestBody']).toBe('{"m":"x"}');
      // The proxy's own letting go of the endpoint is not the hop failing.
      expect(proxy.stats().failed).toBe(0);
    });

    it('a client abort before the endpoint has answered destroys the upstream request, and the record says aborted', async () => {
      let closed: () => void = () => undefined;
      const upstreamClosed = new Promise<void>((resolve) => { closed = resolve; });
      // An endpoint still thinking: it has the request and has sent nothing, not even headers.
      const target = await upstream((req) => { req.socket.on('close', () => closed()); });
      const { proxy, sink } = await proxyTo(target);

      const ac = new AbortController();
      const pending = fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: '{}', signal: ac.signal }).catch(() => 'aborted');
      await new Promise((r) => setTimeout(r, 200));
      ac.abort();
      expect(await pending).toBe('aborted');

      expect(await within(upstreamClosed, 5_000)).toBeUndefined();
      await new Promise((r) => setTimeout(r, 50));
      const written = records(sink);
      expect(written).toHaveLength(1);
      expect(written[0]['outcome']).toBe('aborted');
      expect(written[0]['status']).toBeNull();
      expect(proxy.stats().failed).toBe(0);
    });

    it('a client abort during a stall lets go of the endpoint at once, not when the hold expires', async () => {
      const upstreamGone: { closed: () => void } = { closed: () => undefined };
      const upstreamClosed = new Promise<void>((resolve) => { upstreamGone.closed = resolve; });
      const target = await upstream((req, res) => {
        req.socket.on('close', () => upstreamGone.closed());
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: one\n\n');
        setTimeout(() => res.write('data: two\n\n'), 20);
      });
      const { proxy, sink } = await proxyTo(target, [{ kind: 'stall', at: 1, afterChunks: 1, holdMs: 600_000 }]);

      const ac = new AbortController();
      const answer = await fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: '{}', signal: ac.signal });
      const reader = (answer.body as ReadableStream<Uint8Array>).getReader();
      await reader.read();
      await new Promise((r) => setTimeout(r, 300));
      // The product's idle bound fires: it aborts the stalled call.
      ac.abort();

      expect(await within(upstreamClosed, 5_000)).toBeUndefined();
      await new Promise((r) => setTimeout(r, 50));
      // Two records: the stall as it began, and the product letting go of it.
      expect(records(sink).map((r) => r['outcome'])).toEqual(['stalled', 'aborted']);
      expect(proxy.stats().failed).toBe(0);
    });

    it('a record lands in the file of the scenario that made the call, not the one current when it ends', async () => {
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => { release = resolve; });
      const target = await upstream((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: one\n\n');
        void held.then(() => res.end('data: [DONE]\n\n'));
      });
      const { proxy, sink: first } = await proxyTo(target);
      const second = join(opened.dirs[0], 'next-scenario.jsonl');

      const answer = await fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: '{}' });
      const reader = (answer.body as ReadableStream<Uint8Array>).getReader();
      await reader.read();
      // The next scenario begins while this call is still answering.
      proxy.sink(second);
      release();
      while (!(await reader.read()).done) { /* drain */ }
      await new Promise((r) => setTimeout(r, 50));

      expect(records(first).map((r) => r['outcome'])).toEqual(['complete']);
      expect(records(second)).toEqual([]);
    });

    it('a call in flight when the proxy closes is written as such, and the endpoint is let go', async () => {
      const { target, upstreamClosed } = await holdingUpstream();
      const dir = mkdtempSync(join(tmpdir(), 'model-traffic-'));
      opened.dirs.push(dir);
      // Not in `opened.proxies`: this case closes the proxy itself, and a second close would find it closed.
      const proxy = (await startRecordingProxy({ upstreamUrl: target, redact: (s: string) => s })) as Proxy;
      const sink = join(dir, 'model-traffic.jsonl');
      proxy.sink(sink);

      const answer = await fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: '{"m":"last"}' });
      const reader = (answer.body as ReadableStream<Uint8Array>).getReader();
      await reader.read();
      const tail = reader.read().catch(() => 'cut');

      await proxy.close();
      const written = records(sink);
      expect(written).toHaveLength(1);
      expect(written[0]['outcome']).toBe('in-flight at close');
      expect(written[0]['status']).toBe(200);
      expect(written[0]['requestBody']).toBe('{"m":"last"}');
      expect(String(written[0]['responseBody'])).toContain('one');
      expect(proxy.stats().recorded).toBe(1);
      expect(await within(upstreamClosed, 5_000)).toBeUndefined();
      await tail;
    });

    it('a call that has ended is not written again at close', async () => {
      const target = await upstream((_req, res) => { res.writeHead(200); res.end('{"ok":true}'); });
      const dir = mkdtempSync(join(tmpdir(), 'model-traffic-'));
      opened.dirs.push(dir);
      const proxy = (await startRecordingProxy({ upstreamUrl: target, redact: (s: string) => s })) as Proxy;
      const sink = join(dir, 'model-traffic.jsonl');
      proxy.sink(sink);
      expect((await fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: '{}' })).status).toBe(200);
      await new Promise((r) => setTimeout(r, 50));
      await proxy.close();
      expect(records(sink).map((r) => r['outcome'])).toEqual(['complete']);
    });

    it('an endpoint that drops the connection mid-stream is written as an upstream error, not a client abort', async () => {
      const target = await upstream((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: one\n\n');
        setTimeout(() => res.socket?.destroy(), 50);
      });
      const { proxy, sink } = await proxyTo(target);
      await (async () => {
        const answer = await fetch(`${proxy.url}/chat/completions`, { method: 'POST', body: '{}' });
        return await answer.text();
      })().catch(() => 'cut');
      await new Promise((r) => setTimeout(r, 100));
      const written = records(sink);
      expect(written).toHaveLength(1);
      expect(written[0]['outcome']).toBe('upstream-error');
      expect(String(written[0]['responseBody'])).toContain('one');
      expect(proxy.stats().failed).toBe(1);
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
