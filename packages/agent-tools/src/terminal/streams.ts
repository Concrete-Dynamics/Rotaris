import { CONTRACT_SCHEMA_VERSION, TERMINAL_COALESCE_FLOOR_MS, TERMINAL_INTERVAL_RANGE_MS, type TerminalFrame, type TerminalRefusal, type TerminalStreamKind, type TerminalStreamMeta } from '@rotaris/contracts';
import { millis, type Clocks, type Millis, type TimerHandle } from '@rotaris/kernel';
import type { EmulatorFactory, ScreenEmulator } from './emulator.js';

/**
 * ADR-0021, first executed (Part AL): the streams registry of the run host. One entry per live stream — an
 * agent's foreground PTY (`fg:<agent>`) or a background session (`bg:<ts_id>`, REQ-TOOLS-107/127) — each with
 * its own headless emulator, its own monotonic `seq` (REQ-SHELL-104) and its own flush timer.
 *
 * THE SAMPLING PERIOD IS A CEILING, NOT A METRONOME (ADR-0021 Decision; OQ-38's reading, ratified when OQ-38 closed 2026-09-11 and REQ-CONFIG-117 came to state it):
 * `runtime.terminal_stream_interval_ms` bounds how long output may be withheld from a frame. A keystroke ARMS an
 * immediate flush of the stream's next output, coalesced so that no two frames of one stream are ever closer
 * than `TERMINAL_COALESCE_FLOOR_MS` (20 ms) — the bottom of REQ-TOOLS-126's own range, and since the ipc-hop spike
 * the input to a transport budget (ADR-0021 "The cap is load-bearing", obligation 1). The flush changes only WHEN
 * bytes are framed, never which bytes or in what order (REQ-SHELL-103/104).
 *
 * STREAMING CHANGES NOTHING THE AGENT SEES (REQ-TOOLS-127): the tool feeds this registry from a tap on the PTY and
 * reads nothing back from it; with `terminal_stream_enabled: false` `begin` is a no-op and nothing is emitted, the
 * command runs exactly as before (REQ-TOOLS-126, REQ-NOTIFY-243).
 *
 * The one end-of-command burst — the pending delta, the CLOSING screen frame carrying the observation's final plain
 * text (REQ-TOOLS-127; OQ-5's literal-replacement reading), then the `meta` that closes the stream with its exit code
 * — is three frames in a row, once per command, and is the only place the floor is not applied between frames.
 *
 * Retained screen state is a first-class, non-persisted object (REQ-SHELL-085/104): an ENDED stream stays until a
 * stream of ANOTHER session begins (REQ-SHELL-111: a new session clears all stream state), or until the retained
 * ENDED streams of its session exceed `RETAINED_ENDED_PER_SESSION` and the oldest ended one is evicted. A LIVE
 * stream is NEVER evicted — the concurrent live count is bounded elsewhere (agent count, REQ-TOOLS-108's
 * `runtime.shell_max_background_sessions`), and the shipped ~40 (ADR-0021 obligation 2) all coexist.
 */
export interface StreamSettings {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly bufferKb: number;
}
export const STREAM_SETTINGS_DEFAULTS: StreamSettings = { enabled: true, intervalMs: TERMINAL_INTERVAL_RANGE_MS.default, bufferKb: 256 };
/** How many ENDED streams a session retains before the oldest ended one is evicted; live streams never count against it. */
export const RETAINED_ENDED_PER_SESSION = 64;
const MAX_SCROLLBACK_LINES = 10_000;

/** What drives the stream — registered by the tool, so the registry never knows a PTY from a pipe (REQ-TOOLS-128). */
export interface StreamControl {
  /** Bytes to the process's input; false when input is closed. */
  readonly write?: (bytes: string) => boolean;
  /** The real terminal's size, where there is one; the emulated screen is resized regardless (REQ-SHELL-106). */
  readonly resize?: (cols: number, rows: number) => void;
  readonly interrupt?: () => boolean;
  readonly endInput?: () => boolean;
  /**
   * Terminates what drives the stream. False when it terminated nothing — the command had ended, and no paused one stood in
   * its place — which the kill answers as `ended`, never ok (REQ-SHELL-092); nothing (a background session's `end`) is taken
   * as done.
   */
  readonly kill?: () => boolean | void | Promise<boolean | void>;
}

export interface StreamSpec {
  readonly sessionId: string;
  readonly streamId: string;
  readonly kind: TerminalStreamKind;
  readonly agentId?: string;
  readonly displayName: string;
  readonly command?: string;
  readonly cols: number;
  readonly rows: number;
  /** Where the settings are read from (REQ-TOOLS-126 is workspace configuration). */
  readonly workspaceRoot: string;
  readonly control: StreamControl;
}

export type StreamResult<T = void> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: TerminalRefusal };

interface Live {
  readonly spec: StreamSpec;
  meta: TerminalStreamMeta;
  readonly emulator: ScreenEmulator;
  readonly intervalMs: number;
  seq: number;
  pending: string;
  flush: TimerHandle | null;
  flushDue: number;
  lastEmitAt: number;
  armed: boolean;
  /** The emulator's write queue, so a resync serialises a settled screen. */
  writes: Promise<void>;
  finalText: string | null;
  control: StreamControl;
}

export interface TerminalStreamsDeps {
  readonly clocks: Clocks;
  readonly emulator: EmulatorFactory;
  readonly warn: (m: string) => void;
}

export class TerminalStreams {
  /** Filled by the run host from the run's configuration (`runtime.terminal_stream_*`); the defaults until then. */
  settings: (workspaceRoot: string) => StreamSettings = () => STREAM_SETTINGS_DEFAULTS;
  private readonly bySession = new Map<string, Map<string, Live>>();
  private readonly listeners = new Set<(frame: TerminalFrame) => void>();
  private lastEnabled = true;
  readonly counters = { frames: 0, deltas: 0, screens: 0, metas: 0, armedFlushes: 0 };

  constructor(private readonly deps: TerminalStreamsDeps) {}

  onFrame(cb: (frame: TerminalFrame) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /**
   * A command starts on a stream. A known stream id (the agent's next foreground command on the same PTY) is
   * re-opened in place: the screen continues, the counter continues, the metadata changes (REQ-SHELL-104: the
   * grid is never blank while history exists). Returns false — and does nothing — when streaming is disabled.
   */
  begin(spec: StreamSpec): boolean {
    const settings = this.settings(spec.workspaceRoot);
    this.lastEnabled = settings.enabled;
    if (!settings.enabled) return false;
    // REQ-SHELL-111: a stream of another session begins → every other session's state goes.
    for (const [sid, streams] of this.bySession) {
      if (sid === spec.sessionId) continue;
      for (const s of streams.values()) this.drop(s);
      this.bySession.delete(sid);
    }
    let streams = this.bySession.get(spec.sessionId);
    if (!streams) { streams = new Map(); this.bySession.set(spec.sessionId, streams); }
    const existing = streams.get(spec.streamId);
    if (existing) {
      existing.control = spec.control;
      existing.finalText = null;
      existing.meta = { ...existing.meta, ...(spec.command === undefined ? {} : { command: spec.command }), running: true, acceptsInput: spec.control.write !== undefined, canKill: spec.control.kill !== undefined, truncated: existing.emulator.truncated };
      delete (existing.meta as { exitCode?: number }).exitCode;
      this.emitMeta(existing);
      return true;
    }
    this.evict(streams);
    const intervalMs = Math.min(TERMINAL_INTERVAL_RANGE_MS.max, Math.max(TERMINAL_INTERVAL_RANGE_MS.min, Math.round(settings.intervalMs)));
    const scrollback = settings.bufferKb <= 0 ? 0 : Math.min(MAX_SCROLLBACK_LINES, Math.max(0, Math.floor((settings.bufferKb * 1024) / Math.max(1, spec.cols))));
    const emulator = this.deps.emulator({ cols: spec.cols, rows: spec.rows, scrollback });
    const live: Live = {
      spec, emulator, intervalMs, seq: 0, pending: '', flush: null, flushDue: 0, lastEmitAt: Number.NEGATIVE_INFINITY, armed: false, writes: Promise.resolve(), finalText: null, control: spec.control,
      meta: {
        streamId: spec.streamId, sessionId: spec.sessionId, ...(spec.agentId === undefined ? {} : { agentId: spec.agentId }), kind: spec.kind, displayName: spec.displayName,
        ...(spec.command === undefined ? {} : { command: spec.command }), running: true, truncated: false, cols: spec.cols, rows: spec.rows,
        acceptsInput: spec.control.write !== undefined, canKill: spec.control.kill !== undefined,
      },
    };
    streams.set(spec.streamId, live);
    this.emitMeta(live);
    return true;
  }

  /** Bytes from the process. Fed to the emulator at once; framed at the ceiling, or sooner when armed. */
  data(streamId: string, bytes: string): void {
    const s = this.find(streamId);
    if (!s || bytes.length === 0) return;
    s.pending += bytes;
    s.writes = s.writes.then(() => s.emulator.write(bytes)).catch((e: unknown) => { this.deps.warn(`terminal stream ${streamId}: the emulator refused a write: ${String(e)}`); });
    this.schedule(s, s.armed ? this.floorWait(s) : s.intervalMs);
  }

  /**
   * The USER wrote to the process through the control surface: arm the next flush (REQ-SHELL-166's echo budget;
   * REQ-CONFIG-117). Called only from `sendKeys`, `interrupt` and `endInput` — the three control-surface entries a person
   * reaches after taking control. Output never arms, and neither does an agent's own `is_input` call (OQ-38, ruled
   * 2026-09-11): the period is a ceiling on batching, and the licence to beat it is spent only where someone is waiting
   * to see their own keystroke.
   */
  keystroke(streamId: string): void {
    const s = this.find(streamId);
    if (!s) return;
    s.armed = true;
    this.counters.armedFlushes += 1;
    if (s.pending.length > 0) this.schedule(s, this.floorWait(s));
  }

  /**
   * The command ended: the pending delta, the closing screen frame, then the meta with the exit code. A null code is a
   * command that has none — a background process that could not be started (REQ-TOOLS-179, OQ-143) — and the meta then
   * carries no `exitCode`, which a surface draws as `exited` rather than the −1 of a kill.
   */
  end(streamId: string, outcome: { readonly exitCode: number | null; readonly finalText: string }): void {
    const s = this.find(streamId);
    if (!s || !s.meta.running) return;
    this.flushNow(s);
    s.finalText = outcome.finalText;
    this.emit(s, { kind: 'screen', payload: outcome.finalText, closing: true });
    s.meta = { ...s.meta, running: false, ...(outcome.exitCode === null ? {} : { exitCode: outcome.exitCode }), acceptsInput: false, canKill: false, truncated: s.emulator.truncated };
    this.emitMeta(s);
    // The retained-ended cap is trimmed as a stream ends, oldest ended first; this stream is the newest ended, so it stays.
    const streams = this.bySession.get(s.spec.sessionId);
    if (streams) this.evict(streams);
  }

  /** The streams of one session, live and retained, in the order they began (REQ-SHELL-082/085). */
  list(sessionId: string): TerminalStreamMeta[] {
    const streams = this.bySession.get(sessionId);
    if (!streams) return [];
    return [...streams.values()].map((s) => ({ ...s.meta, truncated: s.emulator.truncated }));
  }

  /**
   * A late attacher is given the output accumulated so far: one `screen` frame per stream (REQ-SHELL-104, ADR-0021).
   *
   * Part AL2 (defect AL2-2, found the first time a window attached to a stream that already existed): the resync
   * frame carried no `meta`, so a display created from it took the unknown-stream defaults — "Terminal", running, 80×24,
   * no command — and an ENDED stream was shown as running for ever, since no later meta was coming. The screen frame
   * now carries the stream's metadata (a frame of any kind may; the display applies it idempotently, REQ-SHELL-105).
   */
  async resync(sessionId: string): Promise<number> {
    const streams = this.bySession.get(sessionId);
    if (!streams) return 0;
    let n = 0;
    for (const s of [...streams.values()]) {
      const meta: TerminalStreamMeta = { ...s.meta, truncated: s.emulator.truncated };
      if (s.finalText !== null && !s.meta.running) { this.emit(s, { kind: 'screen', payload: s.finalText, closing: true, meta }); n += 1; continue; }
      await s.writes;
      this.flushNow(s);
      this.emit(s, { kind: 'screen', payload: s.emulator.serialize(), meta });
      n += 1;
    }
    return n;
  }

  // ---- the control surface (REQ-TOOLS-128, REQ-SHELL-106) ----

  sendKeys(streamId: string, bytes: string): StreamResult {
    const s = this.find(streamId);
    if (!s) return this.unknown();
    if (!s.meta.running || !s.control.write) return { ok: false, error: 'ended' };
    if (!s.control.write(bytes)) return { ok: false, error: 'ended' };
    this.keystroke(streamId);
    return { ok: true, value: undefined };
  }

  /**
   * The emulated screen is resized even when the backend is gone; then the real terminal when possible. "Possible"
   * is the control's presence, NOT the running flag — the first execution against a real PTY found the resize gated
   * on `running` (defect fifty): a foreground shell outlives its command, so a resize made between two commands
   * never reached the PTY and the next command reported the old size. A pipe-backed stream registers no resize.
   */
  resize(streamId: string, cols: number, rows: number): StreamResult {
    const s = this.find(streamId);
    if (!s) return this.unknown();
    s.emulator.resize(cols, rows);
    s.control.resize?.(cols, rows);
    s.meta = { ...s.meta, cols: s.emulator.cols, rows: s.emulator.rows };
    this.emitMeta(s);
    return { ok: true, value: undefined };
  }

  interrupt(streamId: string): StreamResult {
    const s = this.find(streamId);
    if (!s) return this.unknown();
    if (!s.meta.running || !s.control.interrupt) return { ok: false, error: 'ended' };
    if (!s.control.interrupt()) return { ok: false, error: 'ended' };
    this.keystroke(streamId);
    return { ok: true, value: undefined };
  }

  endInput(streamId: string): StreamResult {
    const s = this.find(streamId);
    if (!s) return this.unknown();
    if (!s.meta.running || !s.control.endInput) return { ok: false, error: 'ended' };
    if (!s.control.endInput()) return { ok: false, error: 'ended' };
    this.keystroke(streamId);
    return { ok: true, value: undefined };
  }

  async kill(streamId: string): Promise<StreamResult> {
    const s = this.find(streamId);
    if (!s) return this.unknown();
    if (!s.meta.running) return { ok: false, error: 'ended' };
    if (!s.control.kill) return { ok: false, error: 'no-kill-capability' };
    // FALSIFIED, kept beside its replacement (the Windows ARM64 session's B7, 2026-10-15): "the control acted, so the kill
    // answers ok". The foreground control dropped `killActive`'s false, so a kill of a soft-paused command that terminated
    // nothing answered ok (docs/defects/fixed/the-terminal-windows-kill-of-a-soft-paused-command-does-nothing-and-reports-success.md).
    if ((await s.control.kill()) === false) return { ok: false, error: 'ended' };
    return { ok: true, value: undefined };
  }

  /** A stream's current metadata (REQ-SHELL-107's audit line reads the command and the agent from it). */
  metaOf(streamId: string): TerminalStreamMeta | undefined {
    const s = this.find(streamId);
    return s ? { ...s.meta, truncated: s.emulator.truncated } : undefined;
  }

  dispose(): void {
    for (const streams of this.bySession.values()) for (const s of streams.values()) this.drop(s);
    this.bySession.clear();
  }

  // ---- internals ----

  private find(streamId: string): Live | undefined {
    for (const streams of this.bySession.values()) { const s = streams.get(streamId); if (s) return s; }
    return undefined;
  }
  private unknown(): StreamResult {
    // With streaming off no stream ever exists, and "unknown" would send the user looking for a bug that is a setting.
    return { ok: false, error: !this.lastEnabled && this.bySession.size === 0 ? 'streaming-disabled' : 'unknown-stream' };
  }
  private drop(s: Live): void {
    s.flush?.cancel();
    s.flush = null;
    s.emulator.dispose();
  }
  /** Only ENDED streams are evicted, oldest first; a live stream is never dropped (its emulator is still consuming). */
  private evict(streams: Map<string, Live>): void {
    const ended = [...streams.values()].filter((s) => !s.meta.running);
    while (ended.length > RETAINED_ENDED_PER_SESSION) {
      const oldest = ended.shift()!;
      this.drop(oldest);
      streams.delete(oldest.spec.streamId);
    }
  }
  private floorWait(s: Live): number {
    const since = this.deps.clocks.monotonic.now() - s.lastEmitAt;
    return Math.max(0, TERMINAL_COALESCE_FLOOR_MS - since);
  }
  private schedule(s: Live, waitMs: number): void {
    const due = this.deps.clocks.monotonic.now() + waitMs;
    if (s.flush && s.flushDue <= due) return;
    s.flush?.cancel();
    s.flushDue = due;
    s.flush = this.deps.clocks.timers.after(millis(waitMs) as Millis, () => { s.flush = null; this.flushNow(s); });
  }
  private flushNow(s: Live): void {
    if (s.flush) { s.flush.cancel(); s.flush = null; }
    if (s.pending.length === 0) return;
    const payload = s.pending;
    s.pending = '';
    s.armed = false;
    this.emit(s, { kind: 'delta', payload });
  }
  private emitMeta(s: Live): void {
    this.emit(s, { kind: 'meta', payload: '', meta: { ...s.meta, truncated: s.emulator.truncated } });
  }
  private emit(s: Live, part: { readonly kind: TerminalFrame['kind']; readonly payload: string; readonly meta?: TerminalStreamMeta; readonly closing?: true }): void {
    s.seq += 1;
    s.lastEmitAt = this.deps.clocks.monotonic.now();
    const frame: TerminalFrame = { v: CONTRACT_SCHEMA_VERSION, sessionId: s.spec.sessionId, streamId: s.spec.streamId, seq: s.seq, kind: part.kind, payload: part.payload, ...(part.meta === undefined ? {} : { meta: part.meta }), ...(part.closing === undefined ? {} : { closing: true }) };
    this.counters.frames += 1;
    if (part.kind === 'delta') this.counters.deltas += 1; else if (part.kind === 'screen') this.counters.screens += 1; else this.counters.metas += 1;
    for (const l of this.listeners) { try { l(frame); } catch (e) { this.deps.warn(`a terminal frame listener raised: ${String(e)}`); } }
  }
}
