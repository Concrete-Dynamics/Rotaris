/**
 * The review pane's reads (REQ-TRACE-424..426): which read of the review the pane is showing, whether a read that has
 * landed may be shown, and whether the notice a decision left still belongs to what is on screen.
 *
 * fin34 found two ways the pane could draw a payload other than the one the person's decision belonged to
 * (`docs/defects/fixed/the-review-pane-once-drew-a-refusal-payload-under-the-users-own-accept-notice.md`,
 * `docs/defects/fixed/a-review-read-for-one-requirement-lands-in-the-pane-retargeted-to-another.md`):
 *
 * - the decision's notice was the pane's local state and outlived a FRESH read — the detail's Review control pressed again
 *   while the pane stood open after a decision read the requirement anew, and the refusal REQ-TRACE-424 names for a card the
 *   decision had moved was drawn under a notice calling the payload on screen the one the decision was made against; and
 * - a read outstanding for one requirement, landing after the pane had been opened on another (whose own read REQ-TRACE-425
 *   refused while the first was outstanding), was drawn under the second's identifier, with its decisions offered for it.
 */
export interface ReviewReads {
  /**
   * A read asked for `id`: `start` with the read's sequence number, or `busy` while one is outstanding — REQ-TRACE-425
   * refuses a second read rather than starting it, whichever requirement it is for.
   */
  ask(id: string): { readonly start: number } | { readonly busy: true };
  /**
   * The read `seq` has landed, and the pane now targets `target`: `show` when it is the outstanding read and the pane still
   * shows the requirement it was asked for; `discard` otherwise — a payload is never drawn under another requirement.
   */
  land(seq: number, target: string | null): 'show' | 'discard';
}

export function reviewReads(): ReviewReads {
  let outstanding: { readonly id: string; readonly seq: number } | null = null;
  let next = 0;
  return {
    ask(id) {
      if (outstanding !== null) return { busy: true };
      next += 1;
      outstanding = { id, seq: next };
      return { start: next };
    },
    land(seq, target) {
      if (outstanding === null || outstanding.seq !== seq) return 'discard';
      const { id } = outstanding;
      outstanding = null;
      return target === id ? 'show' : 'discard';
    },
  };
}

/** A decision's notice and the read whose payload the decision was made against. */
export interface DecidedNotice {
  readonly text: string;
  readonly readSeq: number;
}

/**
 * REQ-TRACE-426: the notice after a decision says the payload on screen is the one the decision was made against and is out
 * of date. It is shown only while that payload is still the one on screen: a later read — the notice's own Reload, or the
 * review opened again — replaces the payload, and the notice with it.
 */
export function decidedNoticeShown(decided: DecidedNotice | null, readSeq: number): string | null {
  return decided !== null && decided.readSeq === readSeq ? decided.text : null;
}
