import type { Actor, BoardAction, ColumnToken, DeliveryColumn, Lifecycle, Reachability, Refusal, ReqId, TransitionOutcome } from '@rotaris/contracts';
import { BOARD_ACTIONS, DELIVERY_COLUMNS } from '@rotaris/contracts';
import { toIsoUtc, type Result, type WallClock } from '@rotaris/kernel';
import { DeliveryDal, type DeliveryRecord, type StoreHandle } from '@rotaris/store';
import type { QueueSettingsHolder } from './handles.js';

/**
 * The engine's ONE transition function (Part AK; ADR-0041 "There is one writer of this store — the engine's
 * transition function, reached through the writer handle and from nowhere else"; REQ-TRACE-382..396, 399..405).
 *
 * Two halves, deliberately separable: `decide` is PURE — it takes what the store recorded and what the engine
 * knows about the requirement now, and answers with the move or the refusal in the engine's own words — and
 * `createTransitions` binds the decision to the one DAL transaction. Reachability (REQ-TRACE-391..395) is `decide`
 * asked without writing, so the board can never offer a move the engine would refuse or withhold one it would
 * grant (REQ-TRACE-394: "the board SHALL hold no table of its own describing which transitions are permitted").
 *
 * The three fixed columns REQ-TRACE-384 names: the first column is `backlog`, the released column is `ready`, the
 * terminal column is `done`. `running` is entered by the system alone (REQ-TRACE-392) through `recordRunStarted`.
 */

const FIRST: DeliveryColumn = 'backlog';
const RELEASED: DeliveryColumn = 'ready';
const TERMINAL: DeliveryColumn = 'done';

/** What the store recorded for a requirement, or the absence of a record (every card starts in the first column). */
export interface DeliveryState {
  readonly column: ColumnToken;
  readonly returnTo: DeliveryColumn | null;
  readonly snapshotHash: string | null;
  readonly snapshotAt: string | null;
  readonly acceptedHash: string | null;
  readonly acceptedAt: string | null;
  readonly units: number;
}
export const NO_RECORD: DeliveryState = Object.freeze({ column: FIRST, returnTo: null, snapshotHash: null, snapshotAt: null, acceptedHash: null, acceptedAt: null, units: 0 });

/** What the engine knows about the requirement at the instant of the action (REQ-TRACE-405's "that requirement's hash at that instant"). */
export interface RequirementNow {
  readonly id: ReqId;
  readonly canonicalHash: string;
  readonly lifecycle: Lifecycle;
  readonly isEpic: boolean;
}

export interface TransitionOptions {
  readonly target?: ColumnToken;
  readonly payload?: Readonly<Record<string, string>>;
  /**
   * What the transition entails technically, run BETWEEN admission and the commit while the requirement is in flight
   * (REQ-TRACE-387/388): Part AP's worktree provisioning and the run start live here. A rejection here refuses the
   * action with its message and writes nothing.
   */
  readonly beforeCommit?: (decision: { readonly from: ColumnToken; readonly to: ColumnToken; readonly startsRun: boolean }) => Promise<void | BeforeCommitOutcome>;
}
/**
 * Part AP — what `beforeCommit` hands back: the worktree a run-starting action provisioned (REQ-TRACE-464 "the run
 * SHALL take over the worktree already provisioned for it"), written as its row the way `recordRunStarted` writes one.
 */
export interface BeforeCommitOutcome { readonly worktree?: { readonly ref: string; readonly unit: string; readonly path: string; readonly branch: string } }

/** REQ-TRACE-383's four classifications, as data so a completeness sweep is over the closed set. */
export const ACTION_CLASS: Readonly<Record<BoardAction, { readonly changesState: boolean; readonly transition: boolean; readonly startsRun: boolean; readonly confirm: boolean }>> = Object.freeze({
  'release': { changesState: true, transition: true, startsRun: true, confirm: true },
  'return': { changesState: true, transition: true, startsRun: false, confirm: false },
  'accept': { changesState: true, transition: true, startsRun: false, confirm: true },
  'rerun': { changesState: true, transition: true, startsRun: true, confirm: true },
  'send-back': { changesState: true, transition: true, startsRun: true, confirm: true },
  'reject': { changesState: true, transition: true, startsRun: false, confirm: false },
  'hold': { changesState: true, transition: true, startsRun: false, confirm: false },
  'resume': { changesState: true, transition: true, startsRun: false, confirm: false },
  'answer-blocker': { changesState: true, transition: true, startsRun: false, confirm: false },
  'edit': { changesState: true, transition: false, startsRun: false, confirm: false },
  'create': { changesState: true, transition: false, startsRun: false, confirm: false },
  'accept-proposal': { changesState: true, transition: false, startsRun: false, confirm: true },
  'accept-change-work': { changesState: true, transition: false, startsRun: false, confirm: true },
  'keep-worktree': { changesState: false, transition: false, startsRun: false, confirm: false },
});

/** REQ-TRACE-389: exactly one consequence sentence per action, stated before it happens. */
export const CONSEQUENCE: Readonly<Record<BoardAction, string>> = Object.freeze({
  'release': 'Releasing takes a snapshot of the specification, splits it into execution units and begins work inside a worktree of its own.',
  'return': 'Returning moves the requirement back to the first column and discards nothing already run.',
  'accept': 'Accepting records the delivered specification version; it is refused unless every completion condition holds.',
  'rerun': 'Re-running starts from the current specification on a new branch and keeps the previous branch and worktree.',
  'send-back': 'Sending the agent back places what you wrote into the context given to the following run.',
  'reject': 'Rejecting returns the requirement to ready while keeping the unit branches and worktrees for inspection.',
  'hold': 'Holding blocks the requirement with your stated reason and schedules nothing until it clears.',
  'resume': 'Resuming puts the requirement back into the state it was blocked out of — or, where that was a running state, into the released state, because asserting that a run is under way is something only the system may do; returning to the released state starts the work again, with the queue deciding when.',
  'answer-blocker': 'Answering a blocker stores the answer, hands it back to the engine and lets the flow pick up at the point it halted.',
  'edit': "Editing writes back into the project's own artifact; a delivered requirement then needs an update.",
  'create': "Creating follows the chosen source's own identifier and location conventions.",
  'accept-proposal': "Accepting a proposal creates a permanent technical requirement in the project's own store with its origin link, unlike an execution unit, which outlives nothing.",
  'accept-change-work': 'Accepting change-work carries out what the analysis concluded; nothing runs until you accept.',
  'keep-worktree': 'Keeping the worktree leaves the requirement where it is.',
});

/** REQ-TRACE-392: the glyphs the engine supplies, so the picker never authors its own. */
export const GLYPH = Object.freeze({ reachable: '→', refused: '⊘' });

export interface Decision {
  readonly from: ColumnToken;
  readonly to: ColumnToken;
  readonly startsRun: boolean;
  readonly writes: boolean;
  readonly next: DeliveryState;
  readonly reason: string | null;
  readonly blocker?: { readonly kind: 'stated' | 'run-failure'; readonly reason: string; readonly runUnit: string | null };
  readonly answersBlockers: boolean;
  readonly answer?: string;
}

/**
 * The pure decision. Every refusal names the unmet condition and, where a move was asked for, what the source
 * column can reach (REQ-TRACE-391's "including its enumeration of what the source column can reach").
 */
export function decide(state: DeliveryState, now: RequirementNow, action: BoardAction, actor: Actor, opts: { readonly target?: ColumnToken; readonly payload?: Readonly<Record<string, string>>; readonly at: string; readonly probe?: boolean }): Result<Decision, Refusal> {
  const from = state.column;
  const id = now.id;
  // A probe (reachability asking about one target) does not enumerate the others: that enumeration is what asks it.
  const refuse = (reason: string): Result<Decision, Refusal> => ({ ok: false, error: opts.probe ? { reason } : { reason, reachable: reachableTargets(state, now, actor, opts.at) } });
  const move = (to: ColumnToken, next: Partial<DeliveryState>, extra: Partial<Decision> = {}): Result<Decision, Refusal> => ({
    ok: true,
    value: { from, to, startsRun: false, writes: true, next: { ...state, ...next, column: to }, reason: null, answersBlockers: false, ...extra },
  });
  if (now.isEpic && ACTION_CLASS[action].transition) return refuse(`${id} is an epic: it groups its children and offers no delivery action of its own (REQ-TRACE-284).`);
  if (opts.target !== undefined && opts.target === from && action !== 'keep-worktree') return refuse(`${id} is already in ${from}; a move needs a different column.`);

  switch (action) {
    case 'release': {
      if (from !== FIRST && from !== 'needs-update') return refuse(`${id} cannot be released from ${from}: release moves a requirement from ${FIRST} or needs-update to ${RELEASED}.`);
      if (opts.target !== undefined && opts.target !== RELEASED) return refuse(`Release moves ${id} to ${RELEASED}, not to ${opts.target}.`);
      if (now.lifecycle === 'deprecated') return refuse(`${id} is deprecated and cannot be released.`);
      return move(RELEASED, { snapshotHash: now.canonicalHash, snapshotAt: opts.at }, { startsRun: true });
    }
    case 'return': {
      if (from !== RELEASED) return refuse(`${id} cannot be returned from ${from}: return moves a requirement from ${RELEASED} to ${FIRST}.`);
      if (opts.target !== undefined && opts.target !== FIRST) return refuse(`Return moves ${id} to ${FIRST}, not to ${opts.target}.`);
      return move(FIRST, {});
    }
    case 'accept': {
      if (from !== 'review') return refuse(`${id} is not awaiting a review decision: it is in ${from}.`);
      if (opts.target !== undefined && opts.target !== TERMINAL) return refuse(`Accept moves ${id} to ${TERMINAL}, not to ${opts.target}.`);
      // REQ-TRACE-399/402: the terminal state is unreachable without the delivering run's snapshot, and unreachable
      // when the text moved since that snapshot. THIS is the comparison the writer declares (`comparesSpecificationHash`).
      if (state.snapshotHash === null) return refuse(`${id} has no delivering run's snapshot recorded; the terminal state cannot be entered without one.`);
      if (state.snapshotHash !== now.canonicalHash) return refuse(`The specification of ${id} changed since the snapshot its run was taken against (snapshot ${short(state.snapshotHash)}, now ${short(now.canonicalHash)}); re-run the unit against the current text or send the agent back.`);
      return move(TERMINAL, { acceptedHash: now.canonicalHash, acceptedAt: opts.at });
    }
    case 'rerun': {
      if (from !== 'review' && from !== TERMINAL && from !== 'needs-update') return refuse(`${id} cannot be re-run from ${from}: re-run starts a new unit from review, ${TERMINAL} or needs-update.`);
      if (opts.target !== undefined && opts.target !== RELEASED) return refuse(`Re-run moves ${id} to ${RELEASED}, not to ${opts.target}.`);
      return move(RELEASED, { snapshotHash: now.canonicalHash, snapshotAt: opts.at }, { startsRun: true });
    }
    case 'send-back': {
      if (from !== 'review') return refuse(`${id} is not awaiting a review decision: it is in ${from}.`);
      if (opts.target !== undefined && opts.target !== RELEASED) return refuse(`Send back moves ${id} to ${RELEASED}, not to ${opts.target}.`);
      const instructions = (opts.payload?.['instructions'] ?? '').trim();
      // REQ-TRACE-423: an empty instruction is refused with the reason the requirement gives.
      if (instructions === '') return refuse('Sending the agent back needs instructions: the text is what the next run will receive, and submitting nothing would simply repeat the previous run unaltered.');
      return move(RELEASED, { snapshotHash: now.canonicalHash, snapshotAt: opts.at }, { startsRun: true, reason: instructions });
    }
    case 'reject': {
      if (from !== 'review') return refuse(`${id} is not awaiting a review decision: it is in ${from}.`);
      if (opts.target !== undefined && opts.target !== RELEASED) return refuse(`Reject moves ${id} to ${RELEASED}, not to ${opts.target}.`);
      return move(RELEASED, {}, { reason: (opts.payload?.['reason'] ?? '').trim() || null });
    }
    case 'hold': {
      if (from === 'blocked') return refuse(`${id} is already blocked; resume it or answer its blocker.`);
      if (opts.target !== undefined && opts.target !== 'blocked') return refuse(`Hold moves ${id} to blocked, not to ${opts.target}.`);
      const reason = (opts.payload?.['reason'] ?? '').trim();
      if (reason === '') return refuse(`Holding ${id} needs a stated reason: the block is recorded with it and shown until it clears.`);
      // REQ-TRACE-233: the origin state is recorded; REQ-TRACE-463: a run-time block returns to the released state.
      return move('blocked', { returnTo: from === 'running' ? RELEASED : from }, { reason, blocker: { kind: 'stated', reason, runUnit: null } });
    }
    case 'resume':
    case 'answer-blocker': {
      if (from !== 'blocked') return refuse(`${id} is not blocked: it is in ${from}, and there is nothing to ${action === 'resume' ? 'resume' : 'answer'}.`);
      const back = state.returnTo;
      if (back === null) return refuse(`${id} is blocked but records no state to return to; nothing can be resumed.`);
      const to: DeliveryColumn = back === 'running' ? RELEASED : back;
      // REQ-TRACE-395/453: a blocked card is offered exactly one target, the recorded one, and the surface never chooses it.
      if (opts.target !== undefined && opts.target !== to) return refuse(`${id} was blocked out of ${to} and returns there and nowhere else, not to ${opts.target}.`);
      const answer = action === 'answer-blocker' ? (opts.payload?.['option'] ?? opts.payload?.['answer'] ?? '').trim() : 'resume';
      if (action === 'answer-blocker' && answer === '') return refuse(`Answering the blocker on ${id} needs the chosen option; nothing was recorded.`);
      // REQ-TRACE-386/463: dispatch iff the return is to the released state.
      return move(to, { returnTo: null }, { startsRun: to === RELEASED, answersBlockers: true, answer, reason: action === 'answer-blocker' ? answer : null });
    }
    case 'edit':
    case 'create': {
      // Part AP — REQ-TRACE-383: the two source-writing actions write a record and are not transitions. The write into the
      // project's own artifact is `requirements.source.write`'s (REQ-TRACE-434/439); it records the action HERE, after the
      // file is written, with the summary the audit keeps (REQ-TRACE-405). The wave-1 refusal ("… which Part AP builds and
      // this build does not offer") is retired; its pin in transition.test.ts went with it.
      const summary = (opts.payload?.['summary'] ?? '').trim();
      if (summary === '') return refuse(`${action === 'edit' ? 'Editing' : 'Creating'} ${id} records a summary of what was written into the source; none was given, so nothing was recorded.`);
      return move(from, {}, { reason: summary });
    }
    case 'accept-proposal':
    case 'accept-change-work':
      // Stated refusal: OQ-45 — no decision owns the improvement store's write path; the plan lists both as refusals.
      return refuse(`${action === 'accept-proposal' ? 'Accepting a proposed technical requirement' : 'Accepting change-work'} needs the improvement store, which has no owning decision yet (OQ-45); nothing was written.`);
    case 'keep-worktree':
      // REQ-TRACE-383: explicitly does nothing and reports as much.
      return { ok: true, value: { from, to: from, startsRun: false, writes: false, next: state, reason: null, answersBlockers: false } };
  }
}

/** REQ-TRACE-385's table read backwards: which action a (source, target) pair means, or none. */
export function actionFor(from: ColumnToken, to: ColumnToken, state: DeliveryState): BoardAction | undefined {
  if (from === to) return undefined;
  if (to === 'blocked') return 'hold';
  if (from === 'blocked') return 'resume';
  if ((from === FIRST || from === 'needs-update') && to === RELEASED) return 'release';
  if (from === RELEASED && to === FIRST) return 'return';
  if (from === 'review' && to === TERMINAL) return 'accept';
  if (from === 'review' && to === RELEASED) return 'send-back';
  void state;
  return undefined;
}

/** REQ-TRACE-391..395: the engine's answer for one (source, target) pair, in its own words, with its glyph. */
export function reachability(state: DeliveryState, now: RequirementNow, from: ColumnToken, to: ColumnToken, actor: Actor, at: string): Reachability {
  const reachableFromSource = reachableTargets(state, now, actor, at);
  const refused = (reason: string): Reachability => ({ reachable: false, confirm: false, reason, glyph: GLYPH.refused, reachableFromSource });
  if (from !== state.column) return refused(`${now.id} is in ${state.column}, not ${from}; the board is behind the engine.`);
  if (to === 'running') return refused(`Only the system places a requirement into a run; ${from} can reach: ${list(reachableFromSource)}.`);
  const action = actionFor(from, to, state);
  if (action === undefined) return refused(`${now.id} cannot move from ${from} to ${to}: no board action makes that move. From ${from} it can reach: ${list(reachableFromSource)}.`);
  const d = decide(state, now, action, actor, { target: to, at, payload: PROBE_PAYLOAD, probe: true });
  if (!d.ok) return refused(d.error.reason);
  return { reachable: true, consequence: CONSEQUENCE[action], confirm: ACTION_CLASS[action].confirm, glyph: GLYPH.reachable, reachableFromSource };
}

/** A payload that satisfies every "needs a stated X" precondition, so reachability answers about the MOVE and not about a form nobody has filled in yet. */
const PROBE_PAYLOAD: Readonly<Record<string, string>> = Object.freeze({ reason: '(reason)', instructions: '(instructions)', option: '(option)' });

function reachableTargets(state: DeliveryState, now: RequirementNow, actor: Actor, at: string): DeliveryColumn[] {
  const out: DeliveryColumn[] = [];
  for (const to of DELIVERY_COLUMNS) {
    if (to === state.column || to === 'running') continue;
    const action = actionFor(state.column, to, state);
    if (action === undefined) continue;
    const d = decide(state, now, action, actor, { target: to, at, payload: PROBE_PAYLOAD, probe: true });
    if (d.ok) out.push(to);
  }
  return out;
}

function list(cols: readonly DeliveryColumn[]): string {
  return cols.length === 0 ? 'nothing' : cols.join(', ');
}
function short(hash: string): string {
  return hash.slice(0, 8);
}
/** REQ-TRACE-405: an action by a person is distinguishable from one by the scheduler or an agent, in the stored actor itself. */
export function actorLabel(actor: Actor): string {
  return actor.kind === 'user' ? `user:${actor.person}` : 'system';
}
export function parseActor(label: string): Actor {
  return label.startsWith('user:') ? { kind: 'user', person: label.slice(5) } : { kind: 'system' };
}

/** The `TransitionOutcome` the seam names. `historyEntry` is 0 exactly when nothing was written (`keep-worktree`). */
export type TransitionResult = Result<TransitionOutcome, Refusal>;

/** What the bound transition needs from its caller per call: the store's state and the engine's view of the requirement. */
export interface TransitionContext {
  readonly now: RequirementNow;
}

export interface DeliveryTransitions {
  transition(id: ReqId, action: BoardAction, actor: Actor, ctx: TransitionContext, opts?: TransitionOptions): Promise<TransitionResult>;
  /** REQ-TRACE-464: the system's move into `running`, the run row and its session id in ONE transaction. */
  recordRunStarted(id: ReqId, unit: string, sessionId: string | null, worktree: { readonly ref: string; readonly path: string; readonly branch: string } | null, permissions: string, ctx: TransitionContext): TransitionResult;
  /** The system's move out of `running`: `completed` → review; `failed` / `interrupted` → blocked (run-failure, returns to ready); `cancelled` → ready. */
  recordRunEnded(id: ReqId, unit: string, outcome: 'completed' | 'failed' | 'interrupted' | 'cancelled', detail: string, ctx: TransitionContext): TransitionResult;
  /** Part AP — REQ-TRACE-407/437: the pass's own move OUT of the terminal state when the accepted hash no longer matches; nothing when it does. */
  recordSpecificationMoved(id: ReqId, ctx: TransitionContext): TransitionResult;
  /** Part AP — REQ-TRACE-466/477: the stage a live unit reports (`waiting on a person`, or null); a run-row fact, no delivery state. */
  recordRunStage(id: ReqId, unit: string, stage: string | null): void;
  answerBlocker(id: ReqId, option: string, actor: Actor, ctx: TransitionContext): Promise<TransitionResult>;
  setQueue(automatic: boolean, concurrency: number): void;
  readonly inFlight: ReadonlySet<ReqId>;
}

export function stateOf(record: DeliveryRecord | undefined): DeliveryState {
  if (!record) return NO_RECORD;
  return {
    column: record.state as ColumnToken,
    returnTo: (record.returnTo as DeliveryColumn | null) ?? null,
    snapshotHash: record.snapshotHash,
    snapshotAt: record.snapshotAt,
    acceptedHash: record.acceptedHash,
    acceptedAt: record.acceptedAt,
    units: record.units,
  };
}

/**
 * Bind the decision to the store. This is the ONLY place a delivery row is written in the product; the DAL it holds
 * is private to this closure and appears in no other module's constructor (ADR-0041 "the database handle is held
 * privately by the engine"; `guard.test.ts` asserts it over the module graph).
 *
 * Single-flight per requirement (REQ-TRACE-388) is an ADMISSION check here, not a store lock: a second action on a
 * requirement with one in flight is refused with the stated reason and writes nothing, while actions on different
 * requirements are never bounded.
 */
export function createTransitions(db: StoreHandle, deps: { readonly wall: WallClock; readonly workspaceKey: string; readonly historyLimit?: number; readonly queue: QueueSettingsHolder }): DeliveryTransitions {
  const dal = new DeliveryDal(db);
  const inFlight = new Set<ReqId>();
  const at = () => toIsoUtc(deps.wall.instant());

  const currentState = (id: ReqId): Result<DeliveryState, Refusal> => {
    const row = dal.read(id);
    if (row === undefined) return { ok: true, value: NO_RECORD };
    if (row.kind === 'record') return { ok: true, value: stateOf(row.record) };
    // REQ-CONFIG-192: a record this build cannot interpret is neither rewritten nor deleted, so it cannot be transitioned either.
    return { ok: false, error: { reason: row.kind === 'unsupported' ? `The delivery record of ${id} carries schema version ${row.version}, which this build does not support; it is left as it is.` : `The delivery record of ${id} carries an unreadable schema version; it is left as it is.` } };
  };

  const commit = (id: ReqId, d: Decision, action: string, actor: Actor, hash: string, stamp: string, extras: { runStart?: { unit: string; sessionId: string | null; worktreeRef: string | null; permissions: string }; runEnd?: { unit: string; status: string; outcome: string } } = {}): TransitionOutcome => {
    if (!d.writes) return { id, from: d.from, to: d.to, startsRun: false, historyEntry: 0 };
    const record: DeliveryRecord = { schemaVersion: 1, state: d.next.column, returnTo: d.next.returnTo, acceptedHash: d.next.acceptedHash, snapshotHash: d.next.snapshotHash, snapshotAt: d.next.snapshotAt, acceptedAt: d.next.acceptedAt, updatedAt: stamp, units: d.next.units };
    const out = dal.transition({
      id, record,
      entry: { at: stamp, action, actor: actorLabel(actor), from: d.from, to: d.to, hash, reason: d.reason, override: false },
      ...(deps.historyLimit === undefined ? {} : { historyLimit: deps.historyLimit }),
      ...(extras.runStart ? { runStart: extras.runStart } : {}),
      ...(extras.runEnd ? { runEnd: extras.runEnd } : {}),
      ...(d.blocker ? { raiseBlocker: { kind: d.blocker.kind, reason: d.blocker.reason, options: [], blockingIds: [], runUnit: d.blocker.runUnit } } : {}),
      ...(d.answersBlockers ? { answerBlockers: { answer: d.answer ?? 'resume' } } : {}),
    });
    return { id, from: d.from, to: d.to, startsRun: d.startsRun, historyEntry: out.seq };
  };

  const transitions: DeliveryTransitions = {
    inFlight,
    async transition(id, action, actor, ctx, opts = {}) {
      if (!BOARD_ACTIONS.includes(action)) return { ok: false, error: { reason: `${String(action)} is not a board action.` } };
      if (inFlight.has(id)) return { ok: false, error: { reason: `An action on ${id} is already in flight; wait for it to settle before starting another (REQ-TRACE-388).` } };
      const state = currentState(id);
      if (!state.ok) return state;
      const stamp = at();
      const d = decide(state.value, ctx.now, action, actor, { ...(opts.target === undefined ? {} : { target: opts.target }), ...(opts.payload === undefined ? {} : { payload: opts.payload }), at: stamp });
      if (!d.ok) return d;
      inFlight.add(id);
      try {
        if (opts.beforeCommit) {
          let entailed: void | BeforeCommitOutcome;
          try { entailed = await opts.beforeCommit({ from: d.value.from, to: d.value.to, startsRun: d.value.startsRun }); } catch (e) { return { ok: false, error: { reason: e instanceof Error ? e.message : String(e) } }; }
          // Part AP: the provisioned worktree's row, written the way `recordRunStarted` writes its own (beside the transaction, keyed by ref).
          if (entailed?.worktree) dal.upsertWorktree({ ref: entailed.worktree.ref, id, unit: entailed.worktree.unit, path: entailed.worktree.path, branch: entailed.worktree.branch, createdAt: stamp, kept: false });
        }
        return { ok: true, value: commit(id, d.value, action, actor, ctx.now.canonicalHash, stamp) };
      } finally {
        inFlight.delete(id);
      }
    },
    recordRunStarted(id, unit, sessionId, worktree, permissions, ctx) {
      const state = currentState(id);
      if (!state.ok) return state;
      const s = state.value;
      if (s.column !== RELEASED && s.column !== 'running') return { ok: false, error: { reason: `${id} is in ${s.column}; a run starts only from ${RELEASED}.` } };
      const stamp = at();
      if (worktree) dal.upsertWorktree({ ref: worktree.ref, id, unit, path: worktree.path, branch: worktree.branch, createdAt: stamp, kept: false });
      const d: Decision = { from: s.column, to: 'running', startsRun: false, writes: true, next: { ...s, column: 'running', units: s.units + 1 }, reason: `run started: unit ${unit}${sessionId ? ` (session ${sessionId})` : ''}`, answersBlockers: false };
      return { ok: true, value: commit(id, d, 'run-started', { kind: 'system' }, ctx.now.canonicalHash, stamp, { runStart: { unit, sessionId, worktreeRef: worktree?.ref ?? null, permissions } }) };
    },
    recordRunEnded(id, unit, outcome, detail, ctx) {
      const state = currentState(id);
      if (!state.ok) return state;
      const s = state.value;
      const stamp = at();
      const status = outcome;
      const runEnd = { unit, status, outcome: detail };
      if (s.column !== 'running') {
        // The run row settles even when the requirement has moved on (a hold during the run, REQ-TRACE-463): nothing else changes.
        dal.recordRunEnded({ id, unit, status, outcome: detail, endedAt: stamp });
        return { ok: true, value: { id, from: s.column, to: s.column, startsRun: false, historyEntry: 0 } };
      }
      let d: Decision;
      if (outcome === 'completed') d = { from: 'running', to: 'review', startsRun: false, writes: true, next: { ...s, column: 'review' }, reason: detail, answersBlockers: false };
      else if (outcome === 'cancelled') d = { from: 'running', to: RELEASED, startsRun: false, writes: true, next: { ...s, column: RELEASED }, reason: detail, answersBlockers: false };
      // REQ-TRACE-407/463/476: the system may move a requirement INTO the blocked condition on its own; a run-time block returns to the released state.
      else d = { from: 'running', to: 'blocked', startsRun: false, writes: true, next: { ...s, column: 'blocked', returnTo: RELEASED }, reason: detail, blocker: { kind: 'run-failure', reason: detail, runUnit: unit }, answersBlockers: false };
      return { ok: true, value: commit(id, d, 'run-ended', { kind: 'system' }, ctx.now.canonicalHash, stamp, { runEnd }) };
    },
    answerBlocker(id, option, actor, ctx) {
      return transitions.transition(id, 'answer-blocker', actor, ctx, { payload: { option } });
    },
    // Part AP — REQ-TRACE-407: "a pass MAY, on its own, move a requirement out of the terminal state"; REQ-TRACE-437 routes an
    // edit's needs-update through this same evaluation and not through a special case. The system is the actor.
    recordSpecificationMoved(id, ctx) {
      const state = currentState(id);
      if (!state.ok) return state;
      const s = state.value;
      if (s.column !== TERMINAL || s.acceptedHash === null || s.acceptedHash === ctx.now.canonicalHash) return { ok: true, value: { id, from: s.column, to: s.column, startsRun: false, historyEntry: 0 } };
      const stamp = at();
      const detail = `Specification changed since it was accepted (accepted ${short(s.acceptedHash)}, now ${short(ctx.now.canonicalHash)}).`;
      const d: Decision = { from: TERMINAL, to: 'needs-update', startsRun: false, writes: true, next: { ...s, column: 'needs-update' }, reason: detail, answersBlockers: false };
      return { ok: true, value: commit(id, d, 'specification-moved', { kind: 'system' }, ctx.now.canonicalHash, stamp) };
    },
    recordRunStage(id, unit, stage) {
      dal.setRunStage(id, unit, stage);
    },
    setQueue(automatic, concurrency) {
      // REQ-TRACE-480 names the workspace configuration; its keys are Part AP's (REQ-CONFIG-196). In memory until then.
      deps.queue.set(automatic, concurrency);
    },
  };
  return transitions;
}
