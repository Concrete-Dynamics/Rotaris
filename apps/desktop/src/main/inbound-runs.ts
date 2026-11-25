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
 *    approval wait, released only on a positive proof that the admitted attempt has ended or can never start. A request
 *    while one is active is refused with a stated reason and never queued.
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
 * REWORK 2 (2026-11-25). The slot's transitions are bound to the IDENTITY OF THE ATTEMPT, not to a global counter.
 *
 * REWORK 3 (2026-11-25). The slot is freed ONLY on a DEFINITE signal; when in doubt it is HELD. The cost of holding is a
 * surface that refuses further starts for a while; the cost of freeing early is TWO running runs (REQ-MCP-126).
 *
 * REWORK 4 (2026-11-25) — THE DESIGN SIMPLIFICATION (the advisor's ruling). The timing probe, the "settle by polling"
 * and every `intervalMs`/`spanMs`/`maxSteps` figure LEAVE THE RELEASE PATH. A slot is released on a POSITIVE proof
 * that the admitted attempt has ENDED or CAN NEVER START — never on a clock and never on an empty listing (for any
 * finite sequence of empty listings the first start could still be in preflight). Seven consequences, each structural:
 *
 * 1. **Two admission states, `free` and `held`.** `InboundSurfaceRuns` has exactly one holder — a handle — or none.
 *    `starting`, `running` and `waiting on a person` are the HANDLE's status and all coexist with `held`.
 * 2. **The admission is one SYNCHRONOUS step, before any `await`, and a refusal is final.** The open workspace is read
 *    synchronously, the slot is reserved in the same synchronous step (handle + session id recorded), and a request that
 *    meets an active run is refused with `refused(external_run_active)` and leaves NO work to run later.
 * 3. **The handle is returned at the RESERVATION, not at the start.** `rotaris_start_run` answers `runStarted` with the
 *    handle immediately (status `starting`) and the ONE coordinator run then begins in the background. The listener
 *    holds no long ask, so its deadline is transport alone and the caller can never lose the handle to it (BLOCKER 1).
 * 4. **The handle IS the execution id.** One record per handle, from the reservation to the frozen end: `starting`
 *    status and the confirmed run are the SAME object, so an end always reaches the handle the caller was given (BLOCKER
 *    3). A desktop relaunch of the same session is a NEW execution whose snapshots may not overwrite a completed handle,
 *    and no late event of an older attempt can touch a newer holder.
 * 5. **A never-started attempt is settled only when EVERY dispatch path is closed.** Before dispatch that is the
 *    validation and fence refusals (nothing was asked of the run host); after dispatch only a matching host REFUSAL
 *    settles it, and only a no-reply is held (the host may still be starting the run).
 * 6. **The release source is the REAL execution lifecycle** — the run host's terminal `run.result`, a park that ends
 *    the invocation (`paused`/`paused_message_limit` WITH a stop reason), and the one reconcile that ends a run whose
 *    terminal write FAILED (its durable image stays busy with nothing running it). A park that can resume the same
 *    execution (the plan gate, the message limit) HOLDS, and the persistence failure is reported as its own fact.
 * 7. **A host exit is final** because the run host is never forked again (ADR-0002 consequence 1): nothing it held can
 *    still dispatch to a replacement, so the surface is not locked for the rest of the application.
 *
 * A lost reply is covered for the same reason the ask no longer carries the outcome: the start is performed MAIN-SIDE,
 * so its outcome (a refusal, or the run's own end) is recorded against the handle whether or not the caller ever asked
 * again, and `rotaris_run_status` re-reads the product state by that handle as a second, ask-independent path.
 */

/** One externally started run, as ONE object per handle: reserved at the admission and mutated through its whole life. */
export interface InboundRun {
  /** REQ-MCP-123: the handle the caller was given AND this execution's identity — the only thing a later proof may act on. */
  readonly handle: string;
  /** The session id this surface minted for the attempt; the key the product's own events carry back. */
  readonly sessionId: string;
  /** The session id the run host confirmed, when it differs from the minted one (it does not in practice; kept so the match is exact). */
  hostSessionId: string | null;
  /** The open workspace this attempt starts against, read synchronously at the reservation. */
  workspaceId: string | null;
  /**
   * REQ-MCP-123 (BLOCKER D): the stop reason of THIS run, read from the product's own state (the run host's terminal
   * `run.result`, and the `publish.snapshot` record's own `stopReason`). It lives beside the handle, so it is evicted
   * exactly when the handle is, and no other run's result can displace it.
   */
  stopReason: string | null;
  /**
   * The state the run was in WHEN IT ENDED, frozen at that moment (MAJOR, 2026-11-25). `rotaris_run_status` answers a
   * run that has ended from THIS, never from a later reading of the same session — a desktop continuation of the session
   * would otherwise make the old handle report the continuation's state and waiting flag, and blend its own reason with
   * it (REQ-MCP-123/125). null while the run is still live or held.
   */
  endState: FrozenEndState | null;
  /**
   * A DEFINITE refusal of the start, as the surface would have answered it, kept so `rotaris_run_status` can state it
   * for a handle the caller was already given (REWORK 4's "a subsequent startup failure is a status outcome").
   */
  refusal: InboundStartRefusal | null;
  /** Whether the run host confirmed the start. A handle answered before the confirmation reads `starting`. */
  confirmed: boolean;
}

/** The two fields frozen at a run's end: its execution status and whether it waited on a person then. */
export interface FrozenEndState {
  readonly executionStatus: string;
  readonly awaitingInput: boolean;
}

/** A refusal kept with a handle: the code, the headline and the detail the surface's own refusal would have carried. */
export interface InboundStartRefusal {
  readonly code: string;
  readonly headline: string;
  readonly detail?: string | undefined;
}

/** The product's own facts about one session, read from `publish.snapshot`'s record (BLOCKER C/D). */
export interface ObservedState {
  readonly executionStatus: string;
  readonly stopReason: string | null;
  /** REQ-MCP-125: whether the run waited on a person at the moment this state was read; absent means no. */
  readonly awaitingInput?: boolean | undefined;
}

/** What a reservation answers: the handle and the session id it took, or a bare refusal when one is active. */
export type TakeOutcome = { readonly ok: true; readonly handle: string; readonly sessionId: string } | { readonly ok: false };

/** What the one reconcile found for its run: still held (re-arm), released (the run is over), or not this run's business. */
export type ReconcileOutcome = 'held' | 'released' | 'uninvolved';

/**
 * REQ-MCP-126's slot and REQ-MCP-123's handles, as ONE thing: at most one handle holds the slot, and every handle this
 * surface minted is remembered (with its own reason and end state) so `rotaris_run_status` can answer it.
 */
export class InboundSurfaceRuns {
  /** The handle holding the slot — a reserved attempt or the run it became — or null while the surface is free. */
  #holder: string | null = null;
  /** One record per handle this surface minted, in insertion order, bounded so a long-lived application does not grow without end. */
  readonly #runs = new Map<string, InboundRun>();
  /** The one cap on remembered handles: past it the oldest is dropped — and with it the run's own reason and end state. */
  static readonly #HANDLE_HISTORY_MAX = 64;

  /** The handle holding the slot, or null — the execution id every later proof must match to act (REWORK 4, point 4). */
  get holder(): string | null {
    return this.#holder;
  }

  /** The run holding the slot (held or live), or null — what a test and the status read ask of the slot. */
  get active(): InboundRun | null {
    if (this.#holder === null) return null;
    const run = this.#runs.get(this.#holder);
    if (run === undefined) return null;
    return run.endState !== null || run.refusal !== null ? null : run;
  }

  /**
   * REQ-MCP-126: TAKE the slot, or refuse because one is active. Atomic: the check and the take are one SYNCHRONOUS
   * step, so two concurrent requests cannot both take it; called before the coordinator's side effects. The handle and
   * the session id are recorded HERE, so the attempt's identity — and the handle the caller is given — exist before the
   * run host is asked (REWORK 4, point 2).
   */
  take(sessionId: string, handle: string): TakeOutcome {
    if (this.#holder !== null) return { ok: false };
    const run: InboundRun = { handle, sessionId, hostSessionId: null, workspaceId: null, stopReason: null, endState: null, refusal: null, confirmed: false };
    this.#holder = handle;
    this.#record(run);
    return { ok: true, handle, sessionId };
  }

  /** The open workspace this attempt starts against, so its run can be read and answered under its handle. */
  attachWorkspace(handle: string, workspaceId: string): void {
    const run = this.#runs.get(handle);
    if (run !== null && run !== undefined) run.workspaceId = workspaceId;
  }

  /**
   * REQ-MCP-126 (REWORK 4, point 5): the run host's `session.start` did NOT answer within the bound, and the host MAY
   * still be starting the run. The slot is KEPT (a second external start is refused) and the attempt stays bound to the
   * handle it was minted with, so the run's own end — or the product's own state for that session — frees exactly this
   * handle and no other. REQ-MCP-126's cost argument: holding costs a surface that refuses starts for a while, freeing
   * early costs two running runs, and only the second violates the requirement.
   */
  held(handle: string): void {
    // The attempt already holds the slot and is already tied to its session; this names the intent at the call site.
    void handle;
  }

  /**
   * REQ-MCP-126: the start was confirmed — the run host answered `session.started`, so the execution exists. The
   * record's `confirmed` flag turns the handle's status from `starting` into the product's live state. A handle that has
   * ALREADY ended or been refused is not resurrected (REWORK 4, point 4): a late confirmation may not overwrite a
   * completed handle.
   */
  committed(handle: string, hostSessionId: string): void {
    const run = this.#runs.get(handle);
    if (run === undefined) return;
    run.hostSessionId = hostSessionId;
    run.confirmed = true;
  }

  /**
   * REQ-MCP-126 (REWORK 4, point 5): the start was DEFINITELY refused — every dispatch path for this attempt is closed
   * (nothing was asked of the run host, or the host itself answered that no run exists) — so the attempt can never
   * start and the slot is released. The refusal is kept with the handle, because the caller was already given it: the
   * next `rotaris_run_status` states it. A completed handle is never overwritten by a late refusal.
   */
  refuse(handle: string, refusal: InboundStartRefusal): void {
    const run = this.#runs.get(handle);
    if (run === undefined) return;
    if (run.endState !== null) return;
    run.refusal = refusal;
    if (this.#holder === handle) this.#holder = null;
  }

  /** REQ-MCP-126/130: the run for a handle this surface minted, or undefined for any other value (an unrelated session id among them). */
  byHandle(handle: string): InboundRun | undefined {
    return this.#runs.get(handle);
  }

  /** REQ-MCP-123 (BLOCKER D): the stop reason held for a handle, or undefined for a handle this surface never minted. */
  stopReasonOf(handle: string): string | undefined {
    return this.#runs.get(handle)?.stopReason ?? undefined;
  }

  /**
   * REQ-MCP-126: the run host's terminal `run.result` — the run is over, so the slot is free again and the handle keeps
   * the end state and the reason the product reported (REQ-MONITOR-301, REQ-SESSION-073). Bound to the execution id: a
   * result for another session touches nothing, and a result for a handle that has already ended does not overwrite it
   * (REWORK 4, point 4).
   */
  ended(sessionId: string, stopReason: string | null = null, executionStatus: string | null = null): void {
    const run = this.#runForSession(sessionId);
    if (run === null) return;
    if (stopReason !== null) run.stopReason = stopReason;
    this.#freeze(run, executionStatus === null ? { executionStatus: 'stopped', awaitingInput: false } : { executionStatus, awaitingInput: false });
  }

  /**
   * REQ-MCP-123/126 (REWORK 4, point 6): the product's own state for one session, as `publish.snapshot` publishes it
   * (`executionStatus`, `stopReason`, the waiting flag). The coordinator knows the session id it minted, so it reads
   * that session's state from the product rather than depending on a `run.result` the halted/plan-gate paths never send.
   *
   * - Any state for the attempt's session is POSITIVE evidence the execution exists, so a held attempt becomes confirmed.
   * - A park that CAN resume the same execution (`idle`, a reasonless `paused`/`paused_message_limit`,
   *   `awaiting_plan_decision`) keeps the slot: the plan gate and the message limit relaunch the same session.
   * - A TERMINAL state, or a park WITH a reason (the cancel arm: `paused` + `user_cancelled`), ends THIS execution and
   *   frees the slot, freezing the state with the handle.
   * - A completed handle is never overwritten, and a state for another session touches nothing.
   */
  observe(sessionId: string, state: ObservedState): void {
    const run = this.#runForSession(sessionId);
    if (run === null) return;
    run.confirmed = true;
    if (state.stopReason !== null) run.stopReason = state.stopReason;
    if (runHasEnded(state.executionStatus, state.stopReason)) {
      this.#freeze(run, { executionStatus: state.executionStatus, awaitingInput: state.awaitingInput ?? false });
    }
  }

  /**
   * MAJOR (2026-11-25; REWORK 4, point 6): the run host's `session.list` reading, used by the one bounded reconcile
   * behind a confirmed start. A run whose TERMINAL WRITE failed leaves its durable image busy and sends no `run.result`,
   * so the surface would hold the slot for good. This ends such a run on a DEFINITE reading and nothing else: the session
   * is GONE from the listing (`absent`), or it is present and the listing marks it STALE (busy while no live process
   * holds its lock, REQ-SESSION-171). A live busy run is never ended, and an UNREADABLE listing proves nothing — both
   * keep the slot and may be checked again.
   *
   * The end state frozen here is TERMINAL (`stopped`, not waiting): a dead run must never be frozen as
   * `running`/`awaitingInput=true`, which is what the review found. The reason is the product's own reason for a run
   * whose completion could not be confirmed (`agent_session_aborted`, the one the engine uses when durable recording
   * fails) — the persistence failure itself is reported separately by the run host's own notice.
   */
  reconcile(sessionId: string, reading: InboundStatusReading): ReconcileOutcome {
    const run = this.#runForSession(sessionId);
    if (run === null) return 'uninvolved';
    if (this.#holder !== run.handle) return 'uninvolved';
    if (!run.confirmed) return 'held';
    if (reading.kind === 'unreadable') return 'held';
    if (reading.kind === 'row') {
      if (!reading.stale) {
        // Present and live: either genuinely busy (hold) or resting, which `observe` already settles. A real run is
        // never ended by this.
        if (runHasEnded(reading.executionStatus, null)) this.#freeze(run, { executionStatus: reading.executionStatus, awaitingInput: false });
        return run.endState === null ? 'held' : 'released';
      }
    }
    // Absent, or busy in its record while nothing runs it: the terminal write never landed and the run is over.
    run.stopReason ??= 'agent_session_aborted';
    this.#freeze(run, { executionStatus: 'stopped', awaitingInput: false });
    return 'released';
  }

  /**
   * MAJOR (Main, 2026-11-25; REWORK 4, point 7): the run host's `exit`. The run host is never forked again (ADR-0002
   * consequence 1), so nothing it held can still dispatch — the externally started run is gone, its slot is released and
   * every open handle is closed with a terminal state. The HANDLES are KEPT: the caller holds them, and a handle must
   * answer its own end rather than vanish (the "orphan displacement must not lose a handle" minor).
   */
  abandonAll(): void {
    for (const run of this.#runs.values()) {
      if (run.endState === null && run.refusal === null) {
        run.stopReason ??= 'agent_session_aborted';
        run.endState = { executionStatus: 'stopped', awaitingInput: false };
      }
    }
    this.#holder = null;
  }

  /** Freeze a run's end ONCE and release the slot if this run holds it (REWORK 4, point 4: one identity, one release). */
  #freeze(run: InboundRun, endState: FrozenEndState): void {
    if (run.endState !== null) return;
    run.endState = endState;
    run.refusal = null;
    if (this.#holder === run.handle) this.#holder = null;
  }

  /** The remembered run for a session, still open (neither ended nor refused), or null (REWORK 4, point 4). */
  #runForSession(sessionId: string): InboundRun | null {
    for (const run of this.#runs.values()) {
      if ((run.sessionId === sessionId || run.hostSessionId === sessionId) && run.endState === null && run.refusal === null) return run;
    }
    return null;
  }

  /** Remember a run's handle — and, with it, its reason and end state, which are evicted exactly when the handle is. The HOLDER is never evicted. */
  #record(run: InboundRun): void {
    this.#runs.set(run.handle, run);
    while (this.#runs.size > InboundSurfaceRuns.#HANDLE_HISTORY_MAX) {
      const oldest = [...this.#runs.keys()].find((h) => h !== this.#holder);
      if (oldest === undefined) break;
      this.#runs.delete(oldest);
    }
  }
}

/** REQ-MCP-121/123: the handle this surface mints for a start — a value no other product surface produces. */
export function mintInboundRunHandle(randomBytes: () => string = () => randomUUID().replaceAll('-', '')): string {
  const handle = `inr_${randomBytes()}`;
  return INBOUND_RUN_HANDLE_PATTERN.test(handle) ? handle : `inr_${randomUUID().replaceAll('-', '')}`;
}

/**
 * REQ-MCP-126/123 (BLOCKER B, the lead's decision 2026-11-25): the bound the INBOUND start waits for `session.start`, set
 * ABOVE the run host's own credential lease (`LEASE_ASK_MS` = 45 s so the host can answer late). The desktop start keeps
 * its own, shorter wait (`startSessionRun`'s default); only the inbound path sets this one. The figure lives in
 * `contracts/inbound.ts` as ONE chain with the LISTENER's ask bound, so the two can never drift again (BLOCKER 1); this
 * kernel-typed re-export keeps the coordinator's callers reading a `Millis` from here.
 */
export const INBOUND_START_BOUND_MS = millis(INBOUND_START_BOUND_MS_NUMBER);

/** What the coordinator needs to answer both tools: the shared start coordinator's deps, the run store, the open-workspace read, and the session status. */
export interface InboundCoordinatorDeps {
  readonly start: SessionStartDeps;
  readonly runs: InboundSurfaceRuns;
  /**
   * REQ-MCP-124/126 (REWORK 4, point 2): the workspace open RIGHT NOW, read SYNCHRONOUSLY — the admission reserves the
   * slot (handle, session id, workspace) in ONE synchronous step, so a start that is refused for want of a workspace
   * leaves no work and no reservation behind. `null` means no workspace is open.
   */
  readonly openWorkspaceNow: () => { readonly workspaceId: string; readonly workspace: string } | null;
  /**
   * REQ-MCP-123/125/130: the run's live state and whether it waits on a person, in the product's own vocabulary, read
   * from where the product holds it (the run host's listing for the workspace). The stop reason does NOT ride it (BLOCKER
   * D): it lives with the handle. Answers a definite reading: the row, a definite absence, or an unreadable listing.
   */
  readonly readStatus: (workspaceId: string, sessionId: string) => Promise<InboundStatusReading>;
  readonly mintHandle?: (() => string) | undefined;
  /**
   * MAJOR (REWORK 4, point 6): how ONE reconcile step is scheduled. Production passes main's clock; a test drives it
   * synchronously. Absent means no reconcile (a run whose terminal write failed then holds the slot until the host exits,
   * which is the conservative side). The reconcile releases only on a DEFINITE reading and re-arms while a run is live, so
   * it is not a timing release: no clock ever frees the slot.
   */
  readonly schedule?: ((fn: () => void, after: Millis) => void) | undefined;
  /** BLOCKER B: the bound the inbound start waits; defaulted to `INBOUND_START_BOUND_MS`. */
  readonly startBoundMs?: Millis | undefined;
  /** MAJOR: the delay before each reconcile step; defaulted to `INBOUND_START_BOUND_MS + 60 s`. */
  readonly reconcileAfterMs?: Millis | undefined;
}

/** REQ-MCP-123/124: the two answers a `rotaris_*` tool call becomes, plus the coordinator's own observation entry point. */
export interface InboundSurface {
  readonly startRun: (prompt: string) => Promise<InboundStartRunAnswer>;
  readonly runStatus: (handle: string) => Promise<InboundRunStatusAnswer>;
}

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
   * MAJOR (REWORK 4, point 6): the one reconcile, re-armed while the run is live. Each step reads the product state and
   * ends the run only on a DEFINITE reading (`InboundSurfaceRuns.reconcile`): the session is gone, or it is stale — busy
   * in its record while nothing runs it, which is exactly the failed-terminal-write case. A live busy run is left alone
   * and one more step is armed, so a terminal write that fails LATER than the first step is still covered. No step ever
   * frees the slot on a clock: only a definite reading does, and an unreadable listing ends the chain.
   */
  const armReconcile = (workspaceId: string, sessionId: string): void => {
    const schedule = deps.schedule;
    if (schedule === undefined) return;
    schedule(() => {
      void deps.readStatus(workspaceId, sessionId).then((read) => {
        if (deps.runs.reconcile(sessionId, read) === 'held') armReconcile(workspaceId, sessionId);
      });
    }, reconcileAfter);
  };

  /**
   * REQ-MCP-126 (REWORK 4, points 2 and 5): the start is performed main-side, in the background, and its outcome is
   * recorded against the handle. A DEFINITE refusal releases the slot and is kept with the handle; a NO-REPLY
   * (`run-host.unreachable`) and an unexpected reply prove nothing — the host may still be starting the run — so the slot
   * is HELD and the run's own end (or the product's state for that session) settles it.
   */
  const finishStart = async (handle: string, sessionId: string, open: { readonly workspaceId: string; readonly workspace: string }, prompt: string): Promise<void> => {
    try {
      // REQ-MCP-124: the ordinary start, through the SAME main-side coordinator a desktop start uses — no authority
      // field is set here, and the workspace is the open one. BLOCKER B: the inbound path sets its OWN bound, above the
      // run host's credential lease, so a healthy-but-slow host is not read as a no-reply in the first place.
      const outcome = await startSessionRun(deps.start, { workspaceId: open.workspaceId, workspaceRoot: open.workspace, prompt, sessionId, hostStartBoundMs: startBound });
      if (!outcome.ok) {
        if (outcome.code === 'run-host.unreachable' || outcome.code === 'reply.unexpected') {
          deps.runs.held(handle);
          return;
        }
        deps.runs.refuse(handle, { code: outcome.code, headline: outcome.headline, ...(outcome.detail === undefined ? {} : { detail: outcome.detail }) });
        return;
      }
      const started = (outcome.value as { sessionId: string }).sessionId;
      deps.runs.committed(handle, started);
      // MAJOR: one reconcile behind the start, so a failed terminal write does not hold the slot for good.
      armReconcile(open.workspaceId, started);
    } catch (cause) {
      // Nothing throws into the listener: a rejection here is a refusal with its reason, kept with the handle.
      deps.runs.refuse(handle, { code: 'inbound.start-failed', headline: 'The run could not be started', detail: cause instanceof Error ? cause.message : String(cause) });
    }
  };

  const startRun = async (prompt: string): Promise<InboundStartRunAnswer> => {
    // REQ-MCP-124: the workspace is the OPEN one and nothing a caller named; with none open, refused — and NO reservation
    // is taken, so a refusal for want of a workspace leaves no work and no handle behind.
    const open = deps.openWorkspaceNow();
    if (open === null || open.workspaceId === '' || open.workspace === '(no workspace)') {
      return { kind: 'refused', code: 'inbound.no-workspace', headline: 'No workspace is open', detail: INBOUND_NO_OPEN_WORKSPACE };
    }
    // REQ-MCP-126 (REWORK 4, point 2): the slot FIRST, in the SAME synchronous step as the workspace read and before any
    // `await` — before any side effect (worktree creation among them). The handle and the session id are minted HERE, so
    // the handle the caller is given exists before the run host is asked. A request that meets an active run is refused
    // with the stated reason and leaves NOTHING to run later.
    const sessionId = randomUUID();
    const handle = mint();
    if (!deps.runs.take(sessionId, handle).ok) {
      return { kind: 'refused', code: 'inbound.run-active', headline: 'A run started through the surface is already active', detail: INBOUND_RUN_ALREADY_ACTIVE };
    }
    deps.runs.attachWorkspace(handle, open.workspaceId);
    // REQ-MCP-123 (REWORK 4, point 3): the handle is answered NOW (status `starting`), and the ONE coordinator run begins
    // behind it. The listener holds no long ask, so its deadline is transport alone.
    void finishStart(handle, sessionId, open, prompt);
    return { kind: 'inbound.runStarted', run: handle, sessionId };
  };

  const runStatus = async (handle: string): Promise<InboundRunStatusAnswer> => {
    // REQ-MCP-123/130: only a handle this surface minted is answered; anything else is refused, so no other run is readable.
    const first = deps.runs.byHandle(handle);
    if (first === undefined) return { kind: 'refused', code: 'inbound.unknown-run', headline: 'No run of this surface answers to that handle' };
    // A start that was DEFINITELY refused is stated as that refusal (REWORK 4: "a subsequent startup failure is a status outcome").
    if (first.refusal !== null) return { kind: 'refused', code: first.refusal.code, headline: first.refusal.headline, ...(first.refusal.detail === undefined ? {} : { detail: first.refusal.detail }) };
    /*
     * REQ-MCP-123/126 (REWORK 4, point 8): a second, ask-INDEPENDENT path to the attempt's outcome. The product's own state
     * for the minted session is read here; a state for it is positive evidence the execution exists, so a held attempt
     * settles by this read whether or not the caller ever asked again.
     */
    const read = await deps.readStatus(first.workspaceId ?? '', first.sessionId);
    if (read.kind === 'row') deps.runs.observe(first.sessionId, { executionStatus: read.executionStatus, stopReason: null, awaitingInput: read.awaitingInput });
    const now = deps.runs.byHandle(handle) ?? first;
    /*
     * MAJOR (2026-11-25; B3's negative control reverts exactly this): a run that has ENDED is answered from the state
     * FROZEN at its end, never from a later reading of the same session. A desktop continuation of the session would
     * otherwise make this old handle report the continuation's state and waiting flag, and blend its own reason with the
     * continuation's status (REQ-MCP-123/125/130). ONE seam, after the read, so an ended handle is answered from its own
     * end whatever the read found (`observe` above already no-ops for a handle whose end is frozen).
     */
    if (now.endState !== null) return { kind: 'inbound.runStatus', status: endedStatus(now) };
    if (!now.confirmed) {
      // A start reserved but not confirmed, with nothing yet in the product: the handle reads `starting` and the slot is held.
      const starting: InboundRunStatus = { run: handle, sessionId: now.sessionId, state: 'starting', stopReason: null, awaitingInput: false };
      return { kind: 'inbound.runStatus', status: starting };
    }
    if (read.kind !== 'row') return { kind: 'refused', code: 'inbound.run-unreadable', headline: 'The run’s state could not be read' };
    const busy = isBusy(read.executionStatus);
    // REQ-MCP-125: the caller may observe that its run waits on a decision at the desktop; it may never answer one.
    const status: InboundRunStatus = {
      run: handle,
      sessionId: now.sessionId,
      state: presentationStatus(read.executionStatus),
      // REQ-MCP-123 (BLOCKER D): the reason belongs to the HANDLE and is read from it alone; a run still busy has not
      // stopped, so it reports none however recently the session last stopped.
      stopReason: busy ? null : (now.stopReason as StopReason | null),
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

/**
 * REQ-MCP-123/125/130 (MAJOR, 2026-11-25): the status of a run that has ENDED — its own frozen state, its own reason and
 * the waiting flag it had AT ITS END, and never a later reading of the same session (a desktop continuation must not
 * change an old handle's answer).
 */
function endedStatus(run: InboundRun): InboundRunStatus {
  const ended = run.endState;
  return {
    run: run.handle,
    sessionId: run.sessionId,
    state: presentationStatus(ended === null ? 'stopped' : ended.executionStatus),
    stopReason: run.stopReason as StopReason | null,
    awaitingInput: ended === null ? false : ended.awaitingInput,
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
 * MAJOR (Main, 2026-11-25; REWORK 4, point 7): the run host's `exit`. Main wires this to `runHostChild.on('exit')`, so a
 * crash that took the externally started run with it releases the surface's one-run slot instead of locking the surface
 * for the rest of the application. The run host is never forked again, so no dispatch can still reach a replacement host.
 */
export function inboundRunHostExited(runs: InboundSurfaceRuns): void {
  runs.abandonAll();
}
