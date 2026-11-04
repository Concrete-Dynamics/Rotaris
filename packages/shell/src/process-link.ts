import type { Millis, Timers } from '@rotaris/kernel';
import { CONTRACT_SCHEMA_VERSION, ProcessEventEnvelopeSchema, ProcessMessageSchema, ProcessReplyEnvelopeSchema, ServiceAskEnvelopeSchema, type ProcessEvent, type ProcessReply, type ProcessRequestEnvelope, type RunHostRequest, type ServiceAnswerEnvelope, type ServiceAsk, type WorkspaceServiceRequest } from '@rotaris/contracts';
import { REFUSAL_FOLD_WINDOW_MS, RefusalFold, refusalPaths } from './refusal-fold.js';

/**
 * Main's side of the process protocol (ADR-0002): a request/reply link over
 * a message port, with every request bounded by a deadline (consequence 11:
 * every acknowledgement is bounded, expiry refuses). The transport is a
 * port so the link is testable without Electron.
 */
export interface MessagePortLike {
  postMessage(message: unknown): void;
  onMessage(fn: (message: unknown) => void): () => void;
}

/** A request's bound passed with no reply: told apart from a closed link, which no asking again can answer. */
export class NoReplyWithinBound extends Error {
  override readonly name = 'NoReplyWithinBound';
}

/**
 * What the link says about the child behind it (OQ-485). `boundary` names the child in a refusal line — "run host",
 * "workspace service for <root>" — and `warn` is the injected sink the line is written through: main's application log at
 * `warning` (`apps/desktop/src/main/index.ts`), since `packages/shell` may not import Electron or main's writer.
 */
export interface ProcessLinkLog {
  readonly boundary: string;
  readonly warn: (line: string) => void;
}

/** The three classes a refused message falls in (OQ-485), each folded on its own. */
export type ProcessRefusalClass = 'wrong version' | 'unknown kind' | 'unreadable';

/**
 * Why a message `ProcessMessageSchema` refused was refused, read from its shape and zod's issues, never from a value: the
 * contract version against this build's (both numbers where `v` is a number), a reply, event or ask kind main does not
 * know (the kind's text never echoed), or a shape it cannot read, with the first issue paths capped (`refusalPaths`).
 */
export function classifyProcessRefusal(raw: unknown): { readonly cls: ProcessRefusalClass; readonly detail: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { cls: 'unreadable', detail: 'not an object' };
  const m = raw as Record<string, unknown>;
  if (m['v'] !== CONTRACT_SCHEMA_VERSION) {
    const v = m['v'];
    return { cls: 'wrong version', detail: `contract version ${typeof v === 'number' ? String(v) : 'not a number'} against this build's ${CONTRACT_SCHEMA_VERSION}` };
  }
  const shape = 'reply' in m ? { what: 'a reply', body: 'reply', schema: ProcessReplyEnvelopeSchema } : 'event' in m ? { what: 'an event', body: 'event', schema: ProcessEventEnvelopeSchema } : 'ask' in m ? { what: 'an ask', body: 'request', schema: ServiceAskEnvelopeSchema } : null;
  if (shape === null) return { cls: 'unreadable', detail: 'neither a reply, an event nor an ask' };
  const parsed = shape.schema.safeParse(raw);
  const issues = parsed.success ? [] : parsed.error.issues;
  // Only the message's own kind is an unknown kind: a discriminator deeper in a body main knows is a shape it cannot read.
  if (issues.some((issue) => issue.code === 'invalid_union' && 'note' in issue && issue.note === 'No matching discriminator' && issue.path.length === 2 && issue.path[0] === shape.body && issue.path[1] === 'kind')) {
    return { cls: 'unknown kind', detail: `${shape.what} of a kind main does not know` };
  }
  const paths = refusalPaths(issues);
  return { cls: 'unreadable', detail: paths.length === 0 ? `${shape.what} main cannot read` : `${shape.what} main cannot read at ${paths.join(', ')}` };
}

export class ProcessLink<Req extends RunHostRequest | WorkspaceServiceRequest> {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (r: ProcessReply) => void; reject: (e: Error) => void; cancel: () => void }>();
  private readonly eventListeners = new Set<(e: ProcessEvent) => void>();
  private askHandler: ((ask: ServiceAsk) => Promise<ProcessReply>) | null = null;
  private ended: Extract<ProcessReply, { kind: 'refused' }> | null = null;
  private readonly stop: () => void;
  private readonly refusals: RefusalFold;

  constructor(private readonly port: MessagePortLike, private readonly timers: Timers, private readonly log: ProcessLinkLog) {
    this.refusals = new RefusalFold(timers, log.warn);
    this.stop = port.onMessage((raw) => {
      const parsed = ProcessMessageSchema.safeParse(raw);
      if (!parsed.success) { this.refuse(raw); return; }
      const m = parsed.data;
      if ('event' in m) {
        // One throwing listener must not break dispatch to the rest: the relay's own
        // shed-on-throw stops the disposed-frame throw at the sink, and this stops any
        // remaining listener throw from unwinding into the port's message pump.
        for (const l of this.eventListeners) {
          try {
            l(m.event);
          } catch {
            continue;
          }
        }
        return;
      }
      if ('ask' in m) {
        // ADR-0002 c.7: a narrow request back to main. Answered by the handler, or refused when none is set.
        const answer = (reply: ProcessReply) => { const env: ServiceAnswerEnvelope = { v: CONTRACT_SCHEMA_VERSION, ask: m.ask, reply }; this.port.postMessage(env); };
        if (!this.askHandler) { answer({ kind: 'refused', code: 'ask.unhandled', headline: 'main does not answer this request' }); return; }
        this.askHandler(m.request).then(answer, (e) => answer({ kind: 'refused', code: 'ask.failed', headline: String(e) }));
        return;
      }
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      p.cancel();
      p.resolve(m.reply);
    });
  }

  /**
   * OQ-485: a message the protocol cannot read is dropped as before — ADR-0002 consequence 11(b) unchanged, a request whose
   * reply main could not read still ends `NoReplyWithinBound` at its bound, and the next valid message is answered — and
   * now leaves one `warning` line naming the child, the class, the detail and the pending `id` where it is a number, folded
   * per class into one count line a window (`RefusalFold`). Nothing of the message's values reaches the line.
   */
  private refuse(raw: unknown): void {
    const { cls, detail } = classifyProcessRefusal(raw);
    const id = typeof raw === 'object' && raw !== null && 'id' in raw ? raw.id : undefined;
    const waiting = typeof id === 'number' ? `; request ${String(id)} ${this.pending.has(id) ? 'still waits to its bound' : 'is not waiting'}` : '';
    this.refusals.refuse(
      cls,
      () => `refused a message from the ${this.log.boundary} (${cls}): ${detail}${waiting}; dropped (OQ-485)`,
      (count) => `refused ${count} more message${count === 1 ? '' : 's'} from the ${this.log.boundary} (${cls}) within ${REFUSAL_FOLD_WINDOW_MS / 1000} s of the first; dropped (OQ-485)`,
    );
  }

  onEvent(fn: (e: ProcessEvent) => void): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  /** The one handler for the child's narrow requests back to main. */
  onAsk(fn: (ask: ServiceAsk) => Promise<ProcessReply>): void {
    this.askHandler = fn;
  }

  /**
   * OQ-462 (3), ruled 2026-11-01: the child behind this link is gone (its `exit`, or main ending it for a missed ready
   * bound), so no answer can come. Every request still waiting is answered `refusal` at once, and every later one is
   * answered `refusal` without being posted or waiting out its bound. Idempotent: the first refusal stands.
   */
  end(refusal: Extract<ProcessReply, { kind: 'refused' }>): void {
    if (this.ended !== null) return;
    this.ended = refusal;
    for (const p of this.pending.values()) { p.cancel(); p.resolve(refusal); }
    this.pending.clear();
    // OQ-485: the link's end closes every refusal window, each with its count line.
    this.refusals.flush();
  }

  /** The refusal every request is answered with once `end` has been called; null while the child is there. */
  get endedWith(): Extract<ProcessReply, { kind: 'refused' }> | null {
    return this.ended;
  }

  request(request: Req, boundMs: Millis): Promise<ProcessReply> {
    if (this.ended !== null) return Promise.resolve(this.ended);
    const id = this.nextId++;
    const env: ProcessRequestEnvelope = { v: CONTRACT_SCHEMA_VERSION, id, request };
    return new Promise<ProcessReply>((resolve, reject) => {
      const h = this.timers.after(boundMs, () => {
        this.pending.delete(id);
        reject(new NoReplyWithinBound(`no reply to ${request.kind} within ${boundMs} ms`));
      });
      this.pending.set(id, { resolve, reject, cancel: () => h.cancel() });
      this.port.postMessage(env);
    });
  }

  close(): void {
    this.stop();
    for (const p of this.pending.values()) { p.cancel(); p.reject(new Error('link closed')); }
    this.pending.clear();
    this.refusals.flush();
  }
}
