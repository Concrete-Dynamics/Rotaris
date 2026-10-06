import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore, StoreDal, type SessionRow } from '@rotaris/store';
import { sessionMetrics } from '../export.js';
import { RECOVERY_ENTRY, renderSummary, sessionOutcomeOf, SUMMARY_INSPECTION_NOTE, summaryFactsOf, SummaryWriter, type SummaryFacts } from './summary.js';

/** OQ-60 as ruled (R-071): the outcome a session's readers present, and `summary.md`'s Outcome block. */
describe('run/summary — a session\'s outcome (OQ-60 as ruled; REQ-ORCH-082, REQ-SESSION-062)', () => {
  const correction = { severity: 'warning', message: "Session was still marked 'running' but no process holds a lock for it; status set to 'interrupted'." };
  const columns = { summary_status: 'completed', summary_severity: 'info', summary_text: 'The run completed.' };
  const none = { summary_status: null, summary_severity: null, summary_text: null };

  it('a recovered session presents its correction entry, whatever its columns hold', () => {
    expect(sessionOutcomeOf({ execution_status: 'interrupted', ...none }, correction)).toEqual({ status: 'interrupted', severity: 'warning', message: correction.message });
    expect(sessionOutcomeOf({ execution_status: 'interrupted', ...columns }, correction)).toEqual({ status: 'interrupted', severity: 'warning', message: correction.message });
  });

  it('every other session presents REQ-ORCH-082\'s columns, or nothing — an entry left from an earlier repair included', () => {
    expect(sessionOutcomeOf({ execution_status: 'completed', ...columns }, correction)).toEqual({ status: 'completed', severity: 'info', message: 'The run completed.' });
    expect(sessionOutcomeOf({ execution_status: 'running', ...none }, correction)).toBeNull();
    expect(sessionOutcomeOf({ execution_status: 'interrupted', ...none }, null)).toBeNull();
  });

  it('summary.md carries the outcome it is given as its Outcome block, and none without one', () => {
    const row = rowOf({ execution_status: 'interrupted' });
    expect(renderSummary(factsOf(row))).not.toContain('## Outcome');
    expect(renderSummary(factsOf(row, { outcome: sessionOutcomeOf(row, correction) }))).toContain(`## Outcome\n\ninterrupted (warning): ${correction.message}`);
  });
});

function rowOf(over: Partial<SessionRow> = {}): SessionRow {
  return {
    session_id: 'S-1', workspace_root: 'C:/ws', execution_status: 'completed', created_at: 't0', updated_at: 't1', iterations_completed: 0, stop_reason: null,
    tokens_input: 0, tokens_output: 0, cost: '0', cost_qualifier: 'unknown', tool_calls: 0, compressions: 0, summary_status: null, summary_severity: null, summary_text: null,
    ...over,
  } as unknown as SessionRow;
}

function factsOf(row: SessionRow, over: Partial<SummaryFacts> = {}): SummaryFacts {
  return { row, outcome: null, task: null, metrics: sessionMetrics(row, [], [], [], 0, 0, 0), agents: [], ...over };
}

/** The lines of one `## <name>` section, its blank lines dropped. */
function section(md: string, name: string): string[] {
  const lines = md.split('\n');
  const rest = lines.slice(lines.indexOf(`## ${name}`) + 1);
  const end = rest.findIndex((l) => l.startsWith('## ') || l.startsWith('_'));
  return rest.slice(0, end === -1 ? undefined : end).filter((l) => l !== '');
}

/**
 * REQ-SESSION-140: what `summary.md` holds and in what order. Until fin22 `renderSummary` wrote a heading, eight lines (the
 * stop reason always, `—` for none; tokens and cost `0` for a session that made no request) and a closing line — none of the
 * Task line, Metrics, Warnings, Agents, Slowest Tools or the inspection note
 * (`docs/defects/fixed/summary-md-carries-none-of-the-sections-its-requirement-lists.md`).
 */
describe('run/summary — summary.md carries REQ-SESSION-140\'s sections, in its order', () => {
  it('heading; status, workspace, created, updated; task; then Metrics, Warnings, Agents, Slowest Tools and the inspection note', () => {
    const md = renderSummary(factsOf(rowOf({ stop_reason: 'completed' }), { task: 'Write the notes.' }));
    const order = ['# Session S-1', '- Status: completed', '- Workspace: C:/ws', '- Created: t0', '- Updated: t1', '- Task: Write the notes.', '- Stop reason: completed', '## Metrics', '## Warnings', '## Agents', '## Slowest Tools', SUMMARY_INSPECTION_NOTE];
    const at = order.map((line) => md.indexOf(line));
    expect(at.every((i) => i >= 0), md).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(md.endsWith(`${SUMMARY_INSPECTION_NOTE}\n`)).toBe(true);
    expect(SUMMARY_INSPECTION_NOTE).toMatch(/issues record.*timeline.*metrics document.*permission audit.*Export records….*session\.log/);
  });

  it('the stop-reason line is omitted entirely where none is recorded', () => {
    expect(renderSummary(factsOf(rowOf({ stop_reason: null })))).not.toContain('Stop reason');
    expect(renderSummary(factsOf(rowOf({ stop_reason: 'user_cancelled' })))).toContain('- Stop reason: user_cancelled');
  });

  it('the task is the first submitted prompt cut to 240 characters with the marker counted inside (REQ-SESSION-194), `—` with none', () => {
    const md = renderSummary(factsOf(rowOf(), { task: 'x'.repeat(300) }));
    const line = md.split('\n').find((l) => l.startsWith('- Task: '))!;
    expect(line.slice('- Task: '.length)).toBe(`${'x'.repeat(237)}...`);
    expect(renderSummary(factsOf(rowOf(), { task: null }))).toContain('- Task: —');
  });

  it('an unavailable value reads n/a, never 0: tokens and cost of a session that made no request', () => {
    const md = renderSummary(factsOf(rowOf()));
    expect(md).toContain('- Tokens: n/a');
    expect(md).toContain('- Cost: n/a');
    expect(md).not.toMatch(/- (Tokens|Cost): 0/);
    const spent = renderSummary(factsOf(rowOf({ tokens_input: 120, tokens_output: 30, cost: '0.12', cost_qualifier: 'reported' })));
    expect(spent).toContain('- Tokens: 120 in / 30 out (150 total)');
    expect(spent).toContain('- Cost: 0.12 reported by the provider');
  });

  it('Warnings names every kind REQ-SESSION-140 lists; the three no record measures read n/a, the denials name the permission audit', () => {
    const row = rowOf();
    const metrics = sessionMetrics(row, [], [{ kind: 'decision', decision: 'deny', source: 'rule' }, { kind: 'decision', decision: 'allow', source: 'rule' }], [{ kind: 'terminal_timeout' }, { kind: 'terminal_shell_failure' }], 0, 0, 0);
    expect(section(renderSummary(factsOf(row, { metrics })), 'Warnings')).toEqual([
      '- Stale-input drops: n/a (the model-input record is not kept by this store)',
      '- Mostly-elided artifacts: n/a (no record measures how much of an artifact was elided)',
      '- Report downgrades: n/a (the report-validation record is not kept by this store)',
      '- Permission denials: 1 (counted from the permission audit, where each is an entry)',
      '- Tool errors: 0 (counted from the issues record, where each tool_error issue is an entry)',
      '- Terminal failures: 1',
      '- Terminal suspicious successes: 0',
      "- Timeouts: 1 (tool calls that timed out, a terminal's among them)",
    ]);
    // The audit is named whatever the count, a session with no denial included (the fin22 verifier's optional finding).
    expect(section(renderSummary(factsOf(row, { metrics: sessionMetrics(row, [], [], [], 0, 0, 0) })), 'Warnings')).toContain('- Permission denials: 0 (counted from the permission audit, where each is an entry)');
  });

  /*
   * REQ-SESSION-136's tool errors are its `tool_error` issues — every failure but a shell failure, a suspicious success and a
   * timeout. Until fin23 the line read the histogram's `tool_error` bucket, which a record carrying an `outcome_kind` never
   * reaches: the requirements session of the c2a9444 live run would read "Issues: 5 (… tool_error 4)" beside "Tool errors: 3"
   * (`docs/defects/fixed/summary-md-tool-errors-line-counts-one-outcome-bucket-not-every-tool-error.md`).
   */
  it('Tool errors counts every tool_error issue REQ-SESSION-136 filed, whatever outcome_kind its record carries, and agrees with the Issues line', () => {
    const row = rowOf();
    const rec = (n: number, status: string, isError: number, outcome_kind: string | null, failure_kind: string | null = null) =>
      ({ call_id: `c${n}`, agent_name: 'Ada', tool_name: `tool${n}`, status, elapsed_ms: n, is_error: isError, outcome_kind, failure_kind });
    const records = [
      rec(1, 'failed', 1, 'invalid_request', 'invalid_request'), // refused at the gate's schema check
      rec(2, 'failed', 1, 'execution_error', 'execution_error'), // a terminal that could not start
      rec(3, 'failed', 1, 'mcp', 'tool_error'), // a failed MCP call
      rec(4, 'failed', 1, null), // a file tool's failure: the histogram's own tool_error bucket
      rec(5, 'failed', 1, 'shell_failure'), // its own kind
      rec(6, 'failed', 1, null, 'timeout'), // its own kind, though it derives to the histogram's tool_error bucket
      rec(7, 'ok', 0, 'mcp'),
    ];
    const issues = [{ kind: 'tool_error' }, { kind: 'tool_error' }, { kind: 'tool_error' }, { kind: 'tool_error' }, { kind: 'terminal_shell_failure' }, { kind: 'terminal_timeout' }];
    const metrics = sessionMetrics(row, records, [], issues, 0, 0, 0);
    const md = renderSummary(factsOf(row, { metrics }));
    expect(section(md, 'Warnings')).toContain('- Tool errors: 4 (counted from the issues record, where each tool_error issue is an entry)');
    expect(section(md, 'Metrics')).toContain('- Issues: 6 (terminal_shell_failure 1, terminal_timeout 1, tool_error 4)');
    // The histogram is REQ-SESSION-139's and is unchanged: it classifies by outcome_kind first, an MCP call's included.
    expect(metrics.tool_outcomes).toEqual({ success: 0, tool_error: 2, rejected: 0, unknown: 0, invalid_request: 1, execution_error: 1, mcp: 2, shell_failure: 1 });
  });

  it('Agents lists each agent with its counted calls, n/a where the record holds no count', () => {
    const md = renderSummary(factsOf(rowOf(), { agents: [
      { name: 'Ada', persona: 'orchestrator', role: 'iteration 1 root', state: 'closed (completed)', toolCalls: 3 },
      { name: 'Bo', persona: 'orchestrator', role: 'iteration 2 root', state: 'open', toolCalls: null },
    ] }));
    expect(section(md, 'Agents')).toEqual(['- Ada (orchestrator) — iteration 1 root, closed (completed); tool calls: 3', '- Bo (orchestrator) — iteration 2 root, open; tool calls: n/a']);
    expect(section(renderSummary(factsOf(rowOf())), 'Agents')).toEqual(['- none recorded']);
  });

  it('a slowest call with no elapsed time reads n/a, never 0 ms (the renderer keeps the rule, whatever the metrics pass it)', () => {
    const row = rowOf();
    const metrics = { ...sessionMetrics(row, [], [], [], 0, 0, 0), slowest_tool_calls: [{ tool_name: 'grep', agent_name: 'Ada', call_id: 'c1', elapsed_ms: null, status: 'failed' }] };
    expect(section(renderSummary(factsOf(row, { metrics })), 'Slowest Tools')).toEqual(['1. grep — n/a (Ada, failed)']);
  });
});

describe('run/summary — summaryFactsOf reads one session\'s record (REQ-SESSION-140, REQ-SESSION-139)', () => {
  let dir: string;
  let dal: StoreDal;
  const sid = asSessionId('S-facts');
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-summary-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    dal.upsertSession({ session_id: sid, execution_status: 'completed', workspace_root: 'C:/ws', created_at: 't0', updated_at: 't1' });
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const call = (n: number, agent: string, ms: number, status: string, isError: boolean, entry: Record<string, unknown> = {}): void => {
    const { ordinal } = dal.transaction(() => dal.ringInsert('tool_calls', sid, (o) => dal.insertToolCall({ session_id: sid, ordinal: o, call_id: `c${n}`, agent_name: agent, tool_name: `tool${n}`, status: 'running', started_at: 't', elapsed_ms: null, is_error: 0, entry: '{}' })));
    dal.settleToolCall(sid, ordinal, status, ms, isError, JSON.stringify({ result: 'r'.repeat(50), ...entry }));
  };

  it('the task is the FIRST submitted prompt; the slowest five by elapsed_ms; the outcome kinds read from the entry; denials; agents', () => {
    dal.appendRow(sid, 0, 'user', true, 'First prompt.');
    dal.appendRow(sid, 1, 'agent', true, 'An answer.');
    dal.appendRow(sid, 2, 'user', true, 'Second prompt.');
    dal.insertIteration({ session_id: sid, iteration: 1, root_task_id: 'bg_root', root_canonical_name: 'Ada', root_persona: 'orchestrator', todo_task_id: 't1', task: 'First prompt.', opened_at: 't0' });
    dal.closeIteration(sid, 1, 'succeeded', 't1');
    dal.addIterationRootCalls(sid, 1, 4);
    dal.insertChild({ session_id: sid, task_id: 'bg_c1', canonical_name: 'Bo', given_name: 'Bo', persona: 'coding-agent', state: 'completed', parent_id: 'bg_root', depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't0' });
    call(1, 'Ada', 10, 'completed', false);
    call(2, 'Ada', 700, 'failed', true, { outcome_kind: 'shell_failure' });
    call(3, 'Ada', 30, 'failed', true, { failure_kind: 'timeout' });
    call(4, 'Bo', 400, 'completed', false);
    call(5, 'Bo', 500, 'completed', false);
    call(6, 'Bo', 600, 'completed', false);
    call(7, 'Eve', 50, 'blocked', false);
    dal.transaction(() => dal.ringInsert('permission_audit', sid, (ordinal) => dal.insertAudit({ session_id: sid, ordinal, recorded_at: 't', kind: 'decision', entry: '{}', agent_id: 'a', persona: 'p', tool_name: 'tool7', decision: 'deny', rule_id: 'r', source: 'rule' })));

    const facts = summaryFactsOf(dal, sid)!;
    expect(facts.task).toBe('First prompt.');
    expect(facts.metrics.tool_call_records).toBe(7);
    expect(facts.metrics.tool_outcomes).toMatchObject({ success: 4, tool_error: 1, rejected: 1, shell_failure: 1 });
    expect(facts.metrics.terminal_shell_failures).toBe(1);
    expect(facts.metrics.timeouts).toBe(1);
    expect(facts.metrics.permission_denials).toBe(1);
    expect(facts.agents.map((a) => [a.name, a.role, a.toolCalls])).toEqual([['Ada', 'iteration 1 root', 4], ['Bo', 'child of Ada', 0], ['Eve', null, 1]]);
    const md = renderSummary(facts);
    expect(section(md, 'Slowest Tools')).toEqual([
      '1. tool2 — 700 ms (Ada, failed)', '2. tool6 — 600 ms (Bo, completed)', '3. tool5 — 500 ms (Bo, completed)', '4. tool4 — 400 ms (Bo, completed)', '5. tool7 — 50 ms (Eve, blocked)',
    ]);
    expect(md).toContain('- Task: First prompt.');
  });

  // The fin22 verifier's finding (`summary-md-reads-a-plan-cycle-roots-calls-from-the-capped-tool-call-record.md`): a plan
  // cycle's root's line was read from the tool-call record, a ring capped at 5,000 rows, so past the cap it read short.
  it('a plan cycle\'s root reads its own count (store v33), never the capped record\'s rows', () => {
    dal.insertPlanRoot({ session_id: sid, root_task_id: 'bg_plan', root_canonical_name: 'Ada', root_persona: 'orchestrator', opened_at: 't0' });
    dal.setPlanRoot(sid, 'bg_plan', 'orchestrator');
    dal.addPlanRootCalls(sid, 'bg_plan', 6);
    dal.countPlanRootCalls(sid, 'bg_plan', 6);
    dal.clearPlanRoot(sid, 'bg_plan');
    // The record holds one of its six calls: the cap dropped the rest.
    call(1, 'Ada', 10, 'completed', false);
    dal.db.prepare('UPDATE ring_state SET dropped = 5 WHERE session_id = ? AND kind = ?').run(sid, 'tool_calls');
    const facts = summaryFactsOf(dal, sid)!;
    expect(facts.agents.map((a) => [a.name, a.role, a.toolCalls])).toEqual([['Ada', 'plan cycle root', 6]]);
    expect(section(renderSummary(facts), 'Agents')).toEqual(['- Ada (orchestrator) — plan cycle root; tool calls: 6']);
  });

  it('where no count is kept — a plan cycle\'s root recorded before v33, an agent known only by its records — the record is read while whole, and n/a once the cap has dropped any', () => {
    dal.insertPlanRoot({ session_id: sid, root_task_id: 'bg_plan', root_canonical_name: 'Ada', root_persona: 'orchestrator', opened_at: 't0' });
    dal.db.prepare('UPDATE plan_roots SET tool_calls = NULL WHERE session_id = ?').run(sid);
    call(1, 'Ada', 10, 'completed', false);
    call(2, 'Ada', 20, 'completed', false);
    call(3, 'Eve', 30, 'completed', false);
    expect(summaryFactsOf(dal, sid)!.agents.map((a) => [a.name, a.toolCalls])).toEqual([['Ada', 2], ['Eve', 1]]);
    dal.db.prepare('UPDATE ring_state SET dropped = 1 WHERE session_id = ? AND kind = ?').run(sid, 'tool_calls');
    const facts = summaryFactsOf(dal, sid)!;
    expect(facts.agents.map((a) => [a.name, a.toolCalls])).toEqual([['Ada', null], ['Eve', null]]);
    expect(section(renderSummary(facts), 'Agents')).toEqual(['- Ada (orchestrator) — plan cycle root; tool calls: n/a', '- Eve; tool calls: n/a']);
  });

  it('a recovered session presents its correction entry through every rebuild (OQ-60 as ruled)', () => {
    dal.touchSession(sid, 'interrupted', 't2');
    dal.insertTimeline(sid, dal.nextTimelineOrdinal(sid), 't2', RECOVERY_ENTRY, 'rotaris', 'recovered.', '{}', 'abcdefabcdef', 'warning');
    expect(summaryFactsOf(dal, sid)!.outcome).toEqual({ status: 'interrupted', severity: 'warning', message: 'recovered.' });
  });

  it('a session with no record of any kind reads no task, no agents and no slowest calls', () => {
    const md = renderSummary(summaryFactsOf(dal, sid)!);
    expect(md).toContain('- Task: —');
    expect(section(md, 'Agents')).toEqual(['- none recorded']);
    expect(section(md, 'Slowest Tools')).toEqual(['- none recorded']);
  });
});

/**
 * The fin20 verifier's finding: `rebuild` ran the outcome read (`latestTimelineEntry`) outside the guard that held `read()`,
 * so a throw there rejected the chain — and the repair's `void rebuilt.finally(...)` left a rejection nothing handled, which
 * `closeAll`'s `Promise.all` then inherited. Every read is inside the guard now.
 */
describe('run/summary — SummaryWriter never rejects (REQ-SESSION-028, ADR-0008)', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-summary-writer-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('a read that throws part-way — the correction entry\'s, a store closed behind it — is a warning and the chain settles', async () => {
    const warned: string[] = [];
    const writer = new SummaryWriter({ file: join(dir, 'summary.md'), timers: new FakeClock(), warn: (m) => warned.push(m) });
    const closing = { readTransaction: <T>(fn: () => T) => fn(), getSession: () => rowOf({ execution_status: 'interrupted' }), latestTimelineEntry: () => { throw new Error('The database connection is not open'); } } as unknown as StoreDal;
    writer.rebuild(1, () => summaryFactsOf(closing, asSessionId('S-closing')));
    await expect(writer.settled()).resolves.toBeUndefined();
    expect(warned).toEqual(['summary.md was not rebuilt (generation 1): The database connection is not open']);
  });

  it('a rebuild a newer one is queued behind is skipped; the newer one writes', async () => {
    const reads: number[] = [];
    const writer = new SummaryWriter({ file: join(dir, 'summary.md'), timers: new FakeClock(), warn: () => undefined });
    writer.rebuild(1, () => { reads.push(1); return factsOf(rowOf({ updated_at: 'first' })); });
    writer.rebuild(2, () => { reads.push(2); return factsOf(rowOf({ updated_at: 'second' })); });
    await writer.settled();
    expect(reads).toEqual([2]);
    expect(readFileSync(join(dir, 'summary.md'), 'utf8')).toContain('- Updated: second');
  });
});
