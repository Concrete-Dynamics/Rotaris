import { CONTRACT_SCHEMA_VERSION, INBOUND_LISTENER_ASK_BOUND_MS, type InboundAskHandler, type InboundListenerAsk, type InboundRunStatusAnswer, type InboundStartRunAnswer } from '@rotaris/contracts';
import { millis, type Millis, type Timers } from '@rotaris/kernel';
import { listenerAsk } from './protocol.js';

/**
 * THE LISTENER'S ONE ASK PATH (REQ-MCP-123/124; ADR-0002 c.11). Both tools reduce to one ask to main, and every ask is
 * bounded: a bound that elapses is a refusal with its own reason rather than a hang.
 *
 * BLOCKER 1 (2026-11-25): the bound is `INBOUND_LISTENER_ASK_BOUND_MS`, DERIVED from main's own start bound
 * (`INBOUND_START_BOUND_MS`) plus a margin in `contracts/inbound.ts`. It is deliberately NOT a local figure: main waits up
 * to `INBOUND_START_BOUND_MS` for the run host and the host up to its credential lease before that, so a shorter listener
 * bound would answer a slow-but-confirmed start with this listener's own timeout and throw the reserved handle away. The
 * ask path is a module of its own so this is measured with a fake clock and a slow main, with no process and no port.
 */
export interface InboundAsker {
  /** The one ask path to main, bounded. `send` writes the ask envelope on the port. */
  readonly ask: InboundAskHandler;
  /** Answers an ask whose number is `ask` — the port reader calls this for every answer envelope. */
  readonly answer: (ask: number, answer: InboundStartRunAnswer | InboundRunStatusAnswer) => void;
  /** How many asks are still waiting on main (a test reads it after the bound elapses). */
  readonly pending: () => number;
}

export function createInboundAsker(deps: { readonly send: (message: unknown) => void; readonly timers: Timers; readonly boundMs?: Millis | undefined }): InboundAsker {
  const bound = deps.boundMs ?? millis(INBOUND_LISTENER_ASK_BOUND_MS);
  let nextAsk = 1;
  const waiting = new Map<number, { resolve: (a: InboundStartRunAnswer | InboundRunStatusAnswer) => void; cancel: () => void }>();
  const ask: InboundAskHandler = (request: InboundListenerAsk) => {
    const n = nextAsk++;
    return new Promise<InboundStartRunAnswer | InboundRunStatusAnswer>((resolve, reject) => {
      const handle = deps.timers.after(bound, () => { waiting.delete(n); reject(new Error(`main did not answer within ${bound} ms`)); });
      waiting.set(n, { resolve, cancel: () => handle.cancel() });
      deps.send({ v: CONTRACT_SCHEMA_VERSION, ...listenerAsk(n, request) });
    });
  };
  return {
    ask,
    answer: (n, a) => { const p = waiting.get(n); if (p) { waiting.delete(n); p.cancel(); p.resolve(a); } },
    pending: () => waiting.size,
  };
}
