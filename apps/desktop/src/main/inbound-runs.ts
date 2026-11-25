import { INBOUND_NO_OPEN_WORKSPACE, INBOUND_RUN_ALREADY_ACTIVE, INBOUND_RUN_HANDLE_PATTERN, isBusy, presentationStatus, runHasEnded, type InboundListenerAsk, type InboundRunStatus, type InboundStartRunAnswer, type InboundRunStatusAnswer, type StopReason } from '@rotaris/contracts';
import { millis, type Millis } from '@rotaris/kernel';
import { randomUUID } from 'node:crypto';
import { startSessionRun, type SessionStartDeps } from './session-start.js';

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
}

/** What taking the slot answers: the attempt identity when it was taken, a bare refusal when one is active. */
export type TakeOutcome = { readonly ok: true; readonly attempt: InboundAttempt } | { readonly ok: false };

/** The product's own facts about one session, read from `publish.snapshot`'s record (BLOCKER C/D). */
export interface ObservedState {
  readonly executionStatus: string;
  readonly stopReason: string | null;
}

/** The current run as the coordinator holds it, and the handle index for `rotaris_run_status`. */
export class InboundSurfaceRuns {
  #active: InboundRun | null = null;
  /** REQ-MCP-126: the one in-flight attempt that has taken the slot but not yet committed or released it. */
  #attempt: HeldAttempt | null = null;
  /**
   * Attempts that were superseded while their start was still in flight (an `ended` of A freed A's slot and B took it
   * before A's own `committed` arrived). A late `committed` of such an attempt records the handle it was minted with and
   * touches NOTHING else (BLOCKER A); the map is bounded like the handle history, since the attempt resolves at once.
   */
  readonly #orphans = new Map<number, HeldAttempt>();
  static readonly #ORPHAN_MAX = 16;
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
    const attempt: HeldAttempt = { id: this.#nextAttemptId, sessionId, handle, workspaceId: null, ended: false, stopReason: null };
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
   */
  committed(attempt: InboundAttempt, run: InboundRun): void {
    const held = this.#attempt !== null && this.#attempt.id === attempt.id ? this.#attempt : this.#orphans.get(attempt.id) ?? null;
    if (held === null) return;
    const superseded = this.#attempt === null || this.#attempt.id !== attempt.id;
    const alreadyEnded = held.ended;
    const reason = run.stopReason ?? held.stopReason;
    this.#orphans.delete(attempt.id);
    if (!superseded) this.#attempt = null;
    const stored = this.#record({ handle: run.handle, sessionId: run.sessionId, workspaceId: run.workspaceId, stopReason: reason });
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

  /** The probe found the attempt's session was never created by the run host: no run was born, so no handle is kept (BLOCKER B). */
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
   * for the run's session, with the product's own stop reason (REQ-MONITOR-301). A run that ended for another reason (a
   * desktop stop of the same session) releases the slot too: the product's own notion of "the run is over" is this one.
   *
   * BLOCKER A: bound to the run's session. If the active run is another session, nothing happens; if the attempt's own
   * session ended, the attempt is marked ended (a late `committed` then records the handle and leaves the slot free).
   */
  ended(sessionId: string, stopReason: string | null = null): void {
    if (this.#active !== null) {
      if (this.#active.sessionId !== sessionId) return;
      if (stopReason !== null) this.#active.stopReason = stopReason;
      this.#active = null;
      return;
    }
    const held = this.#attempt;
    if (held !== null && held.sessionId === sessionId) {
      held.ended = true;
      if (stopReason !== null) held.stopReason = stopReason;
    }
  }

  /**
   * REQ-MCP-123/126 (BLOCKER B/C, 2026-11-25): the product's own state for one session, as `publish.snapshot` publishes
   * it (`executionStatus`, `stopReason`). This is the mechanism BLOCKER B and BLOCKER C share: the coordinator knows the
   * session id it minted, so it reads that session's state from the product rather than waiting only for a `run.result`
   * the halted/plan-gate paths never send.
   *
   * - The ACTIVE run's session: its reason is kept and, once the run has ENDED (`runHasEnded`: a busy status has not, a
   *   terminal one has, a park has exactly when a reason accompanies it — a plan-gate cancel writes `paused` +
   *   `user_cancelled`), the slot is freed without any `run.result`.
   * - The HELD attempt's session: a held status means the run really was born, so the attempt settles into the active run
   *   under the handle the caller was given (BLOCKER B's "confirmed late" case); an ended state frees the slot and keeps
   *   the handle with its reason.
   * - Any other session: nothing. A desktop run of another session cannot touch this surface's slot or reasons.
   */
  observe(sessionId: string, state: ObservedState): void {
    const ended = runHasEnded(state.executionStatus, state.stopReason);
    if (this.#active !== null && this.#active.sessionId === sessionId) {
      if (state.stopReason !== null) this.#active.stopReason = state.stopReason;
      if (ended) this.#active = null;
      return;
    }
    const held = this.#attempt;
    if (held === null || held.sessionId !== sessionId) return;
    if (state.stopReason !== null) held.stopReason = state.stopReason;
    const run: InboundRun = { handle: held.handle, sessionId, workspaceId: held.workspaceId ?? '', stopReason: held.stopReason };
    this.#attempt = null;
    const stored = this.#record(run);
    // A held status is a run the product holds, so the attempt was a real run and becomes the active one; an ended state
    // (including a park WITH a reason — a plan-gate or message-limit cancel) leaves the slot free, handle and reason kept.
    if (!ended && !held.ended) this.#active = stored;
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

  /** Remember a run's handle — and, with it, its stop reason, which is evicted exactly when the handle is (BLOCKER D). */
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
 * BLOCKER B (2026-11-25): how a held attempt is settled. The run host's own credential lease is bounded at 45 s
 * (`LEASE_ASK_MS`), so a healthy host can answer `session.start` late; the coordinator's start bound is set above that
 * (`INBOUND_START_BOUND_MS`), and this probe is the belt-and-braces behind it: while the attempt is held, its session is
 * read from the product state, and the slot is freed the moment it is definite that no run was born (the session never
 * appears) or that the run has reached a resting/terminal state.
 */
export interface InboundSettleProbe {
  /** Schedule one probe step; production passes the main clock's `after`, a test drives it synchronously. */
  readonly schedule: (fn: () => void, after: Millis) => void;
  /** How many empty readings before the attempt is taken as never having produced a run. */
  readonly attempts: number;
  readonly intervalMs: Millis;
}

/**
 * REQ-MCP-126/123 (BLOCKER B, lead's decision 2026-11-25): the bound the INBOUND start waits for `session.start`, set
 * ABOVE the run host's own credential lease (LEASE_ASK_MS = 45 s so the host can answer late). The desktop start keeps
 * its own, shorter wait (`startSessionRun`'s default); only the inbound path sets this one.
 */
export const INBOUND_START_BOUND_MS = millis(60_000);

/** What the coordinator needs to answer both tools: the shared start coordinator's deps, the run store, the open-workspace read, and the session status. */
export interface InboundCoordinatorDeps {
  readonly start: SessionStartDeps;
  readonly runs: InboundSurfaceRuns;
  /**
   * REQ-MCP-123/125/130: the run's live state and whether it waits on a person, in the product's own vocabulary, read
   * from where the product holds it (the run host's listing for the workspace). The stop reason does NOT ride it (BLOCKER
   * D): it lives with the handle (`InboundRun.stopReason`), fed from `publish.snapshot`/`run.result`. Answers null when
   * the session cannot be read at all.
   */
  readonly readStatus: (workspaceId: string, sessionId: string) => Promise<{ readonly executionStatus: string; readonly awaitingInput: boolean } | null>;
  /** REQ-MCP-124: the open workspace, as `SessionStartDeps.openWorkspaceRead` reads it. */
  readonly openWorkspace: SessionStartDeps['openWorkspaceRead'];
  readonly mintHandle?: (() => string) | undefined;
  /** BLOCKER B: the probe that settles a held attempt; absent means no probing (a test may then drive `observe` itself). */
  readonly settleProbe?: InboundSettleProbe | undefined;
  /** BLOCKER B: the bound the inbound start waits; defaulted to `INBOUND_START_BOUND_MS`. */
  readonly startBoundMs?: Millis | undefined;
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

  /**
   * BLOCKER B: probe the held attempt's own session until it is definite what became of it. Each step reads the product
   * state; a session that appears settles the attempt (busy → active run, quiescent → slot freed, handle kept), and a
   * session that never appears after the probe's attempts is taken as no run at all (the slot freed, no handle kept).
   */
  const probe = (attempt: InboundAttempt, workspaceId: string): void => {
    const plan = deps.settleProbe;
    if (plan === undefined) return;
    let left = plan.attempts;
    const step = (): void => {
      if (deps.runs.attempt?.id !== attempt.id) return;
      void deps.readStatus(workspaceId, attempt.sessionId).then((read) => {
        if (deps.runs.attempt?.id !== attempt.id) return;
        if (read !== null) {
          deps.runs.observe(attempt.sessionId, { executionStatus: read.executionStatus, stopReason: null });
          return;
        }
        left -= 1;
        if (left <= 0) deps.runs.settleAbsent(attempt);
        else plan.schedule(step, plan.intervalMs);
      });
    };
    plan.schedule(step, plan.intervalMs);
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
      deps.runs.committed(attempt, { handle, sessionId: started, workspaceId: open.workspaceId, stopReason: null });
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
    const read = await deps.readStatus(run.workspaceId, run.sessionId);
    if (read === null) return { kind: 'refused', code: 'inbound.run-unreadable', headline: 'The run’s state could not be read' };
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

/** REQ-MCP-126: the run's session ending releases the slot, and its reason is kept with the handle (BLOCKER D). Main wires this to the run host's `run.result`. */
export function inboundRunEnded(runs: InboundSurfaceRuns, sessionId: string, stopReason: string | null = null): void {
  runs.ended(sessionId, stopReason);
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
