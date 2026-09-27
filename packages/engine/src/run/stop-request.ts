/**
 * ADR-0014 alternative C — an explicit, OBSERVABLE, STICKY stop request.
 *
 * Set by the control channel or by shutdown; never thrown. Sticky: a cancel
 * arriving before the loop's callbacks are wired replays when they are
 * (REQ-SESSION-092, REQ-EVENTS-028). A second request may only raise
 * `forced`; nothing ever lowers it. The reason is the closed stop-reason
 * token the request carries into the terminal result (REQ-MONITOR-301).
 */
/** REQ-TOOLS-065: the headless abort hook ends the run as agent_session_aborted. */
export type StopReasonToken = 'user_cancelled' | 'application_shutdown' | 'agent_session_aborted';

export interface StopState {
  readonly requested: boolean;
  readonly forced: boolean;
  readonly reason: StopReasonToken | null;
  /**
   * PD-ORCH-005 clause 3: the stop is the explicit cancel — REQ-MONITOR-126's control, "cannot be undone in this
   * session" — rather than a stop. A stop leaves every unfinished agent `paused` to be resumed; a cancel ends its agents
   * `cancelled`, and those are never resumed. Like `forced`, it may only be raised.
   */
  readonly final: boolean;
}

export class StopRequest {
  private state: StopState = { requested: false, forced: false, reason: null, final: false };
  private listeners: ((s: StopState) => void)[] = [];

  get requested(): boolean {
    return this.state.requested;
  }
  get forced(): boolean {
    return this.state.forced;
  }
  get reason(): StopReasonToken | null {
    return this.state.reason;
  }
  get final(): boolean {
    return this.state.final;
  }
  get current(): StopState {
    return this.state;
  }

  /**
   * Idempotent; a later `forced` or `final` raises that flag, a later request raising neither changes nothing. The first
   * reason stands.
   */
  request(reason: StopReasonToken, forced = false, final = false): void {
    if (this.state.requested && (!forced || this.state.forced) && (!final || this.state.final)) return;
    this.state = { requested: true, forced: this.state.forced || forced, reason: this.state.reason ?? reason, final: this.state.final || final };
    for (const fn of [...this.listeners]) fn(this.state);
  }

  /** Replays immediately when already requested — the stickiness REQ-SESSION-092 requires. */
  onRequested(fn: (s: StopState) => void): () => void {
    this.listeners.push(fn);
    if (this.state.requested) fn(this.state);
    return () => { this.listeners = this.listeners.filter((l) => l !== fn); };
  }
}
