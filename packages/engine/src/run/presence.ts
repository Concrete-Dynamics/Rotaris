import type { SessionWriter } from '../session-writer.js';

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
 * The two transitions are recorded in the SESSION LOG (REQ-SESSION-142) and, since OQ-76's ruling (2026-10-06,
 * with OQ-157), on the TIMELINE as `user_away` and `user_returned` — domain 05's words, which PD-TOOLS-011
 * adds — so an autopsy reading the store or the export (REQ-SESSION-199) sees when the stretch began and ended.
 * Until then REQ-ORCH-139's closed vocabulary had no word for the user's presence and only the log carried
 * it. Both lines stay at the log's `WARNING` level, which is the configured default: a stretch in which the
 * run refused asks unprompted is read from its start AND its end, and an end that vanished below the default
 * level would leave the stretch looking open.
 */
export interface AwayMark {
  /** The approval timeout, in seconds, that expired unanswered and marked the user away (REQ-TOOLS-052's `<N>`). */
  readonly afterSeconds: number;
}

export interface UserPresenceDeps {
  /** Where a transition is recorded: the run's `warn`, which reaches the session log and the application log. */
  readonly record: (message: string) => void;
  /**
   * OQ-76's ruling: the session's writer, for the transition's timeline entry — `user_away` (the run's, actor `rotaris`)
   * or `user_returned` (the user's input, actor `user`) — with the line as its message and the expired timeout in its
   * metadata. Absent means none is written.
   */
  readonly writer?: Pick<SessionWriter, 'appendTimeline'> | undefined;
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
    const line = `user away: an approval in this run went unanswered for ${afterSeconds} seconds; until the user next sends input to this session, every further approval ask resolves at once under runtime.headless_approval_policy, and every approval still waiting is ended the same way (PD-TOOLS-005)`;
    this.deps.record(line);
    this.deps.writer?.appendTimeline('user_away', 'rotaris', line, { after_seconds: afterSeconds });
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
    const line = `user returned: input reached this session, ending the away stretch that began when an approval went unanswered for ${afterSeconds} seconds; approval asks prompt and wait again (PD-TOOLS-005)`;
    this.deps.record(line);
    this.deps.writer?.appendTimeline('user_returned', 'user', line, { after_seconds: afterSeconds });
    return true;
  }
}
