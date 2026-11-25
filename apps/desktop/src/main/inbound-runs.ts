import { INBOUND_NO_OPEN_WORKSPACE, INBOUND_RUN_ALREADY_ACTIVE, INBOUND_RUN_HANDLE_PATTERN, INBOUND_START_BOUND_MS as INBOUND_START_BOUND_MS_NUMBER, presentationStatus, runHasEnded, type InboundListenerAsk, type InboundRunStatus, type InboundStartRunAnswer, type InboundRunStatusAnswer, type ProcessReply, type StopReason } from '@rotaris/contracts';
import { millis, type Millis } from '@rotaris/kernel';
import { randomUUID } from 'node:crypto';
import { startSessionRun, type SessionStartDeps } from './session-start.js';
import { isDefiniteStartRefusal } from './start-refusal.js';
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
 *
 * REWORK 6 (2026-11-25) — THE EXECUTION IDENTITY, as the advisor ruled it, and ONE lifecycle transition.
 *
 * 1. **Desktop approve/revise/continue/double are THIS run, still running.** Round 5 bound the handle to the session
 *    record's `runStartedAt` and refused a state whose instant differed. That was falsified: a desktop *revise* starts
 *    the NEXT PHASE of the same run with a NEW instant, and a cancel at that next gate (`paused` + `user_cancelled`,
 *    without any `run.result`) was then discarded — the one slot stayed occupied for good. The timestamp equality is
 *    GONE; a state for the handle's session is adopted, whenever it was launched. Equality could never prove ownership
 *    anyway: the pre-flight read exposes the OLD value, so the instant is not an identity of the execution.
 * 2. **The phase's fields are replaced as ONE UNIT** (the status, the waiting flag and the reason together), an ABSENT
 *    reason included. Merging only the populated fields left a prior phase's reason or waiting flag standing after a
 *    resume; a phase that carries no reason now CLEARS the reason the previous one stopped with.
 * 3. **Ending always needs a POSITIVE proof** (unchanged): `run.result`, a terminal status, a park WITH a reason
 *    (`paused`/`paused_message_limit` + reason), the documented STALE/absent listing after a failed terminal write,
 *    or the run host's exit. A park WITHOUT a reason — the plan gate, the message limit — HOLDS.
 * 4. **ONE lifecycle transition decides all of it** (`InboundSurfaceRuns.#transition`). `observe`, `ended`,
 *    `reconcile`, `observeListing` and `abandonAll` are thin events over it, and `rotaris_run_status` reads the state
 *    the transition stored; there is no second place where an end or a confirmation could be decided differently.
 * 5. **NAMED RESIDUAL GAP (not claimed closed) — THE SESSION-ID-ONLY ASSIGNMENT RESTGAP (REWORK 7; CORRECTED AND BROADENED
 *    IN REWORK 8, 2026-11-25).** The session LOCK serializes a session's writer within one application, and the surface's
 *    slot serializes external STARTS — but **every delivery this surface receives is matched to a handle by the SESSION ID
 *    ALONE** (`#runForSession`, `#frozenRunForSession`): a `publish.snapshot`, a `session.list` row, or a terminal
 *    `run.result` is assigned to whichever handle holds that session id, with no proof that the event belongs to THAT
 *    execution. REWORK 7 named this too narrowly ("a fresh start after a failed terminal write"); the boundary is WIDER:
 *    any delivery found by session id alone can hit a handle that ended groundlessly (frozen without a reason this surface
 *    computed) or that is still OPEN — a desktop `prompt`/`retry` at the same session (a genuinely FRESH run), a recovery
 *    re-open after a failed terminal write, or a continuation all share the id. The product does not cleanly separate these
 *    at the assignment point: main is handed only the session id, so the surface cannot tell a fresh start from a resume.
 *    The two advisor rounds established that a TIMESTAMP is NOT an identity proof (and caused the Revise→Cancel hang), so
 *    no timestamp stands in: the equality stays removed. **THE LIMITATION MEASURES (the damage is bounded to the
 *    conservative side):** (a) a handle that has ENDED keeps its own frozen state, and a late `run.result` may only ADD a
 *    missing reason — never change the frozen state — and only when the result AGREES with the frozen end (REWORK 8).
 *    (b) The slot is HELD LONGER rather than freed, because adopting a foreign execution is the failure that costs two
 *    running runs (REQ-MCP-126). (c) A late event for a finished attempt cannot touch a NEWER holder. What is NOT proved:
 *    a foreign delivery that happens to carry the SAME terminal status is still indistinguishable — closing that needs the
 *    fresh-start-versus-resume distinction carried from the lifecycle code that ACCEPTS the action, not done here.
 *
 * REWORK 7 (2026-11-25) — THE PHASE UNIT ON THE HANDLE, THE ACTIVITY-BOUND RECONCILE, AND THE CONSERVATIVE STATUS PATH.
 *
 * 1. **The phase is ONE value on the handle** (`InboundRun.phase`), held together with its reason. A snapshot replaces
 *    the status, the waiting flag and the reason together (an ABSENT reason included); a listing row states NO reason and
 *    so is silent about it, leaving the reason as it stands. `rotaris_run_status` composes the answer from that ONE value,
 *    never field by field from a fresh listing — which is what let a reasonless row overwrite a known reason with null.
 * 2. **A late `run.result` completes an end that ended WITHOUT a reason.** The terminal write publishes the status before
 *    the result, so an end can be frozen first with a null reason; a `run.result` for the SAME handle then adds the
 *    product's own reason. It never overwrites a reason the surface COMPUTED (`agent_session_aborted`) — that is a
 *    positive statement — nor one already observed.
 * 3. **The reconcile is bound by ACTIVITY, not lifetime** (SUPERSEDED by REWORK 10: the reset is gone). Its counter was
 *    reset by `pulse` on every fresh snapshot or listing for the session, so a legitimately waiting run kept its reconcile
 *    alive and only a COMPLETELY SILENT run exhausted the chain. The STATUS path ends a run the listing marks STALE all
 *    the same (also SUPERSEDED by REWORK 10: a STALE row never ends a run).
 *
 * REWORK 8 (2026-11-25) — THE LAST FOUR DEFECTS, all of the same shape: an OBSERVATION used as a PROOF.
 *
 * 1. **The worktree is never deleted on an observation** (`session-start.ts`). Round 7 took a session-created tree away
 *    after two EMPTY listings over the host worst case; that is unfalsifiable false, because the bound ends only MAIN's
 *    wait and a start the host accepted can be born long after (its credential lease comes first). The observation-based
 *    removal is GONE; the tree is removed at exactly two POSITIVE places — the definite refusal, and the worktree cleanup
 *    at session open.
 * 2. **`session.attachment-invalid`, `session.lock-held` and `runHost.gone` are NOT definite refusals** (`start-refusal.ts`):
 *    each can come back AFTER the session record is created, so none proves "no run". `runHost.notStarted` (a missed
 *    `hello`) IS definite — a request before the hello is held, never delivered.
 * 3. **The status answer is composed EXCLUSIVELY from the handle's ONE phase** and from no second source (REWORK 7 still
 *    read `state`/`awaitingInput` off the fresh listing). The phase is replaced as ONE UNIT on every accepted event, and
 *    the end decision reads the reason the EVENT carries, never a carried-over one.
 * 4. **The reconcile cannot be kept alive by polling** (SUPERSEDED by REWORK 10: the counter counts every step and no
 *    source pattern resets it, so the cap is a hard bound). Only a READABLE progress (a row that is the run) reset the
 *    stall counter; an `unreadable` reading proves nothing and did not extend the chain.
 * 5. **The residual gap is named correctly and BROADER** (see the class comment's point 5): every delivery is matched to
 *    a handle by the SESSION ID ALONE, so a delivery can reach a groundlessly frozen or still-open handle. The bounding
 *    measure is sharpened: a late `run.result` may only ADD a missing reason to a frozen end it AGREES with.
 *
 * REWORK 9 (2026-11-25) — A PARK NEVER RELEASES THE SLOT, AND THE TEXT FOLLOWS THE HANDLE'S OWN STATE.
 *
 * 1. **`paused` is AMBIGUOUS and therefore never an end** (`runHasEnded`). A normal DESKTOP Pause writes `paused` +
 *    `user_cancelled` AND emits a `run.result`; a desktop Continue then resumes the SAME open iteration. No product field
 *    separates that resumable pause from the plan-gate cancel (both write `paused`/`user_cancelled`), so round 8's "a park
 *    WITH a reason ends the run" admitted a SECOND external start while the first was continued — two running runs
 *    (REQ-MCP-126). Every park — `paused`, `paused_message_limit`, `awaiting_plan_decision`, each WITH or WITHOUT a reason
 *    — now HOLDS the slot and the handle, and the handle is NOT finalized on the pause: it stays watchable through the
 *    pause and the continuation, and is frozen only on the SAME proof that releases the slot (advisor: "premature handle
 *    finalization" is a High defect). Release comes from a TERMINAL status, a terminal `run.result`, or the run host's
 *    exit — and NOTHING else (REWORK 10 removed the authoritative-ABSENCE arm, which the reviewer measured as the
 *    blocker). The liveness cost (a desktop-paused run never continued holds the slot until the application ends) is
 *    covered by REQ-MCP-126's "refused, never queued".
 * 2. **A held run NEVER reports a stop reason** (REQ-MCP-123; MAJOR 1). The stop reason belongs to a run that has ended;
 *    while the slot is held (`endState === null`) `rotaris_run_status` answers `stopReason: null` and the text says the run
 *    has not stopped — even when the hold IS a park the product labelled `paused`/`user_cancelled`. A TERMINAL end answers
 *    its reason, and the text says `it stopped`.
 * 3. **The reconcile's cap is a hard bound, also under alternating sources** (REQ-MCP-123/126; MAJOR 2; REWORK 10). The
 *    round-9 counter was reset by real PROGRESS alone — which alternation defeated. REWORK 10 removed the reset: the
 *    counter counts every step and the chain exhausts at `RECONCILE_MAX_STEPS` however it is read.
 *
 * REWORK 10 (2026-11-25) — THE UNIFORM RULE: AN OBSERVATION NEVER RELEASES THE SLOT.
 *
 * 1. **Every release authority left in `STALE`/`absent`/the reconcile is REMOVED.** The three advisor rounds converge on
 *    one rule: a listing, a MISSING listing, a STALE row (busy while nothing runs it, REQ-SESSION-171) and a snapshot's
 *    timing are all OBSERVATIONS, and none of them proves the admitted attempt has ended. The previous head released the
 *    slot on a STALE or absent reading, and the reviewer measured the hole: after a FAILED TERMINAL WRITE the desktop can
 *    RE-OPEN the store and CONTINUE the open iteration, so `held → released → a second start admitted` happened while the
 *    first run was still live (REQ-MCP-126). The park guard did not save it either — the FIRST active STALE row overwrote
 *    the stored park phase, the SECOND froze the handle and freed the slot. A `listing` event now NEVER releases: it
 *    refreshes the HELD phase at most — a STALE row sets a phase only when the handle holds none yet, and never
 *    overwrites one (it states the RECORD's liveness, not the run's state) — and an `absent` reading (`listing-gone`) is
 *    passed through the ONE transition, which decides HOLD.
 * 2. **Release comes from exactly three proofs**: `runHasEnded(status)` out of a `snapshot`, the terminal `run.result`
 *    itself, and `abandonAll` (the run host's exit; the host is never forked again, ADR-0002 consequence 1). Nothing
 *    else — a LISTING row never releases, however it reads. The reconcile cannot release at all: it is a pure PHASE
 *    REFRESH that turns a lost-reply attempt live. In doubt: HOLD.
 * 3. **THE ACCEPTED CONSEQUENCE, named**: a run whose terminal write FAILED and whose session never becomes terminal
 *    HOLDS the slot until the run host ends (the application ends), and the surface keeps answering the held (busy)
 *    phase. That is the deliberately conservative side — REQ-MCP-126 covers the liveness cost ("refused, never
 *    queued") — and the alternative (freeing on an observation) is the same defect this feature keeps re-learning.
 * 4. **The reconcile's cap counts EVERY step and NOTHING resets it** (MAJOR 2). Round 9 reset the counter on a CHANGED
 *    state, and the reviewer showed the escape: a listing row signs `stale` while a snapshot of the SAME phase signs
 *    `stopReason`, so ALTERNATING the two sources reset the counter forever (after 192 steps a follow-up was still
 *    planned). The `pulse` reset is GONE; the counter is incremented per step and never cleared, so the chain exhausts at
 *    `RECONCILE_MAX_STEPS` whatever the sources do. Exhaustion no longer costs correctness — the chain cannot release
 *    anything — it only stops a periodic refresh, and `rotaris_run_status` still refreshes the held phase on demand.
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
   * exactly when the handle is, and no other run's result can displace it. Frozen at the run's end.
   *
   * MAJOR A (REWORK 6, 2026-11-25): the reason is replaced as part of the phase's ONE UNIT on every accepted transition
   * — an ABSENT reason included — so a phase that carries none (a resume, a clean completion) clears the reason the
   * previous phase stopped with. Merging only the populated fields left a stale reason standing.
   */
  stopReason: string | null;
  /**
   * REWORK 7 (MAJOR 3, 2026-11-25): the run's PHASE — its execution status, whether it waited on a person and its reason
   * — held TOGETHER on the handle, so `rotaris_run_status` composes ONE coherent answer from one source instead of
   * mixing a state read from a fresh listing with a reason held beside it. `null` until the first state is seen (a
   * just-reserved handle). A snapshot (which carries a reason) replaces all three; a listing row (which carries none)
   * replaces the status and the waiting flag and LEAVES the reason.
   */
  phase: RunPhase | null;
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
  /**
   * REWORK 7 (MAJOR 3, 2026-11-25): whether the reason this run ended with was COMPUTED by the surface (`agent_session_aborted`,
   * the reason an unconfirmable completion gets from `listing-gone`/`host-exit`) rather than observed. A computed reason is
   * a positive statement and a later `run.result` never contradicts it; a NULL reason is not, and a `run.result` may still
   * add the product's own reason to an end that carried none.
   */
  frozenReasonComputed: boolean;
}

/**
 * What ONE lifecycle transition did, for the caller that owns the consequences (MAJOR A/B): whether THIS call is what
 * confirmed the run (so the caller arms the one reconcile, MAJOR B), and whether the run ended on it (frozen answer and
 * released slot).
 */
/**
 * What ONE lifecycle transition did, for the caller that OWNS the consequences (MAJOR A/B): whether THIS call is what
 * confirmed the run (so the caller arms the one reconcile — MAJOR B arming on every path), and whether the run ended on
 * it (frozen answer and released slot).
 */
export interface TransitionOutcome {
  readonly newlyConfirmed: boolean;
  readonly released: boolean;
}

/** The two fields frozen at a run's end: its execution status and whether it waited on a person then. */
export interface FrozenEndState {
  readonly executionStatus: string;
  readonly awaitingInput: boolean;
}

/**
 * REWORK 7 (MAJOR 3, 2026-11-25): ONE phase of a run — its execution status, whether it waited on a person and its stop
 * reason — as ONE value held on the handle (`InboundRun.phase`). Held together so the status answer is composed from one
 * source; a snapshot replaces all three, a listing row replaces the first two and leaves the reason.
 */
export interface RunPhase {
  readonly executionStatus: string;
  readonly awaitingInput: boolean;
  readonly stopReason: string | null;
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

/**
 * MAJOR A (REQ-MCP-123/125/126, 2026-11-25): ONE accepted lifecycle transition of a handle, from whichever source feeds
 * it — a `publish.snapshot` (`snapshot`), the run host's listing (`listing`, whose row carries the stale verdict), the
 * run host's terminal `run.result` (`result`), or a listing that proves the run is gone (`listing-gone`). The one
 * private `#transition` reads it and decides; see the class.
 */
type LifecycleEvent =
  | { readonly kind: 'confirmed'; readonly hostSessionId: string }
  | { readonly kind: 'snapshot'; readonly executionStatus: string; readonly stopReason: string | null; readonly awaitingInput: boolean }
  | { readonly kind: 'listing'; readonly executionStatus: string; readonly awaitingInput: boolean; readonly stale: boolean }
  | { readonly kind: 'result'; readonly stopReason: string | null; readonly executionStatus: string | null }
  | { readonly kind: 'listing-gone' }
  | { readonly kind: 'host-exit' };

/** What a reservation answers: the handle and the session id it took, or a bare refusal when one is active. */
export type TakeOutcome = { readonly ok: true; readonly handle: string; readonly sessionId: string } | { readonly ok: false };

/** What the one reconcile found for its run: still involved (re-arm the refresh), or no longer this run's business. */
export type ReconcileOutcome = 'held' | 'uninvolved';

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
    const run: InboundRun = { handle, sessionId, hostSessionId: null, workspaceId: null, stopReason: null, phase: null, endState: null, refusal: null, confirmed: false, frozenReasonComputed: false };
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
   * completed handle. Answers whether this call is what CONFIRMED the run (`false` for a repeat), so the caller arms the
   * one reconcile exactly once per transition into `confirmed` (MAJOR 2(a), 2026-11-25).
   */
  committed(handle: string, hostSessionId: string): TransitionOutcome {
    const run = this.#runs.get(handle);
    if (run === undefined) return { newlyConfirmed: false, released: false };
    return this.#transition(run, { kind: 'confirmed', hostSessionId });
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
    const run = this.#runs.get(handle);
    if (run === undefined) return undefined;
    const reason = run.endState !== null ? run.stopReason : (run.phase?.stopReason ?? null);
    return reason ?? undefined;
  }

  /**
   * REQ-MCP-126: the run host's terminal `run.result` — the run is over, so the slot is free again and the handle keeps
   * the end state and the reason the product reported (REQ-MONITOR-301, REQ-SESSION-073). Bound to the handle's session:
   * a result for another session touches nothing, and a result for a handle that has already ended does not overwrite it
   * (REWORK 4, point 4). It is one `LifecycleEvent` through the one transition (MAJOR A, 2026-11-25).
   */
  ended(sessionId: string, stopReason: string | null = null, executionStatus: string | null = null): void {
    const run = this.#runForSession(sessionId) ?? this.#frozenRunForSession(sessionId);
    if (run === null) return;
    this.#transition(run, { kind: 'result', stopReason, executionStatus });
  }

  /**
   * REQ-MCP-123/126 (REWORK 4, point 6; REWORK 6, MAJOR A): the product's own state for one session, as
   * `publish.snapshot` publishes it (`executionStatus`, `stopReason`, the waiting flag). The coordinator knows the
   * session id it minted, so it reads that session's state from the product rather than depending on a `run.result` the
   * halted/plan-gate paths never send.
   *
   * Any state for the attempt's session is POSITIVE evidence the execution exists, so a held attempt becomes confirmed.
   * The phase's three fields are adopted as ONE UNIT (an absent reason included), so a phase that starts without a
   * reason never inherits the last one. Whether the run ENDS is decided by the one transition: a terminal status, or a
   * park WITH a reason ends it; a park WITHOUT one (`awaiting_plan_decision`, a reasonless `paused`/`paused_message_limit`)
   * and a live status HOLD. A completed handle is never overwritten, and a state for another session touches nothing.
   *
   * REWORK 6: the `runStartedAt` equality is GONE. Desktop *approve/revise/continue/double* start the next phase of THIS
   * run — not a foreign execution — so a state for the handle's session is adopted whenever it was launched (see the
   * class comment's named residual gap for a genuinely fresh start).
   */
  observe(sessionId: string, state: ObservedState): TransitionOutcome | null {
    const run = this.#runForSession(sessionId);
    if (run === null) return null;
    return this.#transition(run, { kind: 'snapshot', executionStatus: state.executionStatus, stopReason: state.stopReason, awaitingInput: state.awaitingInput ?? false });
  }

  /**
   * REQ-MCP-123/126 (REWORK 6, MAJOR A; REWORK 7, MAJOR 3): the product's own state as the run host's `session.list`
   * states it — the same transition as `observe`, from the listing instead of the published record. A listing row states
   * NO stop reason, so it is SILENT about the reason: the status and the waiting flag are replaced and the reason is LEFT
   * as it stands (a row without a reason overwriting a known one with null was the fault REWORK 7 fixed). Whether the run
   * ENDS is the transition's own question, and REWORK 10 leaves only ONE status-driven end: a TERMINAL status (rule 4d).
   * A PARK does not end it. A STALE row (busy while nothing runs it) is an observation of the RECORD's liveness, not of
   * the run's state, so it refreshes NOTHING and releases NOTHING — rounds 4-9 read it as an end, which the reviewer
   * measured as the blocker.
   */
  observeListing(sessionId: string, row: { readonly executionStatus: string; readonly awaitingInput: boolean; readonly stale?: boolean }): TransitionOutcome | null {
    const run = this.#runForSession(sessionId);
    if (run === null) return null;
    return this.#transition(run, { kind: 'listing', executionStatus: row.executionStatus, awaitingInput: row.awaitingInput, stale: row.stale ?? false });
  }

  /**
   * MAJOR (2026-11-25; REWORK 10, 2026-11-25): the run host's `session.list` reading, used by the one bounded reconcile
   * behind a confirmed start. It is a PURE PHASE REFRESH and NEVER A RELEASE: it turns a lost-reply attempt `confirmed`
   * when the session appears, and it refreshes the held PHASE through the ONE transition. Nothing else — a LISTING (a
   * row, a STALE row or an absent one) never releases, whatever it shows. A STALE row (busy while no live process holds
   * its lock, REQ-SESSION-171) is an observation of the RECORD's liveness, not of the run's state, so it never overwrites
   * a held phase and frees nothing; an `absent` reading is routed through the transition, which decides to HOLD. Rounds
   * 4-9 let this release the slot on a stale or absent reading, and the reviewer measured the hole: after a FAILED
   * TERMINAL WRITE the desktop can re-open the store and CONTINUE the same iteration, so a release here admitted a second
   * start while the first run was still live. A run whose terminal write fails therefore holds the slot until the run host
   * ends — the named, accepted consequence.
   */
  reconcile(sessionId: string, reading: InboundStatusReading): ReconcileOutcome {
    const run = this.#runForSession(sessionId);
    if (run === null) return 'uninvolved';
    if (this.#holder !== run.handle) return 'uninvolved';
    if (!run.confirmed) return 'held';
    // An unreadable listing proves nothing and states no phase: HOLD, change nothing.
    if (reading.kind === 'unreadable') return 'held';
    // An absent listing proves nothing either (the store may be re-opened and the iteration continued): through the ONE
    // transition, whose arm for it HOLDs. The held phase stands.
    if (reading.kind === 'absent') {
      this.#transition(run, { kind: 'listing-gone' });
      return 'held';
    }
    // A row refreshes the held phase and releases NOTHING (a listing never releases, REWORK 10): a STALE row sets a phase
    // only when the handle holds none yet (never overwriting one), and an ordinary row replaces the status and the
    // waiting flag.
    this.#transition(run, { kind: 'listing', executionStatus: reading.executionStatus, awaitingInput: reading.awaitingInput, stale: reading.stale });
    return 'held';
  }

  /**
   * MAJOR (Main, 2026-11-25; REWORK 4, point 7): the run host's `exit`. The run host is never forked again (ADR-0002
   * consequence 1), so nothing it held can still dispatch — the externally started run is gone, its slot is released and
   * every open handle is closed with a terminal state. The HANDLES are KEPT: the caller holds them, and a handle must
   * answer its own end rather than vanish (the "orphan displacement must not lose a handle" minor).
   */
  abandonAll(): void {
    for (const run of this.#runs.values()) this.#transition(run, { kind: 'host-exit' });
    this.#holder = null;
  }

  /**
   * THE ONE LIFECYCLE TRANSITION (MAJOR A, 2026-11-25). Every way the product's own facts reach this surface — a
   * `publish.snapshot`, a `session.list` row, a terminal `run.result`, the run host's exit, the host's confirmation — is
   * turned into exactly one decision here, so a confirmation is recorded in one place, a phase's fields are replaced in
   * one place, and an END (the frozen answer and the released slot) is decided in one place and nowhere else.
   *
   * Order of the rules, and each is the positive proof it claims to be:
   *
   * 1. **A closed handle is closed** — with ONE exception (REWORK 7, MAJOR 3b): a late terminal `run.result` may ADD the
   *    product's own reason to an end that ended WITHOUT one (the terminal write publishes a status before the result, so
   *    the end can be frozen first with a null reason). It never overwrites a reason the surface COMPUTED
   *    (`agent_session_aborted`) — a computed reason is a positive statement — nor one already observed.
   * 2. **A confirmation is the host's `session.started`** — the positive proof the execution exists.
   * 3. **The phase's fields are held as ONE UNIT on the handle** (REWORK 7, MAJOR 3): a snapshot replaces the status, the
   *    waiting flag and the reason together; a listing row, which states NO reason, replaces the status and the waiting
   *    flag and LEAVES the reason (a row is silent about the reason, so it must not overwrite a known one with null).
   * 4. **An end needs a positive proof, and there are exactly THREE** (REWORK 10): a TERMINAL `run.result`, a TERMINAL
   *    `snapshot`, or the run host's exit. A listing — a row, a STALE row or an absent one — and the reconcile are
   *    OBSERVATIONS: they refresh the held phase at most and NEVER release, and a STALE row never overwrites a held phase.
   *    A PARK (`paused`, `paused_message_limit`, `awaiting_plan_decision`), with or without a reason, HOLDS — the run can
   *    resume the same iteration (REWORK 9) — which is the conservative direction REQ-MCP-126 asks for. A run whose
   *    terminal write failed therefore holds the slot until the host ends: named and accepted.
   */
  #transition(run: InboundRun, event: LifecycleEvent): TransitionOutcome {
    const nothing: TransitionOutcome = { newlyConfirmed: false, released: false };
    /*
     * Rule 1 with its REWORK 7 (MAJOR 3b) exception, TIGHTENED by REWORK 8 (MAJOR 5): a frozen (ended or refused) handle
     * is not touched by a late event — EXCEPT that a late terminal `run.result` completes an end which ended WITHOUT a
     * reason. The normal terminal path publishes the status BEFORE the result, so the end is frozen first with a null
     * reason, and the result then carries the product's own reason. The exception is NARROWER than round 7's: the result
     * must AGREE with the frozen end (its own status either absent or equal to the frozen one), because round 7 let a
     * `run.result` with a DIFFERING end status add its reason to a frozen end it did not describe — a foreign delivery
     * matched by session id alone could thus rewrite a closed handle's reason. A result that disagrees is ignored.
     */
    if (run.endState !== null) {
      const agrees = event.kind === 'result' && (event.executionStatus === null || event.executionStatus === run.endState.executionStatus);
      if (agrees && run.stopReason === null && !run.frozenReasonComputed) {
        run.stopReason = event.stopReason;
      }
      return nothing;
    }
    if (run.refusal !== null) return nothing;

    // Rule 2: the host confirmed the start — the execution exists. The handle was answered at the reservation, so this
    // is what turns `starting` into the product's live state; whether THIS call confirmed it is what the caller arms the
    // one reconcile on (MAJOR B).
    if (event.kind === 'confirmed') {
      run.hostSessionId = event.hostSessionId;
      const newlyConfirmed = !run.confirmed;
      run.confirmed = true;
      return { newlyConfirmed, released: false };
    }

    // Every other event is a state of the execution the surface has seen, so it CONFIRMS a held attempt: a state for the
    // attempt's session is positive evidence the execution exists (REWORK 4, point 6).
    const newlyConfirmed = !run.confirmed;
    run.confirmed = true;

    // Rule 4a: the run host's own exit. The host is never forked again, so nothing it held can still dispatch: the run
    // is over, and the frozen answer is terminal and not waiting. A phase reason already observed is kept; only when
    // none was is the engine's own reason for an unconfirmable completion COMPUTED here (and so marked as computed).
    if (event.kind === 'host-exit') {
      const observed = run.phase?.stopReason ?? null;
      this.#freeze(run, { executionStatus: 'stopped', awaitingInput: false }, observed ?? 'agent_session_aborted', observed === null);
      return { newlyConfirmed, released: true };
    }

    // Rule 4b (REWORK 10): an ABSENT listing proves NOTHING, so it releases NOTHING. A session missing from the listing is
    // an OBSERVATION, and after a failed terminal write the desktop can RE-OPEN the store and CONTINUE the open iteration
    // — the reviewer measured exactly this release as the blocker (`held → released → the next start admitted` while the
    // first run was still live). The reading states no phase, so the held phase STANDS and the slot is HELD. This is the
    // one place an absent reading is decided, and it decides to hold; the reason an unconfirmable completion carries
    // (`agent_session_aborted`) is now COMPUTED at the run host's exit alone.
    if (event.kind === 'listing-gone') return { newlyConfirmed, released: false };

    /*
     * Rule 4c: the `run.result` — terminal means the run is over and its own reason rides it (an absent reason is a null
     * reason, which a later result of a still-open handle could not contradict because the handle is closed by this).
     *
     * REWORK 10: the SAME terminal-status question decides it, so the parking special-case is gone (`isParkedStatus` is
     * no longer read anywhere). A result whose OWN status is a PARK, or any other non-terminal status, is NOT an end: a
     * desktop Pause writes `paused` + `user_cancelled` and ALSO delivers this result, and a Continue then resumes the
     * SAME open iteration — so the phase is recorded and the slot is HELD. A result whose status is ABSENT is a bare
     * terminal outcome (a repaired path), and keeps the terminal reading.
     */
    if (event.kind === 'result') {
      if (event.executionStatus !== null && !runHasEnded(event.executionStatus)) {
        run.phase = { executionStatus: event.executionStatus, awaitingInput: false, stopReason: event.stopReason };
        return { newlyConfirmed, released: false };
      }
      this.#freeze(run, { executionStatus: event.executionStatus ?? 'stopped', awaitingInput: false }, event.stopReason, false);
      return { newlyConfirmed, released: true };
    }

    /*
     * Rule 3 (REWORK 7, MAJOR 3; REWORK 8, MAJOR 3): the phase's status, waiting flag and reason, held as ONE UNIT on
     * the handle.
     *
     * - a SNAPSHOT states the reason the product holds, so it replaces all three (an ABSENT reason clears a prior phase's
     *   reason, which is what a resume needs).
     * - a LISTING row states NO reason at all, so it is SILENT about it: the status and the waiting flag are replaced and
     *   the reason is LEFT as it stands.
     * - a STALE row (busy with nothing running it, REQ-SESSION-171) is an OBSERVATION OF THE RECORD'S LIVENESS, not the
     *   run's state and NOT an end (REWORK 10): it releases NOTHING and never OVERWRITES a held phase (it sets one only
     *   when the handle holds none yet). It used to free the slot, and the reviewer measured the hole — a desktop can
     *   re-open the store after a failed terminal write and continue the same iteration, and the FIRST stale row then
     *   overwrote a stored park phase while the SECOND froze the handle and freed the slot. The held phase now STANDS
     *   across any number of stale rows, and the slot with it.
     */
    if (event.kind === 'listing') {
      /*
       * REWORK 10 — THE LISTING NEVER RELEASES THE SLOT, and a STALE row does not even refresh the held phase.
       *
       * The three release proofs are a terminal `publish.snapshot`, a terminal `run.result`, and the run host's exit.
       * The listing is an OBSERVATION and is not one of them. Rounds 4-9 released here on a STALE or absent row, and the
       * reviewer measured the hole: after a FAILED TERMINAL WRITE the desktop can RE-OPEN the store and CONTINUE the same
       * iteration, so a listing-driven release admitted a second start while the first run was still resumable. The park
       * guard did not save it either — the FIRST stale row overwrote the stored park phase and the SECOND froze-and-freed.
       * With the release gone, a STALE row (which states the RECORD's status and that nothing holds its lock,
       * REQ-SESSION-171 — not the run's state) must not OVERWRITE a held phase: a parked run whose record has gone stale
       * still reads `paused` to the caller, never the record's busy status. So a stale row sets a phase ONLY when the
       * handle holds none yet (a lost-reply attempt whose first evidence is a stale record still answers its status);
       * with a phase already held the stale row changes NOTHING and the slot is HELD. That makes the parking guard
       * unnecessary here and is exactly the conservative direction the brief names.
       *
       * An ordinary row refreshes the held phase: the status and the waiting flag TOGETHER, the reason LEFT as it stands
       * (a row states none). The accepted consequence of never releasing here: a run whose terminal write failed and
       * whose session never becomes terminal HOLDS the slot until the run host ends.
       */
      if (!event.stale || run.phase === null) {
        run.phase = { executionStatus: event.executionStatus, awaitingInput: event.awaitingInput, stopReason: run.phase?.stopReason ?? null };
      }
      return { newlyConfirmed, released: false };
    }
    run.phase = { executionStatus: event.executionStatus, awaitingInput: event.awaitingInput, stopReason: event.stopReason };
    /*
     * Rule 4d (REWORK 10): a TERMINAL SNAPSHOT status is the end — one of the exactly three release proofs. This arm is
     * reached by a `snapshot` event alone (a `listing` returned above), so a listing row never releases however it reads.
     * A PARK — every `paused` variant, `paused_message_limit`, the plan gate — HOLDS, with or without a reason: REWORK 9
     * made `runHasEnded` a TERMINAL-STATUS question alone, because no product field separates a resumable desktop pause
     * from the plan-gate cancel and both may be continued on the same iteration.
     */
    if (runHasEnded(event.executionStatus)) {
      this.#freeze(run, { executionStatus: event.executionStatus, awaitingInput: event.awaitingInput }, run.phase.stopReason, false);
      return { newlyConfirmed, released: true };
    }
    return { newlyConfirmed, released: false };
  }

  /** Freeze a run's end ONCE and release the slot if this run holds it (REWORK 4, point 4: one identity, one release). */
  #freeze(run: InboundRun, endState: FrozenEndState, reason: string | null, reasonComputed: boolean): void {
    if (run.endState !== null) return;
    run.endState = endState;
    run.refusal = null;
    run.stopReason = reason;
    run.frozenReasonComputed = reasonComputed;
    if (this.#holder === run.handle) this.#holder = null;
  }

  /**
   * MAJOR 2(a) (REQ-MCP-123/126, 2026-11-25): the still-open run for a session, so a caller that must arm the one
   * reconcile when a confirmation arrives by the EVENT path can name it. Same rule as `#runForSession`.
   */
  openRunForSession(sessionId: string): InboundRun | null {
    return this.#runForSession(sessionId);
  }

  /** The remembered run for a session, still open (neither ended nor refused), or null (REWORK 4, point 4). */
  #runForSession(sessionId: string): InboundRun | null {
    for (const run of this.#runs.values()) {
      if ((run.sessionId === sessionId || run.hostSessionId === sessionId) && run.endState === null && run.refusal === null) return run;
    }
    return null;
  }

  /**
   * REWORK 7 (MAJOR 3b): the FROZEN run for a session — the target of a late terminal `run.result` that completes an end
   * which was frozen WITHOUT a reason (the status was published before the result). Only a run whose end carries no reason
   * the surface COMPUTED is a candidate; one that already has an observed or computed reason is not (the transition
   * no-ops on it anyway, but this keeps the search honest — a completed handle is never rewritten).
   */
  #frozenRunForSession(sessionId: string): InboundRun | null {
    for (const run of this.#runs.values()) {
      if ((run.sessionId === sessionId || run.hostSessionId === sessionId) && run.endState !== null && run.stopReason === null && !run.frozenReasonComputed) return run;
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

/**
 * MINOR (REWORK 6, 2026-11-25): the cap on the one reconcile chain's steps. The chain releases on a definite reading and
 * re-arms while the run is live (so a terminal write that fails later is still caught), but it is BOUNDED: a run that
 * never resolves cannot schedule reads for the rest of the application's life. When the cap is reached the handle simply
 * returns to the ordinary paths — a live run stays held, and a later transition (snapshot, `run.result`, host exit) still
 * ends it. The figure is generous: one step per reconcile delay, so it covers a run of hours.
 */
export const RECONCILE_MAX_STEPS = 64;

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
   * MAJOR 2(a) (REQ-MCP-123/126, 2026-11-25); MAJOR B (REWORK 6, 2026-11-25): the runs whose one reconcile is already
   * armed, and how many steps each has run. A confirmation arrives on THREE paths (the start's own reply, the product's
   * `publish.snapshot`, and the ask-independent `rotaris_run_status` listing read), and arming the chain twice would put
   * two independent chains behind one run; this map makes the arming idempotent per session.
   *
   * MAJOR 2 (REWORK 10, 2026-11-25): the counter counts EVERY step and NOTHING resets it. Rounds 7-9 reset it on a fresh
   * observation, and the reviewer showed the escape: a listing row signs `stale` while a snapshot of the SAME phase signs
   * `stopReason`, so ALTERNATING the two sources reset the counter forever (after 192 steps a follow-up was still
   * planned). The reset is GONE; the chain exhausts at `RECONCILE_MAX_STEPS` whatever the sources do. That no longer
   * affects correctness — the chain cannot release anything (it is a pure phase refresh) — it only stops a periodic
   * refresh, and the STATUS path still refreshes on demand (`rotaris_run_status`).
   */
  const armed = new Map<string, { steps: number }>();

  /**
   * MAJOR (REWORK 4, point 6): the one reconcile, re-armed while the run is live. Each step reads the product state and
   * refreshes the held PHASE through `InboundSurfaceRuns.reconcile`; only a TERMINAL row ends the run there (as it does
   * on the status path). A STALE or absent reading proves NOTHING and holds, so the step simply re-arms until the cap.
   * The chain is bounded: it schedules at most `RECONCILE_MAX_STEPS` reads, counted straight through and never reset, so
   * a run that never resolves cannot schedule reads for the rest of the application's life. No clock and no observation
   * ever frees the slot; the chain cannot release.
   */
  const armReconcile = (workspaceId: string, sessionId: string): void => {
    const schedule = deps.schedule;
    if (schedule === undefined) return;
    if (armed.has(sessionId)) return;
    const state = { steps: 0 };
    armed.set(sessionId, state);
    /*
     * MAJOR 2 (REWORK 10): the counter is incremented per step and never cleared, so the cap is a hard bound under every
     * source pattern. A STALE or absent reading holds and re-arms; only a TERMINAL row (or the run's end elsewhere) ends
     * the chain. Hitting the cap leaves the handle to the ordinary paths (a later `snapshot`, `run.result`, host exit or
     * status read still settles it).
     */
    const step = (): void => {
      if (state.steps >= RECONCILE_MAX_STEPS) { armed.delete(sessionId); return; }
      state.steps += 1;
      schedule(() => {
        void deps.readStatus(workspaceId, sessionId).then((read) => {
          if (deps.runs.reconcile(sessionId, read) === 'held') step();
          else armed.delete(sessionId);
        });
      }, reconcileAfter);
    };
    step();
  };

  /**
   * MAJOR B (REWORK 6, 2026-11-25): ARM the one reconcile on ANY path that turns a handle into `confirmed`, from the
   * transition's own outcome. Called by every transition site (the start's reply, the late confirmation, the snapshot
   * event, the status listing read), so no confirmation can travel without arming it: a terminal-write failure after a
   * confirmation that came only through the listing would otherwise hold the slot for good.
   */
  const armOnConfirm = (run: InboundRun | null | undefined, outcome: TransitionOutcome | null): void => {
    if (run === null || run === undefined || outcome === null || !outcome.newlyConfirmed) return;
    // A transition that both confirmed and ENDED the run (a first snapshot that is already a cancel) needs no reconcile:
    // the run is already frozen and its slot is free.
    if (outcome.released) return;
    if (run.workspaceId === null) return;
    armReconcile(run.workspaceId, run.sessionId);
  };

  /**
   * REQ-MCP-126 (REWORK 4, points 2 and 5): the start is performed main-side, in the background, and its outcome is
   * recorded against the handle. A DEFINITE refusal releases the slot and is kept with the handle; a NO-REPLY
   * (`run-host.unreachable`) and an unexpected reply prove nothing — the host may still be starting the run — so the slot
   * is HELD and the run's own end (or the product's state for that session) settles it.
   *
   * BLOCKER (REQ-MCP-126, 2026-11-25): the confirmation is caught the moment the run host answers it — `onStarted` runs
   * inside `startSessionRun` BEFORE the post-work (`clearForRunStart`, `configFatal.loaded`) and before anything else
   * that can throw. A throw after that moment cannot be read as "no run was born", so the slot is HELD rather than freed:
   * freeing on an unclear failure is exactly how two runs come to exist.
   *
   * MAJOR 1 (REQ-MCP-123/126, 2026-11-25): `onLateOutcome` receives a reply that arrived AFTER main's bound (the link
   * would otherwise discard it), so a later DEFINITIVE refusal still settles the handle instead of stranding it.
   */
  const finishStart = async (handle: string, sessionId: string, open: { readonly workspaceId: string; readonly workspace: string }, prompt: string): Promise<void> => {
    /** The session the host confirmed, once it has — the positive proof that this attempt IS a run. */
    let confirmedSessionId: string | null = null;
    const onStarted = (startedId: string): void => {
      confirmedSessionId = startedId;
      const outcome = deps.runs.committed(handle, startedId);
      if (outcome.newlyConfirmed) armReconcile(open.workspaceId, startedId);
    };
    const onLateOutcome = (reply: ProcessReply): void => {
      if (confirmedSessionId !== null) return;
      if (reply.kind === 'session.started') { onStarted(reply.sessionId); return; }
      if (reply.kind === 'refused' && isDefiniteStartRefusal(reply.code)) {
        deps.runs.refuse(handle, { code: reply.code, headline: reply.headline, ...(reply.detail === undefined ? {} : { detail: reply.detail }) });
      }
      // Anything else — a no-reply, an unexpected reply — proves nothing, so the attempt stays held.
    };
    try {
      // REQ-MCP-124: the ordinary start, through the SAME main-side coordinator a desktop start uses — no authority
      // field is set here, and the workspace is the open one. BLOCKER B: the inbound path sets its OWN bound, above the
      // run host's credential lease, so a healthy-but-slow host is not read as a no-reply in the first place.
      const outcome = await startSessionRun(deps.start, { workspaceId: open.workspaceId, workspaceRoot: open.workspace, prompt, sessionId, hostStartBoundMs: startBound, onStarted, onLateOutcome });
      if (!outcome.ok) {
        // BLOCKER: only a DEFINITE refusal (`isDefiniteStartRefusal`) proves no run exists. The generic host error
        // `request.failed`, a no-reply and an unexpected reply all prove nothing, so the attempt is HELD.
        if (!isDefiniteStartRefusal(outcome.code)) {
          deps.runs.held(handle);
          return;
        }
        deps.runs.refuse(handle, { code: outcome.code, headline: outcome.headline, ...(outcome.detail === undefined ? {} : { detail: outcome.detail }) });
        return;
      }
      const started = (outcome.value as { sessionId: string }).sessionId;
      // `onStarted` normally did this already; this covers a start that answered without running the seam.
      if (confirmedSessionId === null) {
        const transition = deps.runs.committed(handle, started);
        if (transition.newlyConfirmed) armReconcile(open.workspaceId, started);
      }
    } catch {
      /*
       * BLOCKER (REQ-MCP-126, 2026-11-25): a throw proves NOTHING about whether a run was born, so the slot is HELD.
       * When the confirmation was already seen the run for certain exists — the one reconcile is armed for it here, so a
       * terminal write that failed is still covered.
       */
      if (confirmedSessionId !== null) armReconcile(open.workspaceId, confirmedSessionId);
      deps.runs.held(handle);
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
    /*
     * MINOR (REQ-MCP-123, 2026-11-25): a handle that has DEFINITELY been refused or has ENDED is answered from what is
     * already known, BEFORE the listing read. Such a handle needs no listing at all, and waiting on one let a refusal or
     * an end that arrived meanwhile be missed by this very call, which then kept answering `starting`.
     */
    if (first.refusal !== null) return { kind: 'refused', code: first.refusal.code, headline: first.refusal.headline, ...(first.refusal.detail === undefined ? {} : { detail: first.refusal.detail }) };
    if (first.endState !== null) return { kind: 'inbound.runStatus', status: endedStatus(first) };
    /*
     * REQ-MCP-123/126 (REWORK 4, point 8): a second, ask-INDEPENDENT path to the attempt's outcome. The product's own state
     * for the minted session is read here; a state for it is positive evidence the execution exists, so a held attempt
     * settles by this read whether or not the caller ever asked again.
     */
    const read = await deps.readStatus(first.workspaceId ?? '', first.sessionId);
    /*
     * MAJOR B (REWORK 6, 2026-11-25): the ask-independent read goes through the SAME transition (`observeListing`), and
     * an outcome that CONFIRMS the run arms the one reconcile — exactly as a `publish.snapshot` or the start's own reply
     * does. Round 5 dropped `observe`'s answer here, so a confirmation that arrived ONLY through this listing left the
     * reconcile unarmed and a failed terminal write could hold the slot for good.
     */
    if (read.kind === 'row') armOnConfirm(first, deps.runs.observeListing(first.sessionId, { executionStatus: read.executionStatus, awaitingInput: read.awaitingInput, stale: read.stale }));
    const now = deps.runs.byHandle(handle) ?? first;
    // MINOR (REQ-MCP-123): the same guard AFTER the read — a refusal or an end that landed while the listing was being
    // read is stated now, rather than being overtaken by this call's `starting`.
    if (now.refusal !== null) return { kind: 'refused', code: now.refusal.code, headline: now.refusal.headline, ...(now.refusal.detail === undefined ? {} : { detail: now.refusal.detail }) };
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
    /*
     * MAJOR 3 (REWORK 8, 2026-11-25): the status is composed EXCLUSIVELY from the ONE phase the handle holds, and from
     * NO second source. A row that just went through `observeListing` has already replaced the handle's status and
     * waiting flag (and LEFT its reason); reading `read.executionStatus`/`read.awaitingInput` here again was the second
     * source that REWORK 7 left in place. The handle's phase is the whole answer; when the read was not a row, the phase
     * the handle last saw stands. Only a handle that has NEVER seen a state has nothing to answer.
     */
    const phase = now.phase;
    if (phase === null) return { kind: 'refused', code: 'inbound.run-unreadable', headline: 'The run’s state could not be read' };
    const status: InboundRunStatus = {
      run: handle,
      sessionId: now.sessionId,
      state: presentationStatus(phase.executionStatus),
      /*
       * REQ-MCP-123 (BLOCKER D; MAJOR 1, REWORK 9): a stop reason belongs to a run that has ENDED. This handle's slot is
       * still HELD (the `endState !== null` case above returned already), so — even when the hold is a park the product
       * labelled `paused`/`user_cancelled` — the run has not stopped and the answer carries NO reason. Reporting the
       * phase's parked reason here is what made the text say `it stopped` for a held slot (MAJOR 1).
       */
      stopReason: null,
      awaitingInput: phase.awaitingInput,
    };
    return { kind: 'inbound.runStatus', status };
  };

  return {
    runs: deps.runs,
    surface: { startRun, runStatus },
    ask: async (ask: InboundListenerAsk): Promise<InboundStartRunAnswer | InboundRunStatusAnswer> => (ask.kind === 'inbound.startRun' ? startRun(ask.prompt) : runStatus(ask.run)),
    /*
     * MAJOR 2(a) (REQ-MCP-123/126, 2026-11-25); MAJOR B (REWORK 6, 2026-11-25): a `publish.snapshot` that CONFIRMS an
     * attempt arms the one reconcile too — through the ONE transition, whose outcome says whether THIS call confirmed it.
     * A start whose reply was lost still becomes `confirmed` by this event path, and without arming here a terminal write
     * that fails afterwards would leave the slot occupied for good.
     */
    observeSnapshot: (sessionId, state) => {
      const run = deps.runs.openRunForSession(sessionId);
      armOnConfirm(run, deps.runs.observe(sessionId, state));
    },
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
 * set without a `run.result` — settles the slot and hands its reason to the handle. Answers the run whose confirmation
 * this state is, or null.
 */
export function inboundRunObserved(runs: InboundSurfaceRuns, sessionId: string, state: ObservedState): TransitionOutcome | null {
  return runs.observe(sessionId, state);
}

/**
 * MAJOR (Main, 2026-11-25; REWORK 4, point 7): the run host's `exit`. Main wires this to `runHostChild.on('exit')`, so a
 * crash that took the externally started run with it releases the surface's one-run slot instead of locking the surface
 * for the rest of the application. The run host is never forked again, so no dispatch can still reach a replacement host.
 */
export function inboundRunHostExited(runs: InboundSurfaceRuns): void {
  runs.abandonAll();
}
