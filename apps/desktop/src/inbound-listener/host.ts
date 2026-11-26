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

/**
 * MINOR (REWORK 7, 2026-11-25): the cap on the requests queued on the listener's one chain. A request main has already
 * timed out is NOT removed here (there is no cancel across the boundary), so a burst of abandoned requests is REFUSED
 * past this cap rather than queued without end — the same choice main's gesture chain and REQ-MCP-126's slot make. The
 * figure is generous enough that ordinary use never meets it (an enable, a disable and a state read are three requests).
 */
export const MAX_QUEUED_LISTENER_REQUESTS = 32;

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
  /**
   * MAJOR (REQ-MCP-120/121, 2026-11-25): enable/disable/state are SERIALIZED through one chain. Two enables that arrive
   * together must not race: while the first is binding, `listener.binding()` is still null, so a second would rotate the
   * token and, on its rejected bind, revoke the token the FIRST (successful) bind is left comparing — the display and the
   * surface then drift. Applying the requests in the order they arrived makes the second enable see the first's bind and
   * become idempotent. `state` rides the same chain: it is cheap and must not read a half-applied exposure.
   *
   * MINOR (REWORK 7, 2026-11-25): the chain has a CAPACITY bound, as main's own gesture chain does
   * (`MAX_QUEUED_GESTURES`). A main request whose own bound elapsed is NOT removed here — the link discarded the reply,
   * but the listener still holds the work and will still run it (there is no cancel across the boundary). Without a bound,
   * a burst of such abandoned requests (a caller driving enable in a loop, or main retrying) would queue without end, so
   * past the cap a request is REFUSED with a stated reason rather than queued — the same choice REQ-MCP-126 makes for the
   * run slot. The cap is on what is OUTSTANDING, not on how much has ever run.
   */
  let chain: Promise<unknown> = Promise.resolve();
  let queued = 0;
  const serialize = <T>(work: () => Promise<T>): Promise<T> => {
    const next = chain.then(work, work);
    // Keep the chain alive past a rejection, so one failing request never wedges the next.
    chain = next.then(() => undefined, () => undefined);
    return next;
  };

  return {
    apply: (request: InboundListenerRequest): Promise<InboundListenerReply> => {
      if (queued >= MAX_QUEUED_LISTENER_REQUESTS) return Promise.resolve({ kind: 'refused', code: 'inbound.busy', headline: 'Too many inbound surface requests are already queued' });
      queued += 1;
      const run = serialize(async (): Promise<InboundListenerReply> => {
        switch (request.kind) {
          case 'inbound.enable': {
            /*
             * REQ-MCP-120/121 (MAJOR, 2026-11-25): a SECOND enable while the surface is ALREADY bound is IDEMPOTENT. It
             * returns the state that is in force and does NOT rotate or revoke the token: the first socket still serves
             * `transport.ts`'s bind refuses a second one, so rotating here left the listener comparing a token the display
             * no longer showed (two settings windows drifted apart). An enable is the FIRST exposure's act; a repeat is a
             * read of it. The token is rotated only when the surface is genuinely off.
             */
            if (listener.binding() !== null) return { kind: 'inbound.state', state: state() };
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
      });
      void run.then(() => { queued -= 1; }, () => { queued -= 1; });
      return run;
    },
    // REQ-MCP-123/124: the two tool calls go to main; the listener answers nothing of its own here.
    ask: deps.mainAsk,
  };
}
