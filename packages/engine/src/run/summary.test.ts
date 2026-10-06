import { describe, expect, it } from 'vitest';
import type { SessionRow } from '@rotaris/store';
import { renderSummary, sessionOutcomeOf } from './summary.js';

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
    const row = { session_id: 'S-1', workspace_root: 'C:/ws', execution_status: 'interrupted', created_at: 't0', updated_at: 't1', iterations_completed: 0, stop_reason: null, tokens_input: 0, tokens_output: 0, cost: '0', ...none } as unknown as SessionRow;
    expect(renderSummary(row)).not.toContain('## Outcome');
    expect(renderSummary(row, sessionOutcomeOf(row, correction))).toContain(`## Outcome\n\ninterrupted (warning): ${correction.message}`);
  });
});
