import type { TerminalFrame } from '@rotaris/contracts';

/**
 * Part AM — the display side's view of one frame on channel 3 (ADR-0021: VT bytes plus a per-stream monotonic
 * sequence; `screen` on attach and resync, `delta` between, `meta` idempotent). The shape is the manager's ruling on
 * the seam (2026-09-09): `{ v, sessionId, streamId, seq, kind, payload, meta?, closing? }`.
 *
 * Part AL2: now that `channels.ts` carries that shape (`sessionId`, the counter spelt `seq`), the display's frame IS
 * the contract's frame — the one-line alias the merge was meant to make. Nothing in `ui/terminal` declares the shape
 * a second time; the scripted sources in the tests and the proof page emit the contract's type.
 */
export type DisplayFrame = TerminalFrame;

/** The ONE place the sequence field is read. */
export function frameSeq(frame: Pick<DisplayFrame, 'seq'>): number {
  return frame.seq;
}
