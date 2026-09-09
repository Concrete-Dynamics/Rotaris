import type { TerminalStreamMeta } from '@rotaris/contracts';
import { frameSeq, type DisplayFrame } from './frames.js';

/**
 * Part AM — the display emulator as a PORT (ADR-0021: "the emulator library is a port, not the decision"; ADR-0047 B:
 * the library is used as a screen). Two adapters exist: `headless.ts` (`@xterm/headless`, for the transcript preview
 * and for tests) and `xterm-view.ts` (`@xterm/xterm` opened into a DOM host, for the grid). Both consume the same
 * frames from the same subscription point (`streams.ts`), which is what REQ-SHELL-102's identical-cells claim rests on.
 */
export interface ScreenSnapshot {
  readonly cols: number;
  readonly rows: number;
  /** The visible rows, top to bottom, each right-trimmed — the screen as a reader sees it. */
  readonly lines: readonly string[];
  /** The cursor within the screen page: `y` is 0 at the top row of the page, whatever the scrollback. */
  readonly cursor: { readonly x: number; readonly y: number };
  /** Retained history rows above the page (REQ-SHELL-101: the scrollbar's range). */
  readonly historyRows: number;
  /** The first visible buffer row; equals `historyRows` when the view is at the tail. */
  readonly viewportY: number;
  readonly atTail: boolean;
  readonly alternate: boolean;
  /** The program hid its cursor (DECTCEM); REQ-SHELL-098 paints none then. */
  readonly cursorHidden: boolean;
}

export interface ScreenEmulator {
  readonly cols: number;
  readonly rows: number;
  /**
   * Parses asynchronously: xterm queues writes and drains them on a macrotask, so the screen a `snapshot()` taken in
   * the same tick shows is the one BEFORE this data. `parsed` fires once this data (and everything queued before it)
   * has been applied.
   */
  write(data: string, parsed?: () => void): void;
  /**
   * Back to an empty screen with default attributes, main buffer, scrollback cleared — the `screen` frame's
   * precondition. Goes through the write queue (RIS) so it lands AFTER any delta still queued before it.
   */
  reset(): void;
  resize(cols: number, rows: number): void;
  snapshot(): ScreenSnapshot;
  /** The cells of one buffer row between two columns, wide cells intact — the selection extractor's reader. */
  readCells(row: number, fromColumn: number, toColumn: number): string;
  dispose(): void;
}

export type EmulatorFactory = (cols: number, rows: number) => ScreenEmulator;

/** REQ-SHELL-082: an unknown stream displays "Terminal"; every other field takes its safe default until a meta frame arrives. */
export const UNKNOWN_STREAM_META: Omit<TerminalStreamMeta, 'streamId' | 'sessionId'> = Object.freeze({
  kind: 'agent', displayName: 'Terminal', running: true, truncated: false, cols: 80, rows: 24, acceptsInput: false, canKill: false,
});

/**
 * One stream as one renderer holds it: the emulator, the latest metadata, the sequence applied so far, and the
 * running→closed transition that REQ-SHELL-105 says happens exactly once.
 */
export interface StreamDisplay {
  readonly streamId: string;
  readonly emulator: ScreenEmulator;
  readonly meta: TerminalStreamMeta;
  readonly lastSeq: number;
  /** Set when the stream went from running to closed; never unset, whatever a later meta says (REQ-SHELL-105). */
  readonly closed: boolean;
  readonly framesApplied: number;
}

export type ApplyOutcome = 'applied' | 'stale' | 'wrong-stream';

export function createStreamDisplay(frame: DisplayFrame, factory: EmulatorFactory): StreamDisplay {
  const meta: TerminalStreamMeta = frame.meta ?? { ...UNKNOWN_STREAM_META, streamId: frame.streamId, sessionId: '' };
  return { streamId: frame.streamId, emulator: factory(meta.cols, meta.rows), meta, lastSeq: 0, closed: false, framesApplied: 0 };
}

/**
 * REQ-SHELL-104/105 — apply one frame. A sequence number at or below the last applied is never applied twice, so a
 * line is never shown twice while retained and fresh output both arrive; a `screen` frame resets and rewrites; a
 * `delta` appends; a `meta` frame synchronises command, truncation and running state idempotently. The closing frame
 * (OQ-5's reading) is a literal replacement: reset, then the plain text with its newlines carried to column 0.
 */
export function applyFrame(display: StreamDisplay, frame: DisplayFrame): { readonly display: StreamDisplay; readonly outcome: ApplyOutcome } {
  if (frame.streamId !== display.streamId) return { display, outcome: 'wrong-stream' };
  const seq = frameSeq(frame);
  if (seq <= display.lastSeq) return { display, outcome: 'stale' };
  let meta = display.meta;
  let closed = display.closed;
  if (frame.meta) {
    const incoming = frame.meta;
    // The transition runs one way: once closed, a later `running: true` cannot reopen it (REQ-SHELL-105).
    const running = closed ? false : incoming.running;
    if (!closed && meta.running && !incoming.running) closed = true;
    meta = { ...incoming, running, ...(closed && incoming.exitCode === undefined && meta.exitCode !== undefined ? { exitCode: meta.exitCode } : {}) };
    if (meta.cols !== display.emulator.cols || meta.rows !== display.emulator.rows) display.emulator.resize(meta.cols, meta.rows);
  }
  if (frame.kind === 'screen') {
    display.emulator.reset();
    display.emulator.write(frame.closing ? frame.payload.replace(/\r?\n/g, '\r\n') : frame.payload);
  } else if (frame.kind === 'delta') {
    display.emulator.write(frame.payload);
  }
  return { display: { ...display, meta, closed, lastSeq: seq, framesApplied: display.framesApplied + 1 }, outcome: 'applied' };
}
