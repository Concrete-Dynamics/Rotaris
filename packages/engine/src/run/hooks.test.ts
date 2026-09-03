import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type ScriptedCall } from '@rotaris/model';
import { RUN_CONFIG_DEFAULTS, Sessions, type HookPort, type PortToolResult, type Publisher, type RunNotice, type ToolPort } from '../index.js';

const HOST = mintMachineId('0000000000000000000000000000000b') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };
const NONE: Publisher = { increment: () => undefined, snapshot: () => undefined };

/** A hook port that records what the run fires, in order, with the fields it was given. */
function fakeHooks(opts: { withheld?: number; advisory?: string; snapshot?: HookPort['auditSnapshot'] } = {}) {
  const fired: { event: string; fields: Record<string, unknown> }[] = [];
  let announced = 0;
  const port: HookPort = {
    auditSnapshot: opts.snapshot ?? (() => [{ hook_id: 'global:0:session_end', name: 'N', event: 'session_end', matcher: '', source: 'global', command: 'notify --token ***' }]),
    trust: () => ({ withheld: opts.withheld ?? 0, reinstated: 0, notice: opts.withheld ? `Skipped ${opts.withheld} hooks …` : '', workspace: 'C:/ws', fingerprint: 'f'.repeat(64), loadWarning: '' }),
    announceWithheld: () => { announced += 1; return opts.withheld ?? 0; },
    hasHooksFor: () => true,
    fireLifecycle: async (event, fields) => { fired.push({ event, fields: { ...fields } }); return []; },
    advisory: () => opts.advisory ?? '',
    toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
  };
  return { port, fired, announced: () => announced };
}

describe('engine/run — the lifecycle hook points (ADR-0015, REQ-HOOKS-003/080/081/082/085..088/118)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  const warnings: string[] = [];
  const notices: RunNotice[] = [];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-hooks-run-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
    warnings.length = 0;
    notices.length = 0;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  function sessionsWith(calls: ScriptedCall[], hooks: HookPort | null, port: ToolPort | null = null) {
    const client = new ScriptedModelClient(calls);
    let n = 0;
    const sessions = new Sessions({
      clocks: clock, publisher: NONE, pid: 77, host: HOST, retentionCap: 20_000, warn: (m) => warnings.push(m), mintSessionId: () => `H${++n}`,
      model: { backend: new DefaultAgentBackend(client), config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, resolveCredential: async () => 'k' } }, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
      ...(port ? { tools: () => port } : {}), attended: () => true,
      runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' },
      ...(hooks ? { hooks: () => hooks } : {}), notice: (nn) => notices.push(nn),
    });
    return { sessions, client };
  }

  it('session_start before iteration 1, iteration_end after each iteration.end, session_end with the one status string; the audit snapshot', async () => {
    const h = fakeHooks();
    const { sessions } = sessionsWith([answer('done')], h.port);
    const sid = (sessions.start(dal, 'C:/ws', 'do the thing') as { value: SessionId }).value;
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    expect(h.fired.map((f) => f.event)).toEqual(['session_start', 'iteration_end', 'session_end']);
    expect(h.fired[0]!.fields).toEqual({ task: 'do the thing' });
    expect(h.fired[1]!.fields).toMatchObject({ iteration: 1, outcome: 'succeeded', status: 'succeeded', child_name: 'root:1' });
    // REQ-HOOKS-081: character-for-character the value on session.end
    const end = JSON.parse(dal.eventsOfKind(sid, 'session.end')[0]!.payload) as { status: string };
    expect(h.fired[2]!.fields).toEqual({ status: end.status });
    expect(h.announced()).toBe(1);
    const audit = JSON.parse(dal.getLaunchAudit(sid)!.payload) as { hooks: unknown[] };
    expect(audit.hooks).toEqual([{ hook_id: 'global:0:session_end', name: 'N', event: 'session_end', matcher: '', source: 'global', command: 'notify --token ***' }]);
    // nothing withheld, nothing switched off: no notice, no hook issue (REQ-HOOKS-088)
    expect(notices).toEqual([]);
    expect(dal.issuesOf(sid).map((i) => i.kind)).not.toContain('hook_trust');
  });
  it('REQ-HOOKS-086/087: withheld hooks are one hook_trust issue and one keyed notice at start; the advisory goes out at the end and the attachment is removed', async () => {
    const h = fakeHooks({ withheld: 2, advisory: '1 hook was switched off …' });
    const { sessions } = sessionsWith([answer('done')], h.port);
    const sid = (sessions.start(dal, 'C:/ws', 't') as { value: SessionId }).value;
    await sessions.running(sid)!;
    const trust = dal.issuesOf(sid).find((i) => i.kind === 'hook_trust')!;
    expect(trust).toMatchObject({ severity: 'warning', actor: 'hooks' });
    expect(JSON.parse(trust.metadata)).toEqual({ blocked: 2, restored: 0, workspace: 'C:/ws' });
    expect(notices.map((n) => [n.action, n.key ?? ''])).toEqual([['hooks.review', `hooks.review:C:/ws:${'f'.repeat(64)}`], ['hooks.settings', '']]);
    expect(notices[1]!.detail).toBe('1 hook was switched off …');
  });
  it('REQ-HOOKS-041: with no hook port nothing about hooks is recorded; the audit records an explicit empty list', async () => {
    const { sessions } = sessionsWith([answer('done')], null);
    const sid = (sessions.start(dal, 'C:/ws', 't') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(JSON.parse(dal.getLaunchAudit(sid)!.payload)).toMatchObject({ hooks: [] });
    expect(dal.eventsFrom(sid, 1, 10_000).map((e) => e.kind).filter((k) => k.startsWith('hook.'))).toEqual([]);
    expect(notices).toEqual([]);
  });
  it('session_end fires on the interrupted path too, with that status (a stop that lands after start-up still sees session_start: the run did start)', async () => {
    const h = fakeHooks();
    const { sessions } = sessionsWith([answer('never reached')], h.port);
    const sid = (sessions.start(dal, 'C:/ws', 't') as { value: SessionId }).value;
    sessions.control({ sessionId: sid, op: 'cancel', args: {} });
    const r = await sessions.running(sid)!;
    expect(r.status).toBe('interrupted');
    expect(h.fired.map((f) => f.event)).toEqual(['session_start', 'session_end']);
    expect(h.fired[1]!.fields).toEqual({ status: 'interrupted' });
  });
  it('REQ-HOOKS-074: a follow-up from the tool port is delivered as a user message after the tool results', async () => {
    const port: ToolPort = {
      specs: () => [{ name: 'read_file', description: 'r', parameters: { type: 'object' } }],
      dispatch: async (): Promise<PortToolResult> => ({ text: 'no such file', isError: true, status: 'failed', durationMs: 1, label: 'read_file x', args: {}, followUp: "Hook 'P' reported after the 'read_file' call: noted" }),
      cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
    };
    const { sessions, client } = sessionsWith([toolCalls([{ callId: 'c1', name: 'read_file', args: { path: 'x' } }]), answer('ok')], null, port);
    const sid = (sessions.start(dal, 'C:/ws', 't') as { value: SessionId }).value;
    await sessions.running(sid)!;
    const roles = client.requests[1]!.messages.map((m) => m.role);
    expect(roles.slice(-3)).toEqual(['assistant', 'tool', 'user']);
    const last = client.requests[1]!.messages[client.requests[1]!.messages.length - 1]!;
    expect(last.content[0]).toEqual({ kind: 'text', text: "Hook 'P' reported after the 'read_file' call: noted" });
    // the hook feedback is not a transcript row (REQ-HOOKS-138)
    expect(dal.residentRows(sid).map((r) => r.kind)).toEqual(['user', 'tool', 'agent', 'system']);
  });
});
