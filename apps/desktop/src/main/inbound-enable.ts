import type { CommandOutcome } from '@rotaris/contracts';
import type { InboundExposure } from './inbound-exposure.js';

/**
 * MAIN'S ENABLE/DISABLE SEQUENCER (REQ-MCP-120/121; MAJOR of review 3, 2026-11-25). The two settings gestures share ONE
 * serialized path and ONE piece of bookkeeping, kept out of `index.ts` so the two faults the review found are measured
 * without Electron:
 *
 * 1. **Two enables that overlap are serialized.** While the first bind runs, `listener.binding()` is still null, so a
 *    second enable that slipped in would rotate the token and, on its rejected bind, REVOKE the token the first
 *    (successful) bind is left comparing — the display and the surface then drift. The second enable JOINS the first
 *    (idempotence at the host) rather than starting a second rotation.
 * 2. **A disable the listener did NOT confirm is not treated as done.** Main revokes its own exposure at once (the
 *    choice does not persist), but the listener may still hold a socket, so `listenerBound` stays true and the NEXT
 *    disable asks the listener again rather than skipping it on `enabled === false`.
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
  /** REQ-MCP-120: turn the surface on — idempotent once bound, serialized while a bind is in flight. */
  readonly enable: () => Promise<CommandOutcome>;
  /** REQ-MCP-120/121: turn it off; a non-confirmed disable stays pending so the next call asks the listener again. */
  readonly disable: () => Promise<CommandOutcome>;
  /** Whether the LISTENER may still hold a bound socket (told apart from the exposure main shows). */
  readonly listenerBound: () => boolean;
  /** The listener is gone: nothing of it is bound any more. */
  readonly listenerGone: () => void;
}

export function createInboundEnableSequencer(ports: InboundEnablePorts): InboundEnableSequencer {
  let listenerBound = false;
  let inFlight: Promise<CommandOutcome> | null = null;

  const enable = (): Promise<CommandOutcome> => {
    // MAJOR (1): a second enable while one is IN FLIGHT joins it rather than starting a second bind/rotation.
    if (inFlight !== null) return inFlight;
    const work = (async (): Promise<CommandOutcome> => {
      // A repeat while the exposure is already on and bound is IDEMPOTENT: no fresh token, no rebind.
      const current = ports.exposure.view(false);
      if (current.enabled && current.port !== null && listenerBound) return { ok: true, value: current };
      const token = ports.mintToken();
      const asked = await ports.askEnable(token);
      if (!asked.ok) { ports.exposure.turnOff(); return asked.outcome; }
      ports.exposure.turnOn(token);
      ports.exposure.bound(asked.port);
      listenerBound = true;
      return { ok: true, value: ports.exposure.view(true) };
    })();
    const tracked = work.finally(() => { if (inFlight === tracked) inFlight = null; });
    inFlight = tracked;
    return tracked;
  };

  const disable = async (): Promise<CommandOutcome> => {
    const wasEnabled = ports.exposure.view(false).enabled;
    ports.exposure.turnOff();
    // MAJOR (2): a disable that was NOT confirmed is not done — the listener may still hold a socket.
    if (!wasEnabled && !listenerBound) return { ok: true, value: ports.exposure.view(false) };
    const confirmed = await ports.askDisable();
    if (!confirmed) {
      return { ok: false, code: 'inbound.unreachable', headline: 'The inbound surface did not answer the disable', detail: 'The exposure and its token are revoked in the application; the listener did not confirm it, so a socket of it may still be open until the listener or the application ends.' };
    }
    listenerBound = false;
    return { ok: true, value: ports.exposure.view(false) };
  };

  return { enable, disable, listenerBound: () => listenerBound, listenerGone: () => { listenerBound = false; } };
}
