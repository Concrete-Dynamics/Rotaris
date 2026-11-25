import type { UtilityProcess } from 'electron';
import type { MessagePortLike } from '@rotaris/shell';
import { millis, type Timers } from '@rotaris/kernel';
import { CONTRACT_SCHEMA_VERSION, InboundListenerStateSchema, InboundListenerEventEnvelopeSchema, InboundListenerReplyEnvelopeSchema, type InboundExposure as InboundExposureView, type InboundAskHandler, type InboundListenerRequest, type InboundListenerReply } from '@rotaris/contracts';
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
      // The listener's answer to one of ITS asks (a tool call), told apart from its replies and its events by shape.
      const ask = raw as { ask?: unknown; answer?: unknown };
      if (typeof ask.ask === 'number' && ask.answer !== undefined) {
        this.#answer(ask.ask, ask.answer);
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

/** The listener-gone refusal, as main answers a request to a listener it ended or lost (OQ-462). */
export function inboundListenerGoneRefusal(): Extract<InboundListenerReply, { kind: 'refused' }> {
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

/** A message port over an Electron `UtilityProcess` (the same shape `main` gives `ProcessLink`). */
export function portOfChild(child: UtilityProcess): MessagePortLike {
  return {
    postMessage: (message) => child.postMessage(message),
    onMessage: (fn) => {
      const listener = (e: { data: unknown }) => fn(e.data);
      child.on('message', listener);
      return () => child.removeListener('message', listener);
    },
  };
}

/** The state schema re-exported so a test can read an `inbound.state` answer without reaching into contracts. */
export { InboundListenerStateSchema };
