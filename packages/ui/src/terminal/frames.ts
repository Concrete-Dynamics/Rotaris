import type { TerminalStreamMeta } from '@rotaris/contracts';

/**
 * Part AM — the display side's view of one frame on channel 3 (ADR-0021: VT bytes plus a per-stream monotonic
 * sequence; `screen` on attach and resync, `delta` between, `meta` idempotent). The shape is the manager's ruling on
 * the seam (2026-09-09): `{ v, sessionId, streamId, seq, kind, payload, meta?, closing? }` — `sessionId` for
 * per-session routing, the counter spelt `seq`. AL rewrites `TerminalFrameSchema` in `channels.ts` to this shape; this
 * interface is declared here rather than derived from that schema so the two worktrees compile apart, and it is
 * structurally the same type, so the merge may replace it with `TerminalFrame` in one line.
 */
export interface DisplayFrame {
  readonly v: number;
  readonly sessionId: string;
  readonly streamId: string;
  /** Per-stream, monotonic (REQ-SHELL-104) — a different counter from the session's. */
  readonly seq: number;
  readonly kind: 'delta' | 'screen' | 'meta';
  readonly payload: string;
  readonly meta?: TerminalStreamMeta | undefined;
  /** OQ-5's reading (ADR-0021 §"Open question carried"): the closing `screen` frame is plain text, a literal replacement. */
  readonly closing?: true | undefined;
}

/** The ONE place the sequence field is read. */
export function frameSeq(frame: Pick<DisplayFrame, 'seq'>): number {
  return frame.seq;
}
