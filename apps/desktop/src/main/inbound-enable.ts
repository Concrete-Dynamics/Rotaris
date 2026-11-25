import type { CommandOutcome } from '@rotaris/contracts';
import type { InboundExposure } from './inbound-exposure.js';

/**
 * MAIN'S ENABLE/DISABLE SEQUENCER (REQ-MCP-120/121; MAJOR of reviews 3 and 4, 2026-11-25). The two settings gestures share
 * ONE serialized path and ONE piece of bookkeeping, kept out of `index.ts` so the faults the review found are measured
 * without Electron:
 *
 * 1. **Everything the two gestures do is SERIALIZED, in the order the gestures arrived** — an enable that is still
 *    binding and a disable that arrives behind it cannot interleave. Two enables that overlap are joined (the second
 *    sees the first's exposure and is idempotent): while the first bind runs, `listener.binding()` is still null, so an
 *    unjoined second enable would rotate the token and, on its rejected bind, REVOKE the token the first (successful)
 *    bind is left comparing — the display and the surface then drift.
 * 2. **A DISABLE WAITS FOR AN IN-FLIGHT ENABLE and then disables** (the fault of review 4): while an enable's ask was
 *    outstanding, a disable read both flags as false and SKIPPED the listener, and the enable's reply then switched the
 *    exposure ON — a disable that answered "off" while the surface stayed open. Serializing the two closes that window:
 *    the disable runs after the enable has settled and asks the listener to unbind.
 * 3. **A gesture the listener did NOT confirm is not treated as done.** Main revokes its own exposure at once (the
 *    choice does not persist), but the listener may still hold a socket, so `listenerBound` stays true and the NEXT
 *    disable asks the listener again rather than skipping it on `enabled === false`. An ENABLE whose ask was refused
 *    likewise leaves nothing on, and a non-confirmed enable is not remembered as bound.
 */
export interface InboundEnablePorts {
  /** The exposure main shows; the token is minted by the caller and handed to the listener on enable. */
  readonly exposure: InboundExposure;
  /** Ask the listener to enable with a fresh token; answer whether it is now bound and on which port. */
  readonly askEnable: (token: string) => Promise<{ readonly ok: true; readonly port: number } | { readonly ok: false; readonly outcome: CommandOutcome }>;
  /** Ask the listener to disable; answer whether it CONFIRMED the socket is gone. */
  readonly askDisable: () => Promise<boolean>;
  /** Mint a fresh token for a new exposure. */
  readonly mintToken: () => string;
}

export interface InboundEnableSequencer {
  /** REQ-MCP-120: turn the surface on — idempotent once bound, serialized behind any gesture already in flight. */
  readonly enable: () => Promise<CommandOutcome>;
  /** REQ-MCP-120/121: turn it off — serialized behind an in-flight enable, and retried while the listener did not confirm. */
  readonly disable: () => Promise<CommandOutcome>;
  /** Whether the LISTENER may still hold a bound socket (told apart from the exposure main shows). */
  readonly listenerBound: () => boolean;
  /** The listener is gone: nothing of it is bound any more. */
  readonly listenerGone: () => void;
}

export function createInboundEnableSequencer(ports: InboundEnablePorts): InboundEnableSequencer {
  let listenerBound = false;
  /** The one chain every gesture rides, so an enable and a disable that overlap are applied in the order they arrived. */
  let chain: Promise<unknown> = Promise.resolve();
  /** The enable still in flight, so a repeat JOINS it rather than starting a second bind/rotation (read inside the chain). */
  let inFlight: Promise<CommandOutcome> | null = null;

  /** Run `work` after every gesture already queued, keeping the chain alive past a rejection so one failure never wedges the next. */
  const serialize = <T>(work: () => Promise<T>): Promise<T> => {
    const next = chain.then(work, work);
    chain = next.then(() => undefined, () => undefined);
    return next;
  };

  const doEnable = async (): Promise<CommandOutcome> => {
    // A repeat while the exposure is already on and bound is IDEMPOTENT: no fresh token, no rebind.
    const current = ports.exposure.view(false);
    if (current.enabled && current.port !== null && listenerBound) return { ok: true, value: current };
    const token = ports.mintToken();
    const asked = await ports.askEnable(token);
    if (!asked.ok) {
      // A bind that was NOT confirmed leaves nothing on and no token in force (REQ-MCP-121).
      ports.exposure.turnOff();
      listenerBound = false;
      return asked.outcome;
    }
    ports.exposure.turnOn(token);
    ports.exposure.bound(asked.port);
    listenerBound = true;
    return { ok: true, value: ports.exposure.view(true) };
  };

  const enable = (): Promise<CommandOutcome> => {
    // MAJOR (1): a second enable while one is IN FLIGHT joins it rather than queueing a second bind/rotation behind it.
    if (inFlight !== null) return inFlight;
    const work = serialize(doEnable);
    const tracked = work.finally(() => { if (inFlight === tracked) inFlight = null; });
    inFlight = tracked;
    return tracked;
  };

  const disable = (): Promise<CommandOutcome> => serialize(async (): Promise<CommandOutcome> => {
    const wasEnabled = ports.exposure.view(false).enabled;
    // REQ-MCP-120/121: the exposure main shows is revoked at once — the choice does not persist. With nothing to revoke
    // and nothing the listener may hold, there is nothing to ask; otherwise the listener is asked to unbind.
    ports.exposure.turnOff();
    // MAJOR (2): a disable that was NOT confirmed is not done — the listener may still hold a socket.
    if (!wasEnabled && !listenerBound) return { ok: true, value: ports.exposure.view(false) };
    const confirmed = await ports.askDisable();
    if (!confirmed) {
      return { ok: false, code: 'inbound.unreachable', headline: 'The inbound surface did not answer the disable', detail: 'The exposure and its token are revoked in the application; the listener did not confirm it, so a socket of it may still be open until the listener or the application ends.' };
    }
    listenerBound = false;
    return { ok: true, value: ports.exposure.view(false) };
  });

  return { enable, disable, listenerBound: () => listenerBound, listenerGone: () => { listenerBound = false; } };
}
