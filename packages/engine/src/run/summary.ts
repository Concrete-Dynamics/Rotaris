import { countNoun, millis, type Millis, type SessionId, type Timers } from '@rotaris/kernel';
import { replaceDocument, type RetryLadder } from '@rotaris/platform';
import type { ElidedAttachmentRow, SessionRow, StoreDal, TimelineRow } from '@rotaris/store';
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
  /** PD-SESSION-002: the attached artifacts delegated agents were not given (`elidedAttachmentsOf`). */
  readonly elidedAttachments: ElidedAttachments;
}

/** PD-SESSION-002: how many distinct agent-and-artifact pairs were left out, and how many agents they concern. */
export interface ElidedAttachments {
  readonly artifacts: number;
  readonly agents: number;
}

/**
 * PD-SESSION-002 (REQ-SESSION-140's mostly-elided artifacts): the attached artifacts a delegated agent's
 * `PRIOR AGENT CONTEXT (FULL)` block left out because they did not fit its budget (REQ-LIBRARY-098), counted over the
 * timeline's `context_selection` entries. Each pair of agent and artifact counts once, however many times that agent's
 * payload was assembled. `execute` builds the blocks once per execution, so a REQ-ORCH-088 retry within it writes no second
 * entry; another execution of the same child does (a resumed child's retry in a later run, or a follow-up of a child that
 * never started, PD-ORCH-005 clause 22). An entry with no task id, or whose
 * `attached_elided` is absent, not an array, or holds something other than ids, contributes nothing it cannot name.
 */
export function elidedAttachmentsOf(rows: readonly Pick<ElidedAttachmentRow, 'task_id' | 'attached_elided'>[]): ElidedAttachments {
  const pairs = new Set<string>();
  const agents = new Set<string>();
  for (const row of rows) {
    if (row.task_id === null || row.attached_elided === null) continue;
    let ids: unknown;
    try { ids = JSON.parse(row.attached_elided); } catch { continue; }
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      if (typeof id !== 'string' || id === '') continue;
      pairs.add(JSON.stringify([row.task_id, id]));
      agents.add(row.task_id);
    }
  }
  return { artifacts: pairs.size, agents: agents.size };
}

type SummaryDal = Pick<StoreDal, 'readTransaction' | 'getSession' | 'latestTimelineEntry' | 'firstPromptRow' | 'toolCallDigestOf' | 'auditDigestOf' | 'issuesOf' | 'ringState' | 'iterationsOf' | 'planRootsOf' | 'childrenOf' | 'elidedAttachmentRowsOf'>;

/**
 * REQ-SESSION-140 / REQ-SESSION-006: the facts of one session's summary, from the state and the evidence records in ONE read
 * transaction, so no section comes from a different save than another. The tool-call record and the permission audit are read
 * without their serialised entries (`toolCallDigestOf`, `auditDigestOf`): every save rebuilds this, and a record of 5,000
 * calls' arguments and results is not read to be counted. The outcome is `sessionOutcomeOf`'s (OQ-60 as ruled), so every
 * rebuild — a run's, a continuation's, a repair's — presents a recovered session's correction entry. The mostly-elided
 * artifacts (PD-SESSION-002) read two fields of each `context_selection` timeline entry, never its message.
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
    const elidedAttachments = elidedAttachmentsOf(dal.elidedAttachmentRowsOf(sessionId));
    return { row, outcome, task: prompt === undefined ? null : prompt.body, metrics, agents: agentsOf(dal, sessionId, metrics), elidedAttachments };
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
/** PD-SESSION-002: what the Mostly-elided artifacts line counts, in the line's own words. */
const ELIDED_WHAT = 'attached artifacts a delegated agent was not given because they did not fit its context budget';
const count = (n: number | null): string => (n === null ? NA : String(n));
/**
 * REQ-SESSION-133: a count over a capped ring describes what is stored, so once the cap has dropped rows of it the count is a
 * lower bound and reads `at least N`; a whole ring's count reads plain (finacc3 F10).
 */
const atLeast = (n: number, dropped: number): string => (dropped > 0 ? `at least ${n}` : String(n));
const droppedNote = (dropped: number, what: string): string => (dropped > 0 ? `${dropped} older ${what} dropped by the retention cap` : '');

function metricsLines(f: SummaryFacts): string[] {
  const { row, metrics: m } = f;
  const tokens = m.tokens.total > 0 ? `${m.tokens.input} in / ${m.tokens.output} out (${m.tokens.total} total)` : `${NA} (no usage recorded)`;
  const label = costLabelOf(row.cost, row.cost_qualifier);
  const cost = label.qualifier === 'unknown' ? `${NA} (${label.text})` : label.text;
  const kept = m.records_kept.tool_calls;
  const outcomes = Object.entries(m.tool_outcomes).map(([bucket, n]) => `${bucket} ${n}`).join(', ');
  const kinds = Object.entries(m.issues_by_kind).sort(([a], [b]) => a.localeCompare(b)).map(([kind, n]) => `${kind} ${n}`).join(', ');
  // REQ-SESSION-133: the permission audit and the issues record are capped rings; a count over one the cap has dropped rows
  // of reads `at least` and says how many it dropped, as the tool-call record's line does (finacc3 F10).
  const audit = m.records_kept.permission_audit.dropped;
  const issues = m.records_kept.issues.dropped;
  const auditDropped = droppedNote(audit, 'permission-audit entries');
  const issueNotes = [kinds, droppedNote(issues, 'issues')].filter((x) => x !== '').join('; ');
  return [
    `- Iterations completed: ${row.iterations_completed}`,
    `- Tool calls: ${row.tool_calls}`,
    `- Tokens: ${tokens}`,
    `- Cost: ${cost}`,
    `- Compressions: ${row.compressions}`,
    `- Tool-call records: ${kept.retained}${kept.dropped > 0 ? ` (${kept.dropped} older records dropped by the retention cap)` : ''}`,
    `- Tool outcomes: ${outcomes}`,
    `- Permission decisions: ${atLeast(m.permission_decisions, audit)} (${atLeast(m.permission_denials, audit)} denied); mode changes: ${atLeast(m.mode_changes, audit)}${auditDropped ? ` (${auditDropped})` : ''}`,
    `- Issues: ${atLeast(m.issues_total, issues)}${issueNotes ? ` (${issueNotes})` : ''}`,
    `- Model-input records: ${NA} (${NOT_KEPT})`,
    `- Context selections: ${NA} (${NOT_KEPT})`,
    `- Report validations: ${NA} (${NOT_KEPT})`,
  ];
}

/**
 * REQ-SESSION-140's Warnings, every kind it names on its own line. The two whose record this store does not keep read
 * `n/a`, never `0`: stale-input drops (the model-input record) and report downgrades (the report-validation record).
 * Mostly-elided artifacts are PD-SESSION-002's (OQ-207, ruled 2026-10-07 under R-072): the attached artifacts a delegated
 * agent was not given because they did not fit its context budget, counted from the uncapped timeline's
 * `context_selection` entries, so the count reads plain, `0` when nothing was left out. Until that ruling the line read
 * `n/a (no record measures how much of an artifact was elided)`.
 */
function warningLines(f: SummaryFacts): string[] {
  const m = f.metrics;
  const elided = f.elidedAttachments;
  // REQ-SESSION-133 (finacc3 F10): each count over a capped ring the cap has dropped rows of reads `at least`, with how many.
  const audit = m.records_kept.permission_audit.dropped;
  const issues = m.records_kept.issues.dropped;
  const entries = (dropped: number): string => (dropped > 0 ? `; ${droppedNote(dropped, 'entries')}` : '');
  /*
   * REQ-SESSION-133 (finacc3 A2-09): Terminal failures, suspicious successes and Timeouts are each the larger of a count over
   * the tool-call record and one over the issues record (`sessionMetrics`). REQ-SESSION-136 files one issue for each such
   * call — a timeout of an MCP call or a fetch included (finacc3 A2-08) — so either reading is the run's whole count while
   * its ring is whole, and the figure is a lower bound only once both have dropped rows. Until A2-09 the three read plain.
   */
  const calls = m.records_kept.tool_calls.dropped;
  const short = calls > 0 && issues > 0;
  const bothDropped = `${calls} older tool-call records and ${issues} older issues dropped by the retention cap`;
  const outcome = (n: number): string => (short ? `at least ${n} (${bothDropped})` : String(n));
  return [
    `- Stale-input drops: ${NA} (the model-input record is ${NOT_KEPT})`,
    elided.artifacts === 0
      ? `- Mostly-elided artifacts: 0 (${ELIDED_WHAT}; counted from the timeline's context_selection entries)`
      : `- Mostly-elided artifacts: ${elided.artifacts} (${ELIDED_WHAT}, across ${countNoun(elided.agents, 'agent')}; counted from the timeline's context_selection entries, which name each)`,
    `- Report downgrades: ${NA} (the report-validation record is ${NOT_KEPT})`,
    `- Permission denials: ${atLeast(m.permission_denials, audit)} (counted from the permission audit, where each is an entry${entries(audit)})`,
    /*
     * REQ-SESSION-136's tool errors are its `tool_error` issues: "any other failure" than a shell failure, a suspicious
     * success and a timeout, each referencing its record. Read from the issues record, as the Issues line above is, so the
     * file never gives two counts for one thing. Until fin23 this read the histogram's `tool_error` bucket, which a failed
     * record carrying an `outcome_kind` (`invalid_request`, `execution_error`, `mcp`) never reaches and a timeout with none
     * does (docs/defects/fixed/summary-md-tool-errors-line-counts-one-outcome-bucket-not-every-tool-error.md); since OQ-208's
     * ruling (2026-10-07, R-072) MCP and fetch records carry no `outcome_kind` and derive to `success` or `tool_error`. The
     * parenthesis names what is counted, each `tool_error` issue: until fin25 it read "each failed call that is not a
     * terminal failure, suspicious success or timeout", and a suspicious success is no failed call, while a call cut short
     * under PD-ORCH-005 is one and files no issue.
     */
    `- Tool errors: ${atLeast(m.issues_by_kind['tool_error'] ?? 0, issues)} (counted from the issues record, where each tool_error issue is an entry${entries(issues)})`,
    `- Terminal failures: ${outcome(m.terminal_shell_failures)}`,
    `- Terminal suspicious successes: ${outcome(m.suspicious_successes)}`,
    // The metrics document's `timeouts`: every tool call that timed out, the terminal's among them, read from the tool-call
    // record or from the `terminal_timeout` issues, which every timeout files.
    `- Timeouts: ${short ? `at least ${m.timeouts}` : m.timeouts} (tool calls that timed out, a terminal's among them${short ? `; ${bothDropped}` : ''})`,
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
  lines.push('', '## Warnings', '', ...warningLines(f));
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
