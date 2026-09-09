import type { BoardAction, BoardCard, BoardProjection, ColumnToken, DeliveryColumn, DeliveryQueue, EpicCard, HealthToken, ParseError, QueueEntry, RelationToken, ReqId, RequirementEvidence, RequirementRecord, StoreParse, TraceabilityFailure, VerificationReport } from '@rotaris/contracts';
import { compareReqIds } from '@rotaris/contracts';
import type { DeliveryBlockerRow, DeliveryReadRow, DeliveryRunRow } from '@rotaris/store';
import { cardBlocker, type Blocker } from './blockers.js';
import { stateOf } from './transition.js';

/**
 * The board projection (Part AK; ADR-0040 specific 5, ADR-0041; REQ-TRACE-348): one immutable value per pass,
 * joining the engine's parse and verification report with the delivery rows. Every join, closure and sort a
 * database would have been wanted for happens HERE over data already in memory, and the value is handed across
 * already translated — the display mapping in `ui-core` recomputes none of health, evidence state, delivery state
 * or epic progress (REQ-TRACE-254/377). The function is pure: every input, the current time included, is an
 * argument (REQ-TRACE-380), and the result is deep-frozen so no reader can observe half an update.
 */
export interface ProjectionInput {
  readonly workspace: string;
  readonly generation: number;
  readonly producedAt: string;
  readonly parse: StoreParse | undefined;
  readonly parseFailure?: TraceabilityFailure;
  readonly report: VerificationReport | undefined;
  readonly rows: readonly DeliveryReadRow[];
  readonly runs: readonly DeliveryRunRow[];
  readonly openBlockers: readonly DeliveryBlockerRow[];
  readonly queue: { readonly automatic: boolean; readonly concurrency: number; readonly stopped: boolean };
  readonly analysisEnabled: boolean;
  readonly inFlight: ReadonlyMap<ReqId, BoardAction>;
  readonly source: { readonly writable: boolean; readonly canCreate: boolean };
}

/** REQ-TRACE-288: the priority order, then everything else after the last of them, deterministically. */
export const PRIORITY_ORDER = ['critical', 'high', 'normal', 'low'] as const;
export function priorityRank(priority: string | undefined): number {
  if (priority === undefined) return PRIORITY_ORDER.length + 1;
  const i = (PRIORITY_ORDER as readonly string[]).indexOf(priority.toLowerCase());
  return i === -1 ? PRIORITY_ORDER.length : i;
}

/** REQ-TRACE-258: the three obligation kinds, in indicator order; closed. */
export const OBLIGATIONS = ['implementation-trace', 'covering-test', 'verification'] as const;
export type Obligation = (typeof OBLIGATIONS)[number];

/** Which obligations a requirement owes (REQ-TRACE-258): trace where `trace: required`, test where `test: required`, verification where approved and the workspace verified at all. */
export function owedObligations(r: RequirementRecord, report: VerificationReport | undefined): readonly Obligation[] {
  const owed: Obligation[] = [];
  // REQ-TRACE-281/284: an epic is a grouping element, not a work item; its progress is its children's and it owes no evidence of its own.
  if (r.isEpic) return owed;
  if (r.traceRequired) owed.push('implementation-trace');
  if (r.testRequired) owed.push('covering-test');
  // The suite's existence is not in the seam; the report's presence is the nearest fact this projection has. Stated, not guessed at further.
  if (r.status === 'approved' && report !== undefined) owed.push('verification');
  return owed;
}
export function evidenceStateOf(e: RequirementEvidence, o: Obligation) {
  return o === 'implementation-trace' ? e.implementationTrace : o === 'covering-test' ? e.coveringTest : e.verification;
}

/**
 * REQ-TRACE-252: health is derived from the lifecycle, the delivery state and the evidence, and set by nobody
 * directly. The precedence, first match wins: `deprecated` (lifecycle) → `blocked` (delivery) → `needs-update`
 * (the delivery column, or an accepted hash that no longer matches the canonical hash) → `verification-failed` (any
 * recorded evidence failing) → `incomplete-traceability` (an owed obligation absent or stale) → `healthy`.
 * `superseded` is a member of the closed set with NO data source in this product: the requirement document format
 * declares no `supersedes` key, so nothing here can emit it. Stated rather than invented.
 */
export function healthOf(r: RequirementRecord, column: ColumnToken, acceptedHash: string | null, evidence: RequirementEvidence, owed: readonly Obligation[]): HealthToken {
  if (r.status === 'deprecated') return 'deprecated';
  if (column === 'blocked') return 'blocked';
  if (column === 'needs-update' || (acceptedHash !== null && acceptedHash !== r.canonicalHash)) return 'needs-update';
  if (owed.some((o) => evidenceStateOf(evidence, o) === 'failed')) return 'verification-failed';
  if (owed.some((o) => { const s = evidenceStateOf(evidence, o); return s === undefined || s === 'stale'; })) return 'incomplete-traceability';
  return 'healthy';
}

/** REQ-TRACE-246: de-duplication on the SENTENCE, any leading blocked label removed; the earlier spelling is kept. */
export function dedupeAlerts(alerts: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of alerts) {
    const key = a.replace(/^Blocked(?: \([a-z-]+\))?: /, '').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

const NO_EVIDENCE: RequirementEvidence = Object.freeze({ sites: [] });

export function projectBoard(input: ProjectionInput): BoardProjection {
  const { parse, report } = input;
  const records = parse?.records ?? [];
  const byId = new Map<ReqId, RequirementRecord>();
  for (const r of records) byId.set(r.id, r);
  const rowsById = new Map<ReqId, DeliveryReadRow>();
  for (const row of input.rows) rowsById.set(row.id, row);
  const runsById = new Map<ReqId, DeliveryRunRow[]>();
  for (const run of input.runs) { const l = runsById.get(run.req_id) ?? []; l.push(run); runsById.set(run.req_id, l); }
  const blockersById = new Map<ReqId, Blocker[]>();
  for (const b of input.openBlockers) { const l = blockersById.get(b.req_id) ?? []; l.push(blockerOf(b)); blockersById.set(b.req_id, l); }
  const childrenOf = new Map<ReqId, ReqId[]>();
  const derivedOf = new Map<ReqId, ReqId[]>();
  for (const r of records) {
    if (r.epic !== undefined) { const l = childrenOf.get(r.epic) ?? []; l.push(r.id); childrenOf.set(r.epic, l); }
    for (const d of r.derivedFrom) { const l = derivedOf.get(d) ?? []; l.push(r.id); derivedOf.set(d, l); }
  }

  const cards: BoardCard[] = [];
  for (const r of [...records].sort((a, b) => compareReqIds(a.id, b.id))) {
    const row = rowsById.get(r.id);
    const state = row?.kind === 'record' ? stateOf(row.record) : stateOf(undefined);
    const column = state.column;
    const evidence = report?.evidence[r.id] ?? NO_EVIDENCE;
    const owed = owedObligations(r, report);
    const blockers = blockersById.get(r.id) ?? [];
    const latestBlocker = blockers.length > 0 ? blockers[blockers.length - 1] : undefined;
    const runs = runsById.get(r.id) ?? [];
    const running = runs.filter((x) => x.status === 'running');
    const latestRun = running[running.length - 1] ?? runs[runs.length - 1];

    // REQ-TRACE-245's fixed order, then REQ-TRACE-246's de-duplication.
    const alerts: string[] = [];
    if (state.acceptedHash !== null && state.acceptedHash !== r.canonicalHash) alerts.push(`Specification changed since it was accepted (accepted ${state.acceptedHash.slice(0, 8)}, now ${r.canonicalHash.slice(0, 8)}).`);
    if (column === 'blocked' && latestBlocker) alerts.push(`Blocked: ${latestBlocker.reason}`);
    for (const b of blockers) alerts.push(`Blocked (${b.kind}): ${b.reason}`);
    for (const o of owed) {
      const s = evidenceStateOf(evidence, o);
      if (s === 'failed') alerts.push(`Verification failing: ${o}.`);
      else if (s === undefined) alerts.push(`Missing evidence: ${o}.`);
    }
    if (row !== undefined && row.kind !== 'record') alerts.push(row.kind === 'unsupported' ? `Delivery record unsupported (schema version ${row.version}); its delivery history is unavailable for that reason.` : 'Delivery record unreadable (its schema version is below 1, absent or not an integer); its delivery history is unavailable for that reason.');
    if (column === 'review' && state.snapshotHash !== null && state.snapshotHash !== r.canonicalHash) alerts.push('Awaiting review: the specification moved while the run was in flight.');

    // REQ-TRACE-274: the four relation tokens the document format can express; the other eight have no data source here.
    const relations: { kind: RelationToken; id: ReqId }[] = [];
    if (r.epic !== undefined) relations.push({ kind: 'parent', id: r.epic });
    for (const c of (childrenOf.get(r.id) ?? []).sort(compareReqIds)) relations.push({ kind: 'children', id: c });
    for (const d of [...r.derivedFrom].sort(compareReqIds)) relations.push({ kind: 'derived-from', id: d });
    for (const d of (derivedOf.get(r.id) ?? []).sort(compareReqIds)) relations.push({ kind: 'derived-requirements', id: d });

    // REQ-TRACE-243's fixed order: priority, parent epic, source, dependencies, assigned agent, last change — omitted cleanly when absent.
    const facts: { label: string; value: string }[] = [];
    if (r.priority !== undefined && r.priority.toLowerCase() !== 'none') facts.push({ label: 'Priority', value: r.priority });
    if (r.epic !== undefined) facts.push({ label: 'Epic', value: r.epic });
    facts.push({ label: 'Source', value: r.source ?? parse?.layout.storeDir ?? '' });
    if (row?.kind === 'record') facts.push({ label: 'Last change', value: row.record.updatedAt });
    // REQ-TRACE-242's two counted facts ride here so the display can state them as sentences (REQ-TRACE-249).
    facts.push({ label: 'Units', value: String(state.units) });
    if (latestRun) facts.push({ label: 'Last run', value: `${latestRun.started_at}|${latestRun.status}` });

    const inFlightAction = input.inFlight.get(r.id);
    const card: BoardCard = {
      id: r.id, title: r.title, column,
      ...(state.returnTo === null ? {} : { returnTo: state.returnTo }),
      health: healthOf(r, column, state.acceptedHash, evidence, owed),
      lifecycle: r.status, kind: r.kind,
      ...(r.priority === undefined ? {} : { priority: r.priority }),
      ...(r.epic === undefined ? {} : { epic: r.epic }),
      sourcePath: r.sourcePath, sourceKey: r.source ?? parse?.layout.storeDir ?? '',
      evidence, alerts: dedupeAlerts(alerts), relations,
      ...(latestBlocker ? { blocker: cardBlocker(latestBlocker) } : {}),
      ...(latestRun ? { run: { ...(latestRun.session_id === null ? {} : { sessionId: latestRun.session_id }), unit: latestRun.unit, waitingOnPerson: false, ...(latestRun.stage === null ? {} : { stage: latestRun.stage }), interrupted: latestRun.status === 'interrupted' } } : {}),
      ...(inFlightAction === undefined ? {} : { inFlight: { action: inFlightAction, label: inFlightLabel(inFlightAction) } }),
      facts,
    };
    cards.push(card);
  }

  // REQ-TRACE-282/285: an epic summarises its children over the non-deprecated population.
  const epics: EpicCard[] = [];
  for (const r of records) {
    if (!r.isEpic) continue;
    const children = (childrenOf.get(r.id) ?? []).sort(compareReqIds);
    const counted = children.filter((c) => byId.get(c)?.status !== 'deprecated');
    const done = counted.filter((c) => cards.find((x) => x.id === c)?.column === 'done').length;
    epics.push({ id: r.id, title: r.title, done, total: counted.length, children });
  }

  const blocked = cards.filter((c) => c.column === 'blocked').map((c) => ({ id: c.id, reason: c.blocker?.reason ?? 'blocked', returnTo: c.returnTo ?? 'backlog' as DeliveryColumn }));

  const parseErrors: ParseError[] = [...(parse?.errors ?? [])];
  if (input.parseFailure) parseErrors.push({ path: parse?.root ?? input.workspace, message: describeFailure(input.parseFailure) });

  const projection: BoardProjection = {
    workspace: input.workspace,
    generation: input.generation,
    producedAt: input.producedAt,
    source: parse === undefined ? { kind: 'none' } : { kind: 'store', dir: parse.layout.storeDir, writable: input.source.writable, canCreate: input.source.canCreate },
    cards,
    epics,
    queue: queueOf(cards, input.runs, input.queue, byId),
    blocked,
    analysisEnabled: input.analysisEnabled,
    parseErrors,
  };
  return deepFreeze(projection);
}

/** REQ-TRACE-478: executing now, the next candidate, and every deferred candidate with the scheduler's reason, in the order the scheduler applies. */
function queueOf(cards: readonly BoardCard[], runs: readonly DeliveryRunRow[], q: ProjectionInput['queue'], byId: ReadonlyMap<ReqId, RequirementRecord>): DeliveryQueue {
  const entries: QueueEntry[] = [];
  const executing = runs.filter((r) => r.status === 'running');
  for (const r of executing) entries.push({ id: r.req_id, unit: r.unit, state: 'executing' });
  const candidates = cards.filter((c) => c.column === 'ready').sort((a, b) => priorityRank(byId.get(a.id)?.priority) - priorityRank(byId.get(b.id)?.priority) || compareReqIds(a.id, b.id));
  let free = Math.max(0, q.concurrency - executing.length);
  for (const c of candidates) {
    const unit = `u${Number(c.facts.find((f) => f.label === 'Units')?.value ?? '0') + 1}`;
    if (q.stopped) entries.push({ id: c.id, unit, state: 'deferred', reason: 'The queue is stopped; nothing new begins until it is started again, while work already dispatched continues and completes as usual.' });
    else if (!q.automatic) entries.push({ id: c.id, unit, state: 'deferred', reason: 'Automatic scheduling is off; nothing begins until you release it from the queue.' });
    else if (free > 0) { entries.push({ id: c.id, unit, state: 'next' }); free -= 1; }
    else entries.push({ id: c.id, unit, state: 'deferred', reason: `Waiting for a unit slot: ${executing.length} of ${q.concurrency} in use.` });
  }
  return { entries, automatic: q.automatic, concurrency: q.concurrency, stopped: q.stopped };
}

/** REQ-TRACE-388: the per-action progress label naming what is happening. */
export function inFlightLabel(action: BoardAction): string {
  switch (action) {
    case 'release': return 'Releasing…';
    case 'return': return 'Returning…';
    case 'accept': return 'Accepting…';
    case 'rerun': return 'Re-running…';
    case 'send-back': return 'Sending back…';
    case 'reject': return 'Rejecting…';
    case 'hold': return 'Holding…';
    case 'resume': return 'Resuming…';
    case 'answer-blocker': return 'Answering the blocker…';
    case 'edit': return 'Saving the edit…';
    case 'create': return 'Creating…';
    case 'accept-proposal': return 'Accepting the proposal…';
    case 'accept-change-work': return 'Accepting the change-work…';
    case 'keep-worktree': return 'Keeping the worktree…';
  }
}

export function blockerOf(b: DeliveryBlockerRow): Blocker {
  return {
    kind: b.kind as Blocker['kind'],
    reason: b.reason,
    options: parseJson<Blocker['options']>(b.options, []),
    blockingIds: parseJson<readonly ReqId[]>(b.blocking_ids, []),
    runUnit: b.run_unit,
    raisedAt: b.raised_at,
  };
}
function parseJson<T>(text: string, fallback: T): T {
  try { const v = JSON.parse(text) as unknown; return Array.isArray(v) ? (v as T) : fallback; } catch { return fallback; }
}

export function describeFailure(f: TraceabilityFailure): string {
  switch (f.kind) {
    case 'configuration': return `The layout configuration at ${f.path} could not be read: ${f.cause}`;
    case 'parse': return `${f.errors.length} document(s) could not be parsed.`;
    case 'busy': return `The engine is busy with ${f.operation}.`;
    case 'cancelled': return 'The pass was cancelled.';
    case 'failed': return `${f.what} failed: ${f.cause}`;
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}
