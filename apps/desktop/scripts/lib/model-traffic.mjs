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
export async function startRecordingProxy({ upstreamUrl, redact = (s) => s, faults: declared = [] }) {
  let faults = declared.map((rule) => ({ ...rule }));
  const upstream = new URL(upstreamUrl);
  const transport = upstream.protocol === 'https:' ? httpsRequest : httpRequest;
  const basePath = upstream.pathname.replace(/\/+$/, '');
  let sink = null;
  let recorded = 0;
  let failed = 0;
  /** How many calls have reached each watched path, so a rule can name the call it acts on. */
  const calls = new Map();
  const fired = [];

  /**
   * The rule that acts on THIS call, or null.
   *
   * A rule names the path it watches (`/chat/completions` unless it says otherwise) and the **1-based index**
   * of the call on that path it fires at, because "the second completion" is a reproduction and "some
   * completion" is a coincidence — `codebase.md`'s strongest finding of 2026-09-12 is that sixty negative runs
   * proved nothing because none of them carried the input that failed. Each rule fires at most once.
   */
  const ruleFor = (path) => {
    if (faults.length === 0) return null;
    const watched = faults.filter((f) => path.includes(f.path ?? '/chat/completions'));
    if (watched.length === 0) return null;
    const key = watched[0].path ?? '/chat/completions';
    const index = (calls.get(key) ?? 0) + 1;
    calls.set(key, index);
    const rule = watched.find((f) => f.at === index && f.spent !== true) ?? null;
    if (rule !== null) { rule.spent = true; fired.push({ kind: rule.kind, at: rule.at, path: key }); }
    return rule;
  };

  /**
   * Write one record to the file `target` names — the file of the scenario that MADE the call, captured when the
   * call arrived. Writing to the sink current when a call ends put the first live run's aborted `ask` analyst in
   * `edit/` and its released stall in `terminal/` (live-run finding H1, 2026-09-29).
   */
  const write = (target, record) => {
    if (target === null) return;
    try { appendFileSync(target, `${JSON.stringify(record)}\n`); recorded += 1; }
    catch { /* a record that cannot be written never fails the run */ }
  };
  /**
   * The calls still open, each as the function that writes it `in-flight at close` and lets the endpoint go.
   * `close()` runs them, so the call the run was waiting on when the harness stopped — often the one that explains
   * an overrun — is in the pack (live-run finding H-g: 201 `model request POST` lines against 200 records).
   */
  const open = new Set();

  const server = createServer((clientReq, clientRes) => {
    const started = Date.now();
    const target = sink;
    const path = `${basePath}${clientReq.url ?? '/'}`;
    const sentChunks = [];
    const backChunks = [];
    const headers = { ...clientReq.headers, host: upstream.host };
    const rule = ruleFor(path);
    const note = rule === null ? {} : { fault: { kind: rule.kind, at: rule.at, ...(rule.status ? { status: rule.status } : {}), ...(rule.afterChunks === undefined ? {} : { afterChunks: rule.afterChunks }) } };

    /** The endpoint's answer once its headers arrive; null while it is still thinking. */
    let upstreamRes = null;
    /** The upstream request; null for an injected status, which never contacts the endpoint. */
    let upstreamReq = null;
    let stallTimer = null;
    /** A final record of this call is written: nothing after it is, a stall's first record is not final. */
    let ended = false;
    /** The proxy itself let go of the endpoint, so what the endpoint's socket says next is not its failure. */
    let letGo = false;
    /**
     * Write this call's record. `outcome` names why it is being written, because a stalled call is written
     * TWICE — once when the silence begins and once when it ends (released, aborted by the client, or open at
     * close) — and a reader of the pack needs to know which one they have. Every other outcome is final:
     * `complete`, `cut`, `released`, `aborted`, `in-flight at close`, `upstream-error`, `unreachable`.
     *
     * **A stalled call must be recorded at the moment it stalls, not only when it is released.** Measured on
     * the first live execution, 2026-09-22: the product's idle bound fired at 120 s and the run recovered by
     * retrying, so the launch ended long before the proxy's 300 s hold expired, the timer (correctly
     * `unref`'d) never ran, and the ONE call the whole scenario is about was the one call missing from the
     * pack — five `model request POST` lines in the log against four records in `model-traffic.jsonl`.
     */
    const settle = (outcome, extra = {}) => {
      if (ended) return;
      if (outcome !== 'stalled') { ended = true; open.delete(atClose); if (stallTimer !== null) clearTimeout(stallTimer); }
      write(target, {
        at: new Date(started).toISOString(), ms: Date.now() - started,
        method: clientReq.method, path: clientReq.url, upstream: `${upstream.origin}${path}`,
        status: upstreamRes?.statusCode ?? null, ...note, ...(outcome === undefined ? {} : { outcome }), ...extra,
        requestHeaders: scrub(clientReq.headers), requestBody: redact(cap(sentChunks)),
        responseHeaders: upstreamRes?.headers ?? {}, responseBody: redact(cap(backChunks)),
      });
    };
    /** The endpoint is told the call is over the only way HTTP can tell it: its socket closes. */
    const release = () => {
      letGo = true;
      try { upstreamReq?.destroy(); } catch { /* the call is over */ }
    };
    const atClose = () => { settle('in-flight at close'); release(); };
    open.add(atClose);

    /*
     * The client letting go: the product aborted the call (a timed-out classifier, an analysis cancelled at
     * quit, a stream its idle bound declared dead) or the app itself exited. The response closes without the
     * proxy having ended it. The upstream request is destroyed at once, so the endpoint stops generating what
     * nobody will read — on a metered endpoint that is spend the product never made (live-run finding H1: nine
     * such calls ran to completion upstream and were written `complete`).
     */
    clientRes.on('close', () => {
      if (ended || letGo || clientRes.writableEnded) return;
      settle('aborted');
      release();
    });

    /*
     * `status`: the endpoint answers a refusal, and the upstream is never contacted. Synthesised rather than
     * rewritten from a real answer because the point is the STATUS the product sees — a 429 the ladder must
     * wait on, a 500 it must fall back from — and contacting the endpoint to discard its answer would spend
     * the owner's tokens to produce nothing.
     */
    if (rule?.kind === 'status') {
      const body = rule.body ?? JSON.stringify({ error: { message: `injected by the live run's recording proxy (rule ${rule.at})`, type: 'injected_fault' } });
      clientReq.on('data', (chunk) => sentChunks.push(chunk));
      clientReq.on('end', () => {
        clientRes.writeHead(rule.status ?? 500, { 'content-type': 'application/json', ...(rule.headers ?? {}) });
        clientRes.end(body);
        backChunks.push(Buffer.from(body));
        settle(undefined, { status: rule.status ?? 500 });
      });
      return;
    }

    upstreamReq = transport(
      { protocol: upstream.protocol, hostname: upstream.hostname, port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80), method: clientReq.method, path, headers },
      (answer) => {
        upstreamRes = answer;
        // Status and headers straight through, before a single byte of body is copied anywhere.
        clientRes.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        let forwarded = 0;
        let severed = false;
        upstreamRes.on('data', (chunk) => {
          backChunks.push(chunk);
          if (severed) return;
          forwarded += 1;
          const after = rule?.afterChunks ?? 1;
          /*
           * `stall`: the bytes stop but the connection stays OPEN. This is the shape of
           * `docs/defects/single-retry-stream-stall-aborted-a-76-minute-run.md` and the one the product cannot
           * distinguish from a slow model without an idle bound — which is why it is worth inducing at all.
           * Nothing is closed: the run must be the thing that decides the stream is dead.
           */
          if (rule?.kind === 'stall') {
            // `afterChunks` is how many chunks DO arrive before the silence. Forward those, then stop
            // forwarding anything further while leaving the socket open. Getting this off by one gives the
            // client headers and no body at all, which is a different fault (a hang before the first byte)
            // and not the one this rule claims to reproduce.
            if (forwarded <= after) { clientRes.write(chunk); return; }
            if (!severed) {
              severed = true;
              // Recorded HERE, with what had arrived before the silence, because the run may well outlive
              // this stall and the launch may well end before the hold does. See `settle`'s note.
              settle('stalled');
              stallTimer = setTimeout(() => { settle('released'); release(); try { clientRes.destroy(); } catch { /* the call is over */ } }, rule.holdMs ?? 180_000);
              stallTimer.unref?.();
            }
            return;
          }
          /* `cut`: the connection dies mid-stream, the way a proxy or a load balancer drops one. */
          if (rule?.kind === 'cut' && forwarded >= after) {
            severed = true;
            clientRes.write(chunk);
            settle('cut');
            release();
            try { clientRes.destroy(); } catch { /* the call is over */ }
            return;
          }
          clientRes.write(chunk);
          /* `malformed`: a frame the stream parser must reject, injected into an otherwise healthy answer. */
          if (rule?.kind === 'malformed' && forwarded === after) clientRes.write(rule.frame ?? 'data: {"choices":[{"delta":\n\n');
        });
        upstreamRes.on('end', () => {
          if (stallTimer !== null) return;
          if (!severed) { clientRes.end(); settle('complete'); }
        });
        // The endpoint dropping the stream is its failure, written as such — never mistaken for the client's abort.
        upstreamRes.on('error', (cause) => {
          if (letGo || ended) return;
          failed += 1;
          settle('upstream-error', { error: String(cause instanceof Error ? cause.message : cause) });
          clientRes.destroy();
        });
      },
    );

    // The failure of the hop itself is a record too — a run that died because the endpoint refused the
    // connection leaves nothing in the product's log but a generic model error.
    upstreamReq.on('error', (cause) => {
      if (letGo || ended) return;
      failed += 1;
      settle('unreachable', { error: String(cause instanceof Error ? cause.message : cause) });
      if (!clientRes.headersSent) clientRes.writeHead(502, { 'content-type': 'text/plain' });
      clientRes.end('the live run\'s recording proxy could not reach the endpoint');
    });

    clientReq.on('data', (chunk) => { sentChunks.push(chunk); upstreamReq.write(chunk); });
    clientReq.on('end', () => { upstreamReq.end(); });
    clientReq.on('error', () => { release(); });
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
    /**
     * Replace the fault rules between launches, and reset the per-path call counters with them. The counters
     * must reset: a rule that says "the second completion" means the second of THIS launch, and a scenario
     * that inherited the previous launch's count would fire it somewhere nobody chose.
     */
    setFaults: (rules) => { faults = rules.map((rule) => ({ ...rule })); calls.clear(); fired.length = 0; },
    stats: () => ({ recorded, failed, faultsFired: fired.slice(), faultsDeclared: faults.length }),
    /**
     * Stop listening. A call still open is written first, `in-flight at close`, into its own scenario's file,
     * and the endpoint is let go — synchronously, before the returned promise, so a caller that does not await
     * it (the live run's exit paths) still leaves the record.
     */
    close: () => new Promise((resolve) => {
      for (const atClose of [...open]) atClose();
      server.close(() => resolve(undefined));
      server.closeAllConnections?.();
    }),
  };
}
