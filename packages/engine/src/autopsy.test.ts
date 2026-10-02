import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, type SessionId } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { readAutopsy } from './autopsy.js';
const WS = 'C:/ws';

/**
 * R-043 — the run-autopsy snapshot: one read-only pass joining the records
 * the product already keeps. Sessions are PLANTED as rows (a dead process
 * leaves exactly rows), never run.
 */
describe('R-043 — the run-autopsy snapshot', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-autopsy-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const plant = (raw: string, status: string): SessionId => {
    const sid = asSessionId(raw);
    dal.upsertSession({ session_id: raw, execution_status: status, workspace_root: WS, created_at: '2026-09-05T10:00:00.000Z', updated_at: '2026-09-05T10:05:00.000Z' });
    dal.updateSessionRun(sid, { tokens_input: 1500, tokens_output: 60, cost: '0', tool_calls: 4, stop_reason: 'user_cancelled', summary_text: "The run came to rest at the user's request." });
    return sid;
  };

  const toolEntry = (agent: string, tool: string, status: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ timestamp: 't', agent_name: agent, tool_name: tool, status, elapsed_ms: 5, is_error: status !== 'ok', args: { path: 'a.txt' }, result: 'refused', ...extra });

  it('unknown session reads as undefined, never as an empty snapshot', () => {
    expect(readAutopsy(dal, asSessionId('S-none'), clock.wall)).toBeUndefined();
  });

  it('sizes the run: the row, per-tool elapsed sums, failure groups by cause, usage jumps, coherence, per-model-key attribution', () => {
    const sid = plant('S-auto', 'paused');
    dal.transaction(() => {
      dal.ringInsert('tool_calls', sid, (o) => dal.insertToolCall({ session_id: sid, ordinal: o, call_id: 'c1', agent_name: 'a', tool_name: 'read_file', status: 'ok', started_at: 't', elapsed_ms: 8, is_error: 0, entry: toolEntry('a', 'read_file', 'ok') }));
      dal.ringInsert('tool_calls', sid, (o) => dal.insertToolCall({ session_id: sid, ordinal: o, call_id: 'c2', agent_name: 'a', tool_name: 'read_file', status: 'ok', started_at: 't', elapsed_ms: 9, is_error: 0, entry: toolEntry('a', 'read_file', 'ok') }));
      dal.ringInsert('tool_calls', sid, (o) => dal.insertToolCall({ session_id: sid, ordinal: o, call_id: 'c3', agent_name: 'a', tool_name: 'write_file', status: 'failed', started_at: 't', elapsed_ms: 2, is_error: 1, entry: toolEntry('a', 'write_file', 'failed', { failure_kind: 'invalid_request' }) }));
      dal.ringInsert('tool_calls', sid, (o) => dal.insertToolCall({ session_id: sid, ordinal: o, call_id: 'c4', agent_name: 'a', tool_name: 'terminal', status: 'blocked', started_at: 't', elapsed_ms: 1, is_error: 1, entry: toolEntry('a', 'terminal', 'blocked', { failure_kind: 'denied' }) }));
      dal.insertChild({ session_id: sid, task_id: 'bg_00000001', canonical_name: 'c', given_name: 'a', persona: 'coding-agent', state: 'failed', parent_id: 'root', depth: 1, iteration: 1, model_key: 'qwen3.8-flash-next', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' });
      dal.insertEvent(sid, 1, 'session.start', 't1', 1, null, '{"event":"session.start"}');
      dal.insertEvent(sid, 2, 'usage.update', 't2', 1, null, '{"event":"usage.update","tokens":{"input":100,"output":5,"total":105}}');
      dal.insertEvent(sid, 3, 'usage.update', 't3', 1, null, '{"event":"usage.update","tokens":{"input":160,"output":9,"total":169}}');
      dal.insertTimeline(sid, 1, 't', 'run_start', 'rotaris', 'started', '{}', 'aaaaaaaaaaaa', 'info');
    });
    const s = readAutopsy(dal, sid, clock.wall)!;
    expect(s.session).toMatchObject({ session_id: 'S-auto', execution_status: 'paused', stop_reason: 'user_cancelled', tokens_input: 1500, tokens_output: 60, cost: '0', tool_calls: 4 });
    // Per-tool totals with elapsed sums, failed vs blocked partitioned by status.
    expect(s.tools.find((t) => t.tool_name === 'read_file')).toMatchObject({ status: 'ok', calls: 2, errors: 0, elapsed_ms: 17 });
    expect(s.tools.find((t) => t.tool_name === 'write_file')).toMatchObject({ status: 'failed', calls: 1, errors: 1 });
    expect(s.tools.find((t) => t.tool_name === 'terminal')).toMatchObject({ status: 'blocked', calls: 1, errors: 1 });
    // Two failures with the same root are one group with a count.
    expect(s.failures).toHaveLength(2);
    expect(s.failures.find((g) => g.cause === 'invalid_request')).toMatchObject({ count: 1, tools: ['write_file'] });
    expect(s.failures.find((g) => g.cause === 'denied')).toMatchObject({ count: 1, tools: ['terminal'] });
    // Usage jumps, largest first.
    expect(s.usage_jumps.map((j) => j.jump)).toEqual([100, 60]);
    // Coherence: zero cost beside tokens flags; the stopped run carries a summary so no flag.
    expect(s.coherence.zero_cost_with_tokens).toBe(true);
    expect(s.coherence.null_summary_on_stopped).toBe(false);
    expect(s.coherence.duplicate_reads).toEqual([{ path: 'a.txt', reads: 2 }]);
    // Per-model-key attribution from the children record: the usage.update
    // payload carries tokens and cost alone, so the model_key the child
    // carries is the identity the store keeps.
    expect(s.requests).toEqual([{ endpoint: 'qwen3.8-flash-next', agents: ['a'], tool_calls: 4 }]);
    expect(s.counts).toMatchObject({ timeline: 1, children: 1, checkpoints: 0 });
  });

  it('a NULL summary on a stopped run flags; identical commands retried group', () => {
    const sid = plant('S-flag', 'stopped');
    dal.updateSessionRun(sid, { summary_text: '' });
    const cmd = JSON.stringify({ timestamp: 't', agent_name: 'a', tool_name: 'terminal', status: 'ok', elapsed_ms: 1, is_error: false, args: { command: 'git status' }, result: 'ok' });
    dal.transaction(() => {
      dal.ringInsert('tool_calls', sid, (o) => dal.insertToolCall({ session_id: sid, ordinal: o, call_id: 'c1', agent_name: 'a', tool_name: 'terminal', status: 'ok', started_at: 't', elapsed_ms: 1, is_error: 0, entry: cmd }));
      dal.ringInsert('tool_calls', sid, (o) => dal.insertToolCall({ session_id: sid, ordinal: o, call_id: 'c2', agent_name: 'a', tool_name: 'terminal', status: 'ok', started_at: 't', elapsed_ms: 1, is_error: 0, entry: cmd }));
    });
    const s = readAutopsy(dal, sid, clock.wall)!;
    expect(s.coherence.null_summary_on_stopped).toBe(true);
    expect(s.coherence.retried_commands).toEqual([{ command: 'git status', times: 2 }]);
    expect(s.failures).toEqual([]);
  });

  it('reads nothing but the session record: the snapshot writes no row, no event, no timeline entry', () => {
    const sid = plant('S-ro', 'completed');
    const before = { rows: dal.rowCount(sid), events: dal.eventCount(sid), timeline: dal.timelineOf(sid).length, updated: dal.getSession(sid)!.updated_at };
    readAutopsy(dal, sid, clock.wall);
    expect(dal.rowCount(sid)).toBe(before.rows);
    expect(dal.eventCount(sid)).toBe(before.events);
    expect(dal.timelineOf(sid)).toHaveLength(before.timeline);
    expect(dal.getSession(sid)!.updated_at).toBe(before.updated);
  });
});
