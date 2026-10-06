import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type ScriptedCall } from '@rotaris/model';
import { BUILT_IN_PERSONAS, DIRECT_WORK_INSTRUCTION, SWARM_INSTRUCTION, intentPayloadOf, intentStatusOf, RUN_CONFIG_DEFAULTS, Sessions, type Preflight, type PreflightContext, type Publisher, type ToolPort, type ToolPortContext } from '../index.js';

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
      playbookFor: (role, asEntry) => (role === 'orchestrator' ? (asEntry ? 'PLAYBOOK\nROUTE: entry text' : 'PLAYBOOK\nROUTE: routed text') : ''), budgetCell: { maxActive: 2, maxTotal: 6, maxDepth: 2 }, warnings: [],
    };
  }
  function sessionsWith(calls: ScriptedCall[], preflight: Preflight | ((ctx: PreflightContext) => Preflight | Promise<Preflight>) | null, onTools?: (ctx: ToolPortContext) => void, onPreflight?: (ctx: PreflightContext) => void, publisher: Publisher = NONE, systemPrompt?: string, runOverride?: 'single' | 'swarm' | null) {
    const client = new ScriptedModelClient(calls);
    let n = 0;
    const seen: string[] = [];
    const port: ToolPort = { specs: () => [], dispatch: async () => ({ text: '', isError: false, status: 'ok', durationMs: 0, label: '', args: {} }), cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false };
    const sessions = new Sessions({
      clocks: clock, publisher, pid: 77, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => `P${++n}`,
      model: { backend: new DefaultAgentBackend(client), config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k', ...(systemPrompt === undefined ? {} : { systemPrompt }) } }, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
      tools: (ctx) => { onTools?.(ctx); return port; }, attended: () => true,
      runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', ...(runOverride === undefined ? {} : { runOverride }) },
      ...(preflight ? { preflight: async (ctx) => { seen.push(ctx.prompt); onPreflight?.(ctx); return typeof preflight === 'function' ? preflight(ctx) : preflight; } } : {}),
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
    // K3 of the default live run at c2fdd6a: the root is given the entry role's form, never a delegated child's.
    expect(system).toContain('\n\nPLAYBOOK\nROUTE: entry text');
    expect(system).not.toContain('ROUTE: routed text');
    expect(ctxs[0]).toMatchObject({ persona: 'orchestrator', grant: 'direct-work', intent: 'single_file_change' });
    // REQ-ORCH-014: derived status — classified from the audit
    const status = intentStatusOf(dal.getSession(sid)!, dal.getLaunchAudit(sid)!.payload);
    expect(status).toMatchObject({ phase: 'classified', category: 'single_file_change' });
  });
  it('OQ-202 as ruled (PD-ORCH-006): a run that grants the coordinator the direct-work bundle tells it to do the work itself; a coordinating run does not', async () => {
    const coordinating = BUILT_IN_PERSONAS.orchestrator.systemPrompt;
    const systemOf = (client: ScriptedModelClient) => client.requests[0]!.messages[0]!.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
    const granted = sessionsWith([answer('done')], preflightOf('direct-work', 'single_file_change'), undefined, undefined, NONE, coordinating);
    const g = (granted.sessions.start(dal, 'C:/ws', 'fix the typo') as { value: SessionId }).value;
    expect((await granted.sessions.running(g)!).status).toBe('completed');
    const direct = systemOf(granted.client);
    expect(direct).toContain(DIRECT_WORK_INSTRUCTION);
    expect(direct).not.toContain('you do not modify files or run commands yourself');
    // The playbook still follows the instructions (REQ-ORCH-019).
    expect(direct).toContain('\n\nPLAYBOOK\nROUTE: entry text');
    expect(direct).not.toContain('ROUTE: routed text');
    const held = sessionsWith([answer('done')], preflightOf('none', 'whole_project'), undefined, undefined, NONE, coordinating);
    const h = (held.sessions.start(dal, 'C:/ws', 'build the whole thing') as { value: SessionId }).value;
    expect((await held.sessions.running(h)!).status).toBe('completed');
    const coordinated = systemOf(held.client);
    expect(coordinated).toContain('you do not modify files or run commands yourself');
    expect(coordinated).not.toContain(DIRECT_WORK_INSTRUCTION);
  });
  it('REQ-ORCH-025: a `swarm` run is told to delegate as widely as it can, after its playbook, where the coordinator coordinates; an `orchestrator` run is not (the-swarm-run-override-changes-no-instruction-text.md, the half OQ-205 does not hold)', async () => {
    const coordinating = BUILT_IN_PERSONAS.orchestrator.systemPrompt;
    const systemOf = (client: ScriptedModelClient) => client.requests[0]!.messages[0]!.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
    const promptOf = async (grant: 'direct-work' | 'none', category: 'single_file_change' | 'whole_project', override: 'swarm' | null) => {
      const run = sessionsWith([answer('done')], preflightOf(grant, category), undefined, undefined, NONE, coordinating, override);
      const sid = (run.sessions.start(dal, 'C:/ws', 'build the whole thing') as { value: SessionId }).value;
      expect((await run.sessions.running(sid)!).status).toBe('completed');
      return systemOf(run.client);
    };
    const swarm = await promptOf('none', 'whole_project', 'swarm');
    const orchestrator = await promptOf('none', 'whole_project', null);
    expect(swarm).not.toBe(orchestrator);
    expect(swarm).toContain(SWARM_INSTRUCTION);
    expect(orchestrator).not.toContain(SWARM_INSTRUCTION);
    // The final layer: after the role's instructions and its playbook (REQ-ORCH-025 "placed after everything else").
    expect(swarm).toBe(`${orchestrator}\n\n${SWARM_INSTRUCTION}`);
    expect(swarm.indexOf(SWARM_INSTRUCTION)).toBeGreaterThan(swarm.indexOf('PLAYBOOK\nROUTE: routed text'));
    // OQ-205's reading, until it is ruled: a run the mapping grants the direct-work bundle is told to do the work itself and
    // carries no `swarm` demand beside it (PD-ORCH-006).
    const granted = await promptOf('direct-work', 'single_file_change', 'swarm');
    expect(granted).toContain(DIRECT_WORK_INSTRUCTION);
    expect(granted).not.toContain(SWARM_INSTRUCTION);
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
  it('REQ-ORCH-014 (OQ-162, live-run finding a71-3): after a continue that classified, the status is the intent the continuation classified, not the launch\'s', async () => {
    // Changed 2026-10-06 with OQ-162's ruling (R-071): this case was the Continue action, which classified the last prompt
    // again; it now carries the intent in effect (the describe below). A continue by message still classifies, and the
    // header half of the repair is what this case keeps pinning: the status reads the continuation's intent.
    const fallback: Preflight = { ...preflightOf('none', 'whole_project'), intent: { category: 'moderate_feature', confidence: 0, reason: 'the classification call timed out after 12 s', fallback: true, carried_over: false } };
    const classified: Preflight = { ...preflightOf('direct-work', 'single_file_change'), intent: { category: 'explicit_trivial', confidence: 0.92, reason: 'a one-line edit', fallback: false, carried_over: false } };
    const answers = [fallback, classified];
    const snapshots: { intent: unknown }[] = [];
    const publisher: Publisher = { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } };
    const { sessions, seen } = sessionsWith([answer('first, done'), answer('done')], () => answers.shift() ?? classified, undefined, undefined, publisher);
    const sid = (sessions.start(dal, 'C:/ws', 'fix the typo') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(snapshots.at(-1)!.intent).toMatchObject({ phase: 'classified', category: 'moderate_feature', fallback: true });
    expect(sessions.prompt(sid, 'and the other typo').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(seen).toEqual(['fix the typo', 'and the other typo']);
    expect(dal.timelineOf(sid).filter((t) => t.name === 'run_continuation_intent').map((t) => (JSON.parse(t.metadata) as { run_intent: { category: string } }).run_intent.category)).toEqual(['explicit_trivial']);
    // … and the status shows that intent, the one in effect; the launch audit is unchanged.
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
    const { sessions } = sessionsWith([{ parts: [{ hold: turnHeld }, ...answer('first, done').parts] }, answer('done')],
      async () => { calls += 1; if (calls === 1) return fallback; await classifierHeld; return classified; }, undefined, undefined, publisher);
    const sid = (sessions.start(dal, 'C:/ws', 'fix the typo') as { value: SessionId }).value;
    releaseTurn();
    await sessions.running(sid)!;
    const before = snapshots.length;
    // Since OQ-162's ruling (R-071) the Continue action classifies nothing; a continue by message still does.
    expect(sessions.prompt(sid, 'and the other typo').ok).toBe(true);
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

  /**
   * OQ-162 and OQ-105 as ruled (R-071, `PD-ORCH-005` revision 7 clause 40): a continue resumes the paused iteration with the
   * intent and tools it started with. The pre-flight the stub stands in for honours a carried intent as the run host's
   * does (`runPreflight`): no classification, the grant and the playbook resolved for that intent.
   */
  describe('OQ-162 as ruled: a continue resumes the paused iteration with the intent and tools it started with', () => {
    const grantOf = (category: string): 'direct-work' | 'none' => (category === 'explicit_trivial' || category === 'single_file_change' ? 'direct-work' : 'none');
    const resolvedFor = (intent: Preflight['intent']): Preflight => ({ ...preflightOf(grantOf(intent.category), 'single_file_change'), intent, grant: grantOf(intent.category), playbookFor: (role) => (role === 'orchestrator' ? `PLAYBOOK for ${intent.category}` : '') });
    const classifiedAs = (category: 'moderate_feature' | 'explicit_trivial' | 'single_file_change' | 'whole_project', fallback = false): Preflight['intent'] =>
      ({ category, confidence: fallback ? 0 : 0.9, reason: fallback ? 'the classification call timed out after 12 s' : 'test', fallback, carried_over: false });
    const pausedMidTurn = (held: Promise<void>): ScriptedCall => ({ parts: [{ hold: held }, ...toolCalls([{ callId: 'c1', name: 'read_file', args: { path: 'README.md' } }], 'looking').parts] });
    const systemOf = (req: { messages: readonly { content: readonly { kind: string; text?: string }[] }[] }): string => req.messages[0]!.content.map((p) => (p.kind === 'text' ? p.text ?? '' : '')).join('');

    it('the Continue action classifies nothing: the resumed root keeps the launch\'s intent, grant and playbook, the status reads it carried, and nothing is warned (live-run findings a71-3 and G1)', async () => {
      // The live run's shape: the launch fell back at the 12 s bound; classified again, the same prompt would have come back
      // `explicit_trivial` with the direct-work grant (a71-3) or another playbook row (G1).
      const answers = [resolvedFor(classifiedAs('moderate_feature', true)), resolvedFor(classifiedAs('explicit_trivial'))];
      const classifications: string[] = [];
      const carried: Preflight['intent'][] = [];
      const ports: ToolPortContext[] = [];
      let release!: () => void;
      const held = new Promise<void>((r) => { release = r; });
      const snapshots: { intent: unknown }[] = [];
      const publisher: Publisher = { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } };
      const { sessions, client } = sessionsWith([pausedMidTurn(held), answer('done')],
        (ctx) => { if (ctx.intent) { carried.push(ctx.intent); return resolvedFor(ctx.intent); } classifications.push(ctx.prompt); return answers.shift()!; },
        (ctx) => { if (ctx.persona === 'orchestrator') ports.push(ctx); }, undefined, publisher);
      const sid = (sessions.start(dal, 'C:/ws', 'fix the typo') as { value: SessionId }).value;
      for (let i = 0; i < 40 && dal.getSession(sid)!.execution_status !== 'running'; i++) await new Promise((r) => setTimeout(r, 5));
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      await sessions.running(sid)!;
      expect(dal.iterationsOf(sid)).toMatchObject([{ state: 'open', interruption: 'pause' }]);
      const beforeContinue = snapshots.length;
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      // REQ-ORCH-014: no classification call, so the status never read `classifying` while the Continue started.
      expect(snapshots.slice(beforeContinue).filter((p) => (p.intent as { phase?: string } | null)?.phase === 'classifying')).toEqual([]);
      // One classification, the launch's; the Continue carried the intent in effect in.
      expect(classifications).toEqual(['fix the typo']);
      expect(carried).toMatchObject([{ category: 'moderate_feature', carried_over: true, fallback: false }]);
      // The resumed root was offered the grant it started with, and instructed with the playbook it started with.
      expect(ports.map((p) => [p.grant, p.intent])).toEqual([['none', 'moderate_feature'], ['none', 'moderate_feature']]);
      expect(client.requests.map(systemOf).every((text) => text.includes('PLAYBOOK for moderate_feature'))).toBe(true);
      // The record: the continuation's intent is the launch's, carried; the status reads it so.
      const entries = dal.timelineOf(sid).filter((t) => t.name === 'run_continuation_intent').map((t) => (JSON.parse(t.metadata) as { run_intent: Preflight['intent']; intent_grant: string }));
      expect(entries).toMatchObject([{ run_intent: { category: 'moderate_feature', carried_over: true }, intent_grant: 'none' }]);
      expect(dal.residentRows(sid).some((r) => r.body === 'Intent classified: moderate_feature (continued from previous run)')).toBe(true);
      expect(intentStatusOf(dal.getSession(sid)!, intentPayloadOf(dal, sid))).toMatchObject({ phase: 'classified', category: 'moderate_feature', carried_over: true });
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'resumed_under_changed_instructions')).toEqual([]);
    });

    it('a continue by message classifies its message, the resumed iteration keeps the intent it started with, and the new intent governs from the next iteration', async () => {
      const answers = [resolvedFor(classifiedAs('single_file_change')), resolvedFor(classifiedAs('whole_project'))];
      const classifications: string[] = [];
      const ports: ToolPortContext[] = [];
      let releaseFirst!: () => void;
      const first = new Promise<void>((r) => { releaseFirst = r; });
      let releaseResumed!: () => void;
      const resumed = new Promise<void>((r) => { releaseResumed = r; });
      const { sessions, client } = sessionsWith([pausedMidTurn(first), { parts: [{ hold: resumed }, ...answer('resumed, done').parts] }, answer('next, done')],
        (ctx) => { if (ctx.intent) return resolvedFor(ctx.intent); classifications.push(ctx.prompt); return answers.shift()!; },
        (ctx) => { if (ctx.persona === 'orchestrator') ports.push(ctx); });
      const sid = (sessions.start(dal, 'C:/ws', 'fix the typo') as { value: SessionId }).value;
      for (let i = 0; i < 40 && dal.getSession(sid)!.execution_status !== 'running'; i++) await new Promise((r) => setTimeout(r, 5));
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      releaseFirst();
      await sessions.running(sid)!;
      expect(sessions.prompt(sid, 'and rename it too').ok).toBe(true);
      for (let i = 0; i < 80 && client.requests.length < 2; i++) await new Promise((r) => setTimeout(r, 5));
      // While the resumed iteration runs, the status reads the intent it started with, carried.
      expect(intentStatusOf(dal.getSession(sid)!, intentPayloadOf(dal, sid))).toMatchObject({ phase: 'classified', category: 'single_file_change', carried_over: true });
      // A second request the resumed iteration does not hold, so a new iteration follows it in the same run.
      expect(sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'then this' } }).ok).toBe(true);
      releaseResumed();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(classifications).toEqual(['fix the typo', 'and rename it too']);
      expect(dal.iterationsOf(sid).map((r) => r.iteration)).toEqual([1, 2]);
      // The launch's root, the resumed root, then the next iteration's root under the message's classification.
      expect(ports.map((p) => [p.grant, p.intent])).toEqual([['direct-work', 'single_file_change'], ['direct-work', 'single_file_change'], ['none', 'whole_project']]);
      expect(systemOf(client.requests[1]!)).toContain('PLAYBOOK for single_file_change');
      expect(systemOf(client.requests[2]!)).toContain('PLAYBOOK for whole_project');
      const entries = dal.timelineOf(sid).filter((t) => t.name === 'run_continuation_intent').map((t) => (JSON.parse(t.metadata) as { run_intent: Preflight['intent']; next_run_intent?: Preflight['intent'] }));
      expect(entries).toMatchObject([
        { run_intent: { category: 'single_file_change', carried_over: true }, next_run_intent: { category: 'whole_project' } },
        { run_intent: { category: 'whole_project', carried_over: false } },
      ]);
      expect(intentStatusOf(dal.getSession(sid)!, intentPayloadOf(dal, sid))).toMatchObject({ phase: 'classified', category: 'whole_project' });
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'resumed_under_changed_instructions')).toEqual([]);
    });

    it('OQ-202 with OQ-162 (PD-ORCH-006, PD-ORCH-005 revision 7 clause 40): a resumed coordinator keeps the instructions of the grant it started with; a message\'s direct-work grant tells the next iteration\'s root to do the work itself', async () => {
      // The launch coordinates (`none`); the continue's message classifies `explicit_trivial` with the direct-work bundle.
      // The resumed iteration runs under the carried grant, so its root keeps the coordinating prompt that agrees with the
      // tools it is offered; only the next iteration's root is told to do the work itself (found by fin20's verifier).
      const coordinating = BUILT_IN_PERSONAS.orchestrator.systemPrompt;
      const answers = [resolvedFor(classifiedAs('moderate_feature')), resolvedFor(classifiedAs('explicit_trivial'))];
      const ports: ToolPortContext[] = [];
      let releaseFirst!: () => void;
      const first = new Promise<void>((r) => { releaseFirst = r; });
      let releaseResumed!: () => void;
      const resumed = new Promise<void>((r) => { releaseResumed = r; });
      const { sessions, client } = sessionsWith([pausedMidTurn(first), { parts: [{ hold: resumed }, ...answer('resumed, done').parts] }, answer('next, done')],
        (ctx) => (ctx.intent ? resolvedFor(ctx.intent) : answers.shift()!),
        (ctx) => { if (ctx.persona === 'orchestrator') ports.push(ctx); }, undefined, NONE, coordinating);
      const sid = (sessions.start(dal, 'C:/ws', 'add the export feature') as { value: SessionId }).value;
      for (let i = 0; i < 40 && dal.getSession(sid)!.execution_status !== 'running'; i++) await new Promise((r) => setTimeout(r, 5));
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      releaseFirst();
      await sessions.running(sid)!;
      expect(sessions.prompt(sid, 'just fix the typo in the README').ok).toBe(true);
      for (let i = 0; i < 80 && client.requests.length < 2; i++) await new Promise((r) => setTimeout(r, 5));
      expect(sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'then this' } }).ok).toBe(true);
      releaseResumed();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(ports.map((p) => [p.grant, p.intent])).toEqual([['none', 'moderate_feature'], ['none', 'moderate_feature'], ['direct-work', 'explicit_trivial']]);
      const [launched, resumedRoot, next] = client.requests.map(systemOf);
      for (const text of [launched!, resumedRoot!]) {
        expect(text).toContain('you do not modify files or run commands yourself');
        expect(text).not.toContain(DIRECT_WORK_INSTRUCTION);
      }
      expect(resumedRoot).toContain('PLAYBOOK for moderate_feature');
      expect(next).toContain(DIRECT_WORK_INSTRUCTION);
      expect(next).not.toContain('you do not modify files or run commands yourself');
      expect(next).toContain('PLAYBOOK for explicit_trivial');
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'resumed_under_changed_instructions')).toEqual([]);
    });

    it('REQ-ORCH-013: the prior intent a continue\'s classification inherits is the intent in effect, a continue\'s over the launch\'s', async () => {
      const answers = [resolvedFor(classifiedAs('single_file_change')), resolvedFor(classifiedAs('whole_project')), resolvedFor(classifiedAs('moderate_feature', true))];
      const priors: (string | null | undefined)[] = [];
      const { sessions } = sessionsWith([answer('one'), answer('two'), answer('three')],
        (ctx) => { if (ctx.intent) return resolvedFor(ctx.intent); priors.push(ctx.previousIntent); return answers.shift()!; });
      const sid = (sessions.start(dal, 'C:/ws', 'fix the typo') as { value: SessionId }).value;
      await sessions.running(sid)!;
      expect(sessions.prompt(sid, 'now the whole thing').ok).toBe(true);
      await sessions.running(sid)!;
      expect(sessions.prompt(sid, 'continue').ok).toBe(true);
      await sessions.running(sid)!;
      // The second continue's prior is the first continue's `whole_project`, not the launch's `single_file_change`.
      expect(priors).toEqual([undefined, 'single_file_change', 'whole_project']);
    });
  });

  it('REQ-CHAT-158 / REQ-SESSION-154 (live-run finding G8): a continuation\'s run starts at its `starting` save, its pre-flight counted as a launch\'s is', async () => {
    // Each classification takes wall time on the run's clock: 3 s for the launch, 8.6 s for the Continue (the live run's).
    const took = [3_000, 8_600];
    let releaseTurn!: () => void;
    const turnHeld = new Promise<void>((r) => { releaseTurn = r; });
    const startingAt: string[] = [];
    const { sessions } = sessionsWith([{ parts: [{ hold: turnHeld }, ...toolCalls([{ callId: 'c1', name: 'read_file', args: { path: 'README.md' } }], 'looking').parts] }, answer('done')],
      () => preflightOf('none', 'single_file_change'), undefined,
      (ctx) => { startingAt.push(dal.getSession(ctx.sessionId as SessionId)!.updated_at); clock.advance(took.shift() ?? 0); });
    const sid = (sessions.start(dal, 'C:/ws', 'fix the typo') as { value: SessionId }).value;
    for (let i = 0; i < 40 && dal.getSession(sid)!.execution_status !== 'running'; i++) await new Promise((r) => setTimeout(r, 5));
    // The launch: the column is the `starting` save the pre-flight began under.
    expect(dal.getSession(sid)!.run_started_at).toBe(startingAt[0]);
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    releaseTurn();
    await sessions.running(sid)!;
    clock.advance(500);
    expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
    for (let i = 0; i < 40 && startingAt.length < 2; i++) await new Promise((r) => setTimeout(r, 5));
    expect(startingAt).toHaveLength(2);
    clock.advance(1_000);
    expect((await sessions.running(sid)!).status).toBe('completed');
    const row = dal.getSession(sid)!;
    // The continuation: the `starting` save it classified under, not the instant its classification returned (8.6 s on).
    expect(row.run_started_at).toBe(startingAt[1]);
    expect(Date.parse(row.updated_at) - Date.parse(row.run_started_at!)).toBeGreaterThanOrEqual(9_600);
    // The session list's duration label reads the same column: the continued run's whole duration, 0:09, not 0:01.
    expect(sessions.list(dal, 'C:/ws').find((r) => r.sessionId === sid)!.durationLabel).toBe('0:09');
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
