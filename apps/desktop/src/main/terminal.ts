import { CHANNEL, TERMINAL_DELIVERY_BOUND_PER_SECOND, type CommandOutcome, type ProcessReply, type RunHostRequest, type TerminalCommand, type TerminalFrame, type TerminalStreamMeta } from '@rotaris/contracts';
import { millis, type Clocks, type Millis, type TimerHandle } from '@rotaris/kernel';
import type { RendererSink, UpdateRelay } from '@rotaris/shell';

/**
 * Part AL — main's side of the live terminal (ADR-0021 first executed). Two things live here and nothing else:
 *
 *  1. THE DELIVERY BOUND (REQ-MONITOR-306): the rate "is bounded in aggregate — across every live stream, of every
 *     session, delivered to every window, taken together — and not per stream alone … 1,000 frames per second,
 *     measured over any one second at the point frames are delivered to surfaces, and a stream shown in more than
 *     one window counts once per window, because the cost this bound exists to control is paid per delivery". The
 *     point of delivery is `webContents.send`, so the bound is enforced HERE, over ONE sliding second on the
 *     monotonic clock that every window shares: a frame fanned to two windows spends two of that budget. It is
 *     honoured the way REQ-SHELL-103 requires — "by delivering the same output in larger steps rather than by
 *     dropping any of it": a frame that would exceed the bound is MERGED into the receiving window's pending state
 *     for its stream (adjacent deltas concatenated, a `screen` superseding the deltas before it, a `meta` keeping its
 *     place in the order, a closing frame kept) and delivered when the oldest instant leaves the second. Order within
 *     a stream at a window is kept; `seq` on a merged frame is the last one merged, so it never runs backwards.
 *     ADR-0021's per-stream floor (≤ 50 frames/s) is the first line; this is the aggregate obligation 2 asked for.
 *
 *     Part T2 found the first draft's ledger PER WINDOW (defect T2-1), on a reading of the requirement that quoted
 *     its counting rule and not its aggregate: "the bound is enforced HERE, per window, over a one-second sliding
 *     window on the monotonic clock". That reading is kept beside its replacement because it is what the code did.
 *     One session shown in two main windows (REQ-MONITOR-243, REQ-STARTUP-163) then delivered 2,000 frames/s while
 *     each window's own ledger read 1,000 — measured, forty streams, two windows, before the repair. The cost the
 *     bound exists to control is main's per-message relay cost (ADR-0021 "The cap is load-bearing", obligation 3),
 *     which is paid once per delivery and so multiplies by the window count; a per-window ledger cannot see that.
 *  2. THE COMMAND RELAY: the seven `terminal.*` commands travel to the run host shape for shape; a refusal's code
 *     is `terminal.<TerminalRefusal>` (REQ-SHELL-094's banner reads the attempt, not the code).
 *
 * Electron-free on purpose: the limiter is tested against a fake clock and a counting sink.
 */
const WINDOW_MS = 1_000;

/**
 * A window's undelivered frames for one stream, IN ORDER. Adjacent deltas merge into one larger step (REQ-SHELL-103);
 * a screen supersedes the deltas and screens before it; a meta after a meta supersedes it (idempotent, REQ-SHELL-105);
 * a meta between two deltas KEEPS ITS PLACE, so what goes out is delta, meta, delta with the sequence numbers climbing.
 *
 * Part AL2 found the first draft's shape wrong on its first execution through the window (defect AL2-1): it held ONE
 * concatenated delta string and ONE latest meta per stream and drained delta-then-meta, so a meta that arrived between
 * two deltas went out AFTER the merged delta carrying a LOWER `seq`, and every display dropped it as already applied
 * (REQ-SHELL-104's own rule) — under saturation a stream's running→closed transition, or its resize, could be lost.
 * The regression test in `terminal.test.ts` pins the order.
 */
interface PendingStream {
  segments: TerminalFrame[];
}
interface WindowState {
  readonly sink: RendererSink;
  readonly pending: Map<string, PendingStream>;
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
  /**
   * Part T2 — REQ-MONITOR-306's ONE budget: the instants of every delivery to EVERY window inside the last second,
   * oldest first. It sat on `WindowState` until 2026-09-11 (defect T2-1); the requirement bounds the windows taken
   * together and counts a stream shown in two of them twice, so the ledger cannot be one per window.
   */
  private times: number[] = [];
  private timer: TimerHandle | null = null;
  constructor(private readonly deps: TerminalRelayDeps) {
    this.bound = deps.bound ?? TERMINAL_DELIVERY_BOUND_PER_SECOND;
  }

  /** One frame from the run host → every window subscribed to its session, all of them spending the ONE bound (Part T2: a frame fanned to two windows spends two of the budget, never one each). */
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

  /** Part T2: what REQ-MONITOR-306 actually bounds — every window taken together (the proof reads this). */
  aggregate(): { readonly windows: number; readonly delivered: number; readonly merged: number; readonly pending: number; readonly inLastSecond: number } {
    let delivered = 0;
    let merged = 0;
    let pending = 0;
    for (const w of this.windows.values()) { delivered += w.delivered; merged += w.merged; pending += w.pending.size; }
    return { windows: this.windows.size, delivered, merged, pending, inLastSecond: this.times.length };
  }

  forget(sinkId: number): void {
    if (!this.windows.delete(sinkId)) return;
    if (!this.anyPending()) { this.timer?.cancel(); this.timer = null; }
  }

  private anyPending(): boolean {
    for (const w of this.windows.values()) if (w.pending.size > 0) return true;
    return false;
  }
  private stateOf(sink: RendererSink): WindowState {
    let w = this.windows.get(sink.id);
    if (!w || w.sink !== sink) { w = { sink, pending: new Map(), delivered: 0, merged: 0 }; this.windows.set(sink.id, w); }
    return w;
  }
  private prune(now: number): void {
    let i = 0;
    while (i < this.times.length && this.times[i]! <= now - WINDOW_MS) i += 1;
    if (i > 0) this.times = this.times.slice(i);
  }
  private offer(w: WindowState, frame: TerminalFrame): void {
    const now = this.deps.clocks.monotonic.now();
    this.prune(now);
    if (w.pending.size === 0 && this.times.length < this.bound) { this.send(w, frame, now); return; }
    this.merge(w, frame);
    this.drain();
  }
  private send(w: WindowState, frame: TerminalFrame, now: number): void {
    w.sink.send(CHANNEL.terminalFrames, frame);
    this.times.push(now);
    w.delivered += 1;
    this.deps.relay.count(CHANNEL.terminalFrames);
  }
  private merge(w: WindowState, frame: TerminalFrame): void {
    let p = w.pending.get(frame.streamId);
    if (!p) { p = { segments: [] }; w.pending.set(frame.streamId, p); }
    else w.merged += 1;
    const last = p.segments[p.segments.length - 1];
    if (frame.kind === 'delta') {
      if (last && last.kind === 'delta') { p.segments[p.segments.length - 1] = { ...last, payload: last.payload + frame.payload, seq: frame.seq }; return; }
      p.segments.push(frame);
      return;
    }
    if (frame.kind === 'screen') {
      // The screen resets and rewrites the display, so the deltas and screens before it are superseded; the metas before it
      // stay — they carry state a screen without `meta` does not, and they are idempotent.
      p.segments = p.segments.filter((segment) => segment.kind === 'meta');
      p.segments.push(frame);
      return;
    }
    if (last && last.kind === 'meta') { p.segments[p.segments.length - 1] = frame; return; }
    p.segments.push(frame);
  }
  /**
   * Deliver what the ONE budget allows. Part T2: the drain is the limiter's, not a window's, because the budget is —
   * it takes one segment per window per turn, oldest stream first within a window, and goes round again, so that a
   * window saturating on forty streams cannot starve the window beside it of the second they share. Order within a
   * stream at a window is untouched: its segments leave in the order they were merged.
   */
  private drain(): void {
    const now = this.deps.clocks.monotonic.now();
    this.prune(now);
    for (const id of [...this.windows.keys()]) if (!this.deps.relay.hasSink(id)) this.forget(id);
    for (let sent = true; sent && this.times.length < this.bound;) {
      sent = false;
      for (const w of this.windows.values()) {
        if (this.times.length >= this.bound) break;
        const next = w.pending.entries().next();
        if (next.done) continue;
        const [streamId, p] = next.value;
        const segment = p.segments.shift();
        if (segment) { this.send(w, segment, now); sent = true; }
        if (p.segments.length === 0) w.pending.delete(streamId);
      }
    }
    if (!this.anyPending()) { this.timer?.cancel(); this.timer = null; return; }
    if (this.timer) return;
    const wait = Math.max(1, (this.times[0] ?? now) + WINDOW_MS - now);
    this.timer = this.deps.clocks.timers.after(millis(wait) as Millis, () => { this.timer = null; this.drain(); });
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
