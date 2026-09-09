import type { Actor, BoardAction, BoardProjection, ColumnToken, ReqId, Reachability, RequirementDetail, StoreParse, TraceabilityFailure, VerificationReport } from '@rotaris/contracts';
import { BOARD_ACTIONS } from '@rotaris/contracts';
import { DeliveryDal, type StoreHandle } from '@rotaris/store';
import { projectBoard } from './projection.js';
import { parseActor, reachability, stateOf, type DeliveryTransitions, type RequirementNow, type TransitionContext, type TransitionOptions, type TransitionResult } from './transition.js';

/**
 * The two handle types (Part AK; ADR-0041 §"The capability split stays, and it earns its keep"; REQ-TRACE-403):
 * a READER value carrying only query methods and a WRITER value carrying the transition function. The reader is
 * constructed from the database handle; the writer from the reader PLUS the transition function; never the other
 * way. A component composed with the reader alone has no route to change a delivery state, write an audit record
 * or start a run — `guard.test.ts` asserts it over the value and over the module graph.
 */

export interface BoardInput {
  readonly workspace: string;
  readonly generation: number;
  readonly producedAt: string;
  readonly parse: StoreParse | undefined;
  readonly parseFailure?: TraceabilityFailure;
  readonly report: VerificationReport | undefined;
  readonly queue: { readonly automatic: boolean; readonly concurrency: number; readonly stopped: boolean };
  readonly analysisEnabled: boolean;
  readonly inFlight: ReadonlyMap<ReqId, BoardAction>;
  readonly source: { readonly writable: boolean; readonly canCreate: boolean };
}
export interface HistoryEntry { readonly at: string; readonly action: BoardAction; readonly actor: Actor; readonly from: ColumnToken; readonly to: ColumnToken; readonly current: boolean; readonly reason: string | null; readonly override: boolean }
export interface RunRecord { readonly id: ReqId; readonly unit: string; readonly sessionId: string | null; readonly status: string; readonly stage: string | null; readonly outcome: string | null; readonly startedAt: string; readonly endedAt: string | null; readonly branch: string | null; readonly worktreePath: string | null; readonly permissions: string }
export interface QueueSettings { readonly automatic: boolean; readonly concurrency: number }

export interface DeliveryReader {
  board(input: BoardInput): BoardProjection;
  requirement(id: ReqId, input: BoardInput): RequirementDetail | undefined;
  /** REQ-CONFIG-192: `unavailable` for a record this build cannot interpret, with the reason carried by the card's alerts. */
  history(id: ReqId): readonly HistoryEntry[] | 'unavailable';
  runs(id: ReqId): readonly RunRecord[];
  queue(): QueueSettings;
  reachable(id: ReqId, from: ColumnToken, to: ColumnToken, now: RequirementNow, actor: Actor, at: string): Reachability;
  /** Every run row still `running` — the reap's input (REQ-TRACE-476). A query, not a write. */
  runningRuns(): readonly RunRecord[];
}

export interface DeliveryWriter {
  transition(id: ReqId, action: BoardAction, actor: Actor, ctx: TransitionContext, opts?: TransitionOptions): Promise<TransitionResult>;
  recordRunStarted: DeliveryTransitions['recordRunStarted'];
  recordRunEnded: DeliveryTransitions['recordRunEnded'];
  answerBlocker: DeliveryTransitions['answerBlocker'];
  setQueue: DeliveryTransitions['setQueue'];
  readonly inFlight: ReadonlySet<ReqId>;
  /**
   * REQ-TRACE-402: the writer declares, AS DATA the assembly can inspect, that it performs the specification-hash
   * comparison; `assertWriterDeclares` at workspace-service start refuses to serve delivery without it.
   */
  readonly declares: { readonly comparesSpecificationHash: true };
}

/** REQ-TRACE-483: the defaults the configuration schema declares — `manual` and 2. */
export const DEFAULT_QUEUE: QueueSettings = Object.freeze({ automatic: false, concurrency: 2 });
/**
 * REQ-TRACE-480's two persisted controls are workspace configuration (`requirements.scheduling.*`, REQ-CONFIG-196),
 * whose keys Part AP registers; until then the settings live here, in memory, at the schema's defaults. NOT built
 * here: their persistence. Stated in ADR-0041's execution note.
 */
export interface QueueSettingsHolder { get(): QueueSettings; set(automatic: boolean, concurrency: number): void }
export function createQueueSettings(initial: QueueSettings = DEFAULT_QUEUE): QueueSettingsHolder {
  let current = initial;
  return { get: () => current, set: (automatic, concurrency) => { current = Object.freeze({ automatic, concurrency }); } };
}

export function createDeliveryReader(db: StoreHandle, deps: { readonly workspaceKey: string; readonly queue: QueueSettingsHolder }): DeliveryReader {
  // Private: the DAL appears in no property of the value returned, so nothing composed with the reader can reach a write statement.
  const dal = new DeliveryDal(db);
  const runOf = (r: ReturnType<DeliveryDal['runsAll']>[number]): RunRecord => {
    const wt = r.worktree_ref === null ? undefined : dal.worktree(r.worktree_ref);
    return { id: r.req_id, unit: r.unit, sessionId: r.session_id, status: r.status, stage: r.stage, outcome: r.outcome, startedAt: r.started_at, endedAt: r.ended_at, branch: wt?.branch ?? null, worktreePath: wt?.path ?? null, permissions: r.permissions };
  };
  const reader: DeliveryReader = {
    board(input) {
      return projectBoard({ ...input, rows: dal.readAll(), runs: dal.runsAll(), openBlockers: dal.openBlockersAll() });
    },
    requirement(id, input) {
      const board = reader.board(input);
      const card = board.cards.find((c) => c.id === id);
      if (!card) return undefined;
      const record = input.parse?.records.find((r) => r.id === id);
      return {
        card,
        prose: record?.prose ?? '',
        history: reader.history(id),
        runs: reader.runs(id).map((r) => ({ unit: r.unit, ...(r.sessionId === null ? {} : { sessionId: r.sessionId }), ...(r.branch === null ? {} : { branch: r.branch }), ...(r.worktreePath === null ? {} : { worktree: r.worktreePath }), status: r.outcome === null ? r.status : `${r.status}: ${r.outcome}` })),
        evidenceDetail: [...card.evidence.sites].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line)),
        findings: (input.report?.findings ?? []).filter((f) => f.id === id),
      };
    },
    history(id) {
      const row = dal.read(id);
      if (row !== undefined && row.kind !== 'record') return 'unavailable';
      const rows = dal.historyOf(id);
      // The system's run entries are interleaved in the store (REQ-TRACE-405) and reported under `runs`; the detail's
      // history lists the board actions of the closed set, oldest to newest, the current one marked.
      const actions = rows.filter((r) => (BOARD_ACTIONS as readonly string[]).includes(r.action));
      return actions.map((r, i) => ({ at: r.at, action: r.action as BoardAction, actor: parseActor(r.actor), from: r.from_state as ColumnToken, to: r.to_state as ColumnToken, current: i === actions.length - 1, reason: r.reason, override: r.override === 1 }));
    },
    runs(id) {
      return dal.runsOf(id).map(runOf);
    },
    queue() {
      return deps.queue.get();
    },
    reachable(id, from, to, now, actor, at) {
      const row = dal.read(id);
      const state = row?.kind === 'record' ? stateOf(row.record) : stateOf(undefined);
      if (row !== undefined && row.kind !== 'record') return { reachable: false, confirm: false, reason: `The delivery record of ${id} cannot be interpreted by this build and is left as it is.`, glyph: '⊘', reachableFromSource: [] };
      return reachability(state, now, from, to, actor, at);
    },
    runningRuns() {
      return dal.runsWithStatus('running').map(runOf);
    },
  };
  return reader;
}

/**
 * The writer: the reader's queries are NOT on it (a writer is not a reader, and a component handed the writer for
 * a write still asks the reader for its reads), and no method returns the reader or the store. Constructed from
 * the reader PLUS the transition function; the reader argument is what makes the direction of construction a
 * type-level fact rather than a convention.
 */
export function createDeliveryWriter(reader: DeliveryReader, transitions: DeliveryTransitions): DeliveryWriter {
  void reader; // held by construction only; nothing on the writer exposes it
  return Object.freeze({
    transition: (id, action, actor, ctx, opts) => transitions.transition(id, action, actor, ctx, opts),
    recordRunStarted: (...args) => transitions.recordRunStarted(...args),
    recordRunEnded: (...args) => transitions.recordRunEnded(...args),
    answerBlocker: (...args) => transitions.answerBlocker(...args),
    setQueue: (...args) => transitions.setQueue(...args),
    inFlight: transitions.inFlight,
    declares: Object.freeze({ comparesSpecificationHash: true as const }),
  } satisfies DeliveryWriter);
}

/** REQ-TRACE-402: the startup self-check on the composition, naming the comparison that is missing. */
export const MISSING_COMPARISON = 'The delivery-state writer this build was assembled with does not declare comparesSpecificationHash — the specification-hash comparison REQ-TRACE-402 requires before a requirement can be recorded as delivered. Refusing to serve the delivery store.';
export function assertWriterDeclares(writer: { readonly declares?: { readonly comparesSpecificationHash?: unknown } }): void {
  if (writer.declares?.comparesSpecificationHash !== true) throw new Error(MISSING_COMPARISON);
}
