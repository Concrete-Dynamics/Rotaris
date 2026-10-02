import { applyFrame, createStreamDisplay, type ApplyOutcome, type EmulatorFactory, type StreamDisplay } from './emulator.js';
import type { DisplayFrame } from './frames.js';
import { displayNameOf } from './labels.js';

/**
 * Part AM — the ONE subscription point per renderer (ADR-0021: "the transcript preview, the persona card and the
 * pop-out grid subscribe at one point"). Frames on channel 3 are applied here in arrival order; every surface reads
 * the result. Retained screen state is a first-class, non-persisted object: a stream exists here exactly when a
 * frame for it has arrived in this renderer's life, so a session read back from storage yields no stream and no tab
 * (REQ-SHELL-085/104 satisfied by doing nothing). `clear()` is REQ-SHELL-110/111's session change.
 */
export interface TerminalPreview {
  readonly streamId: string;
  /** The visible screen rows, trailing blank rows dropped; the same cells the grid shows (REQ-SHELL-102). */
  readonly lines: readonly string[];
  readonly running: boolean;
  readonly truncated: boolean;
  readonly exitCode: number | undefined;
  readonly command: string | undefined;
  readonly displayName: string;
}

/**
 * `parsed`: a `screen` frame's text has been parsed, so a preview drawn while it was parsing (from the held screen) is
 * now out of date and is drawn again.
 */
export type StreamListener = (streamId: string, outcome: ApplyOutcome | 'cleared' | 'parsed') => void;

/**
 * The screen a stream's previews show while a `screen` frame is parsing: the lines as parsed when the first such frame
 * arrived, and how many screen frames are still parsing.
 */
interface HeldScreen {
  readonly lines: readonly string[];
  pending: number;
}

export class TerminalStreamSet {
  private readonly streams = new Map<string, StreamDisplay>();
  private readonly listeners = new Set<StreamListener>();
  /**
   * REQ-SHELL-102, REQ-CHAT-063/076: a `screen` frame resets the emulator and rewrites it, and the library parses the
   * text over several tasks, so a snapshot taken in between reads a reset (empty) or half-written screen. While a
   * stream's screen frame is parsing, its previews read the screen as it stood before that frame, and once the text
   * has parsed the listeners are told (`parsed`) and the preview reads the emulator again. Seen once in
   * `terminal-proof`'s live section as an empty row preview after the closing frame
   * (`docs/defects/fixed/a-closing-terminal-frame-blanks-the-preview-while-the-final-screen-is-parsed.md`).
   */
  private readonly held = new Map<string, HeldScreen>();
  /** REQ-SHELL-108: the total only ever climbs within a session. */
  private total = 0;

  constructor(private readonly factory: EmulatorFactory) {}

  apply(frame: DisplayFrame): ApplyOutcome {
    let display = this.streams.get(frame.streamId);
    if (display === undefined) {
      display = createStreamDisplay(frame, this.factory);
      this.streams.set(frame.streamId, display);
      this.total += 1;
    }
    const streamId = frame.streamId;
    let hold: HeldScreen | undefined;
    if (frame.kind === 'screen') {
      // Read before the frame is applied: the screen as parsed so far, which is what the previews showed a moment ago.
      hold = this.held.get(streamId) ?? { lines: display.emulator.snapshot().lines, pending: 0 };
    }
    const screen = hold;
    const result = applyFrame(display, frame, screen === undefined ? undefined : () => this.screenParsed(streamId, screen));
    if (result.outcome === 'applied') {
      this.streams.set(streamId, result.display);
      if (screen !== undefined) { screen.pending += 1; this.held.set(streamId, screen); }
    }
    for (const listener of this.listeners) listener(streamId, result.outcome);
    return result.outcome;
  }

  /** A screen frame's text has parsed: the hold is released after the last pending one, and the surfaces redraw. */
  private screenParsed(streamId: string, screen: HeldScreen): void {
    // A hold the set no longer carries belongs to a stream cleared since (REQ-SHELL-110/111): nothing to announce.
    if (this.held.get(streamId) !== screen) return;
    screen.pending -= 1;
    if (screen.pending > 0) return;
    this.held.delete(streamId);
    for (const listener of this.listeners) listener(streamId, 'parsed');
  }

  get(streamId: string): StreamDisplay | null { return this.streams.get(streamId) ?? null; }
  has(streamId: string): boolean { return this.streams.has(streamId); }
  /** In arrival order — the tab order. */
  list(): readonly StreamDisplay[] { return [...this.streams.values()]; }
  running(): number { let n = 0; for (const s of this.streams.values()) if (s.meta.running) n += 1; return n; }
  get totalSeen(): number { return this.total; }

  /** REQ-SHELL-110/111: session focus change or a new session — every screen goes, the counts reset. */
  clear(): void {
    const ids = [...this.streams.keys()];
    for (const s of this.streams.values()) s.emulator.dispose();
    this.streams.clear();
    this.held.clear();
    this.total = 0;
    for (const id of ids) for (const listener of this.listeners) listener(id, 'cleared');
  }

  subscribe(listener: StreamListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /**
   * What the transcript row's preview block draws (REQ-CHAT-063/066/076, REQ-SHELL-079). While a `screen` frame is
   * parsing, the lines are the screen from before it, never the reset or half-written one; the state is the frame's.
   */
  previewOf(streamId: string): TerminalPreview | null {
    const display = this.streams.get(streamId);
    if (display === undefined) return null;
    const lines = [...(this.held.get(streamId)?.lines ?? display.emulator.snapshot().lines)];
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return {
      streamId, lines, running: display.meta.running, truncated: display.meta.truncated,
      exitCode: display.meta.exitCode, command: display.meta.command, displayName: displayNameOf(display.meta),
    };
  }
}
