import { CONTRACT_SCHEMA_VERSION, type InboundAskHandler, type InboundListenerAsk, type InboundRunStatusAnswer, type InboundStartRunAnswer } from '@rotaris/contracts';
import { millis } from '@rotaris/kernel';
import { nodeClocks, superviseUtilityProcess } from '@rotaris/platform';
import { InboundToken } from './guards.js';
import { createInboundHost, type InboundHost } from './host.js';
import { listenerAsk, readAnswerEnvelope, serveListenerRequest } from './protocol.js';

/**
 * INBOUND LISTENER — the surface's own `utilityProcess` (REQ-MCP-127, ADR-0002's amendment). It is forked from the one
 * shipped binary as the run host is, lives exactly as long as the application, and holds NO session lock and NO session
 * store: it speaks to main in the run host's existing terms and writes nothing durable itself (REQ-MCP-124/128).
 *
 * The process holds three things and nothing else: the OS socket bound to loopback on an ephemeral port (REQ-MCP-119),
 * the bearer token of the current exposure (REQ-MCP-121), and the one ask path back to main that answers both tools
 * (REQ-MCP-123/124). Main owns the workspace, the single-run slot and the trusted desktop state; this process owns none
 * of them.
 *
 * R-091: the first thing it starts is how it ends when nothing else ends it — `superviseUtilityProcess`, as the run host
 * and each workspace service do, so a throw no request path caught reaches main's log rather than nothing.
 */
superviseUtilityProcess({
  process,
  name: 'inbound listener',
  logError: (message) => { process.parentPort.postMessage({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'log', level: 'error', message } }); },
  timers: nodeClocks().timers,
});

const port = process.parentPort;
const clocks = nodeClocks();
const ASK_BOUND_MS = 30_000;

function send(message: unknown): void {
  port.postMessage(message);
}
function log(message: string, level: 'info' | 'warn' = 'info'): void {
  send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'log', level, message } });
}

/** REQ-MCP-121: the per-exposure token, minted by main and handed over on `inbound.enable`; this process only compares it. */
const token = new InboundToken();

/**
 * REQ-MCP-124: the one ask path back to main. Every ask is bounded (ADR-0002 c.11): a bound that elapses is a refusal
 * with its own reason rather than a hang. Keyed by the ask id.
 */
let nextAsk = 1;
const pendingAsks = new Map<number, { resolve: (a: InboundStartRunAnswer | InboundRunStatusAnswer) => void; reject: (e: Error) => void; cancel: () => void }>();
const mainAsk: InboundAskHandler = (request: InboundListenerAsk) => {
  const n = nextAsk++;
  return new Promise<InboundStartRunAnswer | InboundRunStatusAnswer>((resolve, reject) => {
    const handle = clocks.timers.after(millis(ASK_BOUND_MS), () => { pendingAsks.delete(n); reject(new Error(`main did not answer within ${ASK_BOUND_MS} ms`)); });
    pendingAsks.set(n, { resolve, reject, cancel: () => handle.cancel() });
    send(listenerAsk(n, request));
  });
};

const host: InboundHost = createInboundHost({ token, log, mainAsk });

/** REQ-MCP-120/127: main's three requests arrive on the port; an answer to an ask arrives on the same port, told apart by shape. */
port.on('message', (event: { data: unknown }) => {
  const answer = readAnswerEnvelope(event.data);
  if (answer !== null) {
    const p = pendingAsks.get(answer.ask);
    if (p) { pendingAsks.delete(answer.ask); p.cancel(); p.resolve(answer.answer); }
    return;
  }
  void serveListenerRequest(event.data, host, send).catch((error: unknown) => {
    log(`inbound listener: a request failed: ${error instanceof Error ? error.message : String(error)}`, 'warn');
  });
});

/** REQ-MCP-127 (R-091, OQ-473): the ready answer at the fork, so main's first request is held rather than bounded early. */
send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'ready', process: 'inbound-listener', pid: process.pid } });
