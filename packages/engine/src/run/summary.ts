import { millis, type Millis, type SessionId, type Timers } from '@rotaris/kernel';
import { replaceDocument, type RetryLadder } from '@rotaris/platform';
import type { SessionRow, StoreDal, TimelineRow } from '@rotaris/store';
import { NOT_KEPT, sessionMetrics, type SessionMetrics } from '../export.js';
import { costLabelOf } from './cost-label.js';
import { cut } from './cut.js';

/**
 * REQ-SESSION-028 / REQ-SESSION-006 / REQ-SESSION-033 — the one file a save
 * still causes: the human-readable summary, rebuilt from the state the save
 * captured and written AFTER the commit, off the run's critical path, through
 * ADR-0004's primitive under REQ-SESSION-033's ladder (at most six attempts:
 * 0.05, 0.1, 0.2, 0.4, 0.8 s). Nothing reads it; a loader never takes a fact
 * from it. Writes are ordered by the save's generation so an older rebuild can
 * never overwrite a newer one; a failed replacement leaves the previous file
 * in force behind a warning and never fails the save (ADR-0008).
 */
export const SUMMARY_LADDER: RetryLadder = { delays: [50, 100, 200, 400, 800].map((n) => millis(n)) as Millis[] };

/** The outcome a session's readers present: its record's summary, `summary.md`'s Outcome block, the agents view's activity line. */
export interface SessionOutcome {
  readonly status: string;
  readonly severity: string;
  readonly message: string;
}

/** REQ-SESSION-062: the type of the entry a repair writes into the session it corrects. */
export const RECOVERY_ENTRY = 'session.interrupted_recovered';

/**
 * OQ-60 as ruled (R-071, 2026-10-06): what a session says of its outcome. REQ-ORCH-082 stays the single definition of
 * end-of-run summarization and is written only by a run's end (the three summary columns). A session whose run died
 * without one is set `interrupted` by REQ-SESSION-060's repair — the only writer of that status (REQ-SESSION-073) — and
 * REQ-SESSION-062's correction entry is the whole of what it says about itself: while the session is `interrupted`, its
 * readers present the latest such entry (status `interrupted`, the entry's severity and message) in place of the columns,
 * which are NULL for a first run that died and describe an earlier run otherwise. Every other session presents its columns,
 * or nothing. No summary is derived here: the entry is presented as it was written.
 */
export function sessionOutcomeOf(row: Pick<SessionRow, 'execution_status' | 'summary_status' | 'summary_severity' | 'summary_text'>, correction: Pick<TimelineRow, 'severity' | 'message'> | null | undefined): SessionOutcome | null {
  if (row.execution_status === 'interrupted' && correction) return { status: 'interrupted', severity: correction.severity, message: correction.message };
  return row.summary_status && row.summary_severity && row.summary_text ? { status: row.summary_status, severity: row.summary_severity, message: row.summary_text } : null;
}

/** The correction entry `sessionOutcomeOf` reads, looked up only for a session that is `interrupted`. */
export function recoveryEntryOf(dal: Pick<StoreDal, 'latestTimelineEntry'>, row: Pick<SessionRow, 'session_id' | 'execution_status'>): TimelineRow | null {
  return row.execution_status === 'interrupted' ? dal.latestTimelineEntry(row.session_id as Parameters<StoreDal['latestTimelineEntry']>[0], RECOVERY_ENTRY) ?? null : null;
}

/** REQ-SESSION-140: the task line's cap, the marker counted inside it (REQ-SESSION-194). */
export const SUMMARY_TASK_CAP = 240;
/** REQ-SESSION-140: how many of the slowest calls the summary lists (the metrics document keeps 10, REQ-SESSION-139). */
export const SUMMARY_SLOWEST = 5;

/** One line of the Agents section: an iteration's root, a plan cycle's root, a delegated child, or a name only the tool-call record knows. */
export interface SummaryAgent {
  readonly name: string;
  readonly persona: string | null;
  /** What the agent is: `iteration 1 root`, `plan cycle root`, `child of <parent>`, or null for a name only the calls carry. */
  readonly role: string | null;
  /** Its state as the record holds it, or null where the record holds none. */
  readonly state: string | null;
  /** Its counted calls; null where the record holds no count for it (a root row written before v26). */
  readonly toolCalls: number | null;
}

/** Everything `summary.md` is rendered from, read in one read transaction (`summaryFactsOf`). */
export interface SummaryFacts {
  readonly row: SessionRow;
  readonly outcome: SessionOutcome | null;
  /** The first submitted prompt's text; null where none was submitted (or the transcript was cleared, REQ-CHAT-084). */
  readonly task: string | null;
  readonly metrics: SessionMetrics;
  readonly agents: readonly SummaryAgent[];
}

type SummaryDal = Pick<StoreDal, 'readTransaction' | 'getSession' | 'latestTimelineEntry' | 'firstPromptRow' | 'toolCallDigestOf' | 'auditDigestOf' | 'issuesOf' | 'ringState' | 'iterationsOf' | 'planRootsOf' | 'childrenOf'>;

/**
 * REQ-SESSION-140 / REQ-SESSION-006: the facts of one session's summary, from the state and the evidence records in ONE read
 * transaction, so no section comes from a different save than another. The tool-call record and the permission audit are read
 * without their serialised entries (`toolCallDigestOf`, `auditDigestOf`): every save rebuilds this, and a record of 5,000
 * calls' arguments and results is not read to be counted. The outcome is `sessionOutcomeOf`'s (OQ-60 as ruled), so every
 * rebuild — a run's, a continuation's, a repair's — presents a recovered session's correction entry.
 */
export function summaryFactsOf(dal: SummaryDal, sessionId: SessionId): SummaryFacts | undefined {
  return dal.readTransaction(() => {
    const row = dal.getSession(sessionId);
    if (!row) return undefined;
    const outcome = sessionOutcomeOf(row, recoveryEntryOf(dal, row));
    const prompt = dal.firstPromptRow(sessionId);
    const toolCalls = dal.toolCallDigestOf(sessionId);
    const metrics = sessionMetrics(row, toolCalls, dal.auditDigestOf(sessionId), dal.issuesOf(sessionId),
      dal.ringState(sessionId, 'permission_audit').dropped, dal.ringState(sessionId, 'issues').dropped, dal.ringState(sessionId, 'tool_calls').dropped);
    return { row, outcome, task: prompt === undefined ? null : prompt.body, metrics, agents: agentsOf(dal, sessionId, metrics) };
  });
}

/**
 * REQ-SESSION-140's Agents: each agent with the calls it counted. A root and a child read their own counters — an
 * iteration's root `iterations.root_tool_calls`, a plan cycle's root `plan_roots.tool_calls` (store v33), a child
 * `children.tool_calls` — never the tool-call record, a ring capped at 5,000 rows (REQ-SESSION-133) that reads fewer calls
 * than were made once the cap has dropped its oldest. Where no counter exists — a plan cycle's root recorded before v33, an
 * agent known only by its records — the record is read while it has dropped nothing, and `n/a` once it has, never a figure
 * it knows may be short (the repair of `summary-md-reads-a-plan-cycle-roots-calls-from-the-capped-tool-call-record.md`).
 */
function agentsOf(dal: SummaryDal, sessionId: SessionId, metrics: SessionMetrics): SummaryAgent[] {
  const agents: SummaryAgent[] = [];
  const whole = metrics.records_kept.tool_calls.dropped === 0;
  const recorded = (name: string): number | null => (whole ? metrics.per_agent[name]?.tool_calls ?? null : null);
  // A child's parent is named by its task id: an iteration's root, a plan cycle's root, or another child.
  const nameOf = new Map<string, string>();
  for (const it of dal.iterationsOf(sessionId)) {
    nameOf.set(it.root_task_id, it.root_canonical_name);
    const state = it.state === 'closed' ? `closed${it.outcome ? ` (${it.outcome})` : ''}` : `open${it.interruption ? ` (${it.interruption})` : ''}`;
    agents.push({ name: it.root_canonical_name, persona: it.root_persona, role: `iteration ${it.iteration} root`, state, toolCalls: it.root_tool_calls });
  }
  for (const p of dal.planRootsOf(sessionId)) {
    nameOf.set(p.root_task_id, p.root_canonical_name);
    agents.push({ name: p.root_canonical_name, persona: p.root_persona, role: 'plan cycle root', state: null, toolCalls: p.tool_calls ?? recorded(p.root_canonical_name) });
  }
  const children = dal.childrenOf(sessionId);
  for (const c of children) nameOf.set(c.task_id, c.canonical_name);
  for (const c of children) {
    agents.push({ name: c.canonical_name, persona: c.persona, role: c.parent_id ? `child of ${nameOf.get(c.parent_id) ?? c.parent_id}` : 'child', state: c.state, toolCalls: c.tool_calls });
  }
  const named = new Set(agents.map((a) => a.name));
  for (const name of Object.keys(metrics.per_agent)) if (!named.has(name)) agents.push({ name, persona: null, role: null, state: null, toolCalls: recorded(name) });
  return agents;
}

const NA = 'n/a';
const count = (n: number | null): string => (n === null ? NA : String(n));

function metricsLines(f: SummaryFacts): string[] {
  const { row, metrics: m } = f;
  const tokens = m.tokens.total > 0 ? `${m.tokens.input} in / ${m.tokens.output} out (${m.tokens.total} total)` : `${NA} (no usage recorded)`;
  const label = costLabelOf(row.cost, row.cost_qualifier);
  const cost = label.qualifier === 'unknown' ? `${NA} (${label.text})` : label.text;
  const kept = m.records_kept.tool_calls;
  const outcomes = Object.entries(m.tool_outcomes).map(([bucket, n]) => `${bucket} ${n}`).join(', ');
  const kinds = Object.entries(m.issues_by_kind).sort(([a], [b]) => a.localeCompare(b)).map(([kind, n]) => `${kind} ${n}`).join(', ');
  return [
    `- Iterations completed: ${row.iterations_completed}`,
    `- Tool calls: ${row.tool_calls}`,
    `- Tokens: ${tokens}`,
    `- Cost: ${cost}`,
    `- Compressions: ${row.compressions}`,
    `- Tool-call records: ${kept.retained}${kept.dropped > 0 ? ` (${kept.dropped} older records dropped by the retention cap)` : ''}`,
    `- Tool outcomes: ${outcomes}`,
    `- Permission decisions: ${m.permission_decisions} (${m.permission_denials} denied); mode changes: ${m.mode_changes}`,
    `- Issues: ${m.issues_total}${kinds ? ` (${kinds})` : ''}`,
    `- Model-input records: ${NA} (${NOT_KEPT})`,
    `- Context selections: ${NA} (${NOT_KEPT})`,
    `- Report validations: ${NA} (${NOT_KEPT})`,
  ];
}

/**
 * REQ-SESSION-140's Warnings, every kind it names on its own line. The three whose record this store does not keep read
 * `n/a`, never `0`: stale-input drops (the model-input record), report downgrades (the report-validation record), and
 * mostly-elided artifacts, which no requirement defines and no record measures (OQ-207: the build proceeds under `n/a`).
 */
function warningLines(m: SessionMetrics): string[] {
  return [
    `- Stale-input drops: ${NA} (the model-input record is ${NOT_KEPT})`,
    `- Mostly-elided artifacts: ${NA} (no record measures how much of an artifact was elided)`,
    `- Report downgrades: ${NA} (the report-validation record is ${NOT_KEPT})`,
    `- Permission denials: ${m.permission_denials} (counted from the permission audit, where each is an entry)`,
    `- Tool errors: ${m.tool_outcomes['tool_error'] ?? 0}`,
    `- Terminal failures: ${m.terminal_shell_failures}`,
    `- Terminal suspicious successes: ${m.suspicious_successes}`,
    // The metrics document's `timeouts`: every tool call that timed out, the terminal's among them, or the terminal's issues.
    `- Timeouts: ${m.timeouts} (tool calls that timed out, a terminal's among them)`,
  ];
}

function agentLine(a: SummaryAgent): string {
  const who = `${a.name}${a.persona ? ` (${a.persona})` : ''}`;
  const what = [a.role, a.state].filter((x): x is string => x !== null && x !== '').join(', ');
  return `- ${who}${what ? ` — ${what}` : ''}; tool calls: ${count(a.toolCalls)}`;
}

function slowestLines(m: SessionMetrics): string[] {
  const slowest = m.slowest_tool_calls.slice(0, SUMMARY_SLOWEST);
  if (slowest.length === 0) return ['- none recorded'];
  return slowest.map((t, i) => `${i + 1}. ${t.tool_name} — ${t.elapsed_ms === null ? NA : `${Math.round(t.elapsed_ms)} ms`} (${t.agent_name}, ${t.status})`);
}

/** The closing inspection note: where the rest of the record is obtained (REQ-SESSION-199, REQ-SESSION-142). */
export const SUMMARY_INSPECTION_NOTE = '_The rest of this session\'s record — the issues record, the timeline, the metrics document and the permission audit — is obtained through Export records… on this session in the session browser. The session log is the file `session.log` beside this one, once logging has written to it. This file is derived from the session record, and nothing reads it._';

/**
 * REQ-SESSION-140, in its order: the heading; status, workspace, created and updated; the task (the first submitted prompt,
 * cut to 240 characters under REQ-SESSION-194, `—` where none was submitted); the stop reason only where one is recorded;
 * Metrics; Warnings; Agents; Slowest Tools; the closing inspection note. An unavailable value reads `n/a` or `—`, never `0`.
 * The Outcome block is the build's own (OQ-60 as ruled, R-071): REQ-SESSION-140 names no outcome section, and it stands
 * after the stop reason, before Metrics, where the order the requirement lists is kept.
 */
export function renderSummary(f: SummaryFacts): string {
  const s = f.row;
  const task = f.task === null || f.task.trim() === '' ? '—' : cut(f.task.replace(/\s+/g, ' ').trim(), SUMMARY_TASK_CAP);
  const lines = [
    `# Session ${s.session_id}`,
    '',
    `- Status: ${s.execution_status}`,
    `- Workspace: ${s.workspace_root}`,
    `- Created: ${s.created_at}`,
    `- Updated: ${s.updated_at}`,
    `- Task: ${task}`,
  ];
  if (s.stop_reason !== null && s.stop_reason !== '') lines.push(`- Stop reason: ${s.stop_reason}`);
  if (f.outcome) lines.push('', '## Outcome', '', `${f.outcome.status} (${f.outcome.severity}): ${f.outcome.message}`);
  lines.push('', '## Metrics', '', ...metricsLines(f));
  lines.push('', '## Warnings', '', ...warningLines(f.metrics));
  lines.push('', '## Agents', '', ...(f.agents.length === 0 ? ['- none recorded'] : f.agents.map(agentLine)));
  lines.push('', '## Slowest Tools', '', ...slowestLines(f.metrics));
  lines.push('', SUMMARY_INSPECTION_NOTE, '');
  return lines.join('\n');
}

export class SummaryWriter {
  private lastGeneration = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly deps: { readonly file: string; readonly timers: Timers; readonly warn: (m: string) => void }) {}

  /**
   * Off the path: returns at once; the write is queued in generation order. `read` gives the facts as they stand when the
   * write runs (`summaryFactsOf`), so a rebuild a newer one has been queued behind is skipped: the newer one writes a state
   * at least as new. Every read the rebuild makes is inside the guard: a store closed behind a queued rebuild, or any read
   * that throws, is a warning and the previous file stays in force, and the chain never rejects — a repair's rebuild is
   * awaited by `closeAll` and by `summariesSettled`, and a rejection there would be one nothing handles.
   */
  rebuild(generation: number, read: () => SummaryFacts | undefined): void {
    if (generation <= this.lastGeneration) return;
    this.lastGeneration = generation;
    this.chain = this.chain.then(async () => {
      if (generation < this.lastGeneration) return;
      let text: string;
      try {
        const facts = read();
        if (!facts) return;
        text = renderSummary(facts);
      } catch (cause) { this.deps.warn(`summary.md was not rebuilt (generation ${generation}): ${String(cause instanceof Error ? cause.message : cause)}`); return; }
      const r = await replaceDocument(this.deps.file, text, { ladder: SUMMARY_LADDER, timers: this.deps.timers, createParent: true });
      if (!r.ok) this.deps.warn(`summary.md could not be replaced and the previous one stays in force: ${r.error.headline}`);
    });
  }

  /** For tests and for shutdown: every queued rebuild has landed. */
  settled(): Promise<void> {
    return this.chain;
  }
}
