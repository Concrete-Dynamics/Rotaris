import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, type ScriptedCall } from '@rotaris/model';
import { intentStatusOf, RUN_CONFIG_DEFAULTS, Sessions, type Preflight, type Publisher, type ToolPort, type ToolPortContext } from '../index.js';

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
  function sessionsWith(calls: ScriptedCall[], preflight: Preflight | null, onTools?: (ctx: ToolPortContext) => void) {
    const client = new ScriptedModelClient(calls);
    let n = 0;
    const seen: string[] = [];
    const port: ToolPort = { specs: () => [], dispatch: async () => ({ text: '', isError: false, status: 'ok', durationMs: 0, label: '', args: {} }), cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false };
    const sessions = new Sessions({
      clocks: clock, publisher: NONE, pid: 77, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => `P${++n}`,
      model: { backend: new DefaultAgentBackend(client), config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' } }, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
      tools: (ctx) => { onTools?.(ctx); return port; }, attended: () => true,
      runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' },
      ...(preflight ? { preflight: async (ctx) => { seen.push(ctx.prompt); return preflight; } } : {}),
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
  it('REQ-ORCH-014: classifying while starting with no audit; null for a session that never ran', () => {
    const row = { execution_status: 'starting' } as Parameters<typeof intentStatusOf>[0];
    expect(intentStatusOf(row, null)).toEqual({ phase: 'classifying' });
    expect(intentStatusOf({ execution_status: 'created' } as Parameters<typeof intentStatusOf>[0], null)).toBeNull();
    expect(intentStatusOf(row, '{"run_intent":{"category":"nope"}}')).toEqual({ phase: 'classifying' });
  });
});
