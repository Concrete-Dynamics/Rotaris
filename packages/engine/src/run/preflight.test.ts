import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type ScriptedCall } from '@rotaris/model';
import { intentPayloadOf, intentStatusOf, RUN_CONFIG_DEFAULTS, Sessions, type Preflight, type PreflightContext, type Publisher, type ToolPort, type ToolPortContext } from '../index.js';

const HOST = mintMachineId('0000000000000000000000000000000c') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };
const NONE: Publisher = { increment: () => undefined, snapshot: () => undefined };

describe('engine/run — the pre-flight in the run (REQ-ORCH-005/014/016/019/024/027, REQ-SESSION-138)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-preflight-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  function preflightOf(grant: 'direct-work' | 'none', category: 'single_file_change' | 'question' | 'whole_project'): Preflight {
    return {
      intent: { category, confidence: 0.9, reason: 'test', fallback: false, carried_over: false }, grant, route: category === 'question' ? 'answer' : 'work',
      resolvedPlaybooks: { orchestrator: { row: 'orchestrator:micro:any', text: 'PLAYBOOK\nROUTE: routed text', cell: { ROUTE: 'routed', AUTONOMY: 'proceed', RESEARCH: 'targeted', CHUNKING: 'single', VERIFY: 'run_checks', ARTIFACT: 'none', OUTPUT: 'report', BUDGET: 'tight' } } },
      playbookFor: (role) => (role === 'orchestrator' ? 'PLAYBOOK\nROUTE: routed text' : ''), budgetCell: { maxActive: 2, maxTotal: 6, maxDepth: 2 }, warnings: [],
    };
  }
  function sessionsWith(calls: ScriptedCall[], preflight: Preflight | (() => Preflight | Promise<Preflight>) | null, onTools?: (ctx: ToolPortContext) => void, onPreflight?: (ctx: PreflightContext) => void, publisher: Publisher = NONE) {
    const client = new ScriptedModelClient(calls);
    let n = 0;
    const seen: string[] = [];
    const port: ToolPort = { specs: () => [], dispatch: async () => ({ text: '', isError: false, status: 'ok', durationMs: 0, label: '', args: {} }), cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false };
    const sessions = new Sessions({
      clocks: clock, publisher, pid: 77, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => `P${++n}`,
      model: { backend: new DefaultAgentBackend(client), config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' } }, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
      tools: (ctx) => { onTools?.(ctx); return port; }, attended: () => true,
      runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' },
      ...(preflight ? { preflight: async (ctx) => { seen.push(ctx.prompt); onPreflight?.(ctx); return typeof preflight === 'function' ? preflight() : preflight; } } : {}),
    });
    return { sessions, client, seen };
  }

  it('the audit carries run_intent, the grant and resolved_playbooks; the root prompt carries the playbook; the entry port sees the grant', async () => {
    const ctxs: ToolPortContext[] = [];
    const { sessions, client, seen } = sessionsWith([answer('done')], preflightOf('direct-work', 'single_file_change'), (c) => ctxs.push(c));
    const sid = (sessions.start(dal, 'C:/ws', 'fix the typo') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(seen).toEqual(['fix the typo']);
    const audit = JSON.parse(dal.getLaunchAudit(sid)!.payload) as { run_intent: unknown; intent_grant: string; resolved_playbooks: Record<string, { row: string }> };
    expect(audit.run_intent).toEqual({ category: 'single_file_change', confidence: 0.9, reason: 'test', fallback: false, carried_over: false });
    expect(audit.intent_grant).toBe('direct-work');
    expect(audit.resolved_playbooks['orchestrator']!.row).toBe('orchestrator:micro:any');
    const system = client.requests[0]!.messages[0]!.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
    expect(system).toMatch(/^You are the orchestrator/);
    expect(system).toContain('\n\nPLAYBOOK\nROUTE: routed text');
    expect(ctxs[0]).toMatchObject({ persona: 'orchestrator', grant: 'direct-work', intent: 'single_file_change' });
    // REQ-ORCH-014: derived status — classified from the audit
    const status = intentStatusOf(dal.getSession(sid)!, dal.getLaunchAudit(sid)!.payload);
    expect(status).toMatchObject({ phase: 'classified', category: 'single_file_change' });
  });
  it('with no pre-flight the fallback intent is recorded, no playbook is appended, and the port sees no grant', async () => {
    const ctxs: ToolPortContext[] = [];
    const { sessions, client } = sessionsWith([answer('done')], null, (c) => ctxs.push(c));
    const sid = (sessions.start(dal, 'C:/ws', 't') as { value: SessionId }).value;
    await sessions.running(sid)!;
    const audit = JSON.parse(dal.getLaunchAudit(sid)!.payload) as { run_intent: { category: string; fallback: boolean }; intent_grant: string; resolved_playbooks: unknown };
    expect(audit.run_intent).toMatchObject({ category: 'moderate_feature', fallback: true });
    expect(audit.intent_grant).toBe('none');
    expect(audit.resolved_playbooks).toEqual({});
    const system = client.requests[0]!.messages[0]!.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
    expect(system).not.toContain('PLAYBOOK');
    expect(ctxs[0]!.grant).toBe('none');
  });
  it('REQ-EVENTS-053 / PD-MONITOR-001: the pre-flight is handed the run\'s counter, and its classification request joins the totals', async () => {
    // What the run host does with the counter: wrap its classifier's backend (`meteredBackend`), which reports this.
    const onPreflight = (ctx: PreflightContext) => { ctx.countUsage?.({ input: 40, output: 4, cost: '0.0004' }, MODEL); };
    const { sessions } = sessionsWith([answer('done', { input: 10, output: 1, cost: '0.001' })], preflightOf('none', 'single_file_change'), undefined, onPreflight);
    const sid = (sessions.start(dal, 'C:/ws', 'fix the typo') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(dal.getSession(sid)).toMatchObject({ tokens_input: 50, tokens_output: 5, cost: '0.0014' });
    expect(dal.eventsOfKind(sid, 'usage.update')).toHaveLength(2);
  });
  it('REQ-ORCH-014 (OQ-162, live-run finding a71-3): after the Continue action the status is the intent the continuation classified, not the launch\'s', async () => {
    const fallback: Preflight = { ...preflightOf('none', 'whole_project'), intent: { category: 'moderate_feature', confidence: 0, reason: 'the classification call timed out after 12 s', fallback: true, carried_over: false } };
    const classified: Preflight = { ...preflightOf('direct-work', 'single_file_change'), intent: { category: 'explicit_trivial', confidence: 0.92, reason: 'a one-line edit', fallback: false, carried_over: false } };
    const answers = [fallback, classified];
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const snapshots: { intent: unknown }[] = [];
    const publisher: Publisher = { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } };
    const { sessions, seen } = sessionsWith([{ parts: [{ hold: held }, ...toolCalls([{ callId: 'c1', name: 'read_file', args: { path: 'README.md' } }], 'looking').parts] }, answer('done')], () => answers.shift() ?? classified, undefined, undefined, publisher);
    const sid = (sessions.start(dal, 'C:/ws', 'fix the typo') as { value: SessionId }).value;
    for (let i = 0; i < 40 && dal.getSession(sid)!.execution_status !== 'running'; i++) await new Promise((r) => setTimeout(r, 5));
    expect(snapshots.at(-1)!.intent).toMatchObject({ phase: 'classified', category: 'moderate_feature', fallback: true });
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    await sessions.running(sid)!;
    expect(dal.iterationsOf(sid)).toMatchObject([{ state: 'open', interruption: 'pause' }]);
    expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    // The Continue action classified the last user prompt again (OQ-162's built reading) …
    expect(seen).toEqual(['fix the typo', 'fix the typo']);
    expect(dal.timelineOf(sid).filter((t) => t.name === 'run_continuation_intent').map((t) => (JSON.parse(t.metadata) as { run_intent: { category: string } }).run_intent.category)).toEqual(['explicit_trivial']);
    // … and the status shows that intent, the one in effect for the resumed iteration; the launch audit is unchanged.
    expect(snapshots.at(-1)!.intent).toEqual({ phase: 'classified', category: 'explicit_trivial', confidence: 0.92, reason: 'a one-line edit', fallback: false, carried_over: false });
    expect(JSON.parse(dal.getLaunchAudit(sid)!.payload)).toMatchObject({ run_intent: { category: 'moderate_feature', fallback: true } });
    expect(intentStatusOf(dal.getSession(sid)!, intentPayloadOf(dal, sid))).toMatchObject({ phase: 'classified', category: 'explicit_trivial' });
  });

  it('REQ-ORCH-014 (OQ-162): while a continue classifies, the status reads `classifying`, and the new intent replaces it in place', async () => {
    const fallback: Preflight = { ...preflightOf('none', 'whole_project'), intent: { category: 'moderate_feature', confidence: 0, reason: 'the classification call timed out after 12 s', fallback: true, carried_over: false } };
    const classified: Preflight = { ...preflightOf('direct-work', 'single_file_change'), intent: { category: 'explicit_trivial', confidence: 0.92, reason: 'a one-line edit', fallback: false, carried_over: false } };
    let releaseTurn!: () => void;
    const turnHeld = new Promise<void>((r) => { releaseTurn = r; });
    let releaseClassifier!: () => void;
    const classifierHeld = new Promise<void>((r) => { releaseClassifier = r; });
    let calls = 0;
    const snapshots: { executionStatus: string; intent: unknown }[] = [];
    const publisher: Publisher = { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } };
    const { sessions } = sessionsWith([{ parts: [{ hold: turnHeld }, ...toolCalls([{ callId: 'c1', name: 'read_file', args: { path: 'README.md' } }], 'looking').parts] }, answer('done')],
      async () => { calls += 1; if (calls === 1) return fallback; await classifierHeld; return classified; }, undefined, undefined, publisher);
    const sid = (sessions.start(dal, 'C:/ws', 'fix the typo') as { value: SessionId }).value;
    for (let i = 0; i < 40 && dal.getSession(sid)!.execution_status !== 'running'; i++) await new Promise((r) => setTimeout(r, 5));
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    releaseTurn();
    await sessions.running(sid)!;
    const before = snapshots.length;
    expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
    for (let i = 0; i < 40 && calls < 2; i++) await new Promise((r) => setTimeout(r, 5));
    expect(calls).toBe(2);
    // The continuation's classification call is in flight: the previous run's fallback is not shown as the intent.
    expect(dal.getSession(sid)!.execution_status).toBe('starting');
    const during = snapshots.slice(before);
    expect(during.length).toBeGreaterThan(0);
    expect(during.every((s) => s.executionStatus !== 'starting' || (s.intent as { phase: string }).phase === 'classifying')).toBe(true);
    expect(during.at(-1)!.intent).toEqual({ phase: 'classifying' });
    releaseClassifier();
    expect((await sessions.running(sid)!).status).toBe('completed');
    const after = snapshots.slice(before + during.length);
    expect(after.find((s) => (s.intent as { phase: string }).phase === 'classified')!.intent).toMatchObject({ phase: 'classified', category: 'explicit_trivial' });
    expect(snapshots.at(-1)!.intent).toMatchObject({ phase: 'classified', category: 'explicit_trivial' });
  });

  it('REQ-ORCH-014: the status reads the newest continuation intent over the launch audit, and the launch audit where no continuation recorded one', async () => {
    const { sessions } = sessionsWith([answer('done')], preflightOf('direct-work', 'single_file_change'));
    const sid = (sessions.start(dal, 'C:/ws', 'fix the typo') as { value: SessionId }).value;
    await sessions.running(sid)!;
    const running = { execution_status: 'running' } as Parameters<typeof intentStatusOf>[0];
    expect(intentPayloadOf(dal, sid)).toBe(dal.getLaunchAudit(sid)!.payload);
    expect(intentStatusOf(running, intentPayloadOf(dal, sid))).toMatchObject({ category: 'single_file_change' });
    const append = (name: string, metadata: unknown) => { const n = dal.nextTimelineOrdinal(sid); dal.insertTimeline(sid, n, `t${n}`, name, 'rotaris', name, JSON.stringify(metadata), `0000000${n}`.slice(-8), 'info'); };
    append('run_continuation_intent', { run_intent: { category: 'question', confidence: 0.8, reason: 'r', fallback: false, carried_over: false } });
    append('run_start', {});
    append('run_continuation_intent', { run_intent: { category: 'exploration', confidence: 0.7, reason: 'r', fallback: false, carried_over: true } });
    append('run_start', {});
    expect(intentStatusOf(running, intentPayloadOf(dal, sid))).toMatchObject({ phase: 'classified', category: 'exploration', carried_over: true });
    expect(intentPayloadOf({ getLaunchAudit: () => undefined, latestTimelineEntry: () => undefined }, 'S-none' as SessionId)).toBeNull();
  });

  it('REQ-ORCH-014: classifying while starting with no audit; null for a session that never ran', () => {
    const row = { execution_status: 'starting' } as Parameters<typeof intentStatusOf>[0];
    expect(intentStatusOf(row, null)).toEqual({ phase: 'classifying' });
    expect(intentStatusOf({ execution_status: 'created' } as Parameters<typeof intentStatusOf>[0], null)).toBeNull();
    expect(intentStatusOf(row, '{"run_intent":{"category":"nope"}}')).toEqual({ phase: 'classifying' });
    // A continuation's pre-flight in flight: the previous run's intent on the record is not shown as the one in effect.
    const previous = '{"run_intent":{"category":"moderate_feature","confidence":0,"reason":"r","fallback":true,"carried_over":false}}';
    expect(intentStatusOf(row, previous)).toMatchObject({ phase: 'classified', category: 'moderate_feature' });
    expect(intentStatusOf(row, previous, true)).toEqual({ phase: 'classifying' });
  });
});
