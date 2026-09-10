import type { Actor, BoardAction, BoardProjection, Reachability, ReqId, RequirementDetail, RequirementsCommandPayload, StoreParse, TraceabilityEngine, TraceabilityFailure, VerificationReport } from '@rotaris/contracts';
import { err, toIsoUtc, type Clocks } from '@rotaris/kernel';
import type { ResolvedStore } from '@rotaris/store';
import { assertWriterDeclares, createDeliveryReader, createDeliveryWriter, createQueueSettings, createTransitions, reapStaleRuns, type BoardInput, type DeliveryReader, type DeliveryWriter, type ReapResult, type RequirementNow } from '@rotaris/workspace';

/**
 * Part AK — the delivery store's service side (ADR-0041's first execution; ADR-0040 specific 5). Lives in the
 * workspace service because that process owns the store's writable connection and is where AJ's engine runs
 * (ADR-0002 #3, W-02): the projection is computed HERE, in the same process as the engine and the store, and the
 * renderer receives one immutable `BoardProjection` per generation over `requirements.board`.
 *
 * The composition is what REQ-TRACE-403 and REQ-TRACE-402 are about: the reader is built from the database handle,
 * the writer from the reader plus the transition function, and `assertWriterDeclares` refuses to serve delivery at
 * all when the writer does not declare the specification-hash comparison. That check runs at construction — the
 * first `requirements.*` command of a workspace open — and its failure is the named message, not a silent absence.
 *
 * The engine is INJECTED. Until Part AJ merges, `ENGINE_NOT_MERGED` answers every pass with a stated failure and the
 * board reports `source: none` with the cause in `parseErrors`; the merge replaces one line in `index.ts`'s case.
 */
export interface DeliveryAnswer {
  readonly value: unknown;
  /** Present exactly when a write moved the generation; main publishes it on channel 10 AFTER the reply (persist before publish). */
  readonly changed?: { readonly generation: number; readonly affected: ReqId[] | null };
}
export interface DeliveryService {
  handle(command: RequirementsCommandPayload, actor: Actor): Promise<DeliveryAnswer>;
  /** What the restart reap settled on the first pass (REQ-TRACE-476), for the log. */
  readonly reaped: readonly ReapResult[];
  readonly generation: number;
}
export interface DeliveryServiceDeps {
  readonly db: ResolvedStore['db'];
  readonly workspaceRoot: string;
  readonly engine: TraceabilityEngine;
  readonly clocks: Clocks;
  readonly log: (message: string, level?: 'info' | 'warn') => void;
}

const NOT_MERGED = Object.freeze({ kind: 'failed', what: 'the traceability engine', cause: 'Part AJ is not merged into this build' } as const);
/** The stand-in until Part AJ's `createTraceabilityEngine` is wired at the merge: every pass fails with the reason stated. */
export const ENGINE_NOT_MERGED: TraceabilityEngine = {
  parseStore: async () => err(NOT_MERGED),
  sweep: async () => err(NOT_MERGED),
  verify: async () => err(NOT_MERGED),
  check: async () => err(NOT_MERGED),
  regenerate: async () => err(NOT_MERGED),
  updateBaselines: async () => err(NOT_MERGED),
  compare: async () => err(NOT_MERGED),
};

export function createDeliveryService(deps: DeliveryServiceDeps): DeliveryService {
  const { db, workspaceRoot, engine, clocks, log } = deps;
  const queue = createQueueSettings();
  const reader: DeliveryReader = createDeliveryReader(db, { workspaceKey: workspaceRoot, queue });
  const writer: DeliveryWriter = createDeliveryWriter(reader, createTransitions(db, { wall: clocks.wall, workspaceKey: workspaceRoot, queue }));
  // REQ-TRACE-402: the startup self-check on the composition. A writer without the declaration is not served.
  assertWriterDeclares(writer);

  let generation = 0;
  let parse: StoreParse | undefined;
  let parseFailure: TraceabilityFailure | undefined;
  let report: VerificationReport | undefined;
  let current: BoardProjection | undefined;
  let stopped = false;
  let reaped: readonly ReapResult[] | undefined;
  let refreshing: Promise<number> | undefined;
  const inFlight = new Map<ReqId, BoardAction>();
  const now = () => toIsoUtc(clocks.wall.instant());

  const input = (): BoardInput => ({
    workspace: workspaceRoot, generation, producedAt: now(), parse, ...(parseFailure === undefined ? {} : { parseFailure }), report,
    queue: { ...reader.queue(), stopped },
    // REQ-TRACE-346: reported by the pass, never deduced. No pass in this build analyses anything, so it is false and said so.
    analysisEnabled: false,
    inFlight,
    // REQ-TRACE-498 "Source read-only": no source write exists in this build (Part AP); the read-only sentence is the honest one.
    source: { writable: false, canCreate: false },
  });
  /** REQ-TRACE-348: one immutable value per generation; the generation moves BEFORE the value is computed so the value carries it. */
  const rebuild = (): number => {
    generation += 1;
    current = reader.board(input());
    return generation;
  };
  const nowOf = (id: ReqId): RequirementNow | undefined => {
    const r = parse?.records.find((x) => x.id === id);
    return r === undefined ? undefined : { id, canonicalHash: r.canonicalHash, lifecycle: r.status, isEpic: r.isEpic };
  };
  /** REQ-TRACE-349: concurrent cold reads coalesce onto one engine read. */
  const refresh = (): Promise<number> => {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const signal = new AbortController().signal;
      const p = await engine.parseStore(workspaceRoot, { signal });
      if (!p.ok) { parse = undefined; parseFailure = p.error; report = undefined; }
      else {
        parse = p.value; parseFailure = undefined;
        const s = await engine.sweep(parse, { signal });
        if (!s.ok) { report = undefined; log(`requirements sweep failed: ${JSON.stringify(s.error)}`, 'warn'); }
        else {
          const v = await engine.verify(parse, s.value, { signal });
          report = v.ok ? v.value : undefined;
          if (!v.ok) log(`requirements verify failed: ${JSON.stringify(v.error)}`, 'warn');
        }
      }
      // REQ-TRACE-476: the restart reap runs once, after the first parse, so the settling entries carry the hash of that instant.
      if (reaped === undefined) {
        reaped = reapStaleRuns(reader, writer, new Set(), (id) => nowOf(id)?.canonicalHash);
        for (const r of reaped) log(`requirements reap: ${r.id} unit ${r.unit} ${r.statement}${r.held ? ' (held, returns to ready)' : ''}`, 'warn');
      }
      return rebuild();
    })().finally(() => { refreshing = undefined; });
    return refreshing;
  };
  const ensure = async (): Promise<BoardProjection> => {
    if (current === undefined) await refresh();
    return current!;
  };

  const detail = (id: ReqId, board: BoardProjection): RequirementDetail | undefined => {
    // REQ-TRACE-348: a detail read describes the generation of the board it was read against — the card is that board's.
    const card = board.cards.find((c) => c.id === id);
    if (card === undefined) return undefined;
    const record = parse?.records.find((r) => r.id === id);
    return {
      card,
      prose: record?.prose ?? '',
      history: reader.history(id),
      runs: reader.runs(id).map((r) => ({ unit: r.unit, ...(r.sessionId === null ? {} : { sessionId: r.sessionId }), ...(r.branch === null ? {} : { branch: r.branch }), ...(r.worktreePath === null ? {} : { worktree: r.worktreePath }), status: r.outcome === null ? r.status : `${r.status}: ${r.outcome}` })),
      evidenceDetail: [...card.evidence.sites].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line)),
      findings: (report?.findings ?? []).filter((f) => f.id === id),
    };
  };

  const service: DeliveryService = {
    get reaped() { return reaped ?? []; },
    get generation() { return generation; },
    async handle(command, actor) {
      switch (command.name) {
        case 'requirements.board':
          return { value: await ensure() };
        case 'requirements.detail': {
          const board = await ensure();
          const d = detail(command.id, board);
          return { value: d ?? { error: `${command.id} is not on this board.` } };
        }
        case 'requirements.refresh': {
          // REQ-TRACE-341: a refresh the user initiates consults no model; this pass never does.
          const g = await refresh();
          return { value: { generation: g }, changed: { generation: g, affected: null } };
        }
        case 'requirements.reachable': {
          await ensure();
          const n = nowOf(command.id);
          const answer: Reachability = n === undefined
            ? { reachable: false, confirm: false, reason: `${command.id} is not in this requirement store.`, glyph: '⊘', reachableFromSource: [] }
            : reader.reachable(command.id, command.from, command.to, n, actor, now());
          return { value: answer };
        }
        case 'requirements.act': {
          await ensure();
          const n = nowOf(command.id);
          if (n === undefined) return { value: { ok: false, error: { reason: `${command.id} is not in this requirement store; nothing was written.` } } };
          inFlight.set(command.id, command.action);
          try {
            const r = await writer.transition(command.id, command.action, actor, { now: n }, { ...(command.target === undefined ? {} : { target: command.target }), ...(command.payload === undefined ? {} : { payload: command.payload }) });
            inFlight.delete(command.id);
            if (!r.ok) return { value: r };
            if (r.value.historyEntry === 0) return { value: r };
            // Persist before publish: the commit is behind us; the generation moves now and main publishes after this reply.
            const g = rebuild();
            log(`requirements: ${command.id} ${command.action} ${r.value.from} → ${r.value.to} by ${actor.kind === 'user' ? `user ${actor.person}` : 'system'} (entry ${r.value.historyEntry}, generation ${g})`);
            return { value: r, changed: { generation: g, affected: [command.id] } };
          } finally {
            inFlight.delete(command.id);
          }
        }
        case 'requirements.queue.set': {
          await ensure();
          const q = reader.queue();
          if (command.automatic !== undefined || command.concurrency !== undefined) writer.setQueue(command.automatic ?? q.automatic, command.concurrency ?? q.concurrency);
          if (command.stop === true) stopped = true;
          if (command.hold !== undefined || command.release !== undefined) {
            return { value: { ok: false, error: { reason: 'Holding or releasing a queued requirement needs the scheduler, which this build does not run (Part AP); nothing changed.' } } };
          }
          const g = rebuild();
          return { value: current!.queue, changed: { generation: g, affected: null } };
        }
        // Part AJ2 — REQ-TRACE-508..511 reach the one engine (ADR-0040 specific 6) through the board's command family, on
        // the route main's `traceability.operate` takes (`traceability.ts`), and the reply carries that route's shape so a
        // surface reads one form. REQ-TRACE-512: the root is the open workspace's, the engine itself refuses a second
        // operation of a kind as `busy`, and a layout or unanticipated failure comes back stated. A regeneration or a
        // baseline update changes what the next verification reads, and a check IS the verification the board presents
        // (REQ-TRACE-508: its findings reach the requirements view), so each of those three re-reads the projection and
        // moves the generation — main publishes it after this reply; a comparison writes nothing the board shows.
        case 'requirements.operation': {
          const started = Number(clocks.monotonic.now());
          // REQ-TRACE-212/216: the phases are logged by name; channel 10's `progress?` is where they would go (not built).
          const options = { signal: new AbortController().signal, progress: (r: { kind: string; phase: string }) => { if (r.kind === 'phase') log(`requirements ${command.operation} (${workspaceRoot}): phase ${r.phase}`); } };
          const r = command.operation === 'check' ? await engine.check(workspaceRoot, options)
            : command.operation === 'regenerate' ? await engine.regenerate(workspaceRoot, options)
              : command.operation === 'baselines' ? await engine.updateBaselines(workspaceRoot, options)
                : await engine.compare(workspaceRoot, command.base, options);
          const elapsedMs = Math.max(0, Math.round(Number(clocks.monotonic.now()) - started));
          log(`requirements ${command.operation} (${workspaceRoot}): ${r.ok ? 'ok' : `refused: ${r.error.kind}`} in ${elapsedMs} ms`, r.ok ? 'info' : 'warn');
          const value = { kind: 'traceability.result', operation: command.operation, root: workspaceRoot, elapsedMs, result: r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error } };
          if (!r.ok || command.operation === 'compare') return { value };
          const g = await refresh();
          return { value, changed: { generation: g, affected: null } };
        }
        case 'requirements.cancel': {
          // The seam's engine offers no cancel; the process's handle does (`TraceabilityEngineHandle`), and a fake without
          // one has nothing to stop. The board names the baseline update `baselines`; the engine names it `updateBaselines`.
          const handle = engine as { cancel?: (root: string, operation: 'check' | 'regenerate' | 'updateBaselines' | 'compare') => boolean };
          const op = command.operation === 'check' || command.operation === 'regenerate' || command.operation === 'compare' ? command.operation : command.operation === 'baselines' ? 'updateBaselines' : undefined;
          const cancelled = op !== undefined && typeof handle.cancel === 'function' ? handle.cancel(workspaceRoot, op) : false;
          log(`requirements cancel ${command.operation} (${workspaceRoot}): ${cancelled ? 'signalled' : 'nothing in flight'}`);
          return { value: { kind: 'traceability.cancelled', cancelled } };
        }
        case 'requirements.source.write':
        case 'requirements.source.previewLocation':
          return { value: { ok: false, error: { reason: "Writing a requirement into the project's own source is not built in this version (Part AP); the source is read-only here and nothing was written." } } };
      }
    },
  };
  return service;
}

/** One service per open store, keyed by the `ResolvedStore` object so a reopen (after a restore) builds a new one. */
const services = new WeakMap<ResolvedStore, DeliveryService>();
export function deliveryServiceFor(open: ResolvedStore, deps: Omit<DeliveryServiceDeps, 'db'>): DeliveryService {
  let s = services.get(open);
  if (s === undefined) { s = createDeliveryService({ db: open.db, ...deps }); services.set(open, s); }
  return s;
}
