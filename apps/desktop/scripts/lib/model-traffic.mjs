/**
 * The recording proxy — what the model was actually sent, and what actually came back.
 *
 * The product logs one line per model call (`run-host/host.ts`'s `onRequest`): the method, the URL, and whether
 * an authorization header was set. Nothing anywhere logs a request body, a response body, a status, a duration
 * or a token count; the only body that survives is 500 characters of a failed response kept on a `ModelError`.
 * So a live run against a real endpoint has never been able to answer what the model was asked or what it said,
 * which is the question most defects here turn out to be about.
 *
 * This closes that without changing the product. The live run points the sandbox's `base_url` at a loopback
 * listener, and the listener forwards to the real endpoint and tees both directions to a file.
 *
 * THE ONE RULE THIS FILE OBEYS: it must not change what the product experiences. That is why it is a raw
 * `http`/`https` pipe and not a `fetch` round-trip — a streamed completion has to arrive as chunks, in the
 * order and at the times the endpoint sent them, or the proxy would be measuring a product that only exists
 * while it is being measured. Headers pass through untouched but for `host`; status and trailers pass through;
 * nothing is buffered on the way to the client, only copied on the way past.
 *
 * Credentials never reach the file: `authorization` and the two api-key spellings are replaced with a marker
 * before the record is written, and the caller's `redact` runs over both bodies as a second pass.
 *
 * Nothing here is product code. It runs only from the live run.
 */
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { appendFileSync } from 'node:fs';

/** Header names whose value is a credential, whatever the endpoint calls it. */
const SECRET_HEADERS = new Set(['authorization', 'api-key', 'x-api-key', 'x-goog-api-key']);
/** A body larger than this is recorded truncated: the pack is for reading, and a 30 MB line is not read. */
const BODY_CAP = 1_000_000;

const scrub = (headers) => {
  const out = {};
  for (const [name, value] of Object.entries(headers)) out[name] = SECRET_HEADERS.has(name.toLowerCase()) ? '[redacted]' : value;
  return out;
};
const cap = (buffers) => {
  const whole = Buffer.concat(buffers);
  return whole.length > BODY_CAP
    ? `${whole.subarray(0, BODY_CAP).toString('utf8')}\n…[truncated: ${whole.length} bytes total]`
    : whole.toString('utf8');
};

/**
 * Start the listener. Resolves with the base URL to hand the product, a `sink` setter so each scenario's traffic
 * lands in its own file, and a `close`.
 *
 * `upstreamUrl` is the endpoint's own base (e.g. `https://host/v1`); its path is prefixed onto every incoming
 * path, so the product may treat the returned URL as a base exactly as it treats the real one.
 */
export async function startRecordingProxy({ upstreamUrl, redact = (s) => s }) {
  const upstream = new URL(upstreamUrl);
  const transport = upstream.protocol === 'https:' ? httpsRequest : httpRequest;
  const basePath = upstream.pathname.replace(/\/+$/, '');
  let sink = null;
  let recorded = 0;
  let failed = 0;

  const write = (record) => {
    if (sink === null) return;
    try { appendFileSync(sink, `${JSON.stringify(record)}\n`); recorded += 1; }
    catch { /* a record that cannot be written never fails the run */ }
  };

  const server = createServer((clientReq, clientRes) => {
    const started = Date.now();
    const path = `${basePath}${clientReq.url ?? '/'}`;
    const sentChunks = [];
    const backChunks = [];
    const headers = { ...clientReq.headers, host: upstream.host };

    const upstreamReq = transport(
      { protocol: upstream.protocol, hostname: upstream.hostname, port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80), method: clientReq.method, path, headers },
      (upstreamRes) => {
        // Status and headers straight through, before a single byte of body is copied anywhere.
        clientRes.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.on('data', (chunk) => { backChunks.push(chunk); clientRes.write(chunk); });
        upstreamRes.on('end', () => {
          clientRes.end();
          write({
            at: new Date(started).toISOString(), ms: Date.now() - started,
            method: clientReq.method, path: clientReq.url, upstream: `${upstream.origin}${path}`,
            status: upstreamRes.statusCode ?? null,
            requestHeaders: scrub(clientReq.headers), requestBody: redact(cap(sentChunks)),
            responseHeaders: upstreamRes.headers, responseBody: redact(cap(backChunks)),
          });
        });
        upstreamRes.on('error', () => { clientRes.destroy(); });
      },
    );

    // The failure of the hop itself is a record too — a run that died because the endpoint refused the
    // connection leaves nothing in the product's log but a generic model error.
    upstreamReq.on('error', (cause) => {
      failed += 1;
      write({
        at: new Date(started).toISOString(), ms: Date.now() - started,
        method: clientReq.method, path: clientReq.url, upstream: `${upstream.origin}${path}`,
        status: null, error: String(cause instanceof Error ? cause.message : cause),
        requestHeaders: scrub(clientReq.headers), requestBody: redact(cap(sentChunks)),
      });
      if (!clientRes.headersSent) clientRes.writeHead(502, { 'content-type': 'text/plain' });
      clientRes.end('the live run\'s recording proxy could not reach the endpoint');
    });

    clientReq.on('data', (chunk) => { sentChunks.push(chunk); upstreamReq.write(chunk); });
    clientReq.on('end', () => { upstreamReq.end(); });
    clientReq.on('error', () => { upstreamReq.destroy(); });
  });

  // Loopback only. This listener forwards a bearer to a real endpoint; it may not be reachable from the network.
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    /** Point the recorder at this scenario's file. `null` stops recording without stopping the proxy. */
    sink: (path) => { sink = path; },
    stats: () => ({ recorded, failed }),
    close: () => new Promise((resolve) => { server.close(() => resolve(undefined)); server.closeAllConnections?.(); }),
  };
}
