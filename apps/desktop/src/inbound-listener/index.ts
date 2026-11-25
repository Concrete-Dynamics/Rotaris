import { CONTRACT_SCHEMA_VERSION } from '@rotaris/contracts';
import { nodeClocks, superviseUtilityProcess } from '@rotaris/platform';
import { createInboundAsker } from './asks.js';
import { InboundToken } from './guards.js';
import { createInboundHost, type InboundHost } from './host.js';
import { readAnswerEnvelope, serveListenerRequest } from './protocol.js';

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

function send(message: unknown): void {
  port.postMessage(message);
}
function log(message: string, level: 'info' | 'warn' = 'info'): void {
  send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'log', level, message } });
}

/** REQ-MCP-121: the per-exposure token, minted by main and handed over on `inbound.enable`; this process only compares it. */
const token = new InboundToken();

/**
 * REQ-MCP-123/124 (BLOCKER 1, 2026-11-25): the one ask path back to main, bounded by the SHARED figure derived from
 * main's own start bound (`INBOUND_LISTENER_ASK_BOUND_MS`, `contracts/inbound.ts`). A bound shorter than main's would
 * answer a slow-but-confirmed start with this listener's own timeout and throw the reserved handle away.
 */
const asker = createInboundAsker({ send, timers: clocks.timers });
const mainAsk = asker.ask;

const host: InboundHost = createInboundHost({ token, log, mainAsk });

/** REQ-MCP-120/127: main's three requests arrive on the port; an answer to an ask arrives on the same port, told apart by shape. */
port.on('message', (event: { data: unknown }) => {
  const answer = readAnswerEnvelope(event.data);
  if (answer !== null) {
    asker.answer(answer.ask, answer.answer);
    return;
  }
  void serveListenerRequest(event.data, host, send).catch((error: unknown) => {
    log(`inbound listener: a request failed: ${error instanceof Error ? error.message : String(error)}`, 'warn');
  });
});

/** REQ-MCP-127 (R-091, OQ-473): the ready answer at the fork, so main's first request is held rather than bounded early. */
send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'ready', process: 'inbound-listener', pid: process.pid } });
