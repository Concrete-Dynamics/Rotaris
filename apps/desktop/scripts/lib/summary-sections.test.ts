/**
 * REQ-SESSION-140 as the live run reads it from each session's `summary.md`, the file `preserveRun` now copies into the pack
 * (`docs/defects/fixed/the-live-runs-pack-carries-no-summary-md.md`). Pinned against the product's own renderer, so the
 * reading and the file cannot drift apart, and against the shapes it must refuse: a section out of order, a missing one, a
 * stop-reason line with none recorded, and the Tool errors line that disagreed with its own Issues line until fin23
 * (`docs/defects/fixed/summary-md-tool-errors-line-counts-one-outcome-bucket-not-every-tool-error.md`).
 */
import { describe, expect, it } from 'vitest';
import { renderSummary, sessionMetrics, type SummaryFacts } from '@rotaris/engine';
import type { SessionRow } from '@rotaris/store';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { preserveSummary, summaryReading } from './summary-sections.mjs';

const row = (over: Partial<SessionRow> = {}): SessionRow => ({
  session_id: 'S-1', workspace_root: '/ws', execution_status: 'completed', created_at: 't0', updated_at: 't1', iterations_completed: 1, stop_reason: 'tasks_complete',
  tokens_input: 10, tokens_output: 5, cost: '0', cost_qualifier: 'unknown', tool_calls: 2, compressions: 0, summary_status: null, summary_severity: null, summary_text: null,
  ...over,
} as unknown as SessionRow);

/** The requirements session of the c2a9444 live run, in small: a refused invalid_request, a plain failure, a shell failure. */
function md(r: SessionRow = row()): string {
  const records = [
    { call_id: 'c1', agent_name: 'Ada', tool_name: 'write_file', status: 'failed', elapsed_ms: 3, is_error: 1, outcome_kind: 'invalid_request', failure_kind: 'invalid_request' },
    { call_id: 'c2', agent_name: 'Ada', tool_name: 'todo', status: 'failed', elapsed_ms: 2, is_error: 1, outcome_kind: null, failure_kind: null },
    { call_id: 'c3', agent_name: 'Ada', tool_name: 'terminal', status: 'failed', elapsed_ms: 9, is_error: 1, outcome_kind: 'shell_failure', failure_kind: null },
  ];
  const issues = [{ kind: 'tool_error' }, { kind: 'tool_error' }, { kind: 'terminal_shell_failure' }];
  const facts: SummaryFacts = { row: r, outcome: null, task: 'Build it.', metrics: sessionMetrics(r, records, [], issues, 0, 0, 0), agents: [] };
  return renderSummary(facts);
}

describe('summaryReading (REQ-SESSION-140)', () => {
  it('the product\'s own summary.md reads clean, with and without a stop reason', () => {
    expect(summaryReading(md(), { sessionId: 'S-1', stopReason: 'tasks_complete' })).toEqual({ ok: true, problems: [] });
    expect(summaryReading(md(row({ stop_reason: null })), { sessionId: 'S-1', stopReason: null })).toEqual({ ok: true, problems: [] });
  });

  it('a section out of order, a missing one, or a stop-reason line with none recorded is named', () => {
    const swapped = md().replace('## Agents', '## Placeholder').replace('## Metrics', '## Agents').replace('## Placeholder', '## Metrics');
    expect(summaryReading(swapped, { sessionId: 'S-1', stopReason: 'tasks_complete' }).problems).toContain('"## Agents" is out of order');
    expect(summaryReading(md().replace(/^## Slowest Tools$/m, ''), { sessionId: 'S-1', stopReason: 'tasks_complete' }).problems).toContain('no "## Slowest Tools"');
    expect(summaryReading(md(), { sessionId: 'S-1', stopReason: null }).problems).toEqual(['a stop-reason line where none is recorded']);
    expect(summaryReading(md(), { sessionId: 'S-2', stopReason: 'tasks_complete' }).problems).toEqual(['no "# Session S-2"']);
    expect(summaryReading('', { sessionId: 'S-1', stopReason: null }).ok).toBe(false);
  });

  it('a Warnings kind missing, or the denials not naming the permission audit, is named', () => {
    expect(summaryReading(md().replace(/^- Report downgrades: .*$/m, ''), { sessionId: 'S-1', stopReason: 'tasks_complete' }).problems).toEqual(['Warnings has no "Report downgrades" line, or not in its place']);
    expect(summaryReading(md().replace(/\(counted from the permission audit[^)]*\)/, ''), { sessionId: 'S-1', stopReason: 'tasks_complete' }).problems).toEqual(['the permission denials do not name the permission audit']);
  });

  it('the Tool errors line that read one histogram bucket before fin23 disagrees with its Issues line, and is named', () => {
    const before = md().replace(/^- Tool errors: .*$/m, '- Tool errors: 1');
    expect(summaryReading(before, { sessionId: 'S-1', stopReason: 'tasks_complete' }).problems).toEqual(['Warnings reads 1 tool error(s) and the Issues line 2 tool_error']);
  });
});

/*
 * Each kept session's summary check is recorded, whatever stops it. Until fin25 a throw inside the summary step —
 * `assertNoCredential` refusing the text, the write, or `checkSummary` itself — was pushed to the pack's `failed` list
 * alone, and that scenario's check vanished from results.json
 * (`docs/defects/fixed/a-summary-check-that-throws-leaves-no-check-in-the-live-runs-results.md`).
 */
describe('preserveSummary (REQ-SESSION-140)', () => {
  type Check = [boolean, string, string];
  const run = (over: { read?: () => string | null; keep?: (text: string) => void; judge?: (text: string, check: (...a: Check) => void) => void }) => {
    const checks: Check[] = [];
    const out = preserveSummary({
      name: 'requirements', sessionId: 'S-1',
      read: over.read ?? (() => '# Session S-1\n'),
      keep: over.keep ?? (() => undefined),
      judge: over.judge ?? ((_text: string, check: (...a: Check) => void) => check(true, 'requirements: judged', 'stop reason none recorded')),
      check: (...a: Check) => { checks.push(a); },
    });
    return { out, checks };
  };

  it('a file judged is kept and its one check recorded', () => {
    const { out, checks } = run({});
    expect(out).toEqual({ wrote: true, failed: null });
    expect(checks).toEqual([[true, 'requirements: judged', 'stop reason none recorded']]);
  });

  it('no file is a failed check, as before', () => {
    const { out, checks } = run({ read: () => null });
    expect(out).toEqual({ wrote: false, failed: 'summary.md (the product wrote none)' });
    expect(checks).toHaveLength(1);
    expect(checks[0]![0]).toBe(false);
    expect(checks[0]![2]).toContain('no summary.md');
  });

  it('a credential refusal or a failed write records a failed check, and the file is not kept', () => {
    const { out, checks } = run({ keep: () => { throw new Error('requirements/summary.md holds the key'); } });
    expect(out).toEqual({ wrote: false, failed: 'summary.md (requirements/summary.md holds the key)' });
    expect(checks).toEqual([[false, "requirements: the session's summary.md carries REQ-SESSION-140's sections, in its order", 'it could not be kept: requirements/summary.md holds the key']]);
  });

  it('a judge that throws before its check records a failed check; one that threw after its check records no second', () => {
    const thrown = run({ judge: () => { throw new Error('database is locked'); } });
    expect(thrown.out).toEqual({ wrote: true, failed: 'summary.md (database is locked)' });
    expect(thrown.checks).toEqual([[false, "requirements: the session's summary.md carries REQ-SESSION-140's sections, in its order", 'it could not be judged: database is locked']]);
    const late = run({ judge: (_t, check) => { check(true, 'requirements: judged', 'ok'); throw new Error('after'); } });
    expect(late.checks).toEqual([[true, 'requirements: judged', 'ok']]);
    expect(late.out.failed).toBe('summary.md (after)');
  });

  it('a read that throws records a failed check', () => {
    const { out, checks } = run({ read: () => { throw new Error('EACCES'); } });
    expect(out).toEqual({ wrote: false, failed: 'summary.md (EACCES)' });
    expect(checks.map((c) => c[0])).toEqual([false]);
  });
});
