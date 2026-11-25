import { INBOUND_NO_OPEN_WORKSPACE, INBOUND_RUN_ALREADY_ACTIVE, INBOUND_RUN_HANDLE_PATTERN, INBOUND_START_BOUND_MS as INBOUND_START_BOUND_MS_NUMBER, isBusy, presentationStatus, runHasEnded, type InboundListenerAsk, type InboundRunStatus, type InboundStartRunAnswer, type InboundRunStatusAnswer, type StopReason } from '@rotaris/contracts';
import { millis, type Millis } from '@rotaris/kernel';
import { randomUUID } from 'node:crypto';
import { startSessionRun, type SessionStartDeps } from './session-start.js';
import type { InboundStatusReading } from './inbound-status.js';

/**
 * THE SURFACE'S MAIN-SIDE COORDINATOR (ADR-0067; REQ-MCP-123/124/125/126/128/130). This is the one place an external
 * caller's ask is turned into an act of the product, and it holds the four rules the surface's slice fixes:
 *
 * 1. **The single-run slot** (REQ-MCP-126). At most one externally started run is active. The slot is taken ATOMICALLY
 *    and BEFORE the coordinator's side effects — worktree creation among them — and held across admission and the whole
 *    approval wait, released only at a definite refusal or the run's own end. A request while one is active is
 *    refused with a stated reason and never queued.
 * 2. **The slot owner survives a listener restart** (the advisor's "slot owner"). The slot's owner is this main-side
 *    coordinator, not the listener process: `InboundSurfaceRuns` lives in main for the application's lifetime, so a
 *    listener that exits and is forked again cannot release the slot or admit a second run. A released listener never
 *    releases the slot.
 * 3. **Handles only this surface minted** (REQ-MCP-123/130). `rotaris_run_status` answers a handle a start returned and
 *    nothing else — an unrelated session id is refused, so the surface cannot be used to read another run's state.
 * 4. **The start is the ordinary start** (REQ-MCP-124). The ask is handed to `startSessionRun`, the same main-side
 *    coordinator a desktop start uses, with the open workspace's own id and root. A caller sets no authority field.
 *
 * Main holds `InboundSurfaceRuns`; the listener holds the socket. An ask arrives from the listener and this answers it.
 *
 * REWORK 2 (2026-11-25, BLOCKER A). The slot's transitions are bound to the IDENTITY OF THE ATTEMPT, not to a global
 * counter. Every start mints an attempt (`{ id, sessionId, handle }`) when it takes the slot, and `held`/`committed`/
 * `release`/`ended`/`observe` act only on the attempt that is current: a late `committed`/`release` of an attempt the
 * coordinator has already moved past touches NOTHING. The counter design allowed exactly that: an `ended(A)` that
 * arrived while A's start was still in `startSessionRun`'s tail freed the slot, a `take(B)` overwrote A's marker, and
 * A's late `committed` then consumed B's reservation and entered the dead A as the active run — a later refusal of B
 * left the slot occupied for good. An attempt carries its own handle and workspace, so a settled (late-started) attempt
 * can be observed under the handle the caller was given.
 *
 * REWORK 3 (2026-11-25, the LEAD RULE). The slot is freed ONLY on a DEFINITE signal; when in doubt it is HELD. The cost
 * of holding is a surface that refuses further starts for a while; the cost of freeing early is TWO running runs, which
 * REQ-MCP-126 forbids. Three consequences, each a fix below:
 *
 * - **BLOCKER 1** — the listener's ask bound is now DERIVED from main's start bound (the one chain in
 *   `contracts/inbound.ts`), so a slow-but-confirmed start is delivered rather than timed out in the listener.
 * - **BLOCKER 2** — the settle probe frees the slot only when it is definite that no run was born (a successful listing
 *   that lacks the session for the whole host worst case, or a definite refusal); an unreadable listing EXTENDS it, and
 *   a later snapshot of the RESERVED session settles THAT attempt even after a newer `take`.
 * - **BLOCKER 3** — `runHasEnded` no longer reads `idle` (nor any non-terminal, reasonless state) as an end, so a
 *   plan-approve/revise or a message-limit continue, which publish `idle` before relaunching the SAME session, keep the
 *   slot through the continuation.
 */

/** One externally started run: the handle the caller was given, the session behind it, the workspace it belongs to, and the reason it stopped (REQ-MCP-123, BLOCKER D). */
export interface InboundRun {
  readonly handle: string;
  readonly sessionId: string;
  readonly workspaceId: string;
  /**
   * BLOCKER D (2026-11-25): the stop reason of THIS run, read from the product's own state (the run host's terminal
   * `run.result`, and the `publish.snapshot` record's own `stopReason`). It lives beside the handle, so it is evicted
   * exactly when the handle is: a desktop run of another session can neither evict it (its result names no handle of
   * this surface and is ignored) nor displace it (`ended`/`observe` write it only for this run's own session).
   */
  stopReason: string | null;
  /**
   * MAJOR (2026-11-25): the state the run was in WHEN IT ENDED, frozen at that moment. `rotaris_run_status` answers a
   * run that has ended from THIS, never from a later reading of the same session — a desktop continuation of the session
   * (a re-run of the same session id) would otherwise make the old handle report the continuation's state and waiting
   * flag (REQ-MCP-123/125). null while the run is still live.
   */
  endState: FrozenEndState | null;
}

/** The two fields frozen at a run's end: its execution status and whether it waited on a person then. */
export interface FrozenEndState {
  readonly executionStatus: string;
  readonly awaitingInput: boolean;
}

/** The identity of one attempt at the slot: minted when the start takes it, and the only thing a later transition may act on. */
export interface InboundAttempt {
  readonly id: number;
  readonly sessionId: string;
  /** The handle reserved for this attempt, so a start that is confirmed only late is still observable (BLOCKER B). */
  readonly handle: string;
}

/** The internal attempt: the identity, plus the workspace it starts against and the facts a settled attempt carries (BLOCKER B/C/D). */
interface HeldAttempt {
  readonly id: number;
  readonly sessionId: string;
  readonly handle: string;
  workspaceId: string | null;
  /** Whether this attempt's run already reported its terminal state, so the late `committed` records the handle and leaves the slot free. */
  ended: boolean;
  /** The reason observed for this attempt's run, so a late `committed` records it with the handle (BLOCKER D). */
  stopReason: string | null;
  /** The state frozen when this attempt's run ended (MAJOR), carried into the recorded run. */
  endState: FrozenEndState | null;
}

/** What taking the slot answers: the attempt identity when it was taken, a bare refusal when one is active. */
export type TakeOutcome = { readonly ok: true; readonly attempt: InboundAttempt } | { readonly ok: false };

/** The product's own facts about one session, read from `publish.snapshot`'s record (BLOCKER C/D). */
export interface ObservedState {
  readonly executionStatus: string;
  readonly stopReason: string | null;
  /** REQ-MCP-125: whether the run waited on a person at the moment this state was read; absent means no. */
  readonly awaitingInput?: boolean | undefined;
}

/** The current run as the coordinator holds it, and the handle index for `rotaris_run_status`. */
export class InboundSurfaceRuns {
  #active: InboundRun | null = null;
  /** REQ-MCP-126: the one in-flight attempt that has taken the slot but not yet committed or released it. */
  #attempt: HeldAttempt | null = null;
  /**
   * Attempts that were superseded while their start was still in flight (an `ended` of A freed A's slot and B took it
   * before A's own `committed` arrived), and attempts whose probe settled them while their commit was still on its way.
   * A late `committed` of such an attempt records the handle it was minted with and touches NOTHING else (BLOCKER A); a
   * later snapshot of its RESERVED session settles THAT attempt, not the one that took the slot in the meantime
   * (BLOCKER 2). The map is bounded; an eviction still leaves the handle answerable, because a late `committed` records
   * the run's own handle even when its attempt is gone (Minor of 2026-11-25).
   */
  readonly #orphans = new Map<number, HeldAttempt>();
  /**
   * MINOR (2026-11-25): how many superseded, unsettled attempts are remembered. It is set well above the number that can
   * be in flight at once (an attempt resolves at the commit or the definite refusal, both inside one start bound), so the
   * eviction path is unreachable in practice; and if it is ever reached, the eviction loses only the ATTEMPT's identity,
   * never the caller's handle — a late `committed` records that handle regardless (`committed` below).
   */
  static readonly #ORPHAN_MAX = 64;
  #nextAttemptId = 1;
  /** Handles this surface minted, by handle, newest last, bounded so a long-lived application does not grow without end. */
  readonly #handles = new Map<string, InboundRun>();
  #handleOrder: string[] = [];
  /** The one cap on remembered handles: past it the oldest is dropped — and with it the run's own stop reason (BLOCKER D). */
  static readonly #HANDLE_HISTORY_MAX = 64;

  /** REQ-MCP-126: whether an externally started run is active (or an admission is in flight that it will name). */
  get active(): InboundRun | null {
    return this.#active;
  }

  /** The attempt holding the slot, or null — the identity a later transition must match to act (REWORK 2, BLOCKER A). */
  get attempt(): InboundAttempt | null {
    return this.#attempt;
  }

  /** Whether any attempt — current or superseded — is still tied to this session (BLOCKER 2's reserved-session read). */
  holdsSession(sessionId: string): boolean {
    if (this.#active !== null && this.#active.sessionId === sessionId) return true;
    if (this.#attempt !== null && this.#attempt.sessionId === sessionId) return true;
    for (const o of this.#orphans.values()) if (o.sessionId === sessionId) return true;
    return false;
  }

  /**
   * REQ-MCP-126: TAKE the slot, or refuse because one is active. Atomic: the check and the take are one synchronous step,
   * so two concurrent requests cannot both take it. Called BEFORE the coordinator's side effects.
   *
   * The slot is held by the ONE current attempt (in flight, its host ask unanswered or answered only after the bound) or
   * by the one committed run. An attempt once ENDED but not yet committed does not hold it (its run is over), yet it is
   * still remembered while no new attempt has taken its place, so a late `committed` can record its handle.
   */
  take(sessionId: string, handle: string): TakeOutcome {
    if (this.#active !== null) return { ok: false };
    const previous = this.#attempt;
    if (previous !== null && !previous.ended) return { ok: false };
    if (previous !== null) {
      // A settled but uncommitted attempt: remember it so ITS late `committed` can still record its handle, then give
      // the slot to the new attempt (BLOCKER A: the new attempt must not be touched by the old one's transitions).
      this.#orphans.set(previous.id, previous);
      while (this.#orphans.size > InboundSurfaceRuns.#ORPHAN_MAX) {
        const oldest = this.#orphans.keys().next().value;
        if (oldest === undefined) break;
        this.#orphans.delete(oldest);
      }
    }
    const attempt: HeldAttempt = { id: this.#nextAttemptId, sessionId, handle, workspaceId: null, ended: false, stopReason: null, endState: null };
    this.#nextAttemptId += 1;
    this.#attempt = attempt;
    return { ok: true, attempt };
  }

  /** The open workspace this attempt starts against, so a settled attempt's run can be read and answered under its handle (BLOCKER B). */
  attachWorkspace(attempt: InboundAttempt, workspaceId: string): void {
    const held = this.#held(attempt);
    if (held !== null) held.workspaceId = workspaceId;
  }

  /**
   * REQ-MCP-126 (BLOCKER 2): the host ask got NO answer within its bound, so the host MAY still be starting the run. The
   * slot is KEPT taken (a second external start is refused) and the attempt stays tied to the session id this start was
   * minted with, so the run's own end — or the settle probe of that session — frees exactly this attempt and no other.
   *
   * This is deliberately the CONSERVATIVE side of REQ-MCP-126's "at most one, never queued": the cost of holding is a
   * surface that refuses further starts until the attempt resolves, the cost of freeing is two running runs, and only the
   * second violates the requirement.
   */
  held(attempt: InboundAttempt): void {
    // The attempt already counts and is already tied to its session id by `take`; this names the intent at the call site.
    void attempt;
  }

  /**
   * REQ-MCP-126: the start succeeded — the slot now names the run it admitted and its handle is remembered. A commit for
   * an attempt that is NOT current touches nothing (BLOCKER A): a late `committed` of a superseded attempt must never
   * consume the current attempt's reservation or enter a dead run as active.
   *
   * A `run.result`/`snapshot` that arrived BEFORE this commit (the run started and ended while the start reply was still
   * on its way) already told us the run is over: its handle is recorded with its reason, and the slot is left free.
   *
   * MINOR (2026-11-25): an attempt whose identity is gone (evicted as an orphan) still has its HANDLE recorded — the
   * caller was given that handle, and the run really started — but nothing else is touched.
   */
  committed(attempt: InboundAttempt, run: InboundRun): void {
    const held = this.#attempt !== null && this.#attempt.id === attempt.id ? this.#attempt : this.#orphans.get(attempt.id) ?? null;
    if (held === null) {
      // The attempt's identity is gone, but the run is real: record its handle (with its OWN facts) and touch nothing.
      this.#record({ handle: run.handle, sessionId: run.sessionId, workspaceId: run.workspaceId, stopReason: run.stopReason, endState: run.endState });
      return;
    }
    const superseded = this.#attempt === null || this.#attempt.id !== attempt.id;
    const alreadyEnded = held.ended;
    const reason = run.stopReason ?? held.stopReason;
    const endState = run.endState ?? held.endState;
    this.#orphans.delete(attempt.id);
    if (!superseded) this.#attempt = null;
    const stored = this.#record({ handle: run.handle, sessionId: run.sessionId, workspaceId: run.workspaceId, stopReason: reason, endState });
    // Only the CURRENT attempt's commit enters the active run: a superseded attempt's run is recorded but never made
    // active, so it can neither hold the slot nor displace whatever holds it (BLOCKER A).
    if (!superseded && !alreadyEnded) this.#active = stored;
  }

  /**
   * REQ-MCP-126: the start was refused — the slot is released, so the next request is admitted. Called only for a DEFINITE
   * refusal (the host answered that no run exists, or the ask failed before any side effect); a bare no-reply does NOT
   * call this (BLOCKER 2). Bound to the attempt: releasing a superseded attempt touches nothing (BLOCKER A).
   */
  release(attempt: InboundAttempt): void {
    if (this.#held(attempt) !== null) this.#attempt = null;
  }

  /**
   * BLOCKER 2 (2026-11-25): the probe established DEFINITIVELY that the attempt's session was never created by the run
   * host — a successful listing for the whole host worst case that does not carry it — so no run was born and no handle
   * is kept. Bound to the attempt: settling a superseded attempt touches nothing.
   */
  settleAbsent(attempt: InboundAttempt): void {
    if (this.#held(attempt) !== null) this.#attempt = null;
  }

  /** REQ-MCP-126/130: the run for a handle this surface minted, or undefined for any other value (an unrelated session id among them). */
  byHandle(handle: string): InboundRun | undefined {
    return this.#handles.get(handle);
  }

  /**
   * REQ-MCP-123 (BLOCKER D): the stop reason held for a handle, or undefined for a handle this surface never minted.
   * Read from the handle's own run and nowhere else, so no other run's result can displace it.
   */
  stopReasonOf(handle: string): string | undefined {
    return this.#handles.get(handle)?.stopReason ?? undefined;
  }

  /**
   * REQ-MCP-126: a terminal state — the run ended, so the slot is free again. Called from the run host's `run.result`
   * for the run's session, with the product's own stop reason and execution status (REQ-MONITOR-301, REQ-SESSION-073).
   * A run that ended for another reason (a desktop stop of the same session) releases the slot too: the product's own
   * notion of "the run is over" is this one.
   *
   * BLOCKER A: bound to the run's session. If the active run is another session, nothing happens; if the attempt's own
   * session ended, the attempt is marked ended (a late `committed` then records the handle and leaves the slot free).
   * MAJOR: the execution status is FROZEN with the reason, so the handle answers its own end from then on.
   */
  ended(sessionId: string, stopReason: string | null = null, executionStatus: string | null = null): void {
    const endState = executionStatus === null ? { executionStatus: 'stopped', awaitingInput: false } : { executionStatus, awaitingInput: false };
    if (this.#active !== null) {
      if (this.#active.sessionId !== sessionId) return;
      if (stopReason !== null) this.#active.stopReason = stopReason;
      this.#active.endState = endState;
      this.#active = null;
      return;
    }
    const held = this.#attempt;
    if (held !== null && held.sessionId === sessionId) {
      held.ended = true;
      if (stopReason !== null) held.stopReason = stopReason;
      held.endState = endState;
      return;
    }
    // BLOCKER 2: an attempt that was superseded (or probe-settled) is still remembered: its reserved session ending is
    // THIS attempt's end, and its handle must carry the reason (never the current attempt's).
    for (const o of this.#orphans.values()) {
      if (o.sessionId !== sessionId) continue;
      o.ended = true;
      if (stopReason !== null) o.stopReason = stopReason;
      o.endState = endState;
      const recorded = this.#handles.get(o.handle);
      if (recorded !== undefined) { if (stopReason !== null) recorded.stopReason = stopReason; recorded.endState = endState; }
      return;
    }
  }

  /**
   * REQ-MCP-123/126 (BLOCKER B/C, 2026-11-25): the product's own state for one session, as `publish.snapshot` publishes
   * it (`executionStatus`, `stopReason`, the waiting flag). This is the mechanism BLOCKER B and BLOCKER C share: the
   * coordinator knows the session id it minted, so it reads that session's state from the product rather than waiting only
   * for a `run.result` the halted/plan-gate paths never send.
   *
   * BLOCKER 3: `runHasEnded` no longer treats `idle` (nor any non-terminal, reasonless state) as an end, so a status that
   * is published BEFORE a continuation of the same session does not free the slot; only a terminal state, a park WITH a
   * reason, or the run's own `run.result` does.
   *
   * - The ACTIVE run's session: its reason and its end state are kept and, once the run has ENDED, the slot is freed
   *   without any `run.result`.
   * - The HELD attempt's session: a state means the run really was born, so the attempt settles into the active run under
   *   the handle the caller was given (BLOCKER B's "confirmed late" case); an ended state frees the slot and keeps the
   *   handle with its reason and its end state.
   * - A superseded attempt's RESERVED session (BLOCKER 2): the snapshot settles THAT attempt (records its handle), never
   *   the attempt that took the slot in the meantime.
   * - Any other session: nothing. A desktop run of another session cannot touch this surface's slot or reasons.
   */
  observe(sessionId: string, state: ObservedState): void {
    const ended = runHasEnded(state.executionStatus, state.stopReason);
    const frozen: FrozenEndState = { executionStatus: state.executionStatus, awaitingInput: state.awaitingInput ?? false };
    if (this.#active !== null && this.#active.sessionId === sessionId) {
      if (state.stopReason !== null) this.#active.stopReason = state.stopReason;
      if (ended) { this.#active.endState = frozen; this.#active = null; }
      return;
    }
    const held = this.#attempt;
    if (held !== null && held.sessionId === sessionId) {
      if (state.stopReason !== null) held.stopReason = state.stopReason;
      if (ended) held.endState = frozen;
      const run: InboundRun = { handle: held.handle, sessionId, workspaceId: held.workspaceId ?? '', stopReason: held.stopReason, endState: ended ? frozen : null };
      this.#attempt = null;
      const stored = this.#record(run);
      // A non-ended state is a run the product holds, so the attempt was a real run and becomes the active one; an ended
      // state (a terminal status or a park WITH a reason — a plan-gate or message-limit cancel) leaves the slot free.
      if (!ended && !held.ended) this.#active = stored;
      return;
    }
    // BLOCKER 2: the attempt that reserved THIS session may have been superseded by a newer `take`. Its snapshot settles
    // THAT attempt — its handle is recorded and its end state kept — and never the current attempt or the active run.
    for (const o of this.#orphans.values()) {
      if (o.sessionId !== sessionId) continue;
      if (state.stopReason !== null) o.stopReason = state.stopReason;
      if (ended) o.endState = frozen;
      const stored = this.#handles.get(o.handle);
      if (stored !== undefined) {
        if (state.stopReason !== null) stored.stopReason = state.stopReason;
        if (ended) stored.endState = frozen;
      } else {
        this.#record({ handle: o.handle, sessionId, workspaceId: o.workspaceId ?? '', stopReason: o.stopReason, endState: ended ? frozen : null });
      }
      if (ended) this.#orphans.delete(o.id);
      return;
    }
  }

  /**
   * MAJOR (2026-11-25): the run host's `session.list` reading, used by the one bounded reconcile after a successful start.
   * A run whose TERMINAL WRITE failed leaves its durable image busy and sends no `run.result`, so the surface would hold
   * the slot for good. This ends such a run on a DEFINITE reading and nothing else: the session is GONE from the listing
   * (`absent`), or it is present and the listing marks it STALE (busy while no live process holds its lock,
   * REQ-SESSION-171). A live busy run is never ended, so a real run can never be killed by this.
   */
  reconcile(sessionId: string, reading: InboundStatusReading): void {
    const run = this.#active;
    if (run === null || run.sessionId !== sessionId) return;
    if (reading.kind === 'unreadable') return;
    if (reading.kind === 'absent') { run.endState = { executionStatus: 'stopped', awaitingInput: false }; this.#active = null; return; }
    if (!reading.stale) {
      // Present and live: either genuinely busy (hold) or resting, which `observe` already settles. Nothing here.
      if (runHasEnded(reading.executionStatus, null)) { run.endState = { executionStatus: reading.executionStatus, awaitingInput: reading.awaitingInput }; this.#active = null; }
      return;
    }
    // Stale: busy in its record while nothing runs it — the terminal write never landed. The run is over.
    run.endState = { executionStatus: reading.executionStatus, awaitingInput: reading.awaitingInput };
    this.#active = null;
  }

  /**
   * MAJOR (Main, 2026-11-25): the run host's `exit`. Nothing it held is alive, so an externally started run's slot is
   * released (the run is gone and settles through stale detection), exactly as the board's coordinator reaps on the same
   * event (`requirements-runs.ts`'s `onRunHostExit`).
   */
  abandonAll(): void {
    this.#attempt = null;
    this.#active = null;
    this.#orphans.clear();
  }

  /** The attempt matching the given identity, or null when a newer attempt has taken its place (BLOCKER A). */
  #held(attempt: InboundAttempt): HeldAttempt | null {
    const held = this.#attempt;
    return held !== null && held.id === attempt.id ? held : null;
  }

  /** Remember a run's handle — and, with it, its stop reason and end state, which are evicted exactly when the handle is (BLOCKER D). */
  #record(run: InboundRun): InboundRun {
    this.#handles.set(run.handle, run);
    this.#handleOrder.push(run.handle);
    while (this.#handleOrder.length > InboundSurfaceRuns.#HANDLE_HISTORY_MAX) {
      const oldest = this.#handleOrder.shift();
      if (oldest !== undefined) this.#handles.delete(oldest);
    }
    return run;
  }
}

/** REQ-MCP-121/123: the handle this surface mints for a start — a value no other product surface produces. */
export function mintInboundRunHandle(randomBytes: () => string = () => randomUUID().replaceAll('-', '')): string {
  const handle = `inr_${randomBytes()}`;
  return INBOUND_RUN_HANDLE_PATTERN.test(handle) ? handle : `inr_${randomUUID().replaceAll('-', '')}`;
}

/**
 * BLOCKER 2 (2026-11-25): how a held attempt is settled, and HOW LONG the probe must keep going before an absence is
 * taken as definite. The run host's own credential lease is bounded at `INBOUND_HOST_CREDENTIAL_LEASE_MS` (45 s) and the
 * inbound start waits `INBOUND_START_BOUND_MS` (60 s), so a run can still be born for the whole of that window; the probe
 * therefore only frees the slot after a successful listing that lacks the session for at least `spanMs`, and any
 * unreadable listing EXTENDS it.
 */
export interface InboundSettleProbe {
  /** Schedule one probe step; production passes the main clock's `after`, a test drives it synchronously. */
  readonly schedule: (fn: () => void, after: Millis) => void;
  /** How many CONSECUTIVE successful-but-absent readings, spanning at least `spanMs`, before the attempt is taken as never having produced a run. */
  readonly attempts: number;
  readonly intervalMs: Millis;
  /** The host worst case the absence must span before it is definite; defaulted to `INBOUND_START_BOUND_MS`. */
  readonly spanMs?: Millis | undefined;
  /** The hard cap on probe steps, so an always-unreadable listing does not probe forever (the slot then stays HELD). */
  readonly maxSteps?: number | undefined;
}

/**
 * REQ-MCP-126/123 (BLOCKER B, the lead's decision 2026-11-25): the bound the INBOUND start waits for `session.start`, set
 * ABOVE the run host's own credential lease (`LEASE_ASK_MS` = 45 s so the host can answer late). The desktop start keeps
 * its own, shorter wait (`startSessionRun`'s default); only the inbound path sets this one. REWORK 3: the figure now lives
 * in `contracts/inbound.ts` as ONE chain with the LISTENER's ask bound, so the two can never drift again (BLOCKER 1); this
 * kernel-typed re-export keeps the coordinator's callers reading a `Millis` from here.
 */
export const INBOUND_START_BOUND_MS = millis(INBOUND_START_BOUND_MS_NUMBER);

/** What the coordinator needs to answer both tools: the shared start coordinator's deps, the run store, the open-workspace read, and the session status. */
export interface InboundCoordinatorDeps {
  readonly start: SessionStartDeps;
  readonly runs: InboundSurfaceRuns;
  /**
   * REQ-MCP-123/125/130: the run's live state and whether it waits on a person, in the product's own vocabulary, read
   * from where the product holds it (the run host's listing for the workspace). The stop reason does NOT ride it (BLOCKER
   * D): it lives with the handle (`InboundRun.stopReason`), fed from `publish.snapshot`/`run.result`. Answers a definite
   * reading: the row, a definite absence, or an unreadable listing (BLOCKER 2).
   */
  readonly readStatus: (workspaceId: string, sessionId: string) => Promise<InboundStatusReading>;
  /** REQ-MCP-124: the open workspace, as `SessionStartDeps.openWorkspaceRead` reads it. */
  readonly openWorkspace: SessionStartDeps['openWorkspaceRead'];
  readonly mintHandle?: (() => string) | undefined;
  /** BLOCKER B: the probe that settles a held attempt; absent means no probing (a test may then drive `observe` itself). */
  readonly settleProbe?: InboundSettleProbe | undefined;
  /** BLOCKER B: the bound the inbound start waits; defaulted to `INBOUND_START_BOUND_MS`. */
  readonly startBoundMs?: Millis | undefined;
  /** MAJOR: after a run starts, one bounded reconcile may end it if it stays busy with no live process (a failed terminal write); defaulted to `INBOUND_START_BOUND_MS + 60 s`. */
  readonly reconcileAfterMs?: Millis | undefined;
}

/** REQ-MCP-123/124: the two answers a `rotaris_*` tool call becomes, plus the coordinator's own observation entry point. */
export interface InboundSurface {
  readonly startRun: (prompt: string) => Promise<InboundStartRunAnswer>;
  readonly runStatus: (handle: string) => Promise<InboundRunStatusAnswer>;
}

/**
 * REQ-MCP-126 (BLOCKER 2): the code `startSessionRun` answers with when the run host did NOT reply within the bound. It is
 * NOT a definite refusal: the host may still be starting the run (its own credential lease is bounded at 45 s), so the
 * slot must be kept, not freed.
 */
export const INBOUND_START_UNCONFIRMED = 'inbound.start-unconfirmed';

/** The one coordinator main holds. `ask` is what the listener's ask path calls. */
export function createInboundCoordinator(deps: InboundCoordinatorDeps): {
  readonly surface: InboundSurface;
  readonly ask: (ask: InboundListenerAsk) => Promise<InboundStartRunAnswer | InboundRunStatusAnswer>;
  readonly runs: InboundSurfaceRuns;
  /** BLOCKER B/C: main wires the run host's `publish.snapshot` here, so the held or active session settles from the product state. */
  readonly observeSnapshot: (sessionId: string, state: ObservedState) => void;
} {
  const mint = deps.mintHandle ?? (() => mintInboundRunHandle());
  const startBound = deps.startBoundMs ?? INBOUND_START_BOUND_MS;
  const reconcileAfter = deps.reconcileAfterMs ?? millis(millis(INBOUND_START_BOUND_MS) + 60_000);

  /**
   * BLOCKER 2: probe the held attempt's own session until it is DEFINITE what became of it. Each step reads the product
   * state; a session that appears settles the attempt (a live status → active run, an ended status → the slot freed with
   * handle and end state kept), and the slot is freed for a never-appearing session ONLY after a successful listing that
   * lacks it for the whole host worst case (`spanMs`). A FAILED/UNREADABLE listing proves nothing and EXTENDS the probe;
   * if the cap is reached without a definite reading, the slot stays HELD (the conservative side of REQ-MCP-126).
   */
  const probe = (attempt: InboundAttempt, workspaceId: string): void => {
    const plan = deps.settleProbe;
    if (plan === undefined) return;
    const span = plan.spanMs ?? INBOUND_START_BOUND_MS;
    const maxSteps = plan.maxSteps ?? Math.max(plan.attempts, Math.ceil(span / Math.max(1, plan.intervalMs)) + plan.attempts);
    let cleanAbsent = 0;
    let elapsed = 0;
    let steps = 0;
    const step = (): void => {
      // Stop once the coordinator no longer tracks this attempt at all (settled and forgotten, or superseded past the cap).
      if (deps.runs.attempt?.id !== attempt.id && !deps.runs.holdsSession(attempt.sessionId)) return;
      steps += 1;
      void deps.readStatus(workspaceId, attempt.sessionId).then((read) => {
        if (deps.runs.attempt?.id !== attempt.id && !deps.runs.holdsSession(attempt.sessionId)) return;
        if (read.kind === 'row') {
          deps.runs.observe(attempt.sessionId, { executionStatus: read.executionStatus, stopReason: null, awaitingInput: read.awaitingInput });
          return;
        }
        if (read.kind === 'unreadable') {
          // BLOCKER 2: a listing that could not be read proves NOTHING — extend, and never settle on it.
          cleanAbsent = 0;
        } else {
          cleanAbsent += 1;
        }
        elapsed += Math.max(1, plan.intervalMs);
        if (cleanAbsent >= plan.attempts && elapsed >= span) { deps.runs.settleAbsent(attempt); return; }
        if (steps >= maxSteps) return; // the cap: no definite reading, so the slot stays HELD.
        plan.schedule(step, plan.intervalMs);
      });
    };
    plan.schedule(step, plan.intervalMs);
  };

  /**
   * MAJOR (2026-11-25): ONE bounded, slow reconcile after a run starts. It reads the session once after the whole host
   * worst case has passed and ends the run only on a DEFINITE reading (`InboundSurfaceRuns.reconcile`): the session is
   * gone, or it is stale — busy in its record while nothing runs it, which is exactly the failed-terminal-write case. A
   * live busy run is left alone, so a real run is never killed.
   */
  const reconcile = (workspaceId: string, sessionId: string): void => {
    const plan = deps.settleProbe;
    if (plan === undefined) return;
    plan.schedule(() => {
      void deps.readStatus(workspaceId, sessionId).then((read) => { deps.runs.reconcile(sessionId, read); });
    }, reconcileAfter);
  };

  const startRun = async (prompt: string): Promise<InboundStartRunAnswer> => {
    // REQ-MCP-126: the slot first, before any side effect (worktree creation among them). Atomic and synchronous, and the
    // handle and session id are minted HERE so the attempt's identity — and the handle the caller may be given — exist
    // before the run host is asked (BLOCKER A/B).
    const sessionId = randomUUID();
    const handle = mint();
    const take = deps.runs.take(sessionId, handle);
    if (!take.ok) {
      return { kind: 'refused', code: 'inbound.run-active', headline: 'A run started through the surface is already active', detail: INBOUND_RUN_ALREADY_ACTIVE };
    }
    const attempt = take.attempt;
    try {
      // REQ-MCP-120/124: the workspace is the OPEN one and nothing a caller named; with none open, refused.
      const open = await deps.openWorkspace(null);
      if (open === null || open.workspaceId === '' || open.workspace === '(no workspace)') {
        deps.runs.release(attempt);
        return { kind: 'refused', code: 'inbound.no-workspace', headline: 'No workspace is open', detail: INBOUND_NO_OPEN_WORKSPACE };
      }
      deps.runs.attachWorkspace(attempt, open.workspaceId);
      // REQ-MCP-124: the ordinary start, through the SAME main-side coordinator a desktop start uses — no authority
      // field is set here (no sandbox mode, no isolation, no board permissions, no worktree), and the workspace is the
      // open one. The coordinator's own fence re-checks the workspace before the host is asked. BLOCKER B: the inbound
      // path sets its OWN bound, above the run host's credential lease, so a healthy-but-slow host is not read as a
      // no-reply in the first place; the desktop default is unchanged.
      const outcome = await startSessionRun(deps.start, { workspaceId: open.workspaceId, workspaceRoot: open.workspace, prompt, sessionId, hostStartBoundMs: startBound });
      if (!outcome.ok) {
        /*
         * BLOCKER 2 (2026-11-25): a NO-REPLY is not a refusal. `run-host.unreachable` is `startSessionRun`'s answer when
         * the run host did not answer its `session.start` within the bound — and a HEALTHY host can answer late and start
         * the run anyway. Freeing the slot here is exactly the defect the review found: a second external start would then
         * be admitted while the first run is being born, and two runs would run against REQ-MCP-126. The slot is KEPT
         * instead (tied to the session id this attempt minted), the handle is kept for the caller, and the attempt is
         * settled by the product state (BLOCKER B's probe and `observe`).
         */
        if (outcome.code === 'run-host.unreachable') {
          deps.runs.held(attempt);
          probe(attempt, open.workspaceId);
          return { kind: 'refused', code: INBOUND_START_UNCONFIRMED, headline: 'The run host did not confirm the start in time', detail: `The start may still be beginning: this surface keeps its one-run slot held, so no second run can start until this attempt either appears or the run host answers. Ask for the run’s state with the handle ${handle}, which is reserved for this attempt.` };
        }
        deps.runs.release(attempt);
        return { kind: 'refused', code: outcome.code, headline: outcome.headline, ...(outcome.detail === undefined ? {} : { detail: outcome.detail }) };
      }
      const started = (outcome.value as { sessionId: string }).sessionId;
      deps.runs.committed(attempt, { handle, sessionId: started, workspaceId: open.workspaceId, stopReason: null, endState: null });
      // MAJOR: one bounded reconcile behind the start, so a failed terminal write does not hold the slot for good.
      reconcile(open.workspaceId, started);
      return { kind: 'inbound.runStarted', run: handle, sessionId: started };
    } catch (cause) {
      // Nothing throws into the listener: a rejection here is a refusal with its reason, and the slot is freed.
      deps.runs.release(attempt);
      return { kind: 'refused', code: 'inbound.start-failed', headline: 'The run could not be started', detail: cause instanceof Error ? cause.message : String(cause) };
    }
  };

  const runStatus = async (handle: string): Promise<InboundRunStatusAnswer> => {
    // REQ-MCP-123/130: only a handle this surface minted is answered; anything else is refused, so no other run is readable.
    const run = deps.runs.byHandle(handle);
    if (run === undefined) return { kind: 'refused', code: 'inbound.unknown-run', headline: 'No run of this surface answers to that handle' };
    /*
     * MAJOR (2026-11-25): a run that has ENDED is answered from the state FROZEN at its end, never from a later reading of
     * the same session. A desktop continuation of the session (the same id, a new run) would otherwise make this old
     * handle report the continuation's state and waiting flag, and blend its own reason with the continuation's status
     * (REQ-MCP-123/125/130).
     */
    if (run.endState !== null) {
      const ended: InboundRunStatus = {
        run: handle,
        sessionId: run.sessionId,
        state: presentationStatus(run.endState.executionStatus),
        stopReason: run.stopReason as StopReason | null,
        awaitingInput: run.endState.awaitingInput,
      };
      return { kind: 'inbound.runStatus', status: ended };
    }
    const read = await deps.readStatus(run.workspaceId, run.sessionId);
    if (read.kind !== 'row') return { kind: 'refused', code: 'inbound.run-unreadable', headline: 'The run’s state could not be read' };
    const busy = isBusy(read.executionStatus);
    const status: InboundRunStatus = {
      run: handle,
      sessionId: run.sessionId,
      state: presentationStatus(read.executionStatus),
      // REQ-MCP-123 (BLOCKER D): the reason belongs to the HANDLE and is read from it alone; a run still busy has not
      // stopped, so it reports none however recently the session last stopped.
      stopReason: busy ? null : (run.stopReason as StopReason | null),
      // REQ-MCP-125: the caller may observe that its run waits on a decision at the desktop; it may never answer one.
      awaitingInput: read.awaitingInput,
    };
    return { kind: 'inbound.runStatus', status };
  };

  return {
    runs: deps.runs,
    surface: { startRun, runStatus },
    ask: async (ask: InboundListenerAsk): Promise<InboundStartRunAnswer | InboundRunStatusAnswer> => (ask.kind === 'inbound.startRun' ? startRun(ask.prompt) : runStatus(ask.run)),
    observeSnapshot: (sessionId, state) => deps.runs.observe(sessionId, state),
  };
}

/** REQ-MCP-126: the run's session ending releases the slot, and its reason and end state are kept with the handle (BLOCKER D, MAJOR). Main wires this to the run host's `run.result`. */
export function inboundRunEnded(runs: InboundSurfaceRuns, sessionId: string, stopReason: string | null = null, executionStatus: string | null = null): void {
  runs.ended(sessionId, stopReason, executionStatus);
}

/**
 * REQ-MCP-123 (BLOCKER C/D): the product's own state for a session, from `publish.snapshot`. Main wires this to the run
 * host's `publish.snapshot`, so a run that parks at the plan gate or the message limit — and any run that leaves the busy
 * set without a `run.result` — settles the slot and hands its reason to the handle.
 */
export function inboundRunObserved(runs: InboundSurfaceRuns, sessionId: string, state: ObservedState): void {
  runs.observe(sessionId, state);
}

/**
 * MAJOR (Main, 2026-11-25): the run host's `exit`. Main wires this to `runHostChild.on('exit')`, so a crash that took the
 * externally started run with it releases the surface's one-run slot instead of locking the surface for the rest of the
 * application.
 */
export function inboundRunHostExited(runs: InboundSurfaceRuns): void {
  runs.abandonAll();
}
