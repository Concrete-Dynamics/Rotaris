import { CHANNEL, TERMINAL_DELIVERY_BOUND_PER_SECOND, type CommandOutcome, type ProcessReply, type RunHostRequest, type TerminalCommand, type TerminalFrame, type TerminalStreamMeta } from '@rotaris/contracts';
import { millis, type Clocks, type Millis, type TimerHandle } from '@rotaris/kernel';
import type { RendererSink, UpdateRelay } from '@rotaris/shell';

/**
 * Part AL — main's side of the live terminal (ADR-0021 first executed). Two things live here and nothing else:
 *
 *  1. THE DELIVERY BOUND (REQ-MONITOR-306): "1,000 frames per second, measured over any one second at the point
 *     frames are delivered to surfaces, and a stream shown in more than one window counts once per window". The
 *     point of delivery is `webContents.send`, so the bound is enforced HERE, per window, over a one-second sliding
 *     window on the monotonic clock. It is honoured the way REQ-SHELL-103 requires — "by delivering the same output
 *     in larger steps rather than by dropping any of it": a frame that would exceed the bound is MERGED into the
 *     window's pending state for its stream (deltas concatenated, a `screen` superseding the deltas before it, the
 *     latest `meta` kept, a closing frame kept) and delivered when the oldest instant leaves the window. Order
 *     within a stream is kept; `seq` on a merged frame is the last one merged, so it never runs backwards.
 *     ADR-0021's per-stream floor (≤ 50 frames/s) is the first line; this is the aggregate one obligation 2 asked for.
 *  2. THE COMMAND RELAY: the seven `terminal.*` commands travel to the run host shape for shape; a refusal's code
 *     is `terminal.<TerminalRefusal>` (REQ-SHELL-094's banner reads the attempt, not the code).
 *
 * Electron-free on purpose: the limiter is tested against a fake clock and a counting sink.
 */
const WINDOW_MS = 1_000;

interface PendingStream {
  screen: TerminalFrame | null;
  deltas: string;
  deltaSeq: number;
  meta: TerminalFrame | null;
  base: TerminalFrame;
}
interface WindowState {
  readonly sink: RendererSink;
  /** Delivery instants inside the last second, oldest first. */
  times: number[];
  readonly pending: Map<string, PendingStream>;
  timer: TimerHandle | null;
  delivered: number;
  merged: number;
}

export interface TerminalRelayDeps {
  readonly relay: UpdateRelay;
  readonly clocks: Clocks;
  readonly log: (line: string) => void;
  /** REQ-MONITOR-306's figure; a test may lower it. */
  readonly bound?: number;
}

export class FrameDeliveryLimiter {
  private readonly windows = new Map<number, WindowState>();
  private readonly bound: number;
  constructor(private readonly deps: TerminalRelayDeps) {
    this.bound = deps.bound ?? TERMINAL_DELIVERY_BOUND_PER_SECOND;
  }

  /** One frame from the run host → every window subscribed to its session, each under its own bound. */
  deliver(frame: TerminalFrame): number {
    const sinks = this.deps.relay.subscribersOf(frame.sessionId);
    for (const sink of sinks) this.offer(this.stateOf(sink), frame);
    return sinks.length;
  }

  /** What a window has delivered and merged so far (the proof reads this). */
  stats(sinkId: number): { readonly delivered: number; readonly merged: number; readonly pending: number } {
    const w = this.windows.get(sinkId);
    return w ? { delivered: w.delivered, merged: w.merged, pending: w.pending.size } : { delivered: 0, merged: 0, pending: 0 };
  }

  forget(sinkId: number): void {
    const w = this.windows.get(sinkId);
    if (!w) return;
    w.timer?.cancel();
    this.windows.delete(sinkId);
  }

  private stateOf(sink: RendererSink): WindowState {
    let w = this.windows.get(sink.id);
    if (!w || w.sink !== sink) { w = { sink, times: [], pending: new Map(), timer: null, delivered: 0, merged: 0 }; this.windows.set(sink.id, w); }
    return w;
  }
  private prune(w: WindowState, now: number): void {
    let i = 0;
    while (i < w.times.length && w.times[i]! <= now - WINDOW_MS) i += 1;
    if (i > 0) w.times = w.times.slice(i);
  }
  private offer(w: WindowState, frame: TerminalFrame): void {
    const now = this.deps.clocks.monotonic.now();
    this.prune(w, now);
    if (w.pending.size === 0 && w.times.length < this.bound) { this.send(w, frame, now); return; }
    this.merge(w, frame);
    this.drain(w);
  }
  private send(w: WindowState, frame: TerminalFrame, now: number): void {
    w.sink.send(CHANNEL.terminalFrames, frame);
    w.times.push(now);
    w.delivered += 1;
    this.deps.relay.count(CHANNEL.terminalFrames);
  }
  private merge(w: WindowState, frame: TerminalFrame): void {
    let p = w.pending.get(frame.streamId);
    if (!p) { p = { screen: null, deltas: '', deltaSeq: 0, meta: null, base: frame }; w.pending.set(frame.streamId, p); }
    else w.merged += 1;
    if (frame.kind === 'delta') { p.deltas += frame.payload; p.deltaSeq = frame.seq; return; }
    if (frame.kind === 'screen') { p.screen = frame; p.deltas = ''; p.deltaSeq = 0; return; }
    p.meta = frame;
  }
  /** Deliver what the budget allows, oldest stream first, up to three frames per stream, in stream order. */
  private drain(w: WindowState): void {
    const now = this.deps.clocks.monotonic.now();
    this.prune(w, now);
    if (!this.deps.relay.hasSink(w.sink.id)) { this.forget(w.sink.id); return; }
    for (const [streamId, p] of w.pending) {
      if (p.screen) { if (w.times.length >= this.bound) break; this.send(w, p.screen, now); p.screen = null; }
      if (p.deltas.length > 0) { if (w.times.length >= this.bound) break; this.send(w, { ...p.base, kind: 'delta', payload: p.deltas, seq: p.deltaSeq, ...({ meta: undefined, closing: undefined }) } as TerminalFrame, now); p.deltas = ''; }
      if (p.meta) { if (w.times.length >= this.bound) break; this.send(w, p.meta, now); p.meta = null; }
      w.pending.delete(streamId);
    }
    if (w.pending.size === 0) { w.timer?.cancel(); w.timer = null; return; }
    if (w.timer) return;
    const wait = Math.max(1, (w.times[0] ?? now) + WINDOW_MS - now);
    w.timer = this.deps.clocks.timers.after(millis(wait) as Millis, () => { w.timer = null; this.drain(w); });
  }
}

export interface RunHostLink {
  request(request: RunHostRequest, boundMs: Millis): Promise<ProcessReply>;
}

/** The seven `terminal.*` commands, shape for shape, to the run host; the reply as a `CommandOutcome`. */
export async function relayTerminalCommand(req: TerminalCommand, runHost: RunHostLink, log: (line: string) => void): Promise<CommandOutcome> {
  let r: ProcessReply;
  try {
    r = await runHost.request(req, millis(req.kind === 'terminal.kill' ? 10_000 : 5_000));
  } catch (cause) {
    return { ok: false, code: 'terminal.unreachable', headline: 'The terminal could not be reached', detail: String(cause) };
  }
  if (r.kind === 'refused') {
    if (req.kind !== 'terminal.audit') log(`terminal ${req.kind} on ${'streamId' in req ? req.streamId : req.sessionId} → refused ${r.code}`);
    return { ok: false, code: r.code, headline: r.headline, ...(r.detail === undefined ? {} : { detail: r.detail }) };
  }
  if (req.kind === 'terminal.streams') {
    if (r.kind !== 'terminal.streams') return { ok: false, code: 'terminal.reply', headline: 'The terminal answered with the wrong reply' };
    const streams: TerminalStreamMeta[] = r.streams;
    return { ok: true, value: streams };
  }
  if (req.kind !== 'terminal.sendKeys' && req.kind !== 'terminal.audit') log(`terminal ${req.kind} on ${req.streamId} → ok`);
  return { ok: true };
}
