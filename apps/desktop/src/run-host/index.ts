import { CONTRACT_SCHEMA_VERSION, ProcessRequestEnvelopeSchema, RunHostRequestSchema, ServiceAnswerEnvelopeSchema } from '@rotaris/contracts';
import { holdMessagesFor, injectChildFault, nodeClocks, superviseUtilityProcess } from '@rotaris/platform';
import { createRunHost } from './host.js';
import { dispatch } from './dispatch.js';

/**
 * RUN HOST — one utilityProcess, forked after `app.ready`, living exactly as
 * long as the application (ADR-0002 #2). It holds every session lock this
 * application takes, and therefore everything that writes a session: the
 * session writers, the projection owners they feed, and the runs
 * (ADR-0008, ADR-0013, ADR-0043).
 *
 * It is HANDED a resolved store path and never reads the identifier file
 * (W-18). A publication leaves here already stamped; main relays it.
 *
 * ADR-0058 step 3b: the refusal of new runs is a lease this process expires
 * itself, so a workspace service that died releases the workspace by doing
 * nothing.
 *
 * WHERE THE MODEL AND THE RUNTIME COME FROM — the configuration files, loaded
 * per run start with the live state on top (ADR-0036/0037, `configuration.ts`).
 * The dialect switch (`scriptedDialect`, compiled out of a packaged build) selects
 * a built-in scripted client for every model (verification only). A fatal file or an unreachable entry model refuses
 * the run before it starts (REQ-EVENTS-021, REQ-CONFIG-478).
 *
 * This file is the ENTRY and nothing else: what the process holds is `host.ts`,
 * what it answers is `dispatch.ts`, and the stand-in every proof runs against is
 * `scripted-client.ts`. Only the lines below start anything, which is what
 * lets the other two be imported without forking a single child.
 *
 * R-091 (hardening §3.2 row 1): the first thing it starts is how it ends when nothing else ends it — one `error` line
 * to main's log and status 70 on a throw or a rejection no request path caught, and status 69 within 250 ms of main's
 * end (`superviseUtilityProcess`, `@rotaris/platform`). Nothing more is written to the store either way: the sessions
 * it held are repaired by the engine's crash path on the next open (`packages/engine/src/run/crash.ts`).
 */
superviseUtilityProcess({
  process,
  name: 'run host',
  logError: (message) => { process.parentPort.postMessage({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'log', level: 'error', message } }); },
  timers: nodeClocks().timers,
});
// Verification only, compiled out of a packaged build: a fault the last-resort handler is proved against (`exit-trace-proof`),
// silence, which misses main's ready bound (OQ-462 (2)), or a slow start, which meets it late (OQ-473).
const fault = __ROTARIS_SEAMS__ ? injectChildFault(process.env['ROTARIS_CAPTURE_CHILD_FAULT'], 'run-host', nodeClocks().timers) : { silent: false, slowMs: 0 };

// Everything this process holds, built now rather than at import (`host.ts`), and the one request path over it.
const h = createRunHost();
const { port, send, reply, pendingAsks } = h;

if (!fault.silent) port.on('message', holdMessagesFor((e: { data: unknown }) => {
  const answer = ServiceAnswerEnvelopeSchema.safeParse(e.data);
  if (answer.success) {
    const p = pendingAsks.get(answer.data.ask);
    if (p) { pendingAsks.delete(answer.data.ask); p.cancel(); p.resolve(answer.data.reply); }
    return;
  }
  const env = ProcessRequestEnvelopeSchema.safeParse(e.data);
  if (!env.success) return;
  const req = RunHostRequestSchema.safeParse(env.data.request);
  if (!req.success) { reply(env.data.id, { kind: 'refused', code: 'request.malformed', headline: 'not a run-host request' }); return; }
  dispatch(req.data, h).then(
    (r) => reply(env.data.id, r),
    (err) => reply(env.data.id, { kind: 'refused', code: 'request.failed', headline: String(err) }),
  );
}, fault.slowMs, nodeClocks().timers));

send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'ready', process: 'run-host', pid: process.pid } });

