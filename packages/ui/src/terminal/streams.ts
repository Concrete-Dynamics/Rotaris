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

export type StreamListener = (streamId: string, outcome: ApplyOutcome | 'cleared') => void;

export class TerminalStreamSet {
  private readonly streams = new Map<string, StreamDisplay>();
  private readonly listeners = new Set<StreamListener>();
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
    const result = applyFrame(display, frame);
    if (result.outcome === 'applied') this.streams.set(frame.streamId, result.display);
    for (const listener of this.listeners) listener(frame.streamId, result.outcome);
    return result.outcome;
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
    this.total = 0;
    for (const id of ids) for (const listener of this.listeners) listener(id, 'cleared');
  }

  subscribe(listener: StreamListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** What the transcript row's preview block draws (REQ-CHAT-063/066/076, REQ-SHELL-079). */
  previewOf(streamId: string): TerminalPreview | null {
    const display = this.streams.get(streamId);
    if (display === undefined) return null;
    const lines = [...display.emulator.snapshot().lines];
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return {
      streamId, lines, running: display.meta.running, truncated: display.meta.truncated,
      exitCode: display.meta.exitCode, command: display.meta.command, displayName: displayNameOf(display.meta),
    };
  }
}
