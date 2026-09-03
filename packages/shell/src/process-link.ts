import type { Millis, Timers } from '@rotaris/kernel';
import { CONTRACT_SCHEMA_VERSION, ProcessMessageSchema, type ProcessEvent, type ProcessReply, type ProcessRequestEnvelope, type RunHostRequest, type WorkspaceServiceRequest } from '@rotaris/contracts';

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

export class ProcessLink<Req extends RunHostRequest | WorkspaceServiceRequest> {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (r: ProcessReply) => void; reject: (e: Error) => void; cancel: () => void }>();
  private readonly eventListeners = new Set<(e: ProcessEvent) => void>();
  private readonly stop: () => void;

  constructor(private readonly port: MessagePortLike, private readonly timers: Timers) {
    this.stop = port.onMessage((raw) => {
      const parsed = ProcessMessageSchema.safeParse(raw);
      if (!parsed.success) return;
      const m = parsed.data;
      if ('event' in m) {
        for (const l of this.eventListeners) l(m.event);
        return;
      }
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      p.cancel();
      p.resolve(m.reply);
    });
  }

  onEvent(fn: (e: ProcessEvent) => void): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  request(request: Req, boundMs: Millis): Promise<ProcessReply> {
    const id = this.nextId++;
    const env: ProcessRequestEnvelope = { v: CONTRACT_SCHEMA_VERSION, id, request };
    return new Promise<ProcessReply>((resolve, reject) => {
      const h = this.timers.after(boundMs, () => {
        this.pending.delete(id);
        reject(new Error(`no reply to ${request.kind} within ${boundMs} ms`));
      });
      this.pending.set(id, { resolve, reject, cancel: () => h.cancel() });
      this.port.postMessage(env);
    });
  }

  close(): void {
    this.stop();
    for (const p of this.pending.values()) { p.cancel(); p.reject(new Error('link closed')); }
    this.pending.clear();
  }
}
