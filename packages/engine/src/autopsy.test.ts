import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, type SessionId } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { ENTRY_KEY_UNDETERMINED, readAutopsy } from './autopsy.js';
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
      dal.insertChild({ session_id: sid, task_id: 'bg_00000001', canonical_name: 'a', given_name: 'a child', persona: 'coding-agent', state: 'failed', parent_id: 'root', depth: 1, iteration: 1, model_key: 'qwen3.8-flash-next', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' });
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
    // carries is the identity the store keeps — matched by the canonical name
    // its calls carry, not the name it was given.
    expect(s.requests).toEqual([{ endpoint: 'qwen3.8-flash-next', agents: ['a'], tool_calls: 4 }]);
    expect(s.counts).toMatchObject({ timeline: 1, children: 1, checkpoints: 0 });
  });

  describe('the entry agent\'s model key comes from what the store records of the entry agent, never from its children (live-run finding a71-13)', () => {
    const child = (sid: SessionId, task: string, name: string, modelKey: string, given = name) => dal.insertChild({ session_id: sid, task_id: task, canonical_name: name, given_name: given, persona: 'coding-agent', state: 'succeeded', parent_id: 'root', depth: 1, iteration: 1, model_key: modelKey, category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' });
    const call = (sid: SessionId, id: string, agent: string) => dal.ringInsert('tool_calls', sid, (o) => dal.insertToolCall({ session_id: sid, ordinal: o, call_id: id, agent_name: agent, tool_name: 'read_file', status: 'ok', started_at: 't', elapsed_ms: 1, is_error: 0, entry: toolEntry(agent, 'read_file', 'ok') }));
    const snapshot = (model: string, models: Record<string, unknown> = {}) => ({ default_persona: 'orchestrator', personas: { orchestrator: { model } }, models });
    const audit = (sid: SessionId, model: string, models: Record<string, unknown> = {}) => dal.insertLaunchAudit(sid, 't0', JSON.stringify({ session_id: sid, config_snapshot: snapshot(model, models) }));
    const run = (sid: SessionId) => {
      call(sid, 'r1', 'orchestrator'); call(sid, 'r2', 'orchestrator'); call(sid, 'r3', 'orchestrator');
      child(sid, 'bg_00000001', 'impl', 'child-model'); child(sid, 'bg_00000002', 'tests', 'child-model');
      call(sid, 'c1', 'impl'); call(sid, 'c2', 'tests');
    };

    it('a root on a different model from its children is attributed to the model its launch audit records', () => {
      const sid = plant('S-root-model', 'completed');
      dal.transaction(() => { run(sid); audit(sid, 'root-model'); });
      expect(readAutopsy(dal, sid, clock.wall)!.requests).toEqual([
        { endpoint: 'root-model', agents: ['orchestrator'], tool_calls: 3 },
        { endpoint: 'child-model', agents: ['impl', 'tests'], tool_calls: 2 },
      ]);
    });

    it('with no launch audit the root reads `session`, even when every child shares one key', () => {
      const sid = plant('S-no-audit', 'completed');
      dal.transaction(() => run(sid));
      expect(readAutopsy(dal, sid, clock.wall)!.requests).toEqual([
        { endpoint: 'session', agents: ['orchestrator'], tool_calls: 3 },
        { endpoint: 'child-model', agents: ['impl', 'tests'], tool_calls: 2 },
      ]);
    });

    it('a recorded switch and a continuation\'s own snapshot name every key the root ran on, in order, without splitting its calls by guess', () => {
      const sid = plant('S-switched', 'completed');
      dal.transaction(() => {
        run(sid); audit(sid, 'root-model');
        dal.insertTimeline(sid, 1, 't1', 'entry_model_switched', 'user', 'The entry model switched to child-model.', JSON.stringify({ model: 'child-model' }), 'aaaaaaaaaaa1', 'info');
        dal.insertTimeline(sid, 2, 't2', 'run_continuation_intent', 'rotaris', 'Continuation intent: answer.', JSON.stringify({ config_snapshot: snapshot('child-model') }), 'aaaaaaaaaaa2', 'info');
        dal.insertTimeline(sid, 3, 't3', 'run_continuation_intent', 'rotaris', 'Continuation intent: answer.', JSON.stringify({ config_snapshot: snapshot('third-model') }), 'aaaaaaaaaaa3', 'info');
      });
      expect(readAutopsy(dal, sid, clock.wall)!.requests).toEqual([
        { endpoint: 'root-model → child-model → third-model', agents: ['orchestrator'], tool_calls: 3 },
        { endpoint: 'child-model', agents: ['impl', 'tests'], tool_calls: 2 },
      ]);
    });

    describe('a "change model now" during a wait (REQ-MONITOR-303, REQ-ORCH-091 d) moves the root exactly when it replaces the pair the root runs on', () => {
      const models = {
        'root-model': { provider: 'openai-compatible', auth_provider: 'katalyst', model_id: 'r', base_url: 'http://e' },
        'child-model': { provider: 'openai', auth_provider: null, model_id: 'c' },
        'spare-model': { provider: 'anthropic', auth_provider: null, model_id: 's' },
      };
      // run.ts `setEntryModel` records the waiting pair and the choice; the run resolves the root through every override of the session.
      const override = (sid: SessionId, n: number, provider: string, model: string, key: string, to: readonly [string, string]) =>
        dal.insertTimeline(sid, n, `t${n}`, 'model_override', 'user', `The user chose ${key}.`, JSON.stringify({ provider, model, model_key: key, to_provider: to[0], to_model: to[1] }), `aaaaaaaaaab${n}`, 'info');

      it('an override of the root\'s own pair: its calls read launch key → override key, and a continuation keeps the override', () => {
        const sid = plant('S-override-root', 'completed');
        dal.transaction(() => {
          run(sid); audit(sid, 'root-model', models);
          override(sid, 1, 'katalyst', 'r', 'spare-model', ['anthropic', 's']);
          // ResilienceMemory.rehydrate replays the override on the continuation, whose snapshot still names root-model.
          dal.insertTimeline(sid, 2, 't2', 'run_continuation_intent', 'rotaris', 'Continuation intent: answer.', JSON.stringify({ config_snapshot: snapshot('root-model', models) }), 'aaaaaaaaaac2', 'info');
        });
        expect(readAutopsy(dal, sid, clock.wall)!.requests).toEqual([
          { endpoint: 'root-model → spare-model', agents: ['orchestrator'], tool_calls: 3 },
          { endpoint: 'child-model', agents: ['impl', 'tests'], tool_calls: 2 },
        ]);
      });

      it('an override of a child\'s different pair leaves the root on its own key', () => {
        const sid = plant('S-override-child', 'completed');
        dal.transaction(() => { run(sid); audit(sid, 'root-model', models); override(sid, 1, 'openai', 'c', 'spare-model', ['anthropic', 's']); });
        expect(readAutopsy(dal, sid, clock.wall)!.requests[0]).toEqual({ endpoint: 'root-model', agents: ['orchestrator'], tool_calls: 3 });
      });

      it('a later switch onto an overridden pair runs on the override, as the run resolves it', () => {
        const sid = plant('S-switch-onto-override', 'completed');
        dal.transaction(() => {
          run(sid); audit(sid, 'root-model', models);
          override(sid, 1, 'openai', 'c', 'spare-model', ['anthropic', 's']);
          dal.insertTimeline(sid, 2, 't2', 'entry_model_switched', 'user', 'The entry model switched to child-model.', JSON.stringify({ model: 'child-model' }), 'aaaaaaaaaac2', 'info');
        });
        expect(readAutopsy(dal, sid, clock.wall)!.requests[0]).toEqual({ endpoint: 'root-model → spare-model', agents: ['orchestrator'], tool_calls: 3 });
      });

      it('where the snapshot does not say which pair the root\'s key resolves to, an override makes the key undetermined from that point', () => {
        const sid = plant('S-override-unknown', 'completed');
        dal.transaction(() => { run(sid); audit(sid, 'root-model'); override(sid, 1, 'openai', 'c', 'spare-model', ['anthropic', 's']); });
        expect(readAutopsy(dal, sid, clock.wall)!.requests[0]).toEqual({ endpoint: `root-model → ${ENTRY_KEY_UNDETERMINED}`, agents: ['orchestrator'], tool_calls: 3 });
      });
    });

    describe('the ladder\'s automatic moves of the root (REQ-ORCH-090, REQ-ORCH-091 b, REQ-NOTIFY-082) move its key; a child\'s move does not', () => {
      const models = {
        'root-model': { provider: 'openai-compatible', auth_provider: 'katalyst', model_id: 'r', base_url: 'http://e' },
        'child-model': { provider: 'openai', auth_provider: null, model_id: 'c' },
        'spare-model': { provider: 'anthropic', auth_provider: null, model_id: 's' },
      };
      // ladder.ts writes these two entries with the agent the cell belongs to; the root's cell lives for the run.
      const sameTier = (sid: SessionId, n: number, agent: string, to: readonly [string, string, string]) =>
        dal.insertTimeline(sid, n, `t${n}`, 'quota_fallback_model', 'rotaris', `${agent} moved to ${to[0]}/${to[1]}.`, JSON.stringify({ agent, from_provider: 'katalyst', from_model: 'r', to_provider: to[0], to_model: to[1], to_key: to[2], condition: 'rate_limit', provider_exhausted: false }), `aaaaaaaaaad${n}`, 'warning');
      const unresponsive = (sid: SessionId, n: number, agent: string, to: readonly [string, string]) =>
        dal.insertTimeline(sid, n, `t${n}`, 'llm_unresponsive', 'rotaris', `${agent} received no model event; re-run on ${to[0]}/${to[1]}.`, JSON.stringify({ agent, from_provider: 'katalyst', from_model: 'r', to_provider: to[0], to_model: to[1], threshold_seconds: 60 }), `aaaaaaaaaae${n}`, 'warning');

      it('the root\'s same-tier fallback: its calls read launch key → the candidate\'s key', () => {
        const sid = plant('S-quota-root', 'completed');
        dal.transaction(() => { run(sid); audit(sid, 'root-model', models); sameTier(sid, 1, 'orchestrator', ['anthropic', 's', 'spare-model']); });
        expect(readAutopsy(dal, sid, clock.wall)!.requests).toEqual([
          { endpoint: 'root-model → spare-model', agents: ['orchestrator'], tool_calls: 3 },
          { endpoint: 'child-model', agents: ['impl', 'tests'], tool_calls: 2 },
        ]);
      });

      it('the root\'s unresponsive fallback: the key is the one `models:` key resolving to the recorded pair', () => {
        const sid = plant('S-unresponsive-root', 'completed');
        dal.transaction(() => { run(sid); audit(sid, 'root-model', models); unresponsive(sid, 1, 'orchestrator', ['anthropic', 's']); });
        expect(readAutopsy(dal, sid, clock.wall)!.requests[0]).toEqual({ endpoint: 'root-model → spare-model', agents: ['orchestrator'], tool_calls: 3 });
      });

      it('an unresponsive fallback onto a pair no `models:` key resolves to reads as the pair itself', () => {
        const sid = plant('S-unresponsive-unknown', 'completed');
        dal.transaction(() => { run(sid); audit(sid, 'root-model', models); unresponsive(sid, 1, 'orchestrator', ['mistral', 'x']); });
        expect(readAutopsy(dal, sid, clock.wall)!.requests[0]).toEqual({ endpoint: 'root-model → mistral/x', agents: ['orchestrator'], tool_calls: 3 });
      });

      it('a child\'s move leaves the root on its own key, and the next continuation\'s snapshot ends the root\'s move', () => {
        const child = plant('S-quota-child', 'completed');
        dal.transaction(() => { run(child); audit(child, 'root-model', models); sameTier(child, 1, 'impl', ['anthropic', 's', 'spare-model']); unresponsive(child, 2, 'tests', ['anthropic', 's']); });
        expect(readAutopsy(dal, child, clock.wall)!.requests[0]).toEqual({ endpoint: 'root-model', agents: ['orchestrator'], tool_calls: 3 });
        const later = plant('S-quota-then-continue', 'completed');
        dal.transaction(() => {
          run(later); audit(later, 'root-model', models); sameTier(later, 1, 'orchestrator', ['anthropic', 's', 'spare-model']);
          dal.insertTimeline(later, 2, 't2', 'run_continuation_intent', 'rotaris', 'Continuation intent: answer.', JSON.stringify({ config_snapshot: snapshot('root-model', models) }), 'aaaaaaaaaaf2', 'info');
        });
        expect(readAutopsy(dal, later, clock.wall)!.requests[0]).toEqual({ endpoint: 'root-model → spare-model → root-model', agents: ['orchestrator'], tool_calls: 3 });
      });
      it('a switch ends the root\'s move only where the run records it rebuilt the root\'s cell for it (REQ-MONITOR-142)', () => {
        // run.ts `setEntryModel` records `rebuilds: false` on a switch onto the model the root's cell was last built from:
        // `rootResilience` does not rebuild it, so the same-tier fallback stays in force.
        const switched = (sid: SessionId, n: number, key: string, rebuilds?: boolean) =>
          dal.insertTimeline(sid, n, `t${n}`, 'entry_model_switched', 'user', `The entry model switched to ${key}.`, JSON.stringify(rebuilds === undefined ? { model: key } : { model: key, rebuilds }), `aaaaaaaaaah${n}`, 'info');
        const kept = plant('S-switch-onto-configured', 'completed');
        dal.transaction(() => { run(kept); audit(kept, 'root-model', models); sameTier(kept, 1, 'orchestrator', ['anthropic', 's', 'spare-model']); switched(kept, 2, 'root-model', false); });
        expect(readAutopsy(dal, kept, clock.wall)!.requests[0]).toEqual({ endpoint: 'root-model → spare-model', agents: ['orchestrator'], tool_calls: 3 });
        const rebuilt = plant('S-switch-rebuilt', 'completed');
        dal.transaction(() => { run(rebuilt); audit(rebuilt, 'root-model', models); sameTier(rebuilt, 1, 'orchestrator', ['anthropic', 's', 'spare-model']); switched(rebuilt, 2, 'child-model', true); });
        expect(readAutopsy(dal, rebuilt, clock.wall)!.requests[0]).toEqual({ endpoint: 'root-model → spare-model → child-model', agents: ['orchestrator'], tool_calls: 3 });
        // A store written before the run recorded `rebuilds` keeps the earlier reading.
        const older = plant('S-switch-unrecorded', 'completed');
        dal.transaction(() => { run(older); audit(older, 'root-model', models); sameTier(older, 1, 'orchestrator', ['anthropic', 's', 'spare-model']); switched(older, 2, 'root-model'); });
        expect(readAutopsy(dal, older, clock.wall)!.requests[0]).toEqual({ endpoint: 'root-model → spare-model → root-model', agents: ['orchestrator'], tool_calls: 3 });
      });
      it('a continuation recording no entry model (`config_snapshot: {}`) is a new run all the same: the root\'s move ends there', () => {
        const sid = plant('S-quota-then-bare-continue', 'completed');
        dal.transaction(() => {
          run(sid); audit(sid, 'root-model', models); sameTier(sid, 1, 'orchestrator', ['anthropic', 's', 'spare-model']);
          dal.insertTimeline(sid, 2, 't2', 'run_continuation_intent', 'rotaris', 'Continuation intent: answer.', JSON.stringify({ config_snapshot: {} }), 'aaaaaaaaaaf3', 'info');
        });
        expect(readAutopsy(dal, sid, clock.wall)!.requests[0]).toEqual({ endpoint: 'root-model → spare-model → root-model', agents: ['orchestrator'], tool_calls: 3 });
      });
    });

    it('a child is known by the name its own records carry (its canonical name), never by the name it was given', () => {
      // The live pack 2026-10-01T17-04-24-814Z: the model named the task 'Run 13 shell commands verbatim'; the ledger made it
      // 'Run-13-shell-commands-verbatim' (REQ-ORCH-044), and its tool calls and the ladder's entries carry that name
      // (orchestration.ts `agentName: row.canonical_name`). Keyed by the given name, the child's calls went to the root's
      // key and the child's fallback moved the root.
      const models = {
        'root-model': { provider: 'openai-compatible', auth_provider: 'katalyst', model_id: 'r', base_url: 'http://e' },
        'child-model': { provider: 'openai', auth_provider: null, model_id: 'c' },
        'spare-model': { provider: 'anthropic', auth_provider: null, model_id: 's' },
      };
      const sid = plant('S-canonical-child', 'completed');
      const agent = 'Run-13-shell-commands-verbatim';
      dal.transaction(() => {
        audit(sid, 'root-model', models);
        call(sid, 'r1', 'orchestrator'); call(sid, 'r2', 'orchestrator'); call(sid, 'r3', 'orchestrator');
        child(sid, 'bg_00000001', agent, 'child-model', 'Run 13 shell commands verbatim');
        call(sid, 'c1', agent); call(sid, 'c2', agent);
        dal.insertTimeline(sid, 1, 't1', 'quota_fallback_model', 'rotaris', `${agent} moved to anthropic/s.`, JSON.stringify({ agent, from_provider: 'openai', from_model: 'c', to_provider: 'anthropic', to_model: 's', to_key: 'spare-model', condition: 'rate_limit', provider_exhausted: false }), 'aaaaaaaaaag1', 'warning');
        dal.insertTimeline(sid, 2, 't2', 'llm_unresponsive', 'rotaris', `${agent} received no model event.`, JSON.stringify({ agent, from_provider: 'openai', from_model: 'c', to_provider: 'anthropic', to_model: 's', threshold_seconds: 60 }), 'aaaaaaaaaag2', 'warning');
      });
      expect(readAutopsy(dal, sid, clock.wall)!.requests).toEqual([
        { endpoint: 'root-model', agents: ['orchestrator'], tool_calls: 3 },
        { endpoint: 'child-model', agents: [agent], tool_calls: 2 },
      ]);
    });

    describe('two agents sharing a canonical name are told apart by the lifetime the children record gives each child (REQ-ORCH-044, OQ-158)', () => {
      // A canonical name is unique among one parent's children in one iteration (REQ-ORCH-044), so a continued session's
      // second run can name a child as the first run did, and a root's persona can spell an earlier child's name. The tool
      // call and the ladder's entries carry the name and the instant; the children record carries each child's window.
      const models = {
        'root-model': { provider: 'openai-compatible', auth_provider: 'katalyst', model_id: 'r', base_url: 'http://e' },
        'big-model': { provider: 'openai', auth_provider: null, model_id: 'b' },
        'small-model': { provider: 'anthropic', auth_provider: null, model_id: 's' },
        'spare-model': { provider: 'mistral', auth_provider: null, model_id: 'x' },
      };
      const T = (m: number) => `2026-10-01T10:${String(m).padStart(2, '0')}:00.000Z`;
      const timed = (sid: SessionId, task: string, name: string, modelKey: string, spawned: string, completed: string | null) => {
        dal.insertChild({ session_id: sid, task_id: task, canonical_name: name, given_name: name, persona: 'coding-agent', state: 'running', parent_id: 'root', depth: 1, iteration: 1, model_key: modelKey, category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: spawned });
        if (completed !== null) dal.setChildState(sid, task, 'succeeded', completed);
      };
      const callAt = (sid: SessionId, id: string, agent: string, at: string) => dal.ringInsert('tool_calls', sid, (o) => dal.insertToolCall({ session_id: sid, ordinal: o, call_id: id, agent_name: agent, tool_name: 'read_file', status: 'ok', started_at: at, elapsed_ms: 1, is_error: 0, entry: toolEntry(agent, 'read_file', 'ok') }));

      it('a continued session\'s second-run child named like the first run\'s: each child\'s calls print under its own key', () => {
        const sid = plant('S-same-name-runs', 'completed');
        dal.transaction(() => {
          audit(sid, 'root-model', models);
          callAt(sid, 'r1', 'orchestrator', T(1));
          timed(sid, 'bg_00000001', 'impl', 'big-model', T(2), T(5));
          callAt(sid, 'a1', 'impl', T(3)); callAt(sid, 'a2', 'impl', T(4));
          timed(sid, 'bg_00000002', 'impl', 'small-model', T(10), T(15));
          callAt(sid, 'b1', 'impl', T(11));
        });
        expect(readAutopsy(dal, sid, clock.wall)!.requests).toEqual([
          { endpoint: 'big-model', agents: ['impl'], tool_calls: 2 },
          { endpoint: 'root-model', agents: ['orchestrator'], tool_calls: 1 },
          { endpoint: 'small-model', agents: ['impl'], tool_calls: 1 },
        ]);
      });

      it('a root whose persona spells an earlier child\'s name: its calls and its fallback outside that child\'s lifetime are the root\'s', () => {
        const sid = plant('S-root-named-like-child', 'completed');
        dal.transaction(() => {
          audit(sid, 'root-model', models);
          timed(sid, 'bg_00000001', 'planner', 'big-model', T(2), T(5));
          callAt(sid, 'a1', 'planner', T(3));
          // The next run's root is the persona `planner`.
          callAt(sid, 'r1', 'planner', T(11)); callAt(sid, 'r2', 'planner', T(12));
          dal.insertTimeline(sid, 1, T(13), 'quota_fallback_model', 'rotaris', 'planner moved to mistral/x.', JSON.stringify({ agent: 'planner', from_provider: 'katalyst', from_model: 'r', to_provider: 'mistral', to_model: 'x', to_key: 'spare-model', condition: 'rate_limit', provider_exhausted: false }), 'aaaaaaaaaai1', 'warning');
        });
        expect(readAutopsy(dal, sid, clock.wall)!.requests).toEqual([
          { endpoint: 'root-model → spare-model', agents: ['planner'], tool_calls: 2 },
          { endpoint: 'big-model', agents: ['planner'], tool_calls: 1 },
        ]);
      });

      it('two windows of one name that overlap: the call is printed as ambiguous, naming both keys, never as the later child\'s', () => {
        const sid = plant('S-same-name-overlap', 'completed');
        dal.transaction(() => {
          audit(sid, 'root-model', models);
          timed(sid, 'bg_00000001', 'impl', 'big-model', T(2), T(8));
          timed(sid, 'bg_00000002', 'impl', 'small-model', T(5), null);
          callAt(sid, 'a1', 'impl', T(3)); callAt(sid, 'a2', 'impl', T(6)); callAt(sid, 'b1', 'impl', T(9));
        });
        expect(readAutopsy(dal, sid, clock.wall)!.requests).toEqual([
          { endpoint: 'big-model', agents: ['impl'], tool_calls: 1 },
          { endpoint: 'ambiguous (big-model | small-model)', agents: ['impl'], tool_calls: 1 },
          { endpoint: 'small-model', agents: ['impl'], tool_calls: 1 },
        ]);
      });
    });

    it('a loader-made copy (a role\'s `thinking`) reads as the one key it copies, and as its own name when two keys match', () => {
      const base = { provider: 'openai-compatible', model_id: 'm', base_url: 'http://e', thinking: null };
      const one = plant('S-synthetic', 'completed');
      dal.transaction(() => { run(one); audit(one, '__persona__:orchestrator', { 'root-model': base, '__persona__:orchestrator': { ...base, thinking: 'high' } }); });
      expect(readAutopsy(dal, one, clock.wall)!.requests[0]).toEqual({ endpoint: 'root-model', agents: ['orchestrator'], tool_calls: 3 });
      const two = plant('S-ambiguous', 'completed');
      dal.transaction(() => { run(two); audit(two, '__persona__:orchestrator', { 'root-model': base, 'same-model': base, '__persona__:orchestrator': { ...base, thinking: 'high' } }); });
      expect(readAutopsy(dal, two, clock.wall)!.requests[0]).toEqual({ endpoint: '__persona__:orchestrator', agents: ['orchestrator'], tool_calls: 3 });
    });
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
