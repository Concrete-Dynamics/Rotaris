import { INBOUND_NO_OPEN_WORKSPACE, INBOUND_RUN_ALREADY_ACTIVE, INBOUND_RUN_HANDLE_PATTERN, presentationStatus, type InboundListenerAsk, type InboundRunStatus, type InboundStartRunAnswer, type InboundRunStatusAnswer, type StopReason } from '@rotaris/contracts';
import { randomUUID } from 'node:crypto';
import { startSessionRun, type SessionStartDeps } from './session-start.js';

/**
 * THE SURFACE'S MAIN-SIDE COORDINATOR (ADR-0067; REQ-MCP-123/124/125/126/128/130). This is the one place an external
 * caller's ask is turned into an act of the product, and it holds the four rules the surface's slice fixes:
 *
 * 1. **The single-run slot** (REQ-MCP-126). At most one externally started run is active. The slot is taken ATOMICALLY
 *    and BEFORE the coordinator's side effects — worktree creation among them — and held across admission and the whole
 *    approval wait, released only at a definite refusal or the run's terminal state. A request while one is active is
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
 */

/** One externally started run: the handle the caller was given, the session behind it, and the workspace it belongs to. */
interface InboundRun {
  readonly handle: string;
  readonly sessionId: string;
  readonly workspaceId: string;
}

/** The current run as the coordinator holds it, and the handle index for `rotaris_run_status`. */
export class InboundSurfaceRuns {
  #active: InboundRun | null = null;
  /** REQ-MCP-126: the in-flight attempts that have taken the slot but not yet committed or released it. */
  #pending = 0;
  /** The session id a taken attempt was minted with, so the run's own end frees exactly that attempt. */
  #pendingSessionId: string | null = null;
  /** Whether the in-flight attempt's run already reported its terminal result (BLOCKER 2, MAJOR: a `run.result` that beat the commit). */
  #pendingEnded = false;
  /** Handles this surface minted, by handle, newest last, bounded so a long-lived application does not grow without end. */
  readonly #handles = new Map<string, InboundRun>();
  #handleOrder: string[] = [];
  /** The one cap on remembered handles: past it the oldest is dropped (its run has long ended; REQ-MCP-126's ceiling is the owner's, this is hygiene). */
  static readonly #HANDLE_HISTORY_MAX = 64;

  /** REQ-MCP-126: whether an externally started run is active (or an admission is in flight that it will name). */
  get active(): InboundRun | null {
    return this.#active;
  }

  /**
   * REQ-MCP-126: TAKE the slot, or refuse because one is active. Atomic: the check and the take are one synchronous step,
   * so two concurrent requests cannot both take it. Called BEFORE the coordinator's side effects.
   *
   * The slot is a COUNT of in-flight attempts plus the one committed run, not a boolean made true at once: an attempt that
   * is still in flight (its host ask unanswered, or answered only after the bound elapsed — BLOCKER 2) keeps the slot, so a
   * second request is refused while the first may still be producing a run.
   */
  take(sessionId: string): { readonly ok: true } | { readonly ok: false } {
    if (this.#active !== null || this.#pending > 0) return { ok: false };
    this.#pending += 1;
    this.#pendingSessionId = sessionId;
    this.#pendingEnded = false;
    return { ok: true };
  }

  /**
   * REQ-MCP-126 (BLOCKER 2): the host ask got NO answer within its bound, so the host MAY still be starting the run. The
   * slot is KEPT taken (a second external start is refused) and the attempt stays tied to the session id this start was
   * minted with, so the run's own `run.result` frees exactly this attempt and no other. Only a definite refusal, the run's
   * end, the run host's exit or the application's quit releases it — a bare no-reply never does.
   *
   * This is deliberately the CONSERVATIVE side of REQ-MCP-126's "at most one, never queued": the cost of holding is a
   * surface that refuses further starts until the attempt resolves, the cost of freeing is two running runs, and only the
   * second violates the requirement. If the host never started a run at all (it was merely slow to refuse), the held
   * attempt is released by the run host's exit (`abandonAll`) or the next application launch; it is not released by
   * guessing.
   */
  held(): void {
    // The attempt is already counted in `#pending` and already tied to its session id by `take`; this names the intent at
    // the call site. Kept as its own method so the coordinator's held path reads as the decision it is.
  }

  /**
   * REQ-MCP-126: the start succeeded — the slot now names the run it admitted and its handle is remembered. The pending
   * attempt is settled first, so the count returns to what the committed run alone holds.
   */
  committed(run: InboundRun): void {
    if (this.#pending > 0) this.#pending -= 1;
    // MAJOR: a `run.result` that arrived BEFORE this commit (the run started and ended while the start reply was still on
    // its way) already told us the run is over — its handle is recorded, and the slot is left free, never held by a dead run.
    const alreadyEnded = this.#pendingEnded && this.#pendingSessionId === run.sessionId;
    this.#pendingSessionId = null;
    this.#pendingEnded = false;
    this.#handles.set(run.handle, run);
    this.#handleOrder.push(run.handle);
    while (this.#handleOrder.length > InboundSurfaceRuns.#HANDLE_HISTORY_MAX) {
      const oldest = this.#handleOrder.shift();
      if (oldest !== undefined) this.#handles.delete(oldest);
    }
    if (!alreadyEnded) this.#active = run;
  }

  /**
   * REQ-MCP-126: the start was refused — the slot is released, so the next request is admitted. Called only for a DEFINITE
   * refusal (the host answered that no run exists, or the ask failed before any side effect); a bare no-reply does NOT
   * call this (BLOCKER 2).
   */
  release(): void {
    if (this.#pending > 0) this.#pending -= 1;
    this.#pendingSessionId = null;
    this.#pendingEnded = false;
  }

  /** REQ-MCP-126/130: the run for a handle this surface minted, or undefined for any other value (an unrelated session id among them). */
  byHandle(handle: string): InboundRun | undefined {
    const run = this.#handles.get(handle);
    return run === undefined ? undefined : run;
  }

  /**
   * REQ-MCP-126: a terminal state — the run ended, so the slot is free again. Called from the run host's `run.result`
   * for the run's session. A run that ended for another reason (a desktop stop of the same session) releases the slot
   * too: the product's own notion of "the run is over" is this one.
   *
   * MAJOR (Main, 2026-11-25): a `run.result` that arrives BEFORE `committed` is the same terminal fact. A run that ended
   * while its start reply was still in flight must not leave the slot taken, so the pending attempt's own session ending
   * marks it ended (the late `committed` then records the handle and leaves the slot free).
   */
  ended(sessionId: string): void {
    if (this.#active !== null) {
      if (this.#active.sessionId === sessionId) this.#active = null;
      return;
    }
    // No committed run yet: only the end of the very session this attempt was minted with frees it, never another's.
    if (this.#pending > 0 && this.#pendingSessionId === sessionId) {
      this.#pendingEnded = true;
      this.#pending -= 1;
    }
  }

  /**
   * MAJOR (Main, 2026-11-25): the run host's `exit`. Nothing it held is alive, so an externally started run's slot is
   * released (the run is gone and settles through stale detection), exactly as the board's coordinator reaps on the same
   * event (`requirements-runs.ts`'s `onRunHostExit`). Without this the surface stayed locked for the rest of the
   * application after a run-host crash, and every later external request was refused for a run that no longer existed.
   */
  abandonAll(): void {
    this.#pending = 0;
    this.#pendingSessionId = null;
    this.#pendingEnded = false;
    this.#active = null;
  }
}

/** REQ-MCP-121/123: the handle this surface mints for a start — a value no other product surface produces. */
export function mintInboundRunHandle(randomBytes: () => string = () => randomUUID().replaceAll('-', '')): string {
  const handle = `inr_${randomBytes()}`;
  return INBOUND_RUN_HANDLE_PATTERN.test(handle) ? handle : `inr_${randomUUID().replaceAll('-', '')}`;
}

/** What the coordinator needs to answer both tools: the shared start coordinator's deps, the run store, the open-workspace read, and the session status. */
export interface InboundCoordinatorDeps {
  readonly start: SessionStartDeps;
  readonly runs: InboundSurfaceRuns;
  /**
   * REQ-MCP-123/125/130: the run's state, its stop reason and whether it waits on a person, in the product's own
   * vocabulary, read from where the product holds it (the run host's listing for the workspace plus main's own terminal
   * stop-reason record). Answers null when the session cannot be read at all.
   */
  readonly readStatus: (workspaceId: string, sessionId: string) => Promise<{ readonly executionStatus: string; readonly stopReason: string | null; readonly awaitingInput: boolean } | null>;
  /** REQ-MCP-124: the open workspace, as `SessionStartDeps.openWorkspaceRead` reads it. */
  readonly openWorkspace: SessionStartDeps['openWorkspaceRead'];
  readonly mintHandle?: (() => string) | undefined;
}

/** REQ-MCP-123/124: the two answers a `rotaris_*` tool call becomes. */
export interface InboundSurface {
  readonly startRun: (prompt: string) => Promise<InboundStartRunAnswer>;
  readonly runStatus: (handle: string) => Promise<InboundRunStatusAnswer>;
}

/**
 * REQ-MCP-126 (BLOCKER 2): the code `startSessionRun` answers with when the run host did NOT reply within the bound. It is
 * NOT a definite refusal: the host may still be starting the run (its own credential lease is bounded at 45 s, longer than
 * this coordinator's wait), so the slot must be kept, not freed.
 */
export const INBOUND_START_UNCONFIRMED = 'inbound.start-unconfirmed';

/** The one coordinator main holds. `ask` is what the listener's ask path calls. */
export function createInboundCoordinator(deps: InboundCoordinatorDeps): { readonly surface: InboundSurface; readonly ask: (ask: InboundListenerAsk) => Promise<InboundStartRunAnswer | InboundRunStatusAnswer>; readonly runs: InboundSurfaceRuns } {
  const mint = deps.mintHandle ?? (() => mintInboundRunHandle());

  const startRun = async (prompt: string): Promise<InboundStartRunAnswer> => {
    // REQ-MCP-126: the slot first, before any side effect (worktree creation among them). Atomic and synchronous, and tied
    // to the session id this attempt will take, so a run whose start reply is lost is still freed by its own `run.result`.
    const sessionId = randomUUID();
    if (!deps.runs.take(sessionId).ok) {
      return { kind: 'refused', code: 'inbound.run-active', headline: 'A run started through the surface is already active', detail: INBOUND_RUN_ALREADY_ACTIVE };
    }
    try {
      // REQ-MCP-120/124: the workspace is the OPEN one and nothing a caller named; with none open, refused.
      const open = await deps.openWorkspace(null);
      if (open === null || open.workspaceId === '' || open.workspace === '(no workspace)') {
        deps.runs.release();
        return { kind: 'refused', code: 'inbound.no-workspace', headline: 'No workspace is open', detail: INBOUND_NO_OPEN_WORKSPACE };
      }
      // REQ-MCP-124: the ordinary start, through the SAME main-side coordinator a desktop start uses — no authority
      // field is set here (no sandbox mode, no isolation, no board permissions, no worktree), and the workspace is the
      // open one. The coordinator's own fence re-checks the workspace before the host is asked.
      const outcome = await startSessionRun(deps.start, { workspaceId: open.workspaceId, workspaceRoot: open.workspace, prompt, sessionId });
      if (!outcome.ok) {
        /*
         * BLOCKER 2 (2026-11-25): a NO-REPLY is not a refusal. `run-host.unreachable` is `startSessionRun`'s answer when
         * the run host did not answer its `session.start` within the bound — and the host's own credential lease is bounded
         * at 45 s (LEASE_ASK_MS), longer than that wait, so a HEALTHY host can answer late and start the run anyway. Freeing
         * the slot here is exactly the defect the review found: a second external start would then be admitted while the
         * first run is being born, and two runs would run against REQ-MCP-126. The slot is KEPT instead (tied to the session
         * id this attempt minted) and only a definite refusal, the run's own end, or the run host's exit releases it.
         */
        if (outcome.code === 'run-host.unreachable') {
          deps.runs.held();
          return { kind: 'refused', code: INBOUND_START_UNCONFIRMED, headline: 'The run host did not confirm the start in time', detail: 'The start may still be beginning: this surface keeps its one-run slot held, so no second run can start until this attempt either appears or the run host answers. Ask for the run’s state again shortly.' };
        }
        deps.runs.release();
        return { kind: 'refused', code: outcome.code, headline: outcome.headline, ...(outcome.detail === undefined ? {} : { detail: outcome.detail }) };
      }
      const started = (outcome.value as { sessionId: string }).sessionId;
      const handle = mint();
      deps.runs.committed({ handle, sessionId: started, workspaceId: open.workspaceId });
      return { kind: 'inbound.runStarted', run: handle, sessionId: started };
    } catch (cause) {
      // Nothing throws into the listener: a rejection here is a refusal with its reason, and the slot is freed.
      deps.runs.release();
      return { kind: 'refused', code: 'inbound.start-failed', headline: 'The run could not be started', detail: cause instanceof Error ? cause.message : String(cause) };
    }
  };

  const runStatus = async (handle: string): Promise<InboundRunStatusAnswer> => {
    // REQ-MCP-123/130: only a handle this surface minted is answered; anything else is refused, so no other run is readable.
    const run = deps.runs.byHandle(handle);
    if (run === undefined) return { kind: 'refused', code: 'inbound.unknown-run', headline: 'No run of this surface answers to that handle' };
    const read = await deps.readStatus(run.workspaceId, run.sessionId);
    if (read === null) return { kind: 'refused', code: 'inbound.run-unreadable', headline: 'The run’s state could not be read' };
    const status: InboundRunStatus = {
      run: handle,
      sessionId: run.sessionId,
      state: presentationStatus(read.executionStatus),
      stopReason: read.stopReason as StopReason | null,
      // REQ-MCP-125: the caller may observe that its run waits on a decision at the desktop; it may never answer one.
      awaitingInput: read.awaitingInput,
    };
    return { kind: 'inbound.runStatus', status };
  };

  return {
    runs: deps.runs,
    surface: { startRun, runStatus },
    ask: async (ask: InboundListenerAsk): Promise<InboundStartRunAnswer | InboundRunStatusAnswer> => (ask.kind === 'inbound.startRun' ? startRun(ask.prompt) : runStatus(ask.run)),
  };
}

/** REQ-MCP-126: the run's session ending releases the slot. Main wires this to the run host's `run.result`. */
export function inboundRunEnded(runs: InboundSurfaceRuns, sessionId: string): void {
  runs.ended(sessionId);
}

/**
 * MAJOR (Main, 2026-11-25): the run host's `exit`. Main wires this to `runHostChild.on('exit')`, so a crash that took the
 * externally started run with it releases the surface's one-run slot instead of locking the surface for the rest of the
 * application.
 */
export function inboundRunHostExited(runs: InboundSurfaceRuns): void {
  runs.abandonAll();
}
