import type { Millis, MonotonicClock, TimerHandle, Timers } from '@rotaris/kernel';
import type { ApprovalOption, ApprovalPayload } from '@rotaris/contracts';

/**
 * ADR-0019: the wait registry lives with the gate, in the run host; the presenter is a revocable
 * capability main registers over the channel. `PendingApprovals` implements REQ-TOOLS-054's semantics
 * exactly, the deliberately odd ones included: waiting on an unknown id resolves CANCELLED, not
 * rejected. Attendedness is a boolean the run host maintains (`PresenterRegistry`): true exactly while
 * at least one window is registered AND the liveness poll has not lapsed. The lapse test is THE GAP
 * SINCE THE LAST REPLY on the run host's own clock — never "did a reply for sequence N arrive" — because
 * a blocked main answers late rather than never (ADR-0019, measured). A lapse settles every waiter
 * `cancelled`, which REQ-TOOLS-052 maps to deny with source `cancelled`; no new state is introduced.
 *
 * Decision 5 of the plan: the lapse window is 3,000 ms on a 250 ms poll — ten missed replies, an order
 * of magnitude above the measured 303 ms idle maximum, inside the 22 s lag the spike says must read as
 * unattended. OQ-39 stays open: the loaded case is unmeasured.
 */
export type ApprovalOutcome =
  | { readonly kind: 'resolved'; readonly option: ApprovalOption }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'timed_out'; readonly afterSeconds: number }
  /**
   * PD-ORCH-005 clause 9 (narrowing REQ-TOOLS-054): the run came to rest — by a pause, a stop, a quit or a crash — while
   * the call waited on a person. The wait is released as WITHDRAWN, never as cancelled: a cancelled wait is REQ-TOOLS-052's
   * denial, and a withdrawn call is recorded as interrupted and never run, never as denied. `cause` names the rest.
   */
  | { readonly kind: 'withdrawn'; readonly cause: string }
  /**
   * PD-TOOLS-005 revision 2 (OQ-78, ruled 2026-10-06): the run marked its user away while this wait was outstanding — another
   * approval of the run went unanswered for `afterSeconds` — so the wait is ended at once and resolved as an ask made while
   * the user is away is, under the headless approval policy with the directive's reason.
   */
  | { readonly kind: 'away'; readonly afterSeconds: number };

interface Waiter {
  readonly payload: ApprovalPayload;
  readonly promise: Promise<ApprovalOutcome>;
  settle: (o: ApprovalOutcome) => void;
  timer: TimerHandle | null;
  shown: boolean;
}

/**
 * PD-ORCH-005 clause 9: what holds a wait past its budget. While `held` answers true — the application's quit has closed
 * the last window and is on its way to withdrawing every wait — an expiring timer is armed again rather than settling
 * the wait `timed_out`, which REQ-TOOLS-052 would turn into a denial. The quit's shutdown then withdraws it.
 */
export interface WaitHoldOptions {
  readonly held?: (() => boolean) | undefined;
}

export class PendingApprovals {
  private readonly waiters = new Map<string, Waiter>();
  private readonly held: () => boolean;
  constructor(private readonly timers: Timers, options: WaitHoldOptions = {}) {
    this.held = options.held ?? (() => false);
  }

  /** REQ-TOOLS-054: an empty id is rejected; a duplicate pending id is rejected with the fixed message. */
  create(payload: ApprovalPayload, timeoutMs: number | null): Promise<ApprovalOutcome> {
    const id = payload.request_id;
    if (id === '') throw new Error('An approval request id must not be empty.');
    if (this.waiters.has(id)) throw new Error(`Approval '${id}' is already pending.`);
    let settle: (o: ApprovalOutcome) => void = () => undefined;
    const promise = new Promise<ApprovalOutcome>((resolve) => { settle = resolve; });
    const w: Waiter = { payload, promise, settle, timer: null, shown: false };
    if (timeoutMs !== null && timeoutMs > 0) {
      const expire = (): void => {
        if (this.held()) { w.timer = this.timers.after(timeoutMs as Millis, expire); return; }
        this.finish(id, { kind: 'timed_out', afterSeconds: timeoutMs / 1000 });
      };
      w.timer = this.timers.after(timeoutMs as Millis, expire);
    }
    this.waiters.set(id, w);
    return promise;
  }
  markShown(id: string): void {
    const w = this.waiters.get(id);
    if (w) w.shown = true;
  }
  /** Resolving an unknown id reports failure without side effect. */
  resolve(id: string, option: ApprovalOption): boolean {
    return this.finish(id, { kind: 'resolved', option });
  }
  /** Cancelling an unknown id reports failure without side effect; a request never shown counts as cancelled all the same. */
  cancel(id: string): boolean {
    return this.finish(id, { kind: 'cancelled' });
  }
  /** Waiting on an unknown id resolves cancelled immediately. */
  wait(id: string): Promise<ApprovalOutcome> {
    return this.waiters.get(id)?.promise ?? Promise.resolve({ kind: 'cancelled' });
  }
  /** PD-TOOLS-005 revision 2: one outstanding wait ended because its run marked the user away; false for an id not pending. */
  endAway(id: string, afterSeconds: number): boolean {
    return this.finish(id, { kind: 'away', afterSeconds });
  }
  /** Bulk cancel: every waiter released (run cancellation, shutdown, host teardown, a lapse). */
  cancelAll(): number {
    const ids = [...this.waiters.keys()];
    for (const id of ids) this.finish(id, { kind: 'cancelled' });
    return ids.length;
  }
  /** PD-ORCH-005 clause 9: every waiter released as withdrawn by the rest `cause`; the count released. */
  withdrawAll(cause: string): number {
    const ids = [...this.waiters.keys()];
    for (const id of ids) this.finish(id, { kind: 'withdrawn', cause });
    return ids.length;
  }
  has(id: string): boolean {
    return this.waiters.has(id);
  }
  /** REQ-TOOLS-060: request id → payload, in creation order. */
  pending(): ApprovalPayload[] {
    return [...this.waiters.values()].map((w) => w.payload);
  }
  get size(): number {
    return this.waiters.size;
  }
  private finish(id: string, outcome: ApprovalOutcome): boolean {
    const w = this.waiters.get(id);
    if (!w) return false;
    this.waiters.delete(id);
    w.timer?.cancel();
    w.settle(outcome);
    return true;
  }
}

export interface PresenterRegistryDeps {
  readonly monotonic: MonotonicClock;
  readonly timers: Timers;
  /** Send one liveness poll to main. */
  readonly poll: (seq: number) => void;
  /** Every registration is revoked at once; the gate's waiters are cancelled by the callee. */
  readonly onLapse: () => void;
  readonly pollMs?: number;
  readonly lapseMs?: number;
}

export const DEFAULT_POLL_MS = 250;
export const DEFAULT_LAPSE_MS = 3_000;

/** ADR-0019: registrations per main window; a lapse is a gap since the last reply, on the run host's clock. */
export class PresenterRegistry {
  private readonly windows = new Set<string>();
  /** PD-ORCH-005 clause 9: main said the quit took the window it revoked last; a registration ends it. */
  private quitBegun = false;
  private lastReplyAt: Millis | null = null;
  private lapsed = false;
  private seq = 0;
  private timer: TimerHandle | null = null;
  readonly pollMs: number;
  readonly lapseMs: number;

  constructor(private readonly deps: PresenterRegistryDeps) {
    this.pollMs = deps.pollMs ?? DEFAULT_POLL_MS;
    this.lapseMs = deps.lapseMs ?? DEFAULT_LAPSE_MS;
  }
  start(): void {
    if (this.timer) return;
    this.timer = this.deps.timers.every(this.pollMs as Millis, () => {
      this.seq += 1;
      this.deps.poll(this.seq);
      this.check();
    });
  }
  stop(): void {
    this.timer?.cancel();
    this.timer = null;
  }
  /** Explicit and prompt, on window creation (ADR-0019 c.1). */
  register(windowId: string): void {
    this.windows.add(windowId);
    this.quitBegun = false;
    if (this.lastReplyAt === null) this.lastReplyAt = this.deps.monotonic.now();
  }
  /**
   * Explicit and prompt, on window close: the last one closing makes the application unattended. `quitting` is main's
   * word that the application's quit closed the window (PD-ORCH-005 clause 9), so what is asked of a person afterwards
   * waits for the quit to withdraw it instead of being resolved as though nobody were there.
   */
  revoke(windowId: string, quitting = false): void {
    this.windows.delete(windowId);
    if (quitting) this.quitBegun = true;
  }
  /** A reply refreshes the set main holds and clears a lapse (asks raised afterwards are brokered again). */
  pollReplied(windows: readonly string[]): void {
    this.lastReplyAt = this.deps.monotonic.now();
    this.windows.clear();
    for (const w of windows) this.windows.add(w);
    this.lapsed = false;
  }
  private check(): void {
    if (this.lapsed || this.windows.size === 0 || this.lastReplyAt === null) return;
    if (this.deps.monotonic.now() - this.lastReplyAt > this.lapseMs) {
      this.lapsed = true;
      this.deps.onLapse();
    }
  }
  /** REQ-TOOLS-053: a prompt can be put in front of a person. */
  get attended(): boolean {
    return this.windows.size > 0 && !this.lapsed;
  }
  /**
   * PD-ORCH-005 clause 9: the application's quit has closed every main window and its shutdown is still to come (it waits
   * on REQ-GIT-101's checkpoint operation first). No presenter is left, but an approval or a question is withdrawn by the
   * quit, never denied or cancelled for want of one.
   */
  get quitting(): boolean {
    return this.quitBegun && this.windows.size === 0;
  }
  get isLapsed(): boolean {
    return this.lapsed;
  }
  get registered(): readonly string[] {
    return [...this.windows];
  }
}

/** The channel to main, as the gate sees it: present a request, close a dialog. Main never decides. */
export interface PresenterPort {
  present(payload: ApprovalPayload): Promise<{ ok: true } | { ok: false; error: string }>;
  close(requestId: string): void;
}
