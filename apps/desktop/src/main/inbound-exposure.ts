import type { UtilityProcess } from 'electron';
import type { MessagePortLike } from '@rotaris/shell';
import { millis, type Timers } from '@rotaris/kernel';
import { CONTRACT_SCHEMA_VERSION, InboundAskEnvelopeSchema, InboundListenerStateSchema, InboundListenerEventEnvelopeSchema, InboundListenerReplyEnvelopeSchema, type InboundExposure as InboundExposureView, type InboundAskHandler, type InboundListenerRequest, type InboundListenerReply } from '@rotaris/contracts';
import { randomBytes } from 'node:crypto';

/**
 * MAIN'S END OF THE INBOUND SURFACE (ADR-0067; REQ-MCP-119/120/121/127). Main mints the per-exposure token, forks the
 * listener's own `utilityProcess` (REQ-MCP-127 — the one shipped binary, as the run host is), asks it to `enable`/`disable`
 * and reads its state. The token is shown ONCE to the user and is never logged; the listener compares it and never sends
 * it back on any ask.
 *
 * This module is the boundary half: a small request/reply link over the child's message port (the `ProcessLink` pattern,
 * specialised because the listener's own wire is not `RunHostRequest`), and the exposure state main holds. The listener
 * answers the port the OS chose, which is the one fact main cannot compute itself.
 */

/** REQ-MCP-127: the fork, and its bounds — the ready answer at the fork, as the run host's `hello` (OQ-473). */
export const INBOUND_LISTENER_SERVICE_NAME = 'rotaris-inbound-listener';
export const INBOUND_LISTENER_READY_BOUND_MS = millis(20_000);

/**
 * REQ-MCP-123/130 (Minor, 2026-11-25): the ask number of a message that HAS an ask number but whose request does not
 * read — so an unreadable tool call can be answered with a refusal correlated to it, rather than dropped into a timeout.
 * `InboundListenerAskSchema` fixes both fields, so the unreadable case is exactly a well-formed number beside an
 * ill-formed request; anything else is not an ask at all and is left to the reply/event readers.
 */
function unreadableAskNumber(raw: unknown): number | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  if (!('ask' in m) || typeof m['ask'] !== 'number' || !Number.isInteger(m['ask']) || m['ask'] < 0) return null;
  if (!('request' in m)) return null;
  return InboundAskEnvelopeSchema.safeParse(raw).success ? null : m['ask'];
}

/** The token main mints for one exposure: 32 random bytes, base64url (REQ-MCP-121, shown once). */
export function newInboundToken(): string {
  const bytes = new Uint8Array(randomBytes(32));
  return Buffer.from(bytes).toString('base64url');
}

/** main's link to the listener: bounded requests in, events and answers out. */
export class InboundListenerLink {
  #nextId = 1;
  readonly #pending = new Map<number, { resolve: (r: InboundListenerReply) => void; reject: (e: Error) => void; cancel: () => void }>();
  #ended: InboundListenerReply | null = null;
  #stop: () => void;
  #askHandler: InboundAskHandler | null = null;

  constructor(private readonly port: MessagePortLike, private readonly timers: Timers, private readonly log: (m: string, level: 'info' | 'warn') => void) {
    this.#stop = port.onMessage((raw) => {
      /*
       * The listener's ASK to main (a tool call), read through the boundary's own contract rather than an ad-hoc cast:
       * the listener sends `{ ask, request }` (`InboundAskEnvelopeSchema`, `listenerAsk`). This direction is the one the
       * fix of 2026-11-25 repaired — the branch previously tested `raw.answer`, which a `{ ask, request }` message never
       * carries, so every `rotaris_start_run`/`rotaris_run_status` ask fell through the shape test and was dropped in
       * silence and the two tools never reached the coordinator. Answering back as `{ ask, answer }` is unchanged.
       */
      const ask = InboundAskEnvelopeSchema.safeParse(raw);
      if (ask.success) {
        this.#answer(ask.data.ask, ask.data.request);
        return;
      }
      /*
       * REQ-MCP-123/130 (Minor, 2026-11-25): an ASK whose request does not read — a run handle that is not the shape the
       * surface mints is the case this closes — is answered with a refusal instead of being DROPPED. Dropping left the
       * listener's ask pending until its own bound elapsed, so the caller saw an IPC timeout rather than a stated
       * refusal. The ask number is read off the message, so the refusal is correlated like any other answer.
       */
      const unreadableAsk = unreadableAskNumber(raw);
      if (unreadableAsk !== null) {
        this.port.postMessage({ v: CONTRACT_SCHEMA_VERSION, ask: unreadableAsk, answer: { kind: 'refused', code: 'inbound.malformed-ask', headline: 'The surface refused a malformed tool call', detail: 'A run handle is the value `rotaris_start_run` returned: the shape `inr_` followed by 32 hexadecimal characters.' } });
        return;
      }
      const reply = InboundListenerReplyEnvelopeSchema.safeParse(raw);
      if (reply.success) {
        const p = this.#pending.get(reply.data.id);
        if (p) { this.#pending.delete(reply.data.id); p.cancel(); p.resolve(reply.data.reply); }
        return;
      }
      const event = InboundListenerEventEnvelopeSchema.safeParse(raw);
      if (event.success && event.data.event.kind === 'log') this.log(`inbound listener: ${event.data.event.message}`, event.data.event.level === 'error' ? 'warn' : 'info');
    });
  }

  /** main answers the listener's asks (the two tools); wired by main once. */
  onAsk(handler: InboundAskHandler): void {
    this.#askHandler = handler;
  }

  #answer(ask: number, answer: unknown): void {
    // The listener sends an ask, main answers it on the same port. The handler is set once at main's build; a missing one
    // is a refusal with its reason, never silence.
    if (this.#askHandler === null) { this.port.postMessage({ v: CONTRACT_SCHEMA_VERSION, ask, answer: { kind: 'refused', code: 'inbound.no-handler', headline: 'The surface has no handler in main' } }); return; }
    void Promise.resolve(this.#askHandler(answer as Parameters<InboundAskHandler>[0])).then(
      (a) => this.port.postMessage({ v: CONTRACT_SCHEMA_VERSION, ask, answer: a }),
      (e: unknown) => this.port.postMessage({ v: CONTRACT_SCHEMA_VERSION, ask, answer: { kind: 'refused', code: 'inbound.ask-failed', headline: 'The ask failed', detail: e instanceof Error ? e.message : String(e) } }),
    );
  }

  /** One bounded request to the listener (ADR-0002 c.11: every acknowledgement is bounded, expiry refuses). */
  request(request: InboundListenerRequest, boundMs: number): Promise<InboundListenerReply> {
    if (this.#ended !== null) return Promise.resolve(this.#ended);
    const id = this.#nextId++;
    return new Promise<InboundListenerReply>((resolve, reject) => {
      const handle = this.timers.after(millis(boundMs), () => { this.#pending.delete(id); reject(new Error(`the inbound listener did not answer ${request.kind} within ${boundMs} ms`)); });
      this.#pending.set(id, { resolve, reject, cancel: () => handle.cancel() });
      this.port.postMessage({ v: CONTRACT_SCHEMA_VERSION, id, request } satisfies { v: number; id: number; request: InboundListenerRequest });
    });
  }

  /** REQ-MCP-127 (OQ-462 (3)): the listener is gone — no answer can come; every later request is refused at once. */
  end(refusal: InboundListenerReply): void {
    if (this.#ended !== null) return;
    this.#ended = refusal;
    for (const p of this.#pending.values()) { p.cancel(); p.resolve(refusal); }
    this.#pending.clear();
  }

  close(): void {
    this.#stop();
    for (const p of this.#pending.values()) { p.cancel(); p.reject(new Error('link closed')); }
    this.#pending.clear();
  }
}

/** The listener-gone refusal, as main answers a request to a listener it ended or lost (OQ-462). */export function inboundListenerGoneRefusal(): Extract<InboundListenerReply, { kind: 'refused' }> {
  return { kind: 'refused', code: 'inbound.gone', headline: 'The inbound listener has stopped' };
}

/** What main holds of the exposure: whether it is on, which port, and the token shown once. */
export interface HeldExposure {
  enabled: boolean;
  port: number | null;
  /** The token of the CURRENT exposure. Main holds it to show once and to hand to the listener on enable; never logged. */
  token: string | null;
}

/** REQ-MCP-120: the surface is off in every build until the user turns it on, and the choice lasts that session alone. */
export class InboundExposure {
  #state: HeldExposure = { enabled: false, port: null, token: null };

  /** REQ-MCP-121: mint a fresh token and remember it, so the same exposure shows the same token and a new one rotates. */
  turnOn(token: string): void {
    this.#state = { enabled: true, port: null, token };
  }

  /** The listener answered with the port the OS chose (REQ-MCP-119). */
  bound(port: number): void {
    this.#state = { ...this.#state, port };
  }

  /** REQ-MCP-120/121: quitting the application revokes it; disabling revokes the token with it. */
  turnOff(): void {
    this.#state = { enabled: false, port: null, token: null };
  }

  /** What a surface shows: the port and token while on (REQ-MCP-120 shows both), the token only on the enabling press. */
  view(includeToken: boolean): InboundExposureView {
    const base = { enabled: this.#state.enabled, port: this.#state.port };
    return includeToken && this.#state.token !== null ? { ...base, token: this.#state.token } : base;
  }

  get token(): string | null {
    return this.#state.token;
  }
}

/**
 * A message port over an Electron `UtilityProcess` (the same shape `main` gives `ProcessLink`), and the ONE such adapter
 * of main's composition root — the run host, every workspace service and the inbound listener all read their child
 * through it.
 *
 * Electron's `UtilityProcess.on('message')` hands the listener the MESSAGE ITSELF (`(message: any) => void`), not an
 * event object: the adapter that wrapped a child in `(e) => fn(e.data)` handed every reader `undefined` and the
 * `InboundListenerLink` then threw on `raw.ask` inside the port's own handler, so the whole main↔listener channel was
 * dead. `apps/desktop/src/main/index.ts` passed the payload straight through all along; this is that same adapter.
 */
export function portOfChild(child: UtilityProcess): MessagePortLike {
  return {
    postMessage: (message) => child.postMessage(message),
    onMessage: (fn) => {
      child.on('message', fn);
      return () => { child.removeListener('message', fn); };
    },
  };
}

/** The state schema re-exported so a test can read an `inbound.state` answer without reaching into contracts. */
export { InboundListenerStateSchema };
