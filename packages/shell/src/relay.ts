import { CHANNEL, type SEQUENCED_CHANNELS, type ChannelName } from '@rotaris/contracts';

/**
 * ADR-0044 — main is a RELAY. It forwards the two update channels unchanged
 * — never generating, renumbering or re-deriving a sequence number — and
 * fans one publication out to every renderer subscribed to that session
 * (ADR-0013). Per-session order is preserved ACROSS the two channel names,
 * because they share one counter (REQ-MONITOR-214).
 *
 * ADR-0052: the relay's capacity is a message rate, so messages per second
 * per channel and the depth of what feeds them are first-class counters,
 * maintained here. The relay's real failure mode is unbounded latency with
 * nothing dropped (spike ipc-hop), which a gap counter cannot see.
 */
export interface RendererSink {
  readonly id: number;
  send(channel: ChannelName, payload: unknown): void;
}

export class UpdateRelay {
  private readonly sinks = new Map<number, RendererSink>();
  private readonly subscriptions = new Map<string, Set<number>>();
  readonly counters: Record<ChannelName, number> = {
    [CHANNEL.transcriptIncrement]: 0,
    [CHANNEL.sessionSnapshot]: 0,
    [CHANNEL.terminalFrames]: 0,
    [CHANNEL.noticeCurrent]: 0,
    [CHANNEL.themeChanged]: 0,
    [CHANNEL.configChanged]: 0,
    [CHANNEL.acknowledgementPublish]: 0,
    [CHANNEL.libraryChanged]: 0,
    [CHANNEL.requirementsChanged]: 0, // Part AK — channel 10's counter; the record is total over ChannelName (plan Reservations, ruled 2026-09-09: a new channel's counter line rides with the channel reservation)
    [CHANNEL.command]: 0,
    [CHANNEL.improvementActivity]: 0,
  };

  attach(sink: RendererSink): void {
    this.sinks.set(sink.id, sink);
  }
  detach(id: number): void {
    this.sinks.delete(id);
    for (const s of this.subscriptions.values()) s.delete(id);
  }
  subscribe(sinkId: number, sessionId: string): void {
    let s = this.subscriptions.get(sessionId);
    if (!s) { s = new Set(); this.subscriptions.set(sessionId, s); }
    s.add(sinkId);
  }
  unsubscribe(sinkId: number, sessionId: string): void {
    this.subscriptions.get(sessionId)?.delete(sinkId);
  }

  /** Forward a sequenced publication to every subscriber of its session, payload untouched. */
  relaySequenced(channel: (typeof SEQUENCED_CHANNELS)[number], payload: { readonly sessionId: string; readonly seq: number }): number {
    this.counters[channel] += 1;
    const subs = this.subscriptions.get(payload.sessionId);
    if (!subs) return 0;
    let n = 0;
    for (const id of subs) {
      const sink = this.sinks.get(id);
      if (sink) { sink.send(channel, payload); n += 1; }
    }
    return n;
  }

  /** Broadcast to every attached renderer (notices are per process, ADR-0049). */
  broadcast(channel: ChannelName, payload: unknown): void {
    this.counters[channel] += 1;
    for (const sink of this.sinks.values()) sink.send(channel, payload);
  }

  /**
   * Part AL / ADR-0021: channel 3 is NOT relayed unchanged — REQ-MONITOR-306 bounds its delivery per window and
   * REQ-SHELL-103 has main honour the bound by merging a stream's frames into larger steps — so the fan-out lives
   * beside the bound (`main/terminal.ts`) and reads the subscription here. `count` keeps ADR-0052's per-channel
   * counter honest for a delivery made outside `relaySequenced` and `broadcast`.
   */
  subscribersOf(sessionId: string): readonly RendererSink[] {
    const subs = this.subscriptions.get(sessionId);
    if (!subs) return [];
    const out: RendererSink[] = [];
    for (const id of subs) { const sink = this.sinks.get(id); if (sink) out.push(sink); }
    return out;
  }
  hasSink(id: number): boolean {
    return this.sinks.has(id);
  }
  count(channel: ChannelName, n = 1): void {
    this.counters[channel] += n;
  }
}
