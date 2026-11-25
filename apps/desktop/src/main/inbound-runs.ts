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
  /** Handles this surface minted, by handle, newest last, bounded so a long-lived application does not grow without end. */
  readonly #handles = new Map<string, InboundRun>();
  #handleOrder: string[] = [];
  /** The one cap on remembered handles: past it the oldest is dropped (its run has long ended; REQ-MCP-126's ceiling is the owner's, this is hygiene). */
  static readonly #HANDLE_HISTORY_MAX = 64;

  /** REQ-MCP-126: whether an externally started run is active. */
  get active(): InboundRun | null {
    return this.#active;
  }

  /**
   * REQ-MCP-126: TAKE the slot, or refuse because one is active. Atomic: the check and the take are one synchronous step,
   * so two concurrent requests cannot both take it. Called BEFORE the coordinator's side effects.
   */
  take(): { readonly ok: true } | { readonly ok: false } {
    if (this.#active !== null) return { ok: false };
    this.#active = { handle: '', sessionId: '', workspaceId: '' };
    return { ok: true };
  }

  /** REQ-MCP-126: the start succeeded — the slot now names the run it admitted and its handle is remembered. */
  committed(run: InboundRun): void {
    this.#active = run;
    this.#handles.set(run.handle, run);
    this.#handleOrder.push(run.handle);
    while (this.#handleOrder.length > InboundSurfaceRuns.#HANDLE_HISTORY_MAX) {
      const oldest = this.#handleOrder.shift();
      if (oldest !== undefined) this.#handles.delete(oldest);
    }
  }

  /** REQ-MCP-126: the start was refused — the slot is released, so the next request is admitted. */
  release(): void {
    this.#active = null;
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
   */
  ended(sessionId: string): void {
    if (this.#active?.sessionId === sessionId) this.#active = null;
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
   * REQ-MCP-123/130: the run's state and stop reason in the product's own vocabulary, read from where the product holds
   * it (the run host's listing for the workspace). Answers null when the session cannot be read at all.
   */
  readonly readStatus: (workspaceId: string, sessionId: string) => Promise<{ readonly executionStatus: string; readonly stopReason: string | null } | null>;
  /** REQ-MCP-124: the open workspace, as `SessionStartDeps.openWorkspaceRead` reads it. */
  readonly openWorkspace: SessionStartDeps['openWorkspaceRead'];
  readonly mintHandle?: (() => string) | undefined;
}

/** REQ-MCP-123/124: the two answers a `rotaris_*` tool call becomes. */
export interface InboundSurface {
  readonly startRun: (prompt: string) => Promise<InboundStartRunAnswer>;
  readonly runStatus: (handle: string) => Promise<InboundRunStatusAnswer>;
}

/** The one coordinator main holds. `ask` is what the listener's ask path calls. */
export function createInboundCoordinator(deps: InboundCoordinatorDeps): { readonly surface: InboundSurface; readonly ask: (ask: InboundListenerAsk) => Promise<InboundStartRunAnswer | InboundRunStatusAnswer>; readonly runs: InboundSurfaceRuns } {
  const mint = deps.mintHandle ?? (() => mintInboundRunHandle());

  const startRun = async (prompt: string): Promise<InboundStartRunAnswer> => {
    // REQ-MCP-126: the slot first, before any side effect (worktree creation among them). Atomic and synchronous.
    if (!deps.runs.take().ok) {
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
      const outcome = await startSessionRun(deps.start, { workspaceId: open.workspaceId, workspaceRoot: open.workspace, prompt });
      if (!outcome.ok) {
        deps.runs.release();
        return { kind: 'refused', code: outcome.code, headline: outcome.headline, ...(outcome.detail === undefined ? {} : { detail: outcome.detail }) };
      }
      const sessionId = (outcome.value as { sessionId: string }).sessionId;
      const handle = mint();
      deps.runs.committed({ handle, sessionId, workspaceId: open.workspaceId });
      return { kind: 'inbound.runStarted', run: handle, sessionId };
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
