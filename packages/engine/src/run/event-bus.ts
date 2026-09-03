import { millis, type Millis, type SessionId, type Timers } from '@rotaris/kernel';
import type { WireEvent } from '../events.js';

/**
 * ADR-0010 channel 2 — the wire-event bus: ordered, BOUNDED-BLOCKING,
 * addressed per session, fed only after the writer's commit
 * (REQ-SESSION-147: persist first, then the tee).
 *
 * - A blocking consumer's delivery completes before the run proceeds past
 *   the operation that raised the event, bounded at 5 s; on expiry that
 *   consumer is detached permanently with one warning and the run proceeds
 *   (REQ-EVENTS-165, REQ-EVENTS-031).
 * - A buffered consumer holds up to 1024 pending events and DISCARDS beyond
 *   that rather than blocking; its discard count only ever rises and is
 *   readable during iteration (REQ-EVENTS-164).
 * - A consumer that throws loses events for itself; the run is unaffected
 *   (REQ-EVENTS-074). Publishing with no consumer does nothing (REQ-EVENTS-075).
 * - Registering for an empty session id is rejected (REQ-EVENTS-075).
 * - Per-session bindings are removed at teardown so a straggler has no
 *   destination (REQ-SESSION-094, REQ-EVENTS-071).
 * - Consumers are this application consuming its own runs, in process
 *   (REQ-EVENTS-178) — never a published surface.
 */
export interface EventConsumer {
  /** `blocking`: the run waits, bounded. `buffered`: the run never waits. */
  readonly mode: 'blocking' | 'buffered';
  deliver(event: WireEvent, line: string): void | Promise<void>;
}

export const DELIVERY_BOUND: Millis = millis(5_000);
export const BUFFER_CAP = 1024;

interface Binding {
  readonly consumer: EventConsumer;
  queue: { event: WireEvent; line: string }[];
  draining: boolean;
  discarded: number;
  detached: boolean;
}

export interface EventBusDeps {
  readonly timers: Timers;
  readonly warn: (message: string) => void;
  readonly deliveryBoundMs?: Millis;
  readonly bufferCap?: number;
}

export class EventBus {
  private readonly bindings = new Map<SessionId, Binding[]>();
  private readonly bound: Millis;
  private readonly cap: number;

  constructor(private readonly deps: EventBusDeps) {
    this.bound = deps.deliveryBoundMs ?? DELIVERY_BOUND;
    this.cap = deps.bufferCap ?? BUFFER_CAP;
  }

  /** Returns the detach; `undefined` for an empty session id (REQ-EVENTS-075: rejected as invalid). */
  attach(sessionId: SessionId, consumer: EventConsumer): (() => void) | undefined {
    if (!sessionId) return undefined;
    const b: Binding = { consumer, queue: [], draining: false, discarded: 0, detached: false };
    const list = this.bindings.get(sessionId) ?? [];
    list.push(b);
    this.bindings.set(sessionId, list);
    return () => { b.detached = true; this.remove(sessionId, b); };
  }

  /** REQ-EVENTS-164: the discard count of every buffered consumer of the session, summed; only ever rises. */
  discarded(sessionId: SessionId): number {
    return (this.bindings.get(sessionId) ?? []).reduce((n, b) => n + b.discarded, 0);
  }

  consumers(sessionId: SessionId): number {
    return this.bindings.get(sessionId)?.length ?? 0;
  }

  /** Called AFTER the commit that recorded `event`. Resolves when every blocking consumer has taken it or been detached. */
  async forward(sessionId: SessionId, event: WireEvent, line: string): Promise<void> {
    const list = this.bindings.get(sessionId);
    if (!list || list.length === 0) return;
    for (const b of [...list]) {
      if (b.detached) continue;
      if (b.consumer.mode === 'buffered') this.enqueue(sessionId, b, event, line);
      else await this.deliverBounded(sessionId, b, event, line);
    }
  }

  /** REQ-SESSION-094's last step: nothing for this session can reach a consumer afterwards. */
  detachSession(sessionId: SessionId): void {
    for (const b of this.bindings.get(sessionId) ?? []) b.detached = true;
    this.bindings.delete(sessionId);
  }

  private async deliverBounded(sessionId: SessionId, b: Binding, event: WireEvent, line: string): Promise<void> {
    let expired = false;
    const timeout = new Promise<void>((resolve) => {
      this.deps.timers.after(this.bound, () => { expired = true; resolve(); });
    });
    const delivery = (async () => {
      try {
        await b.consumer.deliver(event, line);
      } catch (cause) {
        this.deps.warn(`an event consumer for ${sessionId} raised on ${event.event} and lost that event for itself: ${String(cause)}`);
      }
    })();
    await Promise.race([delivery, timeout]);
    if (expired) {
      this.deps.warn(`an event consumer for ${sessionId} did not take ${event.event} within ${this.bound} ms and was detached`);
      b.detached = true;
      this.remove(sessionId, b);
    }
  }

  private enqueue(sessionId: SessionId, b: Binding, event: WireEvent, line: string): void {
    if (b.queue.length >= this.cap) {
      b.discarded += 1;
      return;
    }
    b.queue.push({ event, line });
    if (!b.draining) void this.drain(sessionId, b);
  }

  private async drain(sessionId: SessionId, b: Binding): Promise<void> {
    b.draining = true;
    while (b.queue.length > 0 && !b.detached) {
      const next = b.queue.shift()!;
      try {
        await b.consumer.deliver(next.event, next.line);
      } catch (cause) {
        this.deps.warn(`a buffered event consumer for ${sessionId} raised on ${next.event.event}: ${String(cause)}`);
      }
    }
    b.draining = false;
  }

  private remove(sessionId: SessionId, b: Binding): void {
    const list = this.bindings.get(sessionId);
    if (!list) return;
    const rest = list.filter((x) => x !== b);
    if (rest.length === 0) this.bindings.delete(sessionId);
    else this.bindings.set(sessionId, rest);
  }
}
