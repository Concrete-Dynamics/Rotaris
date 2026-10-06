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
  /**
   * The last frame written was a closing one whose text left the cursor after its last character, not at column 0
   * (the closing text is the observation's, its trailing newline trimmed). Read once, when the next command re-opens
   * the stream: that command's output starts on the row after the closing text (live-run L9).
   */
  readonly closingEndsMidRow: boolean;
}

export type ApplyOutcome = 'applied' | 'stale' | 'wrong-stream';

export function createStreamDisplay(frame: DisplayFrame, factory: EmulatorFactory): StreamDisplay {
  const meta: TerminalStreamMeta = frame.meta ?? { ...UNKNOWN_STREAM_META, streamId: frame.streamId, sessionId: frame.sessionId };
  return { streamId: frame.streamId, emulator: factory(meta.cols, meta.rows), meta, lastSeq: 0, closed: false, framesApplied: 0, closingEndsMidRow: false };
}

/**
 * REQ-SHELL-104/105 — apply one frame. A sequence number at or below the last applied is never applied twice, so a
 * line is never shown twice while retained and fresh output both arrive; a `screen` frame resets and rewrites; a
 * `delta` appends; a `meta` frame synchronises command, truncation and running state idempotently. The closing frame
 * (OQ-5's reading, closed 2026-09-11 when REQ-TOOLS-127 came to state it) is a literal replacement: reset, then the plain text with its newlines carried to column 0.
 *
 * `screen`'s hooks are called only for an applied `screen` frame, from the write queue: `resetReached` once everything
 * queued before the frame has parsed and the reset is next (an empty write ahead of the reset, which is itself queued),
 * so the screen read there is the last complete one; `parsed` once the frame's text has parsed. The subscription point
 * holds that screen for the previews between the two, and only then (`streams.ts`;
 * `docs/defects/fixed/a-closing-terminal-frame-blanks-the-preview-while-the-final-screen-is-parsed.md`).
 */
export interface ScreenFrameHooks {
  readonly resetReached?: () => void;
  readonly parsed?: () => void;
}

export function applyFrame(display: StreamDisplay, frame: DisplayFrame, screen?: ScreenFrameHooks): { readonly display: StreamDisplay; readonly outcome: ApplyOutcome } {
  if (frame.streamId !== display.streamId) return { display, outcome: 'wrong-stream' };
  const seq = frameSeq(frame);
  if (seq <= display.lastSeq) return { display, outcome: 'stale' };
  let meta = display.meta;
  let closed = display.closed;
  let reopened = false;
  if (frame.meta) {
    const incoming = frame.meta;
    /*
     * Part AL2 (defect AL2-4, found the first time a second command ran on a live stream through the window): the
     * transition was written one way — once closed, a later `running: true` could not reopen the display — on the
     * reading that REQ-SHELL-105's "exactly once" bounds the stream's whole life. The run host's registry (ADR-0021,
     * Part AL) re-opens an agent's ONE foreground stream (`fg:<agent>`, REQ-TOOLS-127's scope) in place for each next
     * command: same id, the counter continuing, `running` true again with the new command. Under the old reading the
     * window showed "exit 0" over a command that was running, disabled every control, and the toolbar counted nothing.
     * The reading now: running → closed happens exactly once PER COMMAND; a later meta with `running: true` and a
     * higher `seq` is the next command opening the same stream (the exit code goes with it). An older frame can never
     * reopen anything — the sequence rule above already refuses it — so idempotence is intact.
     */
    // A display created from a late attacher's closing resync frame starts with `running: false` and never saw the
    // transition, so "not running before, running now" is also the next command opening the stream.
    reopened = (closed || !meta.running) && incoming.running;
    if (reopened) closed = false;
    const running = closed ? false : incoming.running;
    if (!closed && meta.running && !incoming.running) closed = true;
    meta = { ...incoming, running, ...(closed && incoming.exitCode === undefined && meta.exitCode !== undefined ? { exitCode: meta.exitCode } : {}) };
    if (reopened && incoming.exitCode === undefined) delete (meta as { exitCode?: number }).exitCode;
    if (meta.cols !== display.emulator.cols || meta.rows !== display.emulator.rows) display.emulator.resize(meta.cols, meta.rows);
  }
  /*
   * Live-run L9, second round (2026-09-29): since the run host's stream carries only what the command wrote, the next
   * command's first delta is its own first line. The closing text above it is the observation's, its trailing newline
   * trimmed, so the literal replacement leaves the cursor after that text's last character, and the next command's
   * first line was drawn onto the previous command's last row ("first-cmdsecond-cmd"). Before L9's repair the echoed
   * wrapper took that glued position and hid it. A re-opened stream now starts on the row after the closing text:
   * the display moves its own cursor to column 0 of the next row, as a terminal would under a new prompt. No byte is
   * added to any frame and nothing the command wrote is changed; a screen frame replaces the screen and needs none.
   */
  let closingEndsMidRow = display.closingEndsMidRow;
  if (frame.kind === 'screen') {
    if (screen?.resetReached !== undefined) display.emulator.write('', screen.resetReached);
    display.emulator.reset();
    display.emulator.write(frame.closing ? frame.payload.replace(/\r?\n/g, '\r\n') : frame.payload, screen?.parsed);
    closingEndsMidRow = frame.closing === true && frame.payload !== '' && !frame.payload.endsWith('\n');
  } else {
    if (reopened && closingEndsMidRow) display.emulator.write('\r\n');
    if (reopened) closingEndsMidRow = false;
    if (frame.kind === 'delta') {
      display.emulator.write(frame.payload);
      closingEndsMidRow = false;
    }
  }
  return { display: { ...display, meta, closed, lastSeq: seq, framesApplied: display.framesApplied + 1, closingEndsMidRow }, outcome: 'applied' };
}
