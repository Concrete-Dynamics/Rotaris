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
import { StringDecoder } from 'node:string_decoder';

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
 * The last usage figures a body carries (`prompt_tokens`, `completion_tokens`, `reasoning_tokens`, each null where absent),
 * or null when it carries none. Read from the WHOLE body, before `cap` cuts it: a streamed completion's usage chunk comes
 * last, so a response over the cap lost it with the cut, and the duress figures read from the record fell short of the
 * store — two calls and 20,787 output tokens in the run at 1763f7f
 * (`docs/defects/fixed/the-traffic-recorders-body-cap-drops-a-responses-usage-and-two-duress-figures-disagree-with-the-store.md`).
 * An escaped name inside a model's own text (`\"prompt_tokens\"`) does not match.
 */
export function usageIn(text) {
  const last = (field) => {
    let found = null;
    for (const m of String(text).matchAll(new RegExp(`"${field}"\\s*:\\s*(\\d+)`, 'g'))) found = Number(m[1]);
    return found;
  };
  const usage = { prompt_tokens: last('prompt_tokens'), completion_tokens: last('completion_tokens'), reasoning_tokens: last('reasoning_tokens') };
  return Object.values(usage).every((v) => v === null) ? null : usage;
}

/**
 * The answer an `empty` rule gives (fin42, PD-ORCH-009 revision 2): an OpenAI-shaped chat completion with no content and no
 * tool call, finished `stop`, and zero usage — streamed as server-sent events when the request asked for a stream, one JSON
 * body otherwise. `requestBody` is the call's request, read for its `model` and `stream` fields; one that will not parse is
 * answered as a stream, the product's own way of calling.
 */
export function emptyCompletion(requestBody) {
  let request = {};
  try { request = JSON.parse(String(requestBody)); } catch { request = { stream: true }; }
  const model = typeof request.model === 'string' ? request.model : 'injected';
  const id = 'chatcmpl-injected-empty';
  const created = 0;
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  if (request.stream === false) {
    return { contentType: 'application/json', body: JSON.stringify({ id, object: 'chat.completion', created, model, choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }], usage }) };
  }
  const event = (data) => `data: ${JSON.stringify(data)}\n\n`;
  const chunk = (choices, extra = {}) => ({ id, object: 'chat.completion.chunk', created, model, choices, ...extra });
  return {
    contentType: 'text/event-stream',
    body: `${event(chunk([{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }]))}${event(chunk([{ index: 0, delta: {}, finish_reason: 'stop' }]))}${event(chunk([], { usage }))}data: [DONE]\n\n`,
  };
}

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
   * The same two figures over the proxy's whole life, which `setFaults` never resets. The per-launch pair above is
   * what a scenario asks about the launch it just ran; the run's summary asks about every rule the run declared and
   * every one that fired, and reading the per-launch pair after the last scenario's `setFaults([])` reported
   * `faultsFired: []` and `faultsDeclared: 0` for a run in which three had fired (live-run finding H4, 2026-09-29).
   */
  const everFired = [];
  let everDeclared = faults.length;

  /**
   * The rule that acts on THIS call, or null.
   *
   * A rule names the path it watches (`/chat/completions` unless it says otherwise) and the **1-based index**
   * of the call on that path it fires at, because "the second completion" is a reproduction and "some
   * completion" is a coincidence — `codebase.md`'s strongest finding of 2026-09-12 is that sixty negative runs
   * proved nothing because none of them carried the input that failed. Each rule fires at most once. The `key` it
   * returns beside the rule is the path the call was counted on, which every fired record names.
   */
  const ruleFor = (path) => {
    if (faults.length === 0) return { rule: null, key: null };
    const watched = faults.filter((f) => path.includes(f.path ?? '/chat/completions'));
    if (watched.length === 0) return { rule: null, key: null };
    const key = watched[0].path ?? '/chat/completions';
    const index = (calls.get(key) ?? 0) + 1;
    calls.set(key, index);
    const rule = watched.find((f) => f.at === index && f.spent !== true) ?? null;
    if (rule !== null) { rule.spent = true; fired.push({ kind: rule.kind, at: rule.at, path: key }); everFired.push({ kind: rule.kind, at: rule.at, path: key }); }
    // A rule with `every: true` (the `pace` kind) acts on every call of its path; it is recorded as fired by the call it
    // actually acted on (`paceFired`), since most calls carry nothing it paces.
    return { rule: rule ?? watched.find((f) => f.every === true) ?? null, key };
  };
  const paceFired = (rule, key) => { fired.push({ kind: rule.kind, at: rule.at ?? 'every', path: key }); everFired.push({ kind: rule.kind, at: rule.at ?? 'every', path: key }); };

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
    const { rule, key: ruleKey } = ruleFor(path);
    let note = rule === null ? {} : { fault: { kind: rule.kind, at: rule.at ?? 'every', ...(rule.status ? { status: rule.status } : {}), ...(rule.afterChunks === undefined ? {} : { afterChunks: rule.afterChunks }), ...(rule.delayMs === undefined ? {} : { delayMs: rule.delayMs }) } };

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
      // The usage is the whole body's, kept beside the capped body (finding U6; `usageIn`).
      const usage = usageIn(Buffer.concat(backChunks).toString('utf8'));
      write(target, {
        at: new Date(started).toISOString(), ms: Date.now() - started,
        method: clientReq.method, path: clientReq.url, upstream: `${upstream.origin}${path}`,
        status: upstreamRes?.statusCode ?? null, ...note, ...(outcome === undefined ? {} : { outcome }), ...extra,
        requestHeaders: scrub(clientReq.headers), requestBody: redact(cap(sentChunks)),
        responseHeaders: upstreamRes?.headers ?? {}, responseBody: redact(cap(backChunks)),
        ...(usage === null ? {} : { usage }),
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

    const forward = () => {
    upstreamReq = transport(
      { protocol: upstream.protocol, hostname: upstream.hostname, port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80), method: clientReq.method, path, headers },
      (answer) => {
        upstreamRes = answer;
        // Status and headers straight through, before a single byte of body is copied anywhere.
        clientRes.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        let forwarded = 0;
        let severed = false;
        /*
         * `pace`: every server-sent event whose text holds `match` (by default `"tool_calls"`, a piece of a tool call's
         * streamed arguments on an OpenAI-shaped endpoint) reaches the client `delayMs` after the event before it; every
         * other event passes as soon as its turn comes. Nothing is dropped and nothing reordered: the endpoint answers at
         * its own speed and the client reads one slow tool call, the shape of the duress live runs' 97 s `write_file`
         * (`docs/defects/fixed/a-child-streaming-a-long-tool-call-is-reported-stalled.md`). The record carries `paced`:
         * how many events were held back, and the instants the first and the last of them were written.
         */
        const pace = rule?.kind === 'pace' ? { decoder: new StringDecoder('utf8'), pending: '', chain: Promise.resolve(), events: 0, firstAt: null, lastAt: null } : null;
        const paced = () => (pace === null ? {} : { paced: { events: pace.events, firstAt: pace.firstAt, lastAt: pace.lastAt } });
        const paceEvent = (event) => {
          pace.chain = pace.chain.then(async () => {
            if (ended || letGo || clientRes.destroyed) return;
            if (event.includes(rule.match ?? '"tool_calls"')) {
              await new Promise((r) => setTimeout(r, rule.delayMs ?? 100));
              if (ended || letGo || clientRes.destroyed) return;
              const now = Date.now();
              pace.events += 1;
              pace.firstAt ??= now;
              pace.lastAt = now;
            }
            clientRes.write(event);
          });
        };
        upstreamRes.on('data', (chunk) => {
          backChunks.push(chunk);
          if (severed) return;
          if (pace !== null) {
            // Whole events only: an event split across two chunks is held until its blank line arrives.
            pace.pending += pace.decoder.write(chunk);
            const events = pace.pending.split(/(?<=\r?\n\r?\n)/);
            pace.pending = /\r?\n\r?\n$/.test(events.at(-1) ?? '') ? '' : events.pop() ?? '';
            for (const event of events) paceEvent(event);
            return;
          }
          forwarded += 1;
          const after = rule?.afterChunks ?? 1;
          /*
           * `stall`: the bytes stop but the connection stays OPEN. This is the shape of
           * `docs/defects/fixed/single-retry-stream-stall-aborted-a-76-minute-run.md` and the one the product cannot
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
          if (pace !== null) {
            const rest = pace.pending + pace.decoder.end();
            if (rest !== '') paceEvent(rest);
            void pace.chain.then(() => {
              if (ended || letGo) return;
              if (pace.events > 0) paceFired(rule, ruleKey);
              clientRes.end();
              settle('complete', paced());
            });
            return;
          }
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

    };

    /*
     * `empty` (fin42, PD-ORCH-009 revision 2): a well-formed completion with no content and no tool call, `finish_reason`
     * `stop` — the answer of a root that ended its turn with nothing for the person — given to the calls whose REQUEST BODY
     * holds `when` (and not `unless`), up to `times` of them, the endpoint never contacted for them. Chosen by what the call
     * carries rather than by its index, since "the root's final completion" is a call no index names in advance: the body is
     * read whole before the call is forwarded or answered, which a completion's request body is anyway before the endpoint
     * answers. A streamed request (`"stream": true`) is answered as server-sent events, any other as one JSON body.
     * Since fin45 (PD-ORCH-009 revision 5, the `empty-wait` scenario) `when` and `unless` may each be a list: the body must hold
     * every `when` and none of the `unless` — "the root's request right after a delegation, before any report" needs two of each.
     */
    const listOf = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
    const emptyRules = rule === null ? faults.filter((f) => f.kind === 'empty' && (f.fired ?? 0) < (f.times ?? 1) && path.includes(f.path ?? '/chat/completions')) : [];
    if (emptyRules.length > 0) {
      clientReq.on('data', (chunk) => { sentChunks.push(chunk); });
      clientReq.on('end', () => {
        const body = Buffer.concat(sentChunks).toString('utf8');
        const hit = emptyRules.find((f) => listOf(f.when).every((w) => body.includes(w)) && !listOf(f.unless).some((u) => body.includes(u))) ?? null;
        if (hit === null) {
          forward();
          for (const chunk of sentChunks) upstreamReq.write(chunk);
          upstreamReq.end();
          return;
        }
        hit.fired = (hit.fired ?? 0) + 1;
        fired.push({ kind: 'empty', at: hit.fired, path: hit.path ?? '/chat/completions' });
        everFired.push({ kind: 'empty', at: hit.fired, path: hit.path ?? '/chat/completions' });
        note = { fault: { kind: 'empty', at: hit.fired, ...(hit.when === undefined ? {} : { when: hit.when }) } };
        const answer = emptyCompletion(body);
        clientRes.writeHead(200, { 'content-type': answer.contentType });
        clientRes.end(answer.body);
        backChunks.push(Buffer.from(answer.body));
        settle('complete', { status: 200 });
      });
      clientReq.on('error', () => { release(); });
      return;
    }
    forward();
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
    setFaults: (rules) => { faults = rules.map((rule) => ({ ...rule })); calls.clear(); fired.length = 0; everDeclared += faults.length; },
    /** This launch's figures: the fault pair covers the rules since the last `setFaults`. */
    stats: () => ({ recorded, failed, faultsFired: fired.slice(), faultsDeclared: faults.length }),
    /** The whole run's figures, for its summary: every rule ever declared, and every one that fired, in order. */
    totals: () => ({ recorded, failed, faultsFired: everFired.slice(), faultsDeclared: everDeclared }),
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
