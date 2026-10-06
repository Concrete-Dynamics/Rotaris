/**
 * PD-TOOLS-005: whether a run treats the user as **away**, and why.
 *
 * One holder per RUN — `Sessions.start` and every continuation install a fresh one, exactly as the mode
 * override (REQ-TOOLS-075) is installed — and it reaches every agent of the run, delegated children
 * included, through the tool-port context the run hands each construction. The gate consults it before
 * it would put an approval prompt in front of the user and tells it when a wait ended by timeout; the
 * session's control arms tell it when the user sent input. Nothing here reads a clock: the mark is a
 * fact about the run, not a duration, and the transitions are dated by the session log they are written to.
 *
 * The two transitions are recorded in the SESSION LOG (REQ-SESSION-142), not the timeline: REQ-ORCH-139
 * closes the timeline-event vocabulary and neither it nor domain 05's permission events has a word for the
 * user's presence — raised as OQ-76 rather than minted here. Both lines are written at the log's `WARNING`
 * level, which is the configured default: a stretch in which the run refused asks unprompted is read by an
 * autopsy from its start AND its end, and an end that vanished below the default level would leave the
 * stretch looking open.
 */
export interface AwayMark {
  /** The approval timeout, in seconds, that expired unanswered and marked the user away (REQ-TOOLS-052's `<N>`). */
  readonly afterSeconds: number;
}

export interface UserPresenceDeps {
  /** Where a transition is recorded: the run's `warn`, which reaches the session log and the application log. */
  readonly record: (message: string) => void;
}

export class UserPresence {
  private mark: AwayMark | null = null;
  private readonly listeners = new Set<(mark: AwayMark) => void>();
  constructor(private readonly deps: UserPresenceDeps) {}

  /**
   * PD-TOOLS-005 revision 2 (OQ-78): `listener` is told when this run marks its user away — an approval wait still outstanding
   * then registers one, so it is ended at once rather than paying its own full timeout. The returned function unregisters it.
   */
  onAway(listener: (mark: AwayMark) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** The away mark, or null while the user is treated as present. Read by the gate at each ask it would prompt for. */
  away(): AwayMark | null {
    return this.mark;
  }

  /**
   * An approval wait in this run ended by timeout. True on the transition; false when the user was already away,
   * so a second timeout (an ask that was already waiting when the first expired) records nothing new.
   */
  markAway(afterSeconds: number): boolean {
    if (this.mark !== null) return false;
    this.mark = { afterSeconds };
    this.deps.record(`user away: an approval in this run went unanswered for ${afterSeconds} seconds; until the user next sends input to this session, every further approval ask resolves at once under runtime.headless_approval_policy, and every approval still waiting is ended the same way (PD-TOOLS-005)`);
    const mark = this.mark;
    for (const listener of [...this.listeners]) listener(mark);
    return true;
  }

  /**
   * The user sent input to this run's session — an approval or question answer, a message, a run control or a
   * permission-mode change. True when it ended an away stretch; false when the user was not away, so ordinary
   * input records nothing.
   */
  returned(): boolean {
    if (this.mark === null) return false;
    const { afterSeconds } = this.mark;
    this.mark = null;
    this.deps.record(`user returned: input reached this session, ending the away stretch that began when an approval went unanswered for ${afterSeconds} seconds; approval asks prompt and wait again (PD-TOOLS-005)`);
    return true;
  }
}
