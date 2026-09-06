import { millis, toIsoUtc, type Millis, type Timers, type WallClock, type SessionId, type Result } from '@rotaris/kernel';
import { replaceDocument, type RetryLadder } from '@rotaris/platform';
import { RING_CAPS, type AuditRow, type EventRow, type IssueRow, type SessionRow, type StoreDal, type TimelineRow, type ToolCallRow } from '@rotaris/store';
import { EVENT_KINDS } from './events.js';

/**
 * Part U — the two exports of the session browser (ADR-0003 consequence 3, ADR-0024's export section).
 *
 * `readRecords` is REQ-SESSION-199's file: the timeline, the issues record, the metrics document and the
 * permission audit, ONE JSON document with those four top-level keys, read in one read transaction so a
 * ring's entries and its header figures come from one state (ADR-0024 c.5). The two rings export as
 * ADR-0024 fixed them — a header (the cap, the cumulative drop count, the oldest and newest retained
 * ordinals, the instant taken, `complete`) over an entries array whose elements carry the ORDINAL BESIDE
 * the stored entry, so a reader with a stock parser performs the completeness arithmetic itself:
 * `dropped + retained == newest`, ordinals contiguous, `oldest - 1 == dropped`. Nothing derived, nothing
 * resolved (a locator is carried, never followed — REQ-EVENTS-056).
 *
 * `readTrajectory` is REQ-SESSION-153's document with REQ-SESSION-193's key inventory, the events as the
 * stored payloads parsed into objects (redaction inherited from the wire, unknown kinds kept intact), and a
 * summary recomputed from those events alone; `batchDocument` is REQ-EVENTS-144's wrapper. `writeExport`
 * is ADR-0004's replace under REQ-TRACE-061's ladder, pretty-printed with sorted keys, two-space indentation
 * and a trailing newline (REQ-EVENTS-145) — nothing is written until the caller has a destination the user
 * chose. Neither export is a channel: no refresh, no repeat, no write to the session's record.
 */

/** REQ-TRACE-061: five attempts in total, delays 0.05 / 0.1 / 0.2 / 0.4 s before the four retries. */
export const EXPORT_LADDER: RetryLadder = { delays: [50, 100, 200, 400].map((n) => millis(n)) as Millis[] };

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** REQ-EVENTS-145: sorted keys at every depth, two-space indentation, one trailing line feed. */
export function renderExport(document: JsonValue): string {
  return `${JSON.stringify(sortKeys(document), null, 2)}\n`;
}

function sortKeys(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const out: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]!);
    return out;
  }
  return value;
}

function parseJson(text: string): JsonValue | undefined {
  try { return JSON.parse(text) as JsonValue; } catch { return undefined; }
}

/** ADR-0024's ring header: the figures a reader checks the entries against. */
export interface RingHeader {
  readonly cap: number;
  readonly dropped: number;
  readonly retained: number;
  readonly oldest_ordinal: number | null;
  readonly newest_ordinal: number | null;
  readonly complete: boolean;
  readonly taken_at: string;
}

function ringHeader(cap: number, dropped: number, ordinals: readonly number[], takenAt: string): RingHeader {
  return {
    cap, dropped, retained: ordinals.length,
    oldest_ordinal: ordinals.length === 0 ? null : ordinals[0]!,
    newest_ordinal: ordinals.length === 0 ? null : ordinals[ordinals.length - 1]!,
    complete: dropped === 0,
    taken_at: takenAt,
  };
}

/**
 * REQ-SESSION-134's entry as the record holds it: the stored columns, the ordinal as its position, metadata decoded.
 *
 * The falsified reading, kept beside its repair: Part U's first execution found the `timeline` table holding neither the
 * requirement's `id` (12 hex) nor its `severity` (ADR-0024 note, defect 42), so the export carried the ordinal as the
 * entry's position and no severity at all, and this function said "the export carries what is stored and says nothing
 * more". Schema v10 added both columns and every writer now mints an id, so both are carried.
 *
 * An entry recorded before v10 has an empty id, and the field is omitted rather than emitted blank: REQ-SESSION-199
 * requires the identifier for every entry it emits "that has one", and an entry whose record never held one has none.
 * The ordinal stays beside it — it is the entry's position in the record, which the id does not give.
 */
function timelineEntry(r: TimelineRow): JsonValue {
  return {
    ordinal: r.ordinal, ...(r.id === '' ? {} : { id: r.id }), timestamp: r.at, type: r.name,
    severity: r.severity, actor: r.actor, message: r.message, metadata: parseJson(r.metadata) ?? r.metadata,
  };
}

/** REQ-SESSION-135's shape from the issue row's columns (the issues record keeps no serialised entry beside them). */
function issueEntry(r: IssueRow): JsonValue {
  return { id: r.id, timestamp: r.recorded_at, kind: r.kind, severity: r.severity, actor: r.actor, message: r.message, evidence_ref: r.evidence_ref, metadata: parseJson(r.metadata) ?? r.metadata };
}

function auditEntry(r: AuditRow): JsonValue {
  // The stored serialised entry, decoded so the document is one JSON value; every field it holds is kept (ADR-0024 item 1).
  return parseJson(r.entry) ?? { raw: r.entry };
}

/** REQ-SESSION-139: `outcome_kind` when the record carries one, else derived from `status` and `is_error` into the four buckets. */
function outcomeOf(t: ToolCallRow, entry: { outcome_kind?: unknown } | undefined): string {
  if (typeof entry?.outcome_kind === 'string' && entry.outcome_kind !== '') return entry.outcome_kind;
  if (t.status === 'blocked' || t.status === 'denied' || t.status === 'rejected') return 'rejected';
  if (t.is_error === 1 || t.status === 'error' || t.status === 'failed') return 'tool_error';
  if (t.status === 'completed' || t.status === 'ok' || t.status === 'success') return 'success';
  return 'unknown';
}

/**
 * REQ-SESSION-139 / REQ-SESSION-193: the metrics document, rebuilt from the session row and the evidence records as
 * they stand after the caps — a capped record's counts describe what is stored. Every figure the requirement lists
 * is a key named by its words; the record kinds this store does not keep (model inputs, context selections, report
 * validations, memory snapshots — REQ-SESSION-133 names them, no writer exists) count zero, stated in `records_kept`.
 */
export function metricsDocument(row: SessionRow, toolCalls: readonly ToolCallRow[], audit: readonly AuditRow[], issues: readonly IssueRow[], auditDropped: number, issuesDropped: number, toolCallsDropped: number): JsonValue {
  const outcomes: { [bucket: string]: number } = { success: 0, tool_error: 0, rejected: 0, unknown: 0 };
  let shellFailures = 0; let suspicious = 0; let timeouts = 0;
  const perAgent = new Map<string, { tool_calls: number; tool_errors: number }>();
  for (const t of toolCalls) {
    const entry = parseJson(t.entry) as { outcome_kind?: unknown; failure_kind?: unknown } | undefined;
    const bucket = outcomeOf(t, entry);
    outcomes[bucket] = (outcomes[bucket] ?? 0) + 1;
    const failure = typeof entry?.failure_kind === 'string' ? entry.failure_kind : '';
    if (bucket === 'shell_failure') shellFailures += 1;
    if (bucket === 'suspicious_success') suspicious += 1;
    if (bucket === 'timeout' || failure === 'timeout') timeouts += 1;
    const a = perAgent.get(t.agent_name) ?? { tool_calls: 0, tool_errors: 0 };
    a.tool_calls += 1;
    if (t.is_error === 1) a.tool_errors += 1;
    perAgent.set(t.agent_name, a);
  }
  const issuesByKind: { [kind: string]: number } = {};
  for (const i of issues) issuesByKind[i.kind] = (issuesByKind[i.kind] ?? 0) + 1;
  // REQ-SESSION-136's outcome-driven issues, counted from the issues record as well, so both readings are in the document.
  shellFailures = Math.max(shellFailures, issuesByKind['terminal_shell_failure'] ?? 0);
  suspicious = Math.max(suspicious, issuesByKind['terminal_suspicious_success'] ?? 0);
  timeouts = Math.max(timeouts, issuesByKind['terminal_timeout'] ?? 0);
  const sources: { [source: string]: number } = {};
  let decisions = 0; let denials = 0; let modeChanges = 0;
  for (const a of audit) {
    if (a.kind === 'mode_change') { modeChanges += 1; continue; }
    decisions += 1;
    if (a.decision === 'deny') denials += 1;
    sources[a.source] = (sources[a.source] ?? 0) + 1;
  }
  const slowest = [...toolCalls].filter((t) => t.elapsed_ms !== null).sort((a, b) => (b.elapsed_ms ?? 0) - (a.elapsed_ms ?? 0)).slice(0, 10)
    .map((t) => ({ tool_name: t.tool_name, agent_name: t.agent_name, call_id: t.call_id, elapsed_ms: t.elapsed_ms, status: t.status }));
  return {
    session_id: row.session_id, status: row.execution_status, updated_at: row.updated_at,
    tool_calls: row.tool_calls, tokens: { input: row.tokens_input, output: row.tokens_output, total: row.tokens_input + row.tokens_output }, cost: row.cost, compressions: row.compressions,
    per_agent: Object.fromEntries([...perAgent.entries()].map(([name, a]) => [name, a])),
    tool_call_records: toolCalls.length,
    tool_outcomes: outcomes,
    terminal_shell_failures: shellFailures, suspicious_successes: suspicious, timeouts,
    slowest_tool_calls: slowest,
    model_input_records: 0, stale_drops: 0, context_selections: 0, report_validations: 0, report_downgrades: 0,
    permission_decisions: decisions, permission_denials: denials, permission_sources: sources, mode_changes: modeChanges,
    issues_total: issues.length, issues_by_kind: issuesByKind,
    records_kept: {
      permission_audit: { retained: audit.length, dropped: auditDropped }, issues: { retained: issues.length, dropped: issuesDropped }, tool_calls: { retained: toolCalls.length, dropped: toolCallsDropped },
      model_inputs: 'not kept by this store', context_selections: 'not kept by this store', report_validations: 'not kept by this store', memory_snapshots: 'not kept by this store',
    },
  };
}

export interface RecordsExport {
  readonly document: JsonValue;
  readonly counts: { readonly timeline: number; readonly issues: number; readonly permission_audit: number; readonly audit_dropped: number; readonly issues_dropped: number };
}

/** REQ-SESSION-199: the four records, one read transaction, absence as an empty record. `undefined` when there is no such session. */
export function readRecords(dal: StoreDal, sessionId: SessionId, wall: WallClock): RecordsExport | undefined {
  return dal.readTransaction(() => {
    const row = dal.getSession(sessionId);
    if (!row) return undefined;
    const takenAt = toIsoUtc(wall.instant());
    const timeline = dal.timelineOf(sessionId);
    const issues = dal.issuesOf(sessionId);
    const audit = dal.auditOf(sessionId);
    const toolCalls = dal.toolCallsOf(sessionId);
    const auditState = dal.ringState(sessionId, 'permission_audit');
    const issuesState = dal.ringState(sessionId, 'issues');
    const toolState = dal.ringState(sessionId, 'tool_calls');
    const document: JsonValue = {
      timeline: timeline.map(timelineEntry),
      issues: { ...ringHeader(RING_CAPS.issues, issuesState.dropped, issues.map((i) => i.ordinal), takenAt), entries: issues.map((i) => ({ ordinal: i.ordinal, entry: issueEntry(i) })) },
      metrics: metricsDocument(row, toolCalls, audit, issues, auditState.dropped, issuesState.dropped, toolState.dropped),
      permission_audit: { ...ringHeader(RING_CAPS.permission_audit, auditState.dropped, audit.map((a) => a.ordinal), takenAt), entries: audit.map((a) => ({ ordinal: a.ordinal, kind: a.kind, entry: auditEntry(a) })) },
    };
    return { document, counts: { timeline: timeline.length, issues: issues.length, permission_audit: audit.length, audit_dropped: auditState.dropped, issues_dropped: issuesState.dropped } };
  });
}

export interface TrajectorySummary {
  readonly events: number;
  readonly unknown_events: number;
  readonly warnings: number;
  readonly runs: number;
  readonly iterations: number;
  readonly tool_calls: number;
  readonly tool_failures: number;
  readonly permission_decisions: number;
  readonly permission_denials: number;
  readonly verifier_runs: number;
  readonly verifier_failures: number;
  readonly child_agents: number;
  readonly errors: number;
  readonly fatal_errors: number;
  readonly event_types: { readonly [kind: string]: number };
  readonly tokens: { readonly input: number; readonly output: number; readonly total: number };
  readonly cost: string;
}

export interface Trajectory {
  readonly document: JsonValue;
  readonly runs: number;
  readonly dropped: number;
  readonly warnings: number;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** REQ-SESSION-153's summary, recomputed from the exported events alone and from no other source. */
export function summariseTrajectory(events: readonly { [key: string]: JsonValue }[], warnings: number): TrajectorySummary {
  const types: { [kind: string]: number } = {};
  let unknown = 0; let runs = 0; let iterations = 0; let toolCalls = 0; let toolFailures = 0; let decisions = 0; let denials = 0;
  let verifierRuns = 0; let verifierFailures = 0; let children = 0; let errors = 0; let fatal = 0;
  let tokens = { input: 0, output: 0, total: 0 }; let cost = '0';
  for (const e of events) {
    const kind = str(e['event']);
    types[kind] = (types[kind] ?? 0) + 1;
    if (!EVENT_KINDS.has(kind)) unknown += 1;
    switch (kind) {
      case 'session.start': runs += 1; break;
      case 'iteration.start': iterations += 1; break;
      case 'tool.start': toolCalls += 1; break;
      case 'tool.finish': if (e['error'] !== null && e['error'] !== undefined || (str(e['status']) !== '' && str(e['status']) !== 'completed' && str(e['status']) !== 'ok')) toolFailures += 1; break;
      case 'permission.decision': decisions += 1; if (str(e['decision']) === 'deny') denials += 1; break;
      case 'verifier.result': verifierRuns += 1; if (e['passed'] === false || e['ok'] === false) verifierFailures += 1; break;
      case 'child.spawn': children += 1; break;
      case 'error': errors += 1; if (e['fatal'] === true) fatal += 1; break;
      case 'usage.update': case 'session.end': {
        // Cumulative figures: the latest one in stored order stands.
        const t = e['tokens']; const c = e['cost'];
        if (t !== null && typeof t === 'object' && !Array.isArray(t)) tokens = { input: num(t['input']), output: num(t['output']), total: num(t['total']) };
        if (c !== null && typeof c === 'object' && !Array.isArray(c)) cost = str(c['total']) || cost;
        break;
      }
      default: break;
    }
  }
  return { events: events.length, unknown_events: unknown, warnings, runs, iterations, tool_calls: toolCalls, tool_failures: toolFailures, permission_decisions: decisions, permission_denials: denials, verifier_runs: verifierRuns, verifier_failures: verifierFailures, child_agents: children, errors, fatal_errors: fatal, event_types: types, tokens, cost };
}

/**
 * REQ-SESSION-153 / REQ-SESSION-193: one session's trajectory document. Identity from the LATEST `session.start` (a
 * resumed session's most recent run — the caller reports it, REQ-SESSION-189); the workspace as the run reported it
 * and never a path of this machine (REQ-EVENTS-132); events as the stored payloads, parsed. `undefined` for no session.
 */
export function readTrajectory(dal: StoreDal, sessionId: SessionId): Trajectory | undefined {
  return dal.readTransaction(() => {
    const row = dal.getSession(sessionId);
    if (!row) return undefined;
    const rows: EventRow[] = dal.eventsOf(sessionId);
    const events: { [key: string]: JsonValue }[] = [];
    let warnings = 0;
    for (const r of rows) {
      const parsed = parseJson(r.payload);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) events.push(parsed);
      else warnings += 1;
    }
    const starts = events.filter((e) => str(e['event']) === 'session.start');
    const latest = starts[starts.length - 1];
    const first = events[0]; const last = events[events.length - 1];
    const startedAt = str(latest?.['timestamp']) || str(first?.['timestamp']) || row.run_started_at || row.created_at;
    const endedAt = str(last?.['timestamp']) || row.updated_at;
    const started = Date.parse(startedAt); const ended = Date.parse(endedAt);
    const duration = Number.isFinite(started) && Number.isFinite(ended) && ended >= started ? (ended - started) / 1000 : 0;
    const summary = summariseTrajectory(events, warnings);
    // The writer named the workspace key `workspace` before Part U corrected it to REQ-SESSION-193's `workspace_root`; both are read.
    const workspace = str(latest?.['workspace_root']) || str(latest?.['workspace']) || row.workspace_root;
    const document: JsonValue = {
      trajectory_version: 1,
      session_id: row.session_id,
      task: str(latest?.['task']),
      workspace,
      permission_mode: str(latest?.['permission_mode']) || row.permission_mode || '',
      started_at: startedAt,
      ended_at: endedAt,
      status: row.execution_status,
      stop_reason: row.stop_reason ?? '',
      duration_seconds: duration,
      truncated: row.truncated === 1,
      dropped_events: row.dropped_count,
      summary: summary as unknown as JsonValue,
      events,
    };
    return { document, runs: summary.runs, dropped: row.dropped_count, warnings };
  });
}

/** REQ-EVENTS-144: exactly `trajectory_version`, `count`, `trajectories`, in selection order. */
export function batchDocument(documents: readonly JsonValue[]): JsonValue {
  return { trajectory_version: 1, count: documents.length, trajectories: [...documents] };
}

/** REQ-SESSION-189's two disclosures, as sentences the confirmation carries (never the file). */
export function trajectoryWarnings(sessionId: string, t: Trajectory): string[] {
  const out: string[] = [];
  if (t.runs > 1) out.push(`Session ${sessionId} was resumed: the document spans ${t.runs} runs and its identity fields describe the most recent one.`);
  if (t.dropped > 0) out.push(`Session ${sessionId}'s history is capped: ${t.dropped} event${t.dropped === 1 ? '' : 's'} were dropped, so the document does not cover the whole run.`);
  if (t.warnings > 0) out.push(`Session ${sessionId}: ${t.warnings} stored line${t.warnings === 1 ? '' : 's'} could not be decoded and ${t.warnings === 1 ? 'is' : 'are'} not in the document.`);
  return out;
}

/** REQ-EVENTS-145 / REQ-TRACE-061 through ADR-0004: whole or not at all, parents created, the replacement retried. */
export async function writeExport(destination: string, document: JsonValue, timers: Timers): Promise<Result<{ bytes: number; attempts: number }, { readonly code: string; readonly headline: string; readonly detail?: string }>> {
  const text = renderExport(document);
  const r = await replaceDocument(destination, text, { ladder: EXPORT_LADDER, timers, createParent: true });
  if (!r.ok) return { ok: false, error: { code: r.error.code, headline: r.error.headline, ...(r.error.detail === undefined ? {} : { detail: r.error.detail }) } };
  return { ok: true, value: { bytes: Buffer.byteLength(text, 'utf8'), attempts: r.value.attempts } };
}
