/**
 * R-043 — the run-autopsy snapshot: one read-only pass over a session's own
 * records, joining what the autopsy of `2e21e324` joined by hand.
 *
 * Covered work (nothing minted): REQ-SESSION-139's metrics document rebuilt
 * from state plus evidence records, REQ-SESSION-199's four records read in
 * one read transaction, REQ-SESSION-153's trajectory summary recomputed from
 * the exported events alone, REQ-SESSION-136's tool-call record fields, and
 * REQ-SESSION-134/135's timeline and issue shapes. Locators are carried,
 * never resolved (REQ-EVENTS-056). The snapshot writes nothing to the
 * session's own record: every read runs inside `readTransaction`, and the
 * only wall-clock read is the ring headers' `taken_at`.
 *
 * What it answers, per section:
 * - `session`: the row's identity, status, stop reason, iterations, tokens,
 *   cost, tool-call and compression counts, token-sample span.
 * - `tools`: per-tool totals with elapsed sums (the dominated-wall-time
 *   read), failed-vs-blocked partitioned, plus the slowest calls.
 * - `failures`: every failed or blocked call grouped by cause — the
 *   `failure_kind` where the record carries one, else the status — with the
 *   tool, the agent, the truncated command or path, and the result head.
 * - `usage`: the largest `usage.update` jumps, so "slow" is a number.
 * - `coherence`: the checks the autopsy ran by hand — a NULL summary on a
 *   stopped run, a cost of zero beside non-zero tokens, duplicate reads of
 *   the same path, identical commands retried.
 * - `requests`: per-model-key tool-call attribution from the children
 *   record (the usage.update payload carries tokens and cost alone, so the
 *   model_key the children carry is the identity the store keeps), newest
 *   totals last.
 */

import type { SessionId, WallClock } from '@rotaris/kernel';
import { type AuditRow, type IssueRow, type SessionRow, type StoreDal, type TimelineRow } from '@rotaris/store';
import { metricsDocument } from './export.js';
import type { JsonValue } from './export.js';

export interface AutopsyToolRow {
  readonly tool_name: string;
  readonly status: string;
  readonly calls: number;
  readonly errors: number;
  readonly elapsed_ms: number;
}

export interface AutopsyFailure {
  readonly ordinal: number;
  readonly tool_name: string;
  readonly agent_name: string;
  readonly status: string;
  readonly cause: string;
  readonly detail: string;
}

export interface AutopsyFailureGroup {
  readonly cause: string;
  readonly count: number;
  readonly tools: readonly string[];
  readonly ordinals: readonly number[];
  readonly sample: string;
}

export interface AutopsyUsageJump {
  readonly at: string;
  readonly input: number;
  readonly output: number;
  readonly jump: number;
}

export interface AutopsyCoherence {
  readonly null_summary_on_stopped: boolean;
  readonly zero_cost_with_tokens: boolean;
  readonly duplicate_reads: readonly { readonly path: string; readonly reads: number }[];
  readonly retried_commands: readonly { readonly command: string; readonly times: number }[];
}

export interface AutopsyEndpointRow {
  readonly endpoint: string;
  readonly agents: readonly string[];
  readonly tool_calls: number;
}

export interface AutopsySnapshot {
  readonly session: {
    readonly session_id: string;
    readonly execution_status: string;
    readonly stop_reason: string | null;
    readonly iterations_completed: number;
    readonly tokens_input: number;
    readonly tokens_output: number;
    readonly cost: string;
    readonly tool_calls: number;
    readonly compressions: number;
    readonly summary_status: string | null;
    readonly summary_text_head: string;
    readonly token_samples: number;
    readonly token_span: string | null;
  };
  readonly tools: readonly AutopsyToolRow[];
  readonly failures: readonly AutopsyFailureGroup[];
  readonly usage_jumps: readonly AutopsyUsageJump[];
  readonly coherence: AutopsyCoherence;
  readonly requests: readonly AutopsyEndpointRow[];
  readonly counts: { readonly timeline: number; readonly issues: number; readonly permission_audit: number; readonly children: number; readonly checkpoints: number };
}

function parseJson(text: string): Record<string, unknown> | undefined {
  try {
    const v = JSON.parse(text) as unknown;
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function head(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** The command or path a failure was about, truncated for the report. */
function failureDetail(tool: string, entry: Record<string, unknown> | undefined): string {
  const args = entry?.['args'];
  const argv = args !== null && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : undefined;
  if (tool === 'terminal') return head(str(argv?.['command']).replace(/\s+/g, ' '), 160);
  const path = argv?.['path'] ?? argv?.['pattern'];
  if (typeof path === 'string' && path !== '') return head(path, 160);
  return head(str(entry?.['result']), 220);
}

/**
 * R-043: one read-only pass over the session's own records. `undefined` for
 * no such session. Every table read runs inside one `readTransaction`, so the
 * entries and the ring headers come from one consistent state (ADR-0024 c.5).
 */
export function readAutopsy(dal: StoreDal, sessionId: SessionId, _wall: WallClock): AutopsySnapshot | undefined {
  return dal.readTransaction(() => {
    const row: SessionRow | undefined = dal.getSession(sessionId);
    if (!row) return undefined;
    const toolCalls = dal.toolCallsOf(sessionId);
    const timeline: TimelineRow[] = dal.timelineOf(sessionId);
    const issues: IssueRow[] = dal.issuesOf(sessionId);
    const audit: AuditRow[] = dal.auditOf(sessionId);
    const children = dal.childrenOf(sessionId);
    const checkpoints = dal.listCheckpoints(sessionId);
    const events = dal.eventsOf(sessionId);

    // Per-tool totals with elapsed sums; failed vs blocked partitioned by status.
    const byTool = new Map<string, AutopsyToolRow>();
    for (const t of toolCalls) {
      const key = `${t.tool_name}\0${t.status}`;
      const prev = byTool.get(key) ?? { tool_name: t.tool_name, status: t.status, calls: 0, errors: 0, elapsed_ms: 0 };
      byTool.set(key, {
        ...prev,
        calls: prev.calls + 1,
        errors: prev.errors + (t.is_error === 1 ? 1 : 0),
        elapsed_ms: prev.elapsed_ms + (t.elapsed_ms ?? 0),
      });
    }
    const tools = [...byTool.values()].sort((a, b) => b.elapsed_ms - a.elapsed_ms);

    // Failures grouped by cause: the record's failure_kind where it carries
    // one, else the status. Two failures with the same root are one group.
    const failures: AutopsyFailure[] = [];
    for (const t of toolCalls) {
      if (t.is_error !== 1 && t.status === 'ok') continue;
      const entry = parseJson(t.entry);
      const cause = str(entry?.['failure_kind']) || t.status;
      failures.push({
        ordinal: t.ordinal,
        tool_name: t.tool_name,
        agent_name: t.agent_name,
        status: t.status,
        cause,
        detail: failureDetail(t.tool_name, entry) || head(str(entry?.['result']), 220),
      });
    }
    const groups = new Map<string, AutopsyFailure[]>();
    for (const f of failures) {
      const list = groups.get(f.cause) ?? [];
      list.push(f);
      groups.set(f.cause, list);
    }
    const failureGroups: AutopsyFailureGroup[] = [...groups.entries()]
      .map(([cause, list]) => ({
        cause,
        count: list.length,
        tools: [...new Set(list.map((f) => f.tool_name))].sort(),
        ordinals: list.map((f) => f.ordinal),
        sample: list[0]?.detail ?? '',
      }))
      .sort((a, b) => b.count - a.count);

    // Usage curve with the largest jumps, from the stored usage.update payloads.
    const jumps: AutopsyUsageJump[] = [];
    let prev = 0;
    for (const e of events) {
      if (e.kind !== 'usage.update') continue;
      const payload = parseJson(e.payload);
      const tokens = payload?.['tokens'];
      const input = tokens !== null && typeof tokens === 'object' && !Array.isArray(tokens) ? num((tokens as Record<string, unknown>)['input']) : 0;
      const output = tokens !== null && typeof tokens === 'object' && !Array.isArray(tokens) ? num((tokens as Record<string, unknown>)['output']) : 0;
      const jump = input - prev;
      prev = input;
      if (jump > 0) jumps.push({ at: e.at, input, output, jump });
    }
    jumps.sort((a, b) => b.jump - a.jump);
    const usageJumps = jumps.slice(0, 10);

    // Coherence: the checks the autopsy ran by hand.
    const stopped = row.execution_status !== 'idle' && row.execution_status !== 'running' && row.execution_status !== 'background' && row.execution_status !== 'waiting';
    const nullSummary = (row.summary_text ?? '') === '';
    const readPaths = new Map<string, number>();
    for (const t of toolCalls) {
      if (t.tool_name !== 'read_file' || t.status !== 'ok') continue;
      const entry = parseJson(t.entry);
      const args = entry?.['args'];
      const path = args !== null && typeof args === 'object' && !Array.isArray(args) ? str((args as Record<string, unknown>)['path']) : '';
      if (path !== '') readPaths.set(path, (readPaths.get(path) ?? 0) + 1);
    }
    const duplicateReads = [...readPaths.entries()]
      .filter(([, n]) => n > 1)
      .map(([path, reads]) => ({ path, reads }))
      .sort((a, b) => b.reads - a.reads)
      .slice(0, 10);
    const commands = new Map<string, number>();
    for (const t of toolCalls) {
      if (t.tool_name !== 'terminal') continue;
      const entry = parseJson(t.entry);
      const args = entry?.['args'];
      const command = args !== null && typeof args === 'object' && !Array.isArray(args) ? head(str((args as Record<string, unknown>)['command']).replace(/\s+/g, ' '), 120) : '';
      if (command !== '') commands.set(command, (commands.get(command) ?? 0) + 1);
    }
    const retriedCommands = [...commands.entries()]
      .filter(([, n]) => n > 1)
      .map(([command, times]) => ({ command, times }))
      .sort((a, b) => b.times - a.times)
      .slice(0, 10);

    // Per-model-key attribution: the store records no provider or model on
    // the usage.update payload (REQ-EVENTS-053's payload is tokens and cost
    // alone), so the snapshot attributes tool calls to the model_key the
    // children record carries. The entry agent's own calls read as the
    // session's own model key: the children record names every key the run
    // used, and the entry agent is the one no child names.
    const callsByAgent = new Map<string, number>();
    for (const t of toolCalls) callsByAgent.set(t.agent_name, (callsByAgent.get(t.agent_name) ?? 0) + 1);
    const childAgents = new Set(children.map((c) => c.given_name));
    const keyByAgent = new Map<string, string>();
    for (const c of children) keyByAgent.set(c.given_name, c.model_key);
    const entryKey = [...new Set(children.map((c) => c.model_key))].length === 1 ? children[0]!.model_key : 'session';
    const requests: AutopsyEndpointRow[] = [...callsByAgent.entries()]
      .map(([agent, calls]) => ({
        endpoint: childAgents.has(agent) ? keyByAgent.get(agent)! : entryKey,
        agents: [agent] as readonly string[],
        tool_calls: calls,
      }))
      .reduce<AutopsyEndpointRow[]>((rows, r) => {
        const prev = rows.find((x) => x.endpoint === r.endpoint);
        if (!prev) return [...rows, r];
        return rows.map((x) =>
          x.endpoint === r.endpoint
            ? { endpoint: x.endpoint, agents: [...x.agents, ...r.agents].sort(), tool_calls: x.tool_calls + r.tool_calls }
            : x,
        );
      }, [])
      .sort((a, b) => b.tool_calls - a.tool_calls);

    let tokenSpan: string | null = null;
    try {
      const samples = JSON.parse(row.token_samples) as unknown;
      if (Array.isArray(samples) && samples.length > 0) {
        const first = (samples[0] as [string, number])[0];
        const last = (samples[samples.length - 1] as [string, number])[0];
        tokenSpan = typeof first === 'string' && typeof last === 'string' ? `${first} → ${last}` : null;
      }
    } catch {
      tokenSpan = null;
    }

    return {
      session: {
        session_id: row.session_id,
        execution_status: row.execution_status,
        stop_reason: row.stop_reason,
        iterations_completed: row.iterations_completed,
        tokens_input: row.tokens_input,
        tokens_output: row.tokens_output,
        cost: row.cost,
        tool_calls: row.tool_calls,
        compressions: row.compressions,
        summary_status: row.summary_status,
        summary_text_head: head(row.summary_text ?? '', 200),
        token_samples: Array.isArray(JSON.parse(row.token_samples || '[]')) ? (JSON.parse(row.token_samples || '[]') as unknown[]).length : 0,
        token_span: tokenSpan,
      },
      tools,
      failures: failureGroups,
      usage_jumps: usageJumps,
      coherence: {
        null_summary_on_stopped: stopped && nullSummary,
        zero_cost_with_tokens: row.cost === '0' && row.tokens_input + row.tokens_output > 0,
        duplicate_reads: duplicateReads,
        retried_commands: retriedCommands,
      },
      requests,
      counts: { timeline: timeline.length, issues: issues.length, permission_audit: audit.length, children: children.length, checkpoints: checkpoints.length },
    };
  });
}

/** The snapshot as a JSON value, for the script that prints it. */
export function autopsyDocument(snapshot: AutopsySnapshot): JsonValue {
  return snapshot as unknown as JsonValue;
}

/** REQ-SESSION-139's metrics beside the snapshot, from the same records. */
export function autopsyMetrics(dal: StoreDal, sessionId: SessionId): JsonValue | undefined {
  return dal.readTransaction(() => {
    const row = dal.getSession(sessionId);
    if (!row) return undefined;
    const toolCalls = dal.toolCallsOf(sessionId);
    const audit = dal.auditOf(sessionId);
    const issues = dal.issuesOf(sessionId);
    const auditState = dal.ringState(sessionId, 'permission_audit');
    const issuesState = dal.ringState(sessionId, 'issues');
    const toolState = dal.ringState(sessionId, 'tool_calls');
    return metricsDocument(row, toolCalls, audit, issues, auditState.dropped, issuesState.dropped, toolState.dropped);
  });
}
