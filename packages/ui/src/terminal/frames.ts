import type { TerminalFrame, TerminalStreamMeta } from '@rotaris/contracts';

/**
 * Part AM — the display side's view of one frame on channel 3 (ADR-0021: VT bytes plus a per-stream monotonic
 * sequence; `screen` on attach and resync, `delta` between, `meta` idempotent). AL extends `TerminalFrameSchema`
 * in place with `meta` and `closing`; until that lands this type carries them as optional fields of the same shape,
 * so the merge is a no-op when the schema agrees and a one-line change to `frameSeq` if AL renames the counter.
 */
export interface DisplayFrame extends TerminalFrame {
  readonly meta?: TerminalStreamMeta | undefined;
  /** OQ-5's reading (ADR-0021 §"Open question carried"): the closing `screen` frame is plain text, a literal replacement. */
  readonly closing?: true | undefined;
}

/** The ONE place the sequence field is read. `channels.ts` spells it `streamSeq`; the plan's seam spells it `seq`. */
export function frameSeq(frame: Pick<TerminalFrame, 'streamSeq'>): number {
  return frame.streamSeq;
}
