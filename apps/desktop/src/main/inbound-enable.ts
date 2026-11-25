import type { CommandOutcome } from '@rotaris/contracts';
import type { InboundExposure } from './inbound-exposure.js';

/**
 * MAIN'S ENABLE/DISABLE SEQUENCER (REQ-MCP-120/121; MAJOR of reviews 3, 4 and 5, 2026-11-25). The two settings gestures
 * share ONE serialized path and ONE piece of bookkeeping, kept out of `index.ts` so the faults the review found are
 * measured without Electron:
 *
 * 1. **Everything the two gestures do is SERIALIZED, in the order the gestures arrived** — an enable that is still
 *    binding and a disable that arrives behind it cannot interleave, and a gesture is never DROPPED in favour of another.
 *    An enable that meets a surface already bound is idempotent (it reads the exposure, and does not rotate or rebind);
 *    two enables that overlap therefore bind ONCE, and `Enable → Disable → Enable` performs the LAST enable — the fault
 *    of review 5 was a repeat enable joining the FIRST enable still in flight, so the gesture between them was skipped
 *    and the surface ended off.
 * 2. **A DISABLE WAITS FOR AN IN-FLIGHT ENABLE and then disables** (the fault of review 4): while an enable's ask was
 *    outstanding, a disable read both flags as false and SKIPPED the listener, and the enable's reply then switched the
 *    exposure ON — a disable that answered "off" while the surface stayed open.
 * 3. **The bind state is held TRUTHFULLY, and the display never disagrees with the listener** (the fault of review 5).
 *    An enable whose ask was NOT answered within its bound — a timeout, an unreachable listener — leaves the bind
 *    question OPEN: the listener may still be binding and may still end bound with the token it was handed. Main does
 *    NOT report `listenerBound === false` for that (a following disable must still reach the listener), and it does NOT
 *    mint a fresh token for the NEXT enable while the question is open: the token it handed over is remembered
 *    (`pendingToken`), and the next enable first READS the listener's state — `listening` adopts that very token, so
 *    what main shows is the token the listener in fact demands, and `not listening` closes the question so a fresh
 *    enable binds from scratch. Only the listener's own answer that the bind FAILED closes the question as "off".
 */
export interface InboundEnablePorts {
  /** The exposure main shows; the token is minted by the caller and handed to the listener on enable. */
  readonly exposure: InboundExposure;
  /**
   * Ask the listener to enable with a fresh token; answer whether it is now bound and on which port. `definite` says
   * whether the LISTENER ITSELF decided the bind (a `bindFailed` refusal): only then is the bind question closed as
   * "nothing is bound". A timeout or an unreachable listener leaves it OPEN (`definite: false`).
   */
  readonly askEnable: (token: string) => Promise<{ readonly ok: true; readonly port: number } | { readonly ok: false; readonly outcome: CommandOutcome; readonly definite: boolean }>;
  /** Ask the listener to disable; answer whether it CONFIRMED the socket is gone. */
  readonly askDisable: () => Promise<boolean>;
  /** Read the listener's own state; `null` when the listener did not answer (the question stays open). */
  readonly askState: () => Promise<{ readonly listening: boolean; readonly port: number | null } | null>;
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
  /** True while the listener MAY hold a socket — including a bind whose question is still open (review 5, point 3). */
  let listenerBound = false;
  /** The token handed over with an enable whose bind is not yet confirmed, or null when the question is closed. */
  let pendingToken: string | null = null;
  /** The one chain every gesture rides, so an enable and a disable that overlap are applied in the order they arrived. */
  let chain: Promise<unknown> = Promise.resolve();

  /** Run `work` after every gesture already queued, keeping the chain alive past a rejection so one failure never wedges the next. */
  const serialize = <T>(work: () => Promise<T>): Promise<T> => {
    const next = chain.then(work, work);
    chain = next.then(() => undefined, () => undefined);
    return next;
  };

  /**
   * Resolve a bind question left OPEN by an earlier enable: read the listener's own state. `listening` means the late
   * bind DID happen with the token main handed over, so main adopts that very token (the display and the listener agree);
   * `not listening` closes the question as off; an unanswered read keeps it open.
   */
  const resolvePending = async (): Promise<CommandOutcome | null> => {
    if (pendingToken === null) return null;
    const token = pendingToken;
    const state = await ports.askState();
    if (state === null) {
      // The listener still did not answer: the question stays open and the exposure stays off, but the listener may yet
      // hold a socket — a disable will reach it.
      return { ok: false, code: 'inbound.unreachable', headline: 'The inbound listener did not answer', detail: 'The exposure is revoked in the application; the listener did not confirm its state, so a socket of it may still be open until the listener or the application ends.' };
    }
    pendingToken = null;
    if (!state.listening) {
      listenerBound = false;
      ports.exposure.turnOff();
      return null; // The question is closed: the caller's enable proceeds as a fresh one.
    }
    // The late bind landed with the token main handed over: adopt it, so what main SHOWS is what the listener DEMANDS.
    listenerBound = true;
    ports.exposure.turnOn(token);
    if (state.port !== null) ports.exposure.bound(state.port);
    return { ok: true, value: ports.exposure.view(true) };
  };

  const doEnable = async (): Promise<CommandOutcome> => {
    // An earlier enable whose bind was never confirmed is resolved FIRST, before anything else is decided.
    const resolved = await resolvePending();
    if (resolved !== null) return resolved;
    // A repeat while the exposure is already on and bound is IDEMPOTENT: no fresh token, no rebind.
    const current = ports.exposure.view(false);
    if (current.enabled && current.port !== null && listenerBound) return { ok: true, value: current };
    const token = ports.mintToken();
    const asked = await ports.askEnable(token);
    if (!asked.ok) {
      ports.exposure.turnOff();
      if (asked.definite) {
        // The listener itself answered that the bind failed: nothing holds a socket, so the question is CLOSED as off.
        listenerBound = false;
        pendingToken = null;
      } else {
        // A timeout, an unreachable listener: the question stays OPEN. Main must not claim the listener is off, and the
        // next enable must not mint a new token while this one may be the token the listener bound with.
        listenerBound = true;
        pendingToken = token;
      }
      return asked.outcome;
    }
    ports.exposure.turnOn(token);
    ports.exposure.bound(asked.port);
    listenerBound = true;
    pendingToken = null;
    return { ok: true, value: ports.exposure.view(true) };
  };

  /**
   * REQ-MCP-120/121: every enable rides the one chain. A repeat enable that meets an already-bound surface is idempotent
   * INSIDE the chain, so two overlapping enables bind once — and, unlike a join, a gesture queued BETWEEN them is still
   * performed (`Enable → Disable → Enable` ends ON, the last gesture's own outcome).
   */
  const enable = (): Promise<CommandOutcome> => serialize(doEnable);

  /**
   * The disable's own work, run INSIDE the one chain (MAJOR of review 4): a disable that arrives while an enable is still
   * binding waits for it and THEN unbinds, instead of reading both flags as false, skipping the listener, and leaving the
   * exposure to be switched ON by the enable's reply.
   */
  const doDisable = async (): Promise<CommandOutcome> => {
    const wasEnabled = ports.exposure.view(false).enabled;
    // REQ-MCP-120/121: the exposure main shows is revoked at once — the choice does not persist. With nothing to revoke
    // and nothing the listener may hold, there is nothing to ask; otherwise the listener is asked to unbind.
    ports.exposure.turnOff();
    /*
     * MAJOR (review 5, point 3): a disable reaches the listener whenever it MAY hold a socket — a confirmed exposure
     * (`wasEnabled`) or a socket main already knows of (`listenerBound`, which stays true while a bind question is open
     * because an enable was not answered in time). That is exactly the case the disable used to skip.
     */
    if (!wasEnabled && !listenerBound) return { ok: true, value: ports.exposure.view(false) };
    const confirmed = await ports.askDisable();
    if (!confirmed) {
      return { ok: false, code: 'inbound.unreachable', headline: 'The inbound surface did not answer the disable', detail: 'The exposure and its token are revoked in the application; the listener did not confirm it, so a socket of it may still be open until the listener or the application ends.' };
    }
    listenerBound = false;
    pendingToken = null;
    return { ok: true, value: ports.exposure.view(false) };
  };

  const disable = (): Promise<CommandOutcome> => serialize(doDisable);

  return { enable, disable, listenerBound: () => listenerBound, listenerGone: () => { listenerBound = false; pendingToken = null; } };
}
