import type { InboundAskHandler, InboundListenerReply, InboundListenerRequest, InboundListenerState } from '@rotaris/contracts';
import type { InboundToken } from './guards.js';
import { createInboundListener, type InboundListener } from './transport.js';

/**
 * THE LISTENER'S STATE (REQ-MCP-119/120/121/127): what the `utilityProcess` holds and what main asks it to do. It owns
 * the current exposure — the socket bound to loopback on an ephemeral port and the per-exposure bearer token — and
 * forwards the two tool calls to main as narrow asks. It has no workspace, no slot and no store.
 *
 * The whole thing is pure over injected ports (`bind`, `ask`, `log`) so the protocol can be driven in a test with no
 * Electron, no socket and no main.
 */

/** The state machine's ports. `ask` is the one path to main; `bound` answers the OS's chosen port. */
export interface InboundHostDeps {
  readonly token: InboundToken;
  readonly log: (message: string, level: 'info' | 'warn') => void;
  /** Bind/unbind the loopback surface; production passes `createInboundListener`, a test its own stand-in. */
  readonly listener?: InboundListener | undefined;
  /** The one path to main: a tool call reduced to an ask, and main's answer. */
  readonly mainAsk: InboundAskHandler;
}

export interface InboundHost {
  /** main's three requests, applied. Answers what the listener did. */
  readonly apply: (request: InboundListenerRequest) => Promise<InboundListenerReply>;
  /** The surface's one ask path — `rotaris_start_run` / `rotaris_run_status` reach main through it. */
  readonly ask: InboundAskHandler;
}

export function createInboundHost(deps: InboundHostDeps): InboundHost {
  const listener = deps.listener ?? createInboundListener({ token: deps.token, ask: deps.mainAsk, log: deps.log });
  const state = (): InboundListenerState => {
    const binding = listener.binding();
    return { listening: binding !== null, port: binding === null ? null : binding.port };
  };

  return {
    apply: async (request: InboundListenerRequest): Promise<InboundListenerReply> => {
      switch (request.kind) {
        case 'inbound.enable': {
          // REQ-MCP-121: the token is rotated for this exposure FIRST, so an enable that fails a bind leaves no old
          // token accepted; the surface then binds on loopback, and the OS chooses the port (REQ-MCP-119).
          deps.token.rotate(request.token);
          try {
            await listener.bind();
          } catch (error) {
            // A bind that failed exposes nothing: the token is revoked with the failure, and the refusal names the cause.
            deps.token.revoke();
            return { kind: 'refused', code: 'inbound.bindFailed', headline: 'The inbound surface could not be bound to loopback', detail: error instanceof Error ? error.message : String(error) };
          }
          return { kind: 'inbound.state', state: state() };
        }
        case 'inbound.disable': {
          // REQ-MCP-120/121: revoking the exposure invalidates the token with it, so a stale token is refused afterwards.
          deps.token.revoke();
          await listener.unbind();
          return { kind: 'inbound.state', state: state() };
        }
        case 'inbound.state':
          return { kind: 'inbound.state', state: state() };
      }
    },
    // REQ-MCP-123/124: the two tool calls go to main; the listener answers nothing of its own here.
    ask: deps.mainAsk,
  };
}
