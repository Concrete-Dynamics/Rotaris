import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, RESIDENT_ROW_CAP, StoreDal, forgetSpelling } from '@rotaris/store';
import type { SessionSnapshot } from '@rotaris/contracts';
import { answer, DefaultAgentBackend, modelError, ScriptedModelClient, toolCalls, type ModelRef, type ScriptedCall } from '@rotaris/model';
import { BUILT_IN_PERSONAS, ResilienceMemory, RUN_CONFIG_DEFAULTS, Sessions, toSessionRecord, type CatalogueEntry, type DelegationOps, type ModelChoice, type ModelLookup, type PortToolResult, type Publisher, type RoleName, type RunConfig, type ToolPort } from '../index.js';
import { conversationOf } from './record.js';
import { persistAttachments } from '../attachments.js';
import { childModelKeys, entryModelKeys } from '../autopsy.js';

const HOST = mintMachineId('0000000000000000000000000000000d') as MachineId;
const ref = (providerId: string, modelId: string): ModelRef => ({ providerId, modelId, dialect: 'chat' });
const A1 = ref('a', 'a1');
const B1 = ref('b', 'b1');
const C1 = ref('c', 'c1');
const F1 = ref('f', 'f1');
const entry = (key: string, provider: string, model: ModelRef, roles: CatalogueEntry['roles'], extra: Partial<CatalogueEntry> = {}): CatalogueEntry => ({ key, provider, model, thinking: 'unset', roles, origin: 'configured', usable: true, ...extra });
const rateLimit = (retryAfterS?: number) => modelError({ code: 'http', status: 429, headline: 'Too Many Requests', providerMessage: 'rate limit', transient: false, ...(retryAfterS === undefined ? {} : { retryAfterMs: retryAfterS * 1000 }) });
const quota = () => modelError({ code: 'http', status: 429, headline: 'quota', providerMessage: '{"error":{"code":"insufficient_quota","message":"You exceeded your current quota"}}', transient: false });
const failing = (e: ReturnType<typeof modelError>): ScriptedCall => ({ parts: [{ error: e }] });
const hanging = (hold: Promise<void>): ScriptedCall => ({ parts: [{ hold, part: { kind: 'text', delta: 'late' } }, { part: { kind: 'finish', reason: 'stop' } }] });
const NEVER = new Promise<void>(() => undefined);

function recorder(): Publisher & { snapshots: SessionSnapshot['session'][] } {
  const snapshots: SessionSnapshot['session'][] = [];
  return { snapshots, increment: () => undefined, snapshot: (p) => snapshots.push(p.session) };
}

/** A tool the test answers itself, ahead of the delegation tools; undefined leaves the call to them. */
type TestTool = (name: string, args: Record<string, unknown>) => Promise<PortToolResult> | undefined;

/** The delegation tools dispatched straight to the ops (as the children test does). */
function delegationPort(ops: DelegationOps, parentId: string, tool?: TestTool): ToolPort {
  const dispatch = async (name: string, raw: string): Promise<PortToolResult> => {
    const a = JSON.parse(raw) as Record<string, unknown>;
    const ok = (text: string): PortToolResult => ({ text, isError: false, status: 'ok', durationMs: 1, label: name, args: a });
    const own = tool?.(name, a);
    if (own) return own;
    if (name === 'delegate') {
      const ids = (k: string): string[] => (Array.isArray(a[k]) ? (a[k] as unknown[]).map(String) : []);
      const r = await ops.delegate(parentId, { persona: String(a['persona']), taskName: String(a['task_name']), task: String(a['task']), dependsOn: ids('depends_on'), inheritedContext: ids('inherited_context'), category: '', runInBackground: true, ...(a['attach_artifacts'] === undefined ? {} : { attachArtifacts: ids('attach_artifacts') }) });
      if (r.status === 'rejected') return { ...ok(`rejected — ${r.message}`), isError: true, status: 'failed' };
      return ok(`Task '${r.canonicalName}': ${r.status}\ntask_id: ${r.taskId}`);
    }
    return { ...ok(`unknown ${name}`), isError: true, status: 'failed' };
  };
  return {
    specs: () => [{ name: 'delegate', description: 'delegate', parameters: { type: 'object' } }],
    dispatch: (c) => dispatch(c.name, c.rawArgs), cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
  };
}

describe('engine/run/ladder — the resilience paths in the run (REQ-ORCH-088/090/091/092, REQ-NOTIFY-081..092/263)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  const warnings: string[] = [];
  // One counter for the whole file: every Sessions instance in a test mints a distinct id (a shared 'S1' read another scenario's rows).
  let minted = 0;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-ladder-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
    warnings.length = 0;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  interface Opts {
    catalogue?: CatalogueEntry[];
    fallbackModel?: ModelChoice | null;
    entryModel?: ModelRef;
    llmResponseTimeoutMs?: number;
    childTimeoutMs?: number;
    roleFallback?: ModelRef | null;
    /** REQ-CONFIG-108: the role's own `stall_timeout`, carried as `Persona.stallTimeoutMs`. */
    roleStallTimeoutMs?: number;
    /** REQ-CONFIG-113: `runtime.child_stall_timeout`. */
    childStallTimeoutMs?: number;
    tool?: TestTool;
    delegation?: boolean;
    over?: Partial<RunConfig>;
    /** The configure call (1-based) from which the configuration refuses — a restart that cannot begin. */
    configureRefusesFrom?: number;
    /** REQ-ORCH-152/153: `runtime.run_start_mode`. */
    runStartMode?: 'auto' | 'plan';
  }

  function sessionsWith(script: (persona: string, turn: number) => ScriptedCall, opts: Opts = {}) {
    const counts = new Map<string, number>();
    const client = new ScriptedModelClient([]);
    const original = client.stream.bind(client);
    client.stream = (req) => {
      const system = req.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '';
      const persona = /^You are the orchestrator/.test(system) ? 'orchestrator' : /summarise/i.test(system) ? 'summariser' : 'child';
      const n = (counts.get(persona) ?? 0) + 1;
      counts.set(persona, n);
      client.push(script(persona, n));
      return original(req);
    };
    const pub = recorder();
    const catalogue = opts.catalogue ?? [entry('a1', 'a', A1, ['small_model'])];
    const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, model: opts.entryModel ?? A1, credentialFor: () => async () => 'k', llmResponseTimeoutMs: opts.llmResponseTimeoutMs ?? 120_000, ...opts.over };
    const models = (key: string): ModelLookup => { const e = catalogue.find((c) => c.key === key); return e ? { ok: true, key, choice: { model: e.model, thinking: e.thinking } } : { ok: false, reason: `'${key}' is not a configured model` }; };
    const personas = { resolve: (name: string) => { const base = BUILT_IN_PERSONAS[name as RoleName]; return base ? { persona: { ...base, ...(opts.roleFallback ? { fallbackModel: opts.roleFallback } : {}), ...(opts.roleStallTimeoutMs === undefined ? {} : { stallTimeoutMs: opts.roleStallTimeoutMs }) }, alias: null } : null; }, knownRoles: () => Object.keys(BUILT_IN_PERSONAS) };
    const backend = new DefaultAgentBackend(client);
    const results: string[] = [];
    let configured = 0;
    const sessions = new Sessions({
      clocks: clock, publisher: pub, pid: 77, host: HOST, retentionCap: 20_000, warn: (m) => warnings.push(m), mintSessionId: () => `S${++minted}`,
      model: null, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid), attended: () => true, onRunResult: (_sid, r) => results.push(r.status),
      configure: () => (++configured >= (opts.configureRefusesFrom ?? Infinity) ? { ok: false as const, error: { reason: 'the configuration no longer loads' } } : { ok: true, value: {
        model: { backend, config }, models, personas,
        runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', drainTimeoutMs: 0, ...(opts.runStartMode === undefined ? {} : { runStartMode: opts.runStartMode }), ...(opts.childTimeoutMs === undefined ? {} : { childTimeoutMs: opts.childTimeoutMs }), ...(opts.childStallTimeoutMs === undefined ? {} : { childStallTimeoutMs: opts.childStallTimeoutMs }) },
        resilience: { catalogue, fallbackModel: opts.fallbackModel ?? null },
      } }),
      ...(opts.delegation ? { tools: (ctx) => (ctx.delegation ? delegationPort(ctx.delegation, ctx.parentId ?? 'root', opts.tool) : { specs: () => [], dispatch: async () => ({ text: '', isError: true, status: 'failed', durationMs: 0, label: '', args: {} }), cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false }) } : {}),
    });
    return { sessions, client, pub, counts, results };
  }
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const timeline = (sid: SessionId) => dal.timelineOf(sid).map((t) => t.name);
  const issues = (sid: SessionId) => dal.issuesOf(sid).map((i) => i.kind);
  const lastWait = (pub: ReturnType<typeof recorder>) => pub.snapshots.at(-1)?.wait ?? null;

  it('a 429 with retry-after 2 s: the run waits (status waiting, the record carries the wait), auto-resumes on the timer and completes; no transient budget spent', async () => {
    const { sessions, client, pub } = sessionsWith((_p, turn) => (turn === 1 ? failing(rateLimit(2)) : answer('after the wait')));
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await tick();
    expect(client.requests).toHaveLength(1);
    const wait = lastWait(pub);
    expect(wait).toMatchObject({ provider: 'a', model: 'a1', exhausted: false, attempt: 1, agent: 'orchestrator', rejection: null });
    expect(wait!.resumeAt).toBe(new Date(Number(clock.instant()) + 2000).toISOString());
    expect(wait!.reason).toContain('Wait 2 s');
    expect(dal.getSession(sid)!.execution_status).toBe('waiting');
    expect(pub.snapshots.at(-1)!.executionStatus).toBe('waiting');
    clock.advance(1999);
    await tick();
    expect(client.requests).toHaveLength(1);
    clock.advance(1);
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    expect(client.requests).toHaveLength(2);
    expect(issues(sid)).toContain('model_wait');
    expect(issues(sid)).not.toContain('transient_llm_error');
    const waitIssue = dal.issuesOf(sid).find((i) => i.kind === 'model_wait')!;
    expect(JSON.parse(waitIssue.metadata)).toMatchObject({ attempt: 1, model: 'a1', provider: 'a', wait_seconds: 2, auto_resume: true, provider_exhausted: false });
    expect(lastWait(pub)).toBeNull();
    expect(dal.residentRows(sid).some((r) => r.kind === 'system' && r.body.startsWith('Waiting on a provider limit'))).toBe(true);
    // The status went waiting → running → completed, each published.
    const statuses = pub.snapshots.map((s) => s.executionStatus);
    expect(statuses.indexOf('waiting')).toBeGreaterThan(-1);
    expect(statuses.lastIndexOf('running')).toBeGreaterThan(statuses.indexOf('waiting'));
  });

  it('a 429 with no retry-after waits 60 s locally; cancel during the wait ends the run user_cancelled with the condition as its error (REQ-NOTIFY-063/093)', async () => {
    const { sessions, client, pub } = sessionsWith((_p, turn) => (turn === 1 ? failing(rateLimit()) : answer('never')));
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await tick();
    const wait = lastWait(pub)!;
    expect(wait.resumeAt).toBe(new Date(Number(clock.instant()) + 60_000).toISOString());
    expect(wait.reason).toMatch(/rate limiting model a1\. Wait before retrying\.$/);
    expect(JSON.parse(dal.issuesOf(sid).find((i) => i.kind === 'model_wait')!.metadata)).toMatchObject({ wait_seconds: 60, auto_resume: true });
    expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('interrupted');
    expect(result.stop_reason).toBe('user_cancelled');
    expect(result.error).toBe(wait.reason);
    expect(client.requests).toHaveLength(1);
    expect(dal.getSession(sid)!.execution_status).toBe('paused');
    expect(lastWait(pub)).toBeNull();
  });

  it('PD-ORCH-005 clause 2: a pause accepted during a provider-limit wait releases it at once — no request follows, and the wait was not the user\'s cancel', async () => {
    const { sessions, client, pub } = sessionsWith((_p, turn) => (turn === 1 ? failing(rateLimit()) : answer('never')));
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await tick();
    expect(lastWait(pub)).not.toBeNull();
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    // REQ-MONITOR-124 (found by phase 3's second review): releasing the wait does not read `running` again.
    expect(dal.getSession(sid)!.execution_status).toBe('pausing');
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('interrupted');
    expect(result.error).toBeNull();
    expect(client.requests).toHaveLength(1);
    expect(dal.iterationsOf(sid)).toMatchObject([{ state: 'open', interruption: 'pause' }]);
    expect(lastWait(pub)).toBeNull();
  });

  it('PD-ORCH-005 clause 2: the step in flight when the pause is accepted meets a provider limit — its report stands, and nothing waits or retries', async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const { sessions, client, pub } = sessionsWith((_p, turn) => (turn === 1 ? { parts: [{ hold: held }, { error: rateLimit() }] } : answer('never')));
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await tick();
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('interrupted');
    expect(client.requests).toHaveLength(1);
    expect(issues(sid)).not.toContain('model_wait');
    expect(lastWait(pub)).toBeNull();
    expect(dal.iterationsOf(sid)).toMatchObject([{ state: 'open', interruption: 'pause' }]);
  });

  it('PD-ORCH-005 clause 2: a pause accepted during a transient retry\'s backoff makes no retry', async () => {
    const { sessions, client } = sessionsWith((_p, turn) => (turn === 1 ? failing(modelError({ code: 'http', status: 503, headline: 'Service Unavailable' })) : answer('never')));
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await tick();
    expect(issues(sid)).toEqual(['transient_llm_error']);
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    clock.advance(1000);
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('interrupted');
    expect(client.requests).toHaveLength(1);
    expect(dal.iterationsOf(sid)).toMatchObject([{ state: 'open', interruption: 'pause' }]);
  });

  it('PD-ORCH-005 clause 5: a child whose limit expires while the run comes to rest ends failed with REQ-ORCH-088\'s report — never paused, never retried on the fallback, and not summarised', async () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('f1', 'f', F1, [])];
    let summaries = 0;
    const script = (persona: string, turn: number): ScriptedCall => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'slow', task: 'TASK: be slow' } }]) : answer('never');
      if (persona === 'summariser') { summaries += 1; return answer('{"summary":"done"}'); }
      return hanging(NEVER);
    };
    const t = sessionsWith(script, { catalogue, roleFallback: F1, childTimeoutMs: 10_000, delegation: true });
    const sid = (t.sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await tick();
    expect(t.sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    // The pause waits for the step in flight; the child's limit expires meanwhile, and the backstop ends the step.
    clock.advance(10_000);
    await tick();
    clock.advance(30_000);
    await t.sessions.running(sid)!;
    const child = dal.childrenOf(sid)[0]!;
    expect(child).toMatchObject({ state: 'failed', interruption: null });
    expect(JSON.parse(child.report!)).toMatchObject({ status: 'failed', errors: [{ type: 'timeout', message: 'Child timed out after 10s' }, { type: 'summary_failure', message: 'the run was coming to rest, so no summarising call was made' }] });
    expect(timeline(sid)).not.toContain('fallback_model');
    expect(summaries).toBe(0);
  });

  it('PD-ORCH-005 (OQ-97): a resumed child that times out is retried on its fallback from its payload, not from its record', async () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('f1', 'f', F1, [])];
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const script = (persona: string, turn: number): ScriptedCall => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'slow', task: 'TASK: be slow' } }]) : answer('ok');
      if (persona === 'summariser') return answer('{"summary":"done"}');
      // The step in flight at the pause asks for a call that never runs; the resumed step hangs; the fallback answers.
      if (turn === 1) return { parts: [{ hold: held }, ...toolCalls([{ callId: 'b1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Looking.').parts] };
      return turn === 2 ? hanging(NEVER) : answer('done on the fallback');
    };
    const t = sessionsWith(script, { catalogue, roleFallback: F1, childTimeoutMs: 10_000, delegation: true });
    const sid = (t.sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    for (let i = 0; i < 40 && (t.counts.get('child') ?? 0) < 1; i++) await tick();
    expect(t.sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    await t.sessions.running(sid)!;
    expect(t.sessions.continueSession(sid, 'continue').ok).toBe(true);
    for (let i = 0; i < 40 && (t.counts.get('child') ?? 0) < 2; i++) await tick();
    // The limit expires; the landing backstop then ends the hung step, and REQ-ORCH-088 retries on the fallback.
    clock.advance(10_000);
    await tick();
    clock.advance(30_000);
    await t.sessions.running(sid)!;
    const onFallback = t.client.requests.filter((r) => r.model.modelId === F1.modelId);
    expect(onFallback.length).toBeGreaterThan(0);
    // The retry starts its conversation again from the payload: one user message, the task, and nothing of the record.
    const conversation = onFallback[0]!.messages.filter((m) => m.role !== 'system');
    expect(conversation).toHaveLength(1);
    expect(conversation[0]!.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).toContain('TASK: be slow');
  });

  it('REQ-TOOLS-154 with PD-ORCH-005 (the repair of a-resumed-childs-retry-payload-loses-its-attachments-and-inherited-context): a resumed child\'s fallback retry in a later run carries its prior-agent context, its attached artifact and its inherited context, as its first payload did', async () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('f1', 'f', F1, [])];
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    let sid!: SessionId;
    const script = (persona: string, turn: number): ScriptedCall => {
      if (persona === 'summariser') return answer('{"summary":"surveyed the tree","key_findings":["the tree has three roots"]}');
      if (persona === 'orchestrator') {
        if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'survey', task: 'TASK: survey' } }]);
        if (turn === 3) {
          // The survey has succeeded with its report stored: the slow child depends on it, inherits it and attaches its report.
          const survey = dal.childrenOf(sid)[0]!;
          const report = dal.artifactByTask(sid, survey.task_id)!;
          return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'slow', task: 'TASK: be slow', depends_on: [survey.task_id], inherited_context: [survey.task_id], attach_artifacts: [report.slug] } }]);
        }
        return answer('ok');
      }
      // child 1 and 2: the survey answers, and again at REQ-ORCH-095's re-prompt. child 3: the slow child's step in flight at
      // the pause; child 4: its resumed step hangs; after that, the fallback answers.
      if (turn <= 2) return answer('surveyed');
      if (turn === 3) return { parts: [{ hold: held }, ...toolCalls([{ callId: 'b1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Looking.').parts] };
      return turn === 4 ? hanging(NEVER) : answer('done on the fallback');
    };
    const t = sessionsWith(script, { catalogue, roleFallback: F1, childTimeoutMs: 10_000, delegation: true });
    sid = (t.sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    for (let i = 0; i < 80 && (t.counts.get('child') ?? 0) < 3; i++) await tick();
    const text = (r: (typeof t.client.requests)[number]) => r.messages.filter((m) => m.role !== 'system').map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n');
    const first = t.client.requests.filter((r) => r.model.modelId === A1.modelId && text(r).includes('TASK: be slow'))[0]!;
    for (const block of ['[Prior agent context', 'PRIOR AGENT CONTEXT (FULL)', '[Inherited context']) expect(text(first)).toContain(block);
    expect(t.sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    await t.sessions.running(sid)!;
    // A later run: the continue resumes the slow child from its record, in a run whose memory of the launch is gone.
    expect(t.sessions.continueSession(sid, 'continue').ok).toBe(true);
    for (let i = 0; i < 80 && (t.counts.get('child') ?? 0) < 4; i++) await tick();
    clock.advance(10_000);
    await tick();
    clock.advance(30_000);
    await t.sessions.running(sid)!;
    const onFallback = t.client.requests.filter((r) => r.model.modelId === F1.modelId);
    expect(onFallback.length).toBeGreaterThan(0);
    const retry = onFallback[0]!.messages.filter((m) => m.role !== 'system');
    expect(retry).toHaveLength(1);
    // REQ-TOOLS-154's order, as the first payload had it: the prior-agent context first, the attached bodies, the inherited block, the task last.
    const payload = text(onFallback[0]!);
    const at = (s: string) => payload.indexOf(s);
    expect(at('[Prior agent context')).toBe(0);
    expect(at('PRIOR AGENT CONTEXT (FULL)')).toBeGreaterThan(0);
    expect(at('[Inherited context')).toBeGreaterThan(at('PRIOR AGENT CONTEXT (FULL)'));
    expect(at('TASK: be slow')).toBeGreaterThan(at('[Inherited context'));
    expect(payload).toContain('surveyed the tree');
    expect(payload).toBe(text(first));
  });

  it('the second wait on the same agent doubles the local backoff (REQ-NOTIFY-085)', async () => {
    const { sessions, pub } = sessionsWith((_p, turn) => (turn <= 2 ? failing(rateLimit()) : answer('third time')));
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await tick();
    clock.advance(60_000);
    await tick();
    expect(lastWait(pub)).toMatchObject({ attempt: 2 });
    expect(lastWait(pub)!.resumeAt).toBe(new Date(Number(clock.instant()) + 120_000).toISOString());
    clock.advance(120_000);
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
  });

  describe('REQ-MONITOR-117..119 with REQ-ORCH-091 (c) (OQ-173): a wait the run imposes is not a stall', () => {
    const stallLines = () => warnings.filter((m) => /appears stalled/.test(m));
    /** Advances the clock in 5 s strides, letting what each stride wakes run and publish. */
    const stride = async (ms: number) => { for (let t = 0; t < ms; t += 5_000) { clock.advance(Math.min(5_000, ms - t)); await tick(); } };

    it('the entry agent\'s 120 s suspended wait on a provider limit raises no `stall` issue and no stalled seconds; the watch logs the wait instead', async () => {
      const { sessions, client, pub } = sessionsWith((_p, turn) => (turn === 1 ? failing(rateLimit(120)) : answer('after the wait')));
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await tick();
      expect(lastWait(pub)).toMatchObject({ attempt: 1, agent: 'orchestrator' });
      await stride(120_000);
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(client.requests).toHaveLength(2);
      expect(issues(sid)).toContain('model_wait');
      expect(issues(sid)).not.toContain('stall');
      expect(stallLines()).toEqual([]);
      expect(pub.snapshots.every((s) => s.entryStalledSeconds === null)).toBe(true);
      // REQ-MONITOR-118's manner: the silence is logged as the wait it is, once at entry and at each repeat the throttle allows.
      expect(warnings.filter((m) => m.startsWith('agent waiting on a provider limit:'))).toEqual([expect.stringMatching(/^agent waiting on a provider limit: orchestrator \(bg_[0-9a-f]{8}\) has no model event or token for 90 seconds; the wait is the run's own and not a stall \(OQ-173\)$/)]);
    });

    it('a child\'s 120 s suspended wait on a provider limit raises no `stall` issue and no stalled seconds on its agent row', async () => {
      const { sessions, pub } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'limited', task: 'TASK: wait' } }]) : answer('finished');
        if (persona === 'summariser') return answer('{"summary":"done"}');
        return turn === 1 ? failing(rateLimit(120)) : answer('I did it after the wait.');
      }, { delegation: true });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      for (let i = 0; i < 40 && lastWait(pub) === null; i++) await tick();
      expect(lastWait(pub)).toMatchObject({ attempt: 1 });
      await stride(120_000);
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(dal.childrenOf(sid)[0]!.state).toBe('succeeded');
      expect(issues(sid)).not.toContain('stall');
      expect(stallLines()).toEqual([]);
      expect(pub.snapshots.every((s) => s.agents.every((a) => a.stalledSeconds === null))).toBe(true);
      expect(warnings.filter((m) => m.startsWith('child waiting on a provider limit: limited'))).toHaveLength(1);
    });

    it('the wait\'s end restarts the silence: a step that then says nothing for the threshold is a stall again', async () => {
      let speak!: () => void;
      const spoken = new Promise<void>((r) => { speak = r; });
      const { sessions } = sessionsWith((_p, turn) => (turn === 1 ? failing(rateLimit(120)) : { parts: [{ hold: spoken }, ...answer('late').parts] }));
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await tick();
      await stride(120_000);
      expect(issues(sid)).not.toContain('stall');
      await stride(85_000);
      expect(issues(sid)).not.toContain('stall');
      await stride(5_000);
      expect(issues(sid)).toContain('stall');
      expect(stallLines()).toEqual([expect.stringMatching(/^agent appears stalled: no model event or token for 90 seconds/)]);
      speak();
      expect((await sessions.running(sid)!).status).toBe('completed');
    });
  });

  it('quota with a same-tier candidate on another provider: the pair is marked exhausted, the fallback is transparent, the run completes on the other model (REQ-ORCH-091 a/b, REQ-NOTIFY-082/088/090)', async () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('b1', 'b', B1, ['small_model']), entry('c1', 'c', C1, [])];
    const { sessions, client, pub } = sessionsWith((_p, turn) => (turn === 1 ? failing(quota()) : answer('from b')), { catalogue });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'b1']);
    expect(timeline(sid)).toEqual(expect.arrayContaining(['model_exhausted', 'quota_fallback_model']));
    const fallback = dal.timelineOf(sid).find((t) => t.name === 'quota_fallback_model')!;
    expect(JSON.parse(fallback.metadata)).toMatchObject({ from_provider: 'a', from_model: 'a1', to_provider: 'b', to_model: 'b1', to_key: 'b1', condition: 'quota_exhausted', provider_exhausted: true });
    const issue = dal.issuesOf(sid).find((i) => i.kind === 'quota_fallback')!;
    expect(issue.severity).toBe('warning');
    expect(JSON.parse(issue.metadata)).toMatchObject({ requested_model: 'a/a1', fallback_model: 'b/b1', provider_exhausted: true });
    expect(JSON.parse(dal.timelineOf(sid).find((t) => t.name === 'model_exhausted')!.metadata)).toMatchObject({ provider: 'a', model: 'a1' });
    expect(issues(sid)).not.toContain('model_wait');
    expect(pub.snapshots.every((s) => s.wait === null)).toBe(true);
  });

  it('REQ-MONITOR-194 / REQ-MONITOR-303: a quota wait\'s record names the model keys the session recorded out of quota, for the picker to annotate', async () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('b1', 'b', B1, [])];
    const { sessions, client, pub } = sessionsWith((_p, turn) => (turn === 1 ? failing(quota()) : answer('from b')), { catalogue });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    for (let i = 0; i < 40 && lastWait(pub) === null; i++) await tick();
    // No same-tier candidate: an indefinite wait on a1, which the session now holds out of quota; b1 is not excluded.
    expect(lastWait(pub)).toMatchObject({ provider: 'a', model: 'a1', resumeAt: null, excluded: ['a1'] });
    expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model: 'b1' } })).toEqual({ ok: true });
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'b1']);
    expect(lastWait(pub)).toBeNull();
  });

  // Until OQ-177 (2026-10-02) the switch onto a1 recorded `rebuilds: false` and the fallback stood
  // (a-switch-onto-the-configured-entry-model-leaves-a-ladder-fallback-in-force); now every switch rebuilds the cell.
  it('REQ-MONITOR-142 over REQ-ORCH-091 b (OQ-177): a switch records that the root\'s cell is rebuilt for it — even for the model it was last built from, so a fallback in force ends', async () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('b1', 'b', B1, ['small_model']), entry('c1', 'c', C1, [])];
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const { sessions, client } = sessionsWith((_p, turn) => (turn === 1 ? failing(quota()) : { parts: [{ hold: held }, ...answer('from b').parts] }), { catalogue });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    for (let i = 0; i < 40 && client.requests.length < 2; i++) await tick();
    // The root fell back a1 → b1 and its call on b1 is in flight: no wait, so a switch is the next-iteration switch.
    expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'b1']);
    const switched = () => dal.timelineOf(sid).filter((t) => t.name === 'entry_model_switched').map((t) => JSON.parse(t.metadata) as unknown);
    // The configured key: the cell was built from a1, and it is rebuilt on a1 all the same (OQ-177), ending b1.
    expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model: 'a1' } })).toEqual({ ok: true });
    // Another model: rebuilt from the next iteration.
    expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model: 'c1' } })).toEqual({ ok: true });
    // No root turn between the two: the second supersedes the first, which never applies.
    expect(switched()).toEqual([{ model: 'a1', rebuilds: true, supersedes: false }, { model: 'c1', rebuilds: true, supersedes: true }]);
    release();
    expect((await sessions.running(sid)!).status).toBe('completed');
  });

  /*
   * The verifier's away-and-back case of the same note: with the root on its fallback, a switch away from the configured
   * model and one back onto it before the root's next turn. `rebuilds: true` on the first was a prediction the second
   * overtook; the run says so (`supersedes`). Since OQ-177 the second rebuilds the cell on a1, so the next iteration's root
   * runs on a1 and the reader, over the run's own store, reads b1 then a1. (Until 2026-10-02 the second recorded
   * `rebuilds: false`, the root kept b1 and the reader read b1 alone.) The control: the switch away alone moves the next
   * iteration's root to c1. A second task gives the run that next iteration: a switch applies from the next iteration, and
   * the root's resume after its child is still this one (REQ-MONITOR-142).
   */
  it('REQ-MONITOR-142 over REQ-ORCH-091 b (OQ-177): a switch away and back before the root\'s next turn supersedes the first — the root returns to the configured model, and the record and the autopsy reader say so', async () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('b1', 'b', B1, ['small_model']), entry('c1', 'c', C1, [])];
    const systemOf = (r: { messages: readonly { content: readonly { kind: string; text?: string }[] }[] }) => r.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text ?? '' : '')).join('') ?? '';
    const runWith = async (switches: readonly string[]) => {
      let release!: () => void;
      const held = new Promise<void>((r) => { release = r; });
      const script = (persona: string, turn: number): ScriptedCall => {
        if (persona === 'summariser') return answer('{"summary":"done"}');
        if (persona !== 'orchestrator') return answer('child done');
        if (turn === 1) return failing(quota());
        // On b1: held, then a delegation; its turn ends and the root resumes with the child's report in a new turn.
        if (turn === 2) return { parts: [{ hold: held }, ...toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'side', task: 'TASK: side' } }]).parts] };
        return answer(`root ${turn}`);
      };
      const { sessions, client } = sessionsWith(script, { catalogue, delegation: true, childTimeoutMs: 10_000 });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      for (let i = 0; i < 40 && client.requests.length < 2; i++) await tick();
      expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'b1']);
      for (const model of switches) expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model } })).toEqual({ ok: true });
      expect(sessions.control({ op: 'editTodo', sessionId: sid, args: { op: 'add', id: 'second', text: 'a second task' } })).toEqual({ ok: true });
      release();
      expect((await sessions.running(sid)!).status).toBe('completed');
      const rows = dal.timelineOf(sid);
      return {
        records: rows.filter((t) => t.name === 'entry_model_switched').map((t) => JSON.parse(t.metadata) as unknown),
        root: client.requests.filter((r) => /^You are the orchestrator/.test(systemOf(r))).map((r) => r.model.modelId),
        keys: entryModelKeys(undefined, rows, childModelKeys(dal.childrenOf(sid))),
      };
    };
    const control = await runWith(['c1']);
    expect(control.records).toEqual([{ model: 'c1', rebuilds: true, supersedes: false }]);
    expect(control.root.slice(0, 2)).toEqual(['a1', 'b1']);
    expect(control.root.length).toBeGreaterThan(3);
    expect(control.root.at(-1)).toBe('c1');
    expect(control.keys).toEqual(['b1', 'c1']);
    const awayAndBack = await runWith(['c1', 'a1']);
    expect(awayAndBack.records).toEqual([{ model: 'c1', rebuilds: true, supersedes: false }, { model: 'a1', rebuilds: true, supersedes: true }]);
    expect(awayAndBack.root.length).toBeGreaterThan(3);
    expect(awayAndBack.root).not.toContain('c1');
    expect(awayAndBack.root.at(-1)).toBe('a1');
    expect(awayAndBack.keys).toEqual(['b1', 'a1']);
  });

  /*
   * The verifier's second case of the same note: the root's ladder move recorded BETWEEN a switch and the switch that
   * supersedes it. The move happens in the turn already running when the first switch was made, on the cell from before
   * it, so undoing the superseded switch keeps it until the superseding switch applies: since OQ-177 that switch back onto
   * a1 rebuilds the cell, so the next iteration's root runs on a1 and the reader, over the run's own store, reads b1 then
   * a1. (Until 2026-10-02 the switch back recorded `rebuilds: false`, the root stayed on b1 and the reader ended on b1.)
   * The run records on the move that a switch was pending (`switch_pending`), so the reader also places a move before a
   * switch that is never superseded — the control: the switch to c1 alone ends the move at the next iteration's root.
   */
  it('REQ-MONITOR-142 over REQ-ORCH-091 b (OQ-177): a root fallback made while a switch is pending is recorded so, and the reader places it before the switch — superseded, then ended by the switch that supersedes it; ended when the switch applies', async () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('b1', 'b', B1, ['small_model']), entry('c1', 'c', C1, [])];
    const systemOf = (r: { messages: readonly { content: readonly { kind: string; text?: string }[] }[] }) => r.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text ?? '' : '')).join('') ?? '';
    const runWith = async (back: boolean) => {
      let releaseA!: () => void;
      const heldA = new Promise<void>((r) => { releaseA = r; });
      let releaseB!: () => void;
      const heldB = new Promise<void>((r) => { releaseB = r; });
      const script = (persona: string, turn: number): ScriptedCall => {
        if (persona === 'summariser') return answer('{"summary":"done"}');
        if (persona !== 'orchestrator') return answer('child done');
        // On a1: held, then a quota failure — the same-tier fallback to b1 is made inside this turn.
        if (turn === 1) return { parts: [{ hold: heldA }, { error: quota() }] };
        // On b1: held, then a delegation; the root resumes with the child's report in a new turn.
        if (turn === 2) return { parts: [{ hold: heldB }, ...toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'side', task: 'TASK: side' } }]).parts] };
        return answer(`root ${turn}`);
      };
      const { sessions, client } = sessionsWith(script, { catalogue, delegation: true, childTimeoutMs: 10_000 });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      for (let i = 0; i < 40 && client.requests.length < 1; i++) await tick();
      expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model: 'c1' } })).toEqual({ ok: true });
      releaseA();
      for (let i = 0; i < 40 && client.requests.length < 2; i++) await tick();
      expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'b1']);
      if (back) expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model: 'a1' } })).toEqual({ ok: true });
      expect(sessions.control({ op: 'editTodo', sessionId: sid, args: { op: 'add', id: 'second', text: 'a second task' } })).toEqual({ ok: true });
      releaseB();
      expect((await sessions.running(sid)!).status).toBe('completed');
      const rows = dal.timelineOf(sid);
      return {
        records: rows.filter((t) => t.name === 'entry_model_switched' || t.name === 'quota_fallback_model').map((t) => ({ name: t.name, ...(JSON.parse(t.metadata) as Record<string, unknown>) })),
        root: client.requests.filter((r) => /^You are the orchestrator/.test(systemOf(r))).map((r) => r.model.modelId),
        keys: entryModelKeys(undefined, rows, childModelKeys(dal.childrenOf(sid))),
      };
    };
    const control = await runWith(false);
    expect(control.records).toEqual([
      { name: 'entry_model_switched', model: 'c1', rebuilds: true, supersedes: false },
      expect.objectContaining({ name: 'quota_fallback_model', agent: 'orchestrator', to_key: 'b1', switch_pending: true }),
    ]);
    expect(control.root.slice(0, 2)).toEqual(['a1', 'b1']);
    expect(control.root.length).toBeGreaterThan(3);
    expect(control.root.at(-1)).toBe('c1');
    expect(control.keys).toEqual(['b1', 'c1']);
    const between = await runWith(true);
    expect(between.records).toEqual([
      { name: 'entry_model_switched', model: 'c1', rebuilds: true, supersedes: false },
      expect.objectContaining({ name: 'quota_fallback_model', agent: 'orchestrator', to_key: 'b1', switch_pending: true }),
      { name: 'entry_model_switched', model: 'a1', rebuilds: true, supersedes: true },
    ]);
    expect(between.root.length).toBeGreaterThan(3);
    expect(between.root).not.toContain('c1');
    expect(between.root.at(-1)).toBe('a1');
    expect(between.keys).toEqual(['b1', 'a1']);
  });

  // The same placement for the ladder's other automatic move (REQ-ORCH-090): an unresponsive fallback made while a switch
  // is pending records so, the switch ends it at the next iteration's root (a second task gives the run one; the root's
  // resume after its child stays on f1, REQ-MONITOR-142), and the reader reads f1's pair then c1, as the root ran.
  it('REQ-MONITOR-142 over REQ-ORCH-090: a root unresponsive fallback made while a switch is pending is recorded so, and the switch it preceded ends it', async () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('c1', 'c', C1, []), entry('f1', 'f', F1, [])];
    const systemOf = (r: { messages: readonly { content: readonly { kind: string; text?: string }[] }[] }) => r.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text ?? '' : '')).join('') ?? '';
    const script = (persona: string, turn: number): ScriptedCall => {
      if (persona === 'summariser') return answer('{"summary":"done"}');
      if (persona !== 'orchestrator') return answer('child done');
      // On a1: no event within llm_response_timeout, so the call is re-run on the fallback f1 inside this turn.
      if (turn === 1) return hanging(NEVER);
      // On f1: a delegation; the root resumes with the child's report in a new turn.
      if (turn === 2) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'side', task: 'TASK: side' } }]);
      return answer(`root ${turn}`);
    };
    const { sessions, client } = sessionsWith(script, { catalogue, delegation: true, childTimeoutMs: 10_000, fallbackModel: { model: F1, thinking: 'unset' }, llmResponseTimeoutMs: 30_000 });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    for (let i = 0; i < 40 && client.requests.length < 1; i++) await tick();
    expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model: 'c1' } })).toEqual({ ok: true });
    expect(sessions.control({ op: 'editTodo', sessionId: sid, args: { op: 'add', id: 'second', text: 'a second task' } })).toEqual({ ok: true });
    clock.advance(30_000);
    expect((await sessions.running(sid)!).status).toBe('completed');
    const rows = dal.timelineOf(sid);
    expect(rows.filter((t) => t.name === 'entry_model_switched' || t.name === 'llm_unresponsive').map((t) => ({ name: t.name, ...(JSON.parse(t.metadata) as Record<string, unknown>) }))).toEqual([
      { name: 'entry_model_switched', model: 'c1', rebuilds: true, supersedes: false },
      expect.objectContaining({ name: 'llm_unresponsive', agent: 'orchestrator', from_model: 'a1', to_model: 'f1', switch_pending: true }),
    ]);
    const root = client.requests.filter((r) => /^You are the orchestrator/.test(systemOf(r))).map((r) => r.model.modelId);
    expect(root.slice(0, 2)).toEqual(['a1', 'f1']);
    expect(root.length).toBeGreaterThan(2);
    expect(root.at(-1)).toBe('c1');
    // No launch audit here, so no `models:` key names f1's pair and the reader prints the pair itself (REQ-ORCH-090's entry records no key).
    expect(entryModelKeys(undefined, rows, childModelKeys(dal.childrenOf(sid)))).toEqual(['f/f1', 'c1']);
  });

  it('REQ-MONITOR-142 over REQ-MONITOR-303: the root\'s own wait choice supersedes a switch recorded since its last turn, and its override says so', async () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('c1', 'c', C1, []), entry('f1', 'f', F1, [])];
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const { sessions, client, pub } = sessionsWith((_p, turn) => (turn === 1 ? { parts: [{ hold: held }, { error: quota() }] } : answer('on c1')), { catalogue });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    for (let i = 0; i < 40 && client.requests.length < 1; i++) await tick();
    // The root's call on a1 is in flight: a switch to f1 is recorded and waits for the root's next turn.
    expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model: 'f1' } })).toEqual({ ok: true });
    release();
    for (let i = 0; i < 40 && lastWait(pub) === null; i++) await tick();
    // The call failed on quota with no same-tier candidate: the root waits, and the user's choice there replaces f1.
    expect(lastWait(pub)).toMatchObject({ provider: 'a', model: 'a1', agent: 'orchestrator' });
    expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model: 'c1' } })).toEqual({ ok: true });
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'c1']);
    const meta = (name: string) => dal.timelineOf(sid).filter((t) => t.name === name).map((t) => JSON.parse(t.metadata) as Record<string, unknown>);
    expect(meta('entry_model_switched')).toEqual([{ model: 'f1', rebuilds: true, supersedes: false }]);
    expect(meta('model_override')).toEqual([expect.objectContaining({ provider: 'a', model: 'a1', model_key: 'c1', supersedes: true })]);
  });

  describe('PD-MONITOR-001 revision 2: a request is priced at the ladder cell, by the model it was sent to', () => {
    const A_RATES = { input: '0.000003', output: '0.000015' };
    const B_RATES = { input: '0.0000001', output: '0.0000002' };
    const label = (sid: SessionId) => toSessionRecord(dal.getSession(sid)!).costLabel;
    const costs = (sid: SessionId) => dal.eventsOfKind(sid, 'usage.update').map((e) => (JSON.parse(e.payload) as { cost: { total: string } }).cost.total);

    it('a request the provider did not price is priced at its model\'s configured rates, exactly, and the run reads configured', async () => {
      const { sessions } = sessionsWith(() => answer('priced here', { input: 1000, output: 200 }), { catalogue: [entry('a1', 'a', A1, ['small_model'], { pricing: A_RATES })] });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      // 1000 × 0.000003 + 200 × 0.000015 = 0.006, with no binary float anywhere on the way.
      expect(dal.getSession(sid)).toMatchObject({ cost: '0.006000', cost_qualifier: 'configured' });
      expect(costs(sid)).toEqual(['0.006000']);
      expect(label(sid)).toEqual({ text: '0.0060 at configured rates', qualifier: 'configured' });
    });

    it('a reported figure takes precedence, and one configured figure beside it makes the whole run read configured', async () => {
      const failedWithCost: ScriptedCall = { parts: [{ part: { kind: 'usage', usage: { input: 10, output: 5, cost: '0.0012' } } }, { error: modelError({ code: 'http', status: 503, headline: 'overloaded' }) }] };
      const { sessions } = sessionsWith((_p, turn) => (turn === 1 ? failedWithCost : answer('second', { input: 1000, output: 200 })), { catalogue: [entry('a1', 'a', A1, ['small_model'], { pricing: A_RATES })] });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await tick();
      clock.advance(1_000);
      expect((await sessions.running(sid)!).status).toBe('completed');
      // The reported 0.0012 is kept as reported (its tokens are NOT re-priced); the second request adds 0.006000.
      expect(costs(sid)).toEqual(['0.0012', '0.007200']);
      expect(label(sid)).toEqual({ text: '0.0072 at configured rates', qualifier: 'configured' });
    });

    it('without rates a reported figure beside an unpriced request reads incomplete; with no figure at all, unknown', async () => {
      const failedWithCost: ScriptedCall = { parts: [{ part: { kind: 'usage', usage: { input: 10, output: 5, cost: '0.0012' } } }, { error: modelError({ code: 'http', status: 503, headline: 'overloaded' }) }] };
      const mixed = sessionsWith((_p, turn) => (turn === 1 ? failedWithCost : answer('unpriced', { input: 1000, output: 200 })));
      const sid = (mixed.sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await tick();
      clock.advance(1_000);
      await mixed.sessions.running(sid)!;
      expect(label(sid)).toEqual({ text: 'at least 0.0012; some requests have no price', qualifier: 'incomplete' });
      const none = sessionsWith(() => answer('unpriced', { input: 1000, output: 200 }));
      const sid2 = (none.sessions.start(dal, 'C:/ws', 'y') as { value: SessionId }).value;
      await none.sessions.running(sid2)!;
      expect(dal.getSession(sid2)).toMatchObject({ cost: '0', cost_qualifier: 'unknown' });
      expect(label(sid2)).toEqual({ text: 'price not established', qualifier: 'unknown' });
    });

    it('after a fallback the request is priced at the fallback\'s rates, not the rates of the model the agent started on', async () => {
      const catalogue = [entry('a1', 'a', A1, ['small_model'], { pricing: A_RATES }), entry('b1', 'b', B1, ['small_model'], { pricing: B_RATES })];
      const { sessions, client } = sessionsWith((_p, turn) => (turn === 1 ? failing(quota()) : answer('from b', { input: 1000, output: 200 })), { catalogue });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'b1']);
      // 1000 × 0.0000001 + 200 × 0.0000002 = 0.00014 at b1's rates; a1's would have been 0.006. The quota refusal counted nothing.
      expect(dal.getSession(sid)).toMatchObject({ cost: '0.0001400', cost_qualifier: 'configured' });
    });
  });

  it('a generic rate limit also takes the one same-tier fallback before any wait; the second limit on the fallback waits (REQ-ORCH-091 b then c)', async () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('b1', 'b', B1, ['small_model'])];
    const { sessions, client, pub } = sessionsWith((_p, turn) => (turn <= 2 ? failing(rateLimit(1)) : answer('ok')), { catalogue });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await tick();
    expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'b1']);
    expect(lastWait(pub)).toMatchObject({ provider: 'b', model: 'b1', exhausted: false, attempt: 1 });
    clock.advance(1000);
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'b1', 'b1']);
  });

  it('quota with no candidate: an indefinite wait; a rejected setModel keeps the wait and names why; a valid one rebuilds, re-runs at once and persists the override, which a continuation and a fresh process both honour (REQ-ORCH-091 c/d, REQ-NOTIFY-089, REQ-SESSION-196)', async () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('c1', 'c', C1, [])];
    const script = (_p: string, turn: number) => (turn === 1 ? failing(quota()) : answer(`answer ${turn}`));
    const { sessions, client, pub } = sessionsWith(script, { catalogue });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await tick();
    expect(lastWait(pub)).toMatchObject({ provider: 'a', model: 'a1', exhausted: true, resumeAt: null, attempt: 1 });
    expect(lastWait(pub)!.reason).toMatch(/quota exhausted for model a1.*keep failing.*switch|add credit/);
    expect(JSON.parse(dal.issuesOf(sid).find((i) => i.kind === 'model_wait')!.metadata)).toMatchObject({ wait_seconds: null, auto_resume: false, provider_exhausted: true });
    clock.advance(3_600_000);
    await tick();
    expect(client.requests).toHaveLength(1);
    // An unknown key: refused, recorded, the wait continues and the header is told why.
    expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model: 'nope' } })).toEqual({ ok: false });
    expect(issues(sid)).toContain('model_override_rejected');
    expect(lastWait(pub)!.rejection).toMatch(/nope could not be applied .*not a configured model.*still outstanding/);
    // The waiting pair itself: refused too.
    expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model: 'a1' } })).toEqual({ ok: false });
    expect(client.requests).toHaveLength(1);
    // A different model: applied at once and persisted.
    expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model: 'c1' } })).toEqual({ ok: true });
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'c1']);
    expect(timeline(sid)).toContain('model_override');
    expect(JSON.parse(dal.timelineOf(sid).find((t) => t.name === 'model_override')!.metadata)).toMatchObject({ provider: 'a', model: 'a1', model_key: 'c1' });
    expect(dal.residentRows(sid).some((r) => r.kind === 'system' && r.body.includes('Model changed to c1 during the wait'))).toBe(true);
    // A continuation in the same process never returns to a1.
    const cont = sessions.prompt(sid, 'again');
    if (!cont.ok) throw new Error(cont.error.reason);
    await sessions.running(sid)!;
    expect(client.requests.at(-1)!.model.modelId).toBe('c1');
    // A fresh process: the override is rehydrated from the timeline (REQ-SESSION-196's session-scoped model override).
    const fresh = sessionsWith(() => answer('fresh'), { catalogue });
    const resumed = fresh.sessions.resume(dal, 'C:/ws', sid);
    if (!resumed.ok) throw new Error(resumed.error.reason);
    const again = fresh.sessions.prompt(sid, 'once more');
    if (!again.ok) throw new Error(again.error.reason);
    await fresh.sessions.running(sid)!;
    expect(fresh.client.requests.map((r) => r.model.modelId)).toEqual(['c1']);
    // Found on Part Q's first execution: a continuation on a LOADED session forwarded no events, so its terminal result never left the run host.
    expect(fresh.results).toEqual(['completed']);
  });

  /*
   * REQ-CHAT-006 / REQ-SESSION-026 / REQ-NOTIFY-089: the record says which configured key a session-wide override replaces and
   * the key it runs on, so the composer's model chip and the inspector name what the next run starts with. Before it the chips
   * read the configured key (docs/defects/the-model-chips-show-the-configured-model-while-a-session-wide-override-is-in-force.md).
   */
  it('REQ-CHAT-006 / REQ-SESSION-026: the record names the override in force — in this process, and after a fresh one opens the session', async () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('c1', 'c', C1, [])];
    const { sessions, pub } = sessionsWith((_p, turn) => (turn === 1 ? failing(quota()) : answer(`answer ${turn}`)), { catalogue });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    for (let i = 0; i < 40 && lastWait(pub) === null; i++) await tick();
    expect(pub.snapshots.at(-1)!.modelOverrides).toEqual([]);
    expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model: 'c1' } })).toEqual({ ok: true });
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(pub.snapshots.at(-1)!.modelOverrides).toEqual([{ from: 'a1', to: 'c1' }]);
    // A fresh process: no run of the session has started there; opening it reads the override from the timeline.
    const fresh = sessionsWith(() => answer('fresh'), { catalogue });
    const resumed = fresh.sessions.resume(dal, 'C:/ws', sid);
    if (!resumed.ok) throw new Error(resumed.error.reason);
    expect(fresh.sessions.attach(sid)).toBe(true);
    expect(fresh.pub.snapshots.at(-1)!.modelOverrides).toEqual([{ from: 'a1', to: 'c1' }]);
  });

  it('an unresponsive model: no event within llm_response_timeout closes the call and re-runs it once on the fallback; without a fallback the call keeps waiting (REQ-ORCH-090, REQ-CONFIG-114)', async () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('f1', 'f', F1, [])];
    const withFallback = sessionsWith((_p, turn) => (turn === 1 ? hanging(NEVER) : answer('from the fallback')), { catalogue, fallbackModel: { model: F1, thinking: 'unset' }, llmResponseTimeoutMs: 30_000 });
    const sid = (withFallback.sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await tick();
    expect(withFallback.client.requests).toHaveLength(1);
    clock.advance(29_999);
    await tick();
    expect(withFallback.client.requests).toHaveLength(1);
    clock.advance(1);
    const result = await withFallback.sessions.running(sid)!;
    expect(result.status).toBe('completed');
    expect(withFallback.client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'f1']);
    expect(timeline(sid)).toContain('llm_unresponsive');
    expect(issues(sid)).toContain('llm_unresponsive');
    expect(JSON.parse(dal.timelineOf(sid).find((t) => t.name === 'llm_unresponsive')!.metadata)).toMatchObject({ from_model: 'a1', to_model: 'f1', threshold_seconds: 30 });

    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const without = sessionsWith((_p, turn) => (turn === 1 ? hanging(hold) : answer('never')), { catalogue, fallbackModel: null, llmResponseTimeoutMs: 30_000 });
    const sid2 = (without.sessions.start(dal, 'C:/ws', 'y') as { value: SessionId }).value;
    await tick();
    clock.advance(90_000);
    await tick();
    expect(without.client.requests).toHaveLength(1);
    release();
    const r2 = await without.sessions.running(sid2)!;
    expect(r2.status).toBe('completed');
    expect(without.client.requests).toHaveLength(1);
    expect(timeline(sid2)).not.toContain('llm_unresponsive');
  });

  it('the threshold is armed only below the agent bound (REQ-ORCH-090) and the role fallback is never the agent\'s own model', async () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('f1', 'f', F1, [])];
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    // llm_response_timeout 120 s is not below the model timeout 120 s: no timer.
    const s = sessionsWith((_p, turn) => (turn === 1 ? hanging(hold) : answer('never')), { catalogue, fallbackModel: { model: F1, thinking: 'unset' }, llmResponseTimeoutMs: 120_000, over: { modelTimeoutMs: 120_000 } });
    const sid = (s.sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await tick();
    clock.advance(200_000);
    await tick();
    expect(s.client.requests).toHaveLength(1);
    release();
    await s.sessions.running(sid)!;
    // The fallback slot names the agent's own model: no fallback, no timer.
    let release2!: () => void;
    const hold2 = new Promise<void>((r) => { release2 = r; });
    const t = sessionsWith((_p, turn) => (turn === 1 ? hanging(hold2) : answer('never')), { catalogue, fallbackModel: { model: A1, thinking: 'unset' }, llmResponseTimeoutMs: 30_000 });
    const sid2 = (t.sessions.start(dal, 'C:/ws', 'y') as { value: SessionId }).value;
    await tick();
    clock.advance(60_000);
    await tick();
    expect(t.client.requests).toHaveLength(1);
    release2();
    await t.sessions.running(sid2)!;
  });

  it('REQ-ORCH-088: a child at the hard timeout is retried once on the role\'s fallback and succeeds; without one it fails with the timeout report', async () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('f1', 'f', F1, [])];
    const script = (persona: string, turn: number): ScriptedCall => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'slow', task: 'TASK: be slow' } }]) : answer('finished');
      if (persona === 'summariser') return answer('{"summary":"done"}');
      return turn === 1 ? hanging(NEVER) : answer('I did it on the fallback.');
    };
    const withFallback = sessionsWith(script, { catalogue, roleFallback: F1, childTimeoutMs: 10_000, delegation: true });
    const sid = (withFallback.sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await tick();
    expect(dal.childrenOf(sid)[0]!.state).toBe('running');
    // REQ-ORCH-088: the ceiling asks the child to land rather than cutting it; this child holds on NEVER and
    // cannot, so it is the backstop 30 s behind the ceiling (`CHILD_LANDING_GRACE`) that ends it and lets the
    // fallback retry begin. Both figures are advanced here because both are now on the path.
    clock.advance(10_000);
    await tick();
    clock.advance(30_000);
    const result = await withFallback.sessions.running(sid)!;
    expect(result.status).toBe('completed');
    const child = dal.childrenOf(sid)[0]!;
    expect(child.state).toBe('succeeded');
    // PD-ORCH-005 clause 1: the retry starts the child's conversation again from its payload, and the record says so —
    // the conversation a resume would send carries the payload once, while the full history keeps both attempts.
    const recorded = conversationOf(dal.agentConversation(sid, child.task_id));
    const payloads = (ms: readonly { role: string; content: readonly { kind: string; text?: string }[] }[]) => ms.filter((m) => m.role === 'user' && m.content.some((p) => p.kind === 'text' && (p.text ?? '').includes('TASK: be slow'))).length;
    expect(payloads(recorded)).toBe(1);
    expect(payloads(dal.agentMessagesOf(sid, child.task_id).filter((r) => r.kind === 'message').map((r) => JSON.parse(r.body) as { role: string; content: { kind: string; text?: string }[] }))).toBe(2);
    // REQ-ORCH-139 (A29): the retry is named by the vocabulary — `fallback_model` on the timeline, `timeout_fallback` as the issue.
    expect(timeline(sid)).toContain('fallback_model');
    expect(issues(sid)).toContain('timeout_fallback');
    expect(JSON.parse(dal.timelineOf(sid).find((t) => t.name === 'fallback_model')!.metadata)).toMatchObject({ from_model: 'a1', to_model: 'f1', timeout_seconds: 10 });
    // a1 hung and timed out, f1 answered; REQ-ORCH-095's one re-prompt of a text-only implementer adds a third call, on f1 still.
    const childRequests = withFallback.client.requests.filter((r) => !/^You are the orchestrator|summarise/i.test(r.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? ''));
    expect(childRequests.slice(0, 2).map((r) => r.model.modelId)).toEqual(['a1', 'f1']);
    expect(childRequests.slice(1).every((r) => r.model.modelId === 'f1')).toBe(true);

    const without = sessionsWith(script, { catalogue, roleFallback: null, childTimeoutMs: 10_000, delegation: true });
    const sid2 = (without.sessions.start(dal, 'C:/ws', 'y') as { value: SessionId }).value;
    await tick();
    clock.advance(10_000);
    await tick();
    clock.advance(30_000);
    const r2 = await without.sessions.running(sid2)!;
    expect(r2.status).toBe('completed');
    const c2 = dal.childrenOf(sid2)[0]!;
    expect(c2.state).toBe('failed');
    expect((JSON.parse(c2.report!) as { errors: { message: string }[] }).errors.map((e) => e.message)).toContain('Child timed out after 10s');
    expect(timeline(sid2)).not.toContain('fallback_model');
  });

  /*
   * PD-ORCH-004 on REQ-ORCH-088's own path: the parts of the progress rule that only the timeout's machinery can
   * exercise — the fallback retry, the landing grace and the role's window. Each child here runs under a 10 s limit.
   */
  describe('PD-ORCH-004 on REQ-ORCH-088\'s path: the retry, the landing and the role\'s window', () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('f1', 'f', F1, [])];
    /** A gate the test opens: a call waiting on it completes at whatever the clock reads when it is opened. */
    const gate = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };
    /** A model step that speaks only once `p` is released. */
    const held = (p: Promise<void>, text: string): ScriptedCall => ({ parts: [{ hold: p, part: { kind: 'text', delta: text } }, { part: { kind: 'finish', reason: 'stop' } }] });
    /** `write_file` and `read_file` answered here; a read of a gate's name completes when that gate opens. */
    const fileTools = (gates: Record<string, Promise<void>>): TestTool => (name, a) => {
      if (name !== 'write_file' && name !== 'read_file') return undefined;
      const result: PortToolResult = { text: 'ok', isError: false, status: 'ok', durationMs: 1, label: name, args: a };
      const waitOn = gates[String(a['path'])];
      return waitOn ? waitOn.then(() => result) : Promise.resolve(result);
    };
    const script = (child: (turn: number) => ScriptedCall) => (persona: string, turn: number): ScriptedCall => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build', task: 'TASK: build' } }]) : answer('finished');
      if (persona === 'summariser') return answer('{"summary":"done"}');
      return child(turn);
    };
    type Stored = { errors: { type: string; message: string }[]; cut_off?: { statement: string; changed_paths: string[]; continuation_offer: string | null } };
    const reportOf = (sid: SessionId) => JSON.parse(dal.childrenOf(sid)[0]!.report!) as Stored;

    it('PD-ORCH-004 / REQ-ORCH-088: the changed paths are collected across the fallback retry — attempt 1\'s write is listed beside attempt 2\'s', async () => {
      const g = gate(); const h = gate();
      const s = sessionsWith(script((turn) => {
        // Attempt 1, on a1: one write at 0 s, then a model step that never answers, so the backstop ends it.
        if (turn === 1) return toolCalls([{ callId: 'w1', name: 'write_file', args: { path: 'src/a.ts', content: 'a' } }]);
        if (turn === 2) return hanging(NEVER);
        // Attempt 2, on f1 from 40 s: another write, and a read that completes 1 s before this attempt's limit.
        if (turn === 3) return toolCalls([{ callId: 'w2', name: 'write_file', args: { path: 'src/b.ts', content: 'b' } }, { callId: 'r1', name: 'read_file', args: { path: 'gate' } }]);
        return held(h.p, 'halfway');
      }), { catalogue, roleFallback: F1, childTimeoutMs: 10_000, childStallTimeoutMs: 2_000, delegation: true, tool: fileTools({ gate: g.p }) });
      const sid = (s.sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await tick();
      clock.advance(10_000); await tick(); // attempt 1's limit: its only call completed 10 s before — not progress
      clock.advance(30_000); await tick(); // the landing backstop ends attempt 1; the retry starts at 40 s
      clock.advance(9_000); g.open(); await tick(); // the read completes at 49 s
      clock.advance(1_000); // attempt 2's limit, at 50 s
      h.open();
      expect((await s.sessions.running(sid)!).status).toBe('completed');
      expect(timeline(sid)).toContain('fallback_model');
      expect(dal.childrenOf(sid)[0]!.state).toBe('failed');
      const report = reportOf(sid);
      expect(report.errors).toEqual(expect.arrayContaining([{ type: 'timeout', message: 'Child timed out after 10s' }]));
      expect(report.cut_off?.statement).toBe('Cut off while making progress: this child completed a tool call within the final 2s before its 10s limit expired.');
      expect(report.cut_off?.changed_paths).toEqual(['src/a.ts', 'src/b.ts']);
    });

    it('PD-ORCH-004 / REQ-ORCH-088: progress is read at the expiry of the attempt that ended failed — attempt 1 progressing and attempt 2 not gives REQ-ORCH-088\'s report alone', async () => {
      const g1 = gate(); const g2 = gate(); const h = gate();
      const s = sessionsWith(script((turn) => {
        // Attempt 1: a write and a read completing 1 s before its limit — progressing at ITS expiry.
        if (turn === 1) return toolCalls([{ callId: 'w1', name: 'write_file', args: { path: 'src/a.ts', content: 'a' } }, { callId: 'r1', name: 'read_file', args: { path: 'gate1' } }]);
        if (turn === 2) return hanging(NEVER);
        // Attempt 2, from 40 s: a read completing at 41 s, 9 s before its limit, then silence.
        if (turn === 3) return toolCalls([{ callId: 'r2', name: 'read_file', args: { path: 'gate2' } }]);
        return held(h.p, 'still reading');
      }), { catalogue, roleFallback: F1, childTimeoutMs: 10_000, childStallTimeoutMs: 2_000, delegation: true, tool: fileTools({ gate1: g1.p, gate2: g2.p }) });
      const sid = (s.sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await tick();
      clock.advance(9_000); g1.open(); await tick();
      clock.advance(1_000); await tick(); // attempt 1's limit, 1 s after its read: progressing
      clock.advance(30_000); await tick(); // the backstop; the retry starts at 40 s
      clock.advance(1_000); g2.open(); await tick();
      clock.advance(9_000); // attempt 2's limit, at 50 s, 9 s after its read: not progressing
      h.open();
      expect((await s.sessions.running(sid)!).status).toBe('completed');
      expect(timeline(sid)).toContain('fallback_model');
      expect(dal.childrenOf(sid)[0]!.state).toBe('failed');
      const report = reportOf(sid);
      expect(report.errors).toEqual(expect.arrayContaining([{ type: 'timeout', message: 'Child timed out after 10s' }]));
      expect(report.cut_off).toBeUndefined();
    });

    it('PD-ORCH-004: a call that completes during the landing grace, after the limit expired, is not progress', async () => {
      const g1 = gate(); const g2 = gate();
      const s = sessionsWith(script((turn) => {
        if (turn === 1) return toolCalls([{ callId: 'r1', name: 'read_file', args: { path: 'gate1' } }]);
        // Dispatched at 1 s, it completes only at 15 s — 5 s into the landing grace.
        if (turn === 2) return toolCalls([{ callId: 'r2', name: 'read_file', args: { path: 'gate2' } }]);
        return answer('never reached: the landing stops the turn before its next model step');
      }), { childTimeoutMs: 10_000, childStallTimeoutMs: 2_000, delegation: true, tool: fileTools({ gate1: g1.p, gate2: g2.p }) });
      const sid = (s.sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await tick();
      clock.advance(1_000); g1.open(); await tick();
      clock.advance(9_000); await tick(); // the limit, at 10 s: the last completion was 9 s before
      clock.advance(5_000); g2.open(); // the held read completes at 15 s, inside the grace
      expect((await s.sessions.running(sid)!).status).toBe('completed');
      const row = dal.childrenOf(sid)[0]!;
      expect(row.state).toBe('failed');
      expect(row.tool_calls).toBe(2);
      const report = reportOf(sid);
      expect(report.errors).toEqual(expect.arrayContaining([{ type: 'timeout', message: 'Child timed out after 10s' }]));
      expect(report.cut_off).toBeUndefined();
    });

    it('PD-ORCH-004 / REQ-CONFIG-108: a role\'s stall_timeout substitutes for runtime.child_stall_timeout as the window', async () => {
      /** One child whose only call completes 3 s before its limit, under a run window of 5 s and the role window given. */
      const cutOffUnder = async (roleStallTimeoutMs: number | undefined) => {
        const g = gate(); const h = gate();
        const s = sessionsWith(script((turn) => (turn === 1 ? toolCalls([{ callId: 'r1', name: 'read_file', args: { path: 'gate' } }]) : held(h.p, 'reading on'))),
          { childTimeoutMs: 10_000, childStallTimeoutMs: 5_000, ...(roleStallTimeoutMs === undefined ? {} : { roleStallTimeoutMs }), delegation: true, tool: fileTools({ gate: g.p }) });
        const sid = (s.sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await tick();
        clock.advance(7_000); g.open(); await tick();
        clock.advance(3_000); // the limit, 3 s after the call
        h.open();
        expect((await s.sessions.running(sid)!).status).toBe('completed');
        return reportOf(sid).cut_off;
      };
      // The run's 5 s window alone: 3 s before the expiry is inside it (the positive control).
      expect((await cutOffUnder(undefined))?.statement).toMatch(/within the final 5s before its 10s limit/);
      // A role window of 2 s replaces it: the same call is outside.
      expect(await cutOffUnder(2_000)).toBeUndefined();
      // A role window of 3 s replaces it too, and the bound stays inclusive.
      expect((await cutOffUnder(3_000))?.statement).toMatch(/within the final 3s before its 10s limit/);
    });
  });

  describe('REQ-NOTIFY-111/112 with REQ-ORCH-088 and REQ-CONFIG-108: the corrective message across the retry, and the role\'s window', () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('f1', 'f', F1, [])];
    const gate = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };
    /** A model step that says nothing until `p` is released, and then fails. */
    const silentThenFails = (p: Promise<void>): ScriptedCall => ({ parts: [{ hold: p }, { error: modelError({ code: 'unknown', headline: 'the stream ended with no answer', transient: false }) }] });
    const script = (child: (turn: number) => ScriptedCall) => (persona: string, turn: number): ScriptedCall => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'quiet', task: 'TASK: quiet' } }]) : answer('finished');
      if (persona === 'summariser') return answer('{"summary":"done"}');
      return child(turn);
    };
    const childRequests = (s: ReturnType<typeof sessionsWith>) => s.client.requests.filter((r) => !/^You are the orchestrator|summarise/i.test(r.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? ''));
    const corrective = (r: { messages: readonly { content: readonly { kind: string; text?: string }[] }[] }) => r.messages.some((m) => m.content.some((p) => p.kind === 'text' && (p.text ?? '').startsWith('[Corrective message]')));

    it('once per child task: a child corrected on its first attempt is not corrected again on REQ-ORCH-088\'s fallback retry', async () => {
      const g1 = gate(); const g2 = gate();
      const s = sessionsWith(script((turn) => {
        if (turn === 1) return silentThenFails(g1.p); // attempt 1, on a1: silent 3 s, then fails — its corrective message
        if (turn === 2) return hanging(NEVER); // the corrected turn hangs to the limit; the backstop ends attempt 1
        return silentThenFails(g2.p); // attempt 2, on f1: silent 3 s, then fails — no second message
      }), { catalogue, roleFallback: F1, childTimeoutMs: 10_000, childStallTimeoutMs: 2_000, delegation: true });
      const sid = (s.sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await tick();
      clock.advance(3_000); g1.open(); await tick();
      clock.advance(7_000); await tick(); // attempt 1's limit
      clock.advance(30_000); await tick(); // the backstop; the retry starts on f1
      clock.advance(3_000); g2.open();
      expect((await s.sessions.running(sid)!).status).toBe('completed');
      expect(timeline(sid)).toContain('fallback_model');
      const requests = childRequests(s);
      expect(requests.map((r) => [r.model.modelId, corrective(r)])).toEqual([['a1', false], ['a1', true], ['f1', false]]);
      expect(warnings.filter((m) => m.startsWith('child corrective message:'))).toHaveLength(1);
      expect(dal.childrenOf(sid)[0]!.state).toBe('failed');
    });

    it('a role\'s stall_timeout is the watch\'s threshold and the message\'s window on that role\'s children', async () => {
      const g = gate();
      const s = sessionsWith(script((turn) => (turn === 1 ? silentThenFails(g.p) : answer('carried on'))), { childStallTimeoutMs: 60_000, roleStallTimeoutMs: 4_000, delegation: true });
      const sid = (s.sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await tick();
      clock.advance(4_000);
      // REQ-MONITOR-117: with a 4 s threshold the watch evaluates every second, and the stall is entered at 4 s.
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'stall').map((i) => i.message)).toEqual([expect.stringMatching(/^child appears stalled: no model event or token for 4 seconds/)]);
      g.open();
      expect((await s.sessions.running(sid)!).status).toBe('completed');
      expect(corrective(childRequests(s)[1]!)).toBe(true);
    });
  });

  it('REQ-ORCH-092: a 503 is retried once from the transient budget and a 401 fails the agent at once; a validation failure uses its own budget', async () => {
    const transient = sessionsWith((_p, turn) => (turn === 1 ? failing(modelError({ code: 'http', status: 503, headline: 'Service Unavailable' })) : answer('ok')));
    const sid = (transient.sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await tick();
    clock.advance(1000);
    expect((await transient.sessions.running(sid)!).status).toBe('completed');
    expect(issues(sid)).toEqual(['transient_llm_error']);
    expect(transient.client.requests).toHaveLength(2);

    const fatal = sessionsWith((_p, turn) => (turn === 1 ? failing(modelError({ code: 'http', status: 401, headline: 'Unauthorized', providerMessage: 'Incorrect API key provided', transient: false })) : answer('never')));
    const sid2 = (fatal.sessions.start(dal, 'C:/ws', 'y') as { value: SessionId }).value;
    const r2 = await fatal.sessions.running(sid2)!;
    expect(r2.status).toBe('failed');
    expect(fatal.client.requests).toHaveLength(1);
    expect(issues(sid2)).toEqual([]);

    const validation = sessionsWith((_p, turn) => (turn === 1 ? failing(modelError({ code: 'validation', headline: 'unparseable JSON', transient: false })) : answer('ok')), { over: { validationRetries: 1 } });
    const sid3 = (validation.sessions.start(dal, 'C:/ws', 'z') as { value: SessionId }).value;
    await tick();
    clock.advance(1000);
    expect((await validation.sessions.running(sid3)!).status).toBe('completed');
    expect(issues(sid3)).toEqual(['validation_llm_error']);
  });

  describe('REQ-NOTIFY-070 / REQ-MONITOR-147 / REQ-SESSION-026: a first authentication failure pins fallback_model session-wide and restarts', () => {
    const unauthorized = () => modelError({ code: 'http', status: 401, headline: 'Unauthorized', providerMessage: 'Incorrect API key provided', transient: false });
    const catalogue = () => [entry('a1', 'a', A1, ['small_model']), entry('f1', 'f', F1, [])];

    it('pins the fallback keyed by the failed pair, restarts with the same prompt on it, and the pin outlives the run and a reload', async () => {
      const { sessions, client } = sessionsWith((_p, turn) => (turn === 1 ? failing(unauthorized()) : answer(`answer ${turn}`)), { catalogue: catalogue(), fallbackModel: { model: F1, thinking: 'unset' } });
      const sid = (sessions.start(dal, 'C:/ws', 'do the thing') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('failed');
      // REQ-NOTIFY-068: the 401 is not retried.
      expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1']);
      const restarted = sessions.restartOnFallback(sid);
      if (!restarted.ok) throw new Error(restarted.error.reason);
      expect(restarted.value).toEqual({ failed: { provider: 'a', model: 'a1', key: 'a1' }, fallback: { provider: 'f', model: 'f1', key: 'f1' }, prompt: 'do the thing' });
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'f1']);
      expect(dal.residentRows(sid).filter((r) => r.kind === 'user').map((r) => r.body)).toEqual(['do the thing', 'do the thing']);
      // The restart's row stands just before the restarted prompt — written once the restart began, never before.
      const kinds = dal.residentRows(sid).map((r) => `${r.kind}:${/restarts on the fallback/.test(r.body) ? 'restart' : r.body}`);
      expect(kinds.indexOf('system:restart')).toBe(kinds.lastIndexOf('user:do the thing') - 1);
      expect(JSON.parse(dal.timelineOf(sid).find((t) => t.name === 'model_override')!.metadata)).toMatchObject({ provider: 'a', model: 'a1', model_key: 'f1', to_provider: 'f', to_model: 'f1', cause: 'authentication' });
      // Session-wide, not one run's: a later prompt in this process stays on the fallback.
      const later = sessions.prompt(sid, 'again');
      if (!later.ok) throw new Error(later.error.reason);
      await sessions.running(sid)!;
      expect(client.requests.at(-1)!.model.modelId).toBe('f1');
      // And a reload of the session: the pin is rehydrated from the timeline.
      const fresh = sessionsWith(() => answer('fresh'), { catalogue: catalogue(), fallbackModel: { model: F1, thinking: 'unset' } });
      const resumed = fresh.sessions.resume(dal, 'C:/ws', sid);
      if (!resumed.ok) throw new Error(resumed.error.reason);
      const again = fresh.sessions.prompt(sid, 'once more');
      if (!again.ok) throw new Error(again.error.reason);
      await fresh.sessions.running(sid)!;
      expect(fresh.client.requests.map((r) => r.model.modelId)).toEqual(['f1']);
    });

    it('REQ-ORCH-153: a first 401 on a plan cycle\'s turn restarts on the fallback too — the restarted plan cycle runs on it and parks at the gate', async () => {
      const { sessions, client } = sessionsWith((_p, turn) => (turn === 1 ? failing(unauthorized()) : answer('1. Do the thing on the fallback.')), { catalogue: catalogue(), fallbackModel: { model: F1, thinking: 'unset' }, runStartMode: 'plan' });
      const sid = (sessions.start(dal, 'C:/ws', 'plan the thing') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('failed');
      expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1']);
      const restarted = sessions.restartOnFallback(sid);
      if (!restarted.ok) throw new Error(`${restarted.error.code}: ${restarted.error.reason}`);
      expect(restarted.value).toEqual({ failed: { provider: 'a', model: 'a1', key: 'a1' }, fallback: { provider: 'f', model: 'f1', key: 'f1' }, prompt: 'plan the thing' });
      await sessions.running(sid)!;
      expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'f1']);
      // The restart is the same prompt under the same mode: a plan cycle, held at the gate with the fallback's plan.
      expect(dal.getSession(sid)!.execution_status).toBe('awaiting_plan_decision');
      expect(JSON.parse(dal.timelineOf(sid).find((t) => t.name === 'model_override')!.metadata)).toMatchObject({ provider: 'a', model: 'a1', model_key: 'f1', cause: 'authentication' });
    });

    /*
     * REQ-ORCH-154 with REQ-NOTIFY-070/074: a plan decision launches a run carrying more than the last prompt — revise "starts
     * a further plan cycle with the plan as it currently stands and the changes stated", approve carries the plan as the
     * user left it (edited where they edited it). A restart after that run's first 401 relaunches the same decision on the
     * model just pinned: the plan, the changes and the cycle reach the fallback, and no prompt is re-submitted, since a
     * decision is no prompt. Re-submitting the last user row instead opened a fresh cycle from the original prompt and
     * dropped both (the fourth repair round's blocking finding).
     */
    const planned = (script: (turn: number) => ScriptedCall) => {
      const h = sessionsWith((_p, turn) => script(turn), { catalogue: catalogue(), fallbackModel: { model: F1, thinking: 'unset' }, runStartMode: 'plan' });
      const sid = (h.sessions.start(dal, 'C:/ws', 'plan the thing') as { value: SessionId }).value;
      return { ...h, sid };
    };
    const users = (sid: SessionId) => dal.residentRows(sid).filter((r) => r.kind === 'user').map((r) => r.body);
    const taskStates = (sid: SessionId) => (JSON.parse(dal.getSession(sid)!.todo ?? '{"phases":[]}') as { phases: { tasks: { state: string }[] }[] }).phases.flatMap((p) => p.tasks.map((t) => t.state));

    it('REQ-ORCH-154: a revise cycle that fails on a first 401 is restarted as the same revise — the stated changes and the plan they revise reach the fallback', async () => {
      const { sessions, client, sid } = planned((turn) => (turn === 1 ? answer('1. Original plan.') : turn === 2 ? failing(unauthorized()) : answer('1. Revised plan on the fallback.')));
      await sessions.running(sid)!;
      expect(dal.getSession(sid)!.execution_status).toBe('awaiting_plan_decision');
      expect(sessions.planDecision(sid, 'revise', 'USE-THE-ZEBRA-LIBRARY')).toEqual({ ok: true, value: { relaunched: true, cycle: 1 } });
      expect((await sessions.running(sid)!).status).toBe('failed');
      expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'a1']);
      const restarted = sessions.restartOnFallback(sid);
      if (!restarted.ok) throw new Error(`${restarted.error.code}: ${restarted.error.reason}`);
      await sessions.running(sid)!;
      expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'a1', 'f1']);
      const sent = JSON.stringify(client.requests[2]!.messages);
      expect(sent).toContain('USE-THE-ZEBRA-LIBRARY');
      expect(sent).toContain('1. Original plan.');
      // The revise's own cycle, parked at the gate with the fallback's plan and the changes it was asked for.
      expect(dal.getSession(sid)!.execution_status).toBe('awaiting_plan_decision');
      expect(dal.planCyclesOf(sid).map((c) => ({ cycle: c.cycle, changes: c.changes, plan: c.plan }))).toEqual([
        { cycle: 1, changes: '', plan: '1. Original plan.' },
        { cycle: 2, changes: 'USE-THE-ZEBRA-LIBRARY', plan: '1. Revised plan on the fallback.' },
      ]);
      // A decision is no prompt: nothing is re-submitted, and a row says the run restarted on the fallback.
      expect(users(sid)).toEqual(['plan the thing']);
      expect(dal.residentRows(sid).some((r) => r.kind === 'system' && /^Authentication failed on a\/a1\. The run restarts on the fallback model f1/.test(r.body))).toBe(true);
      // Approving the revised plan carries the work out once, on the fallback: the request was never abandoned or doubled.
      expect(sessions.planDecision(sid, 'approve').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'a1', 'f1', 'f1']);
      expect(JSON.stringify(client.requests[3]!.messages)).toContain('1. Revised plan on the fallback.');
      expect(taskStates(sid)).toEqual(['complete']);
    });

    it('REQ-ORCH-154: an approved plan whose run fails on a first 401 is restarted as the same approval — the plan as the user edited it reaches the fallback', async () => {
      const { sessions, client, sid } = planned((turn) => (turn === 1 ? answer('1. Original plan.') : turn === 2 ? failing(unauthorized()) : answer('carried out on the fallback')));
      await sessions.running(sid)!;
      expect(sessions.planEdit(sid, '1. THE-EDITED-STEP.').ok).toBe(true);
      expect(sessions.planDecision(sid, 'approve').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('failed');
      const restarted = sessions.restartOnFallback(sid);
      if (!restarted.ok) throw new Error(`${restarted.error.code}: ${restarted.error.reason}`);
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'a1', 'f1']);
      expect(JSON.stringify(client.requests[2]!.messages)).toContain('THE-EDITED-STEP');
      expect(dal.getSession(sid)!.plan_released).toBe(1);
      expect(dal.planCyclesOf(sid)).toHaveLength(1);
      expect(users(sid)).toEqual(['plan the thing']);
      // The failed run's task stays abandoned (REQ-ORCH-074) and the relaunch carried the request out again (OQ-182).
      expect(taskStates(sid)).toEqual(['abandoned', 'complete']);
    });

    it('REQ-NOTIFY-074 with REQ-ORCH-154: the recovery dialog\'s restart relaunches a failed revise as the same revise too', async () => {
      const { sessions, client, sid } = planned((turn) => (turn === 1 ? answer('1. Original plan.') : turn === 2 ? failing(unauthorized()) : answer('1. Revised plan on the chosen model.')));
      await sessions.running(sid)!;
      expect(sessions.planDecision(sid, 'revise', 'USE-THE-ZEBRA-LIBRARY').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('failed');
      const restarted = sessions.restartAfterAuthFailure(sid, 'f1');
      if (!restarted.ok) throw new Error(`${restarted.error.code}: ${restarted.error.reason}`);
      await sessions.running(sid)!;
      expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'a1', 'f1']);
      expect(JSON.stringify(client.requests[2]!.messages)).toContain('USE-THE-ZEBRA-LIBRARY');
      expect(dal.planCyclesOf(sid).map((c) => c.changes)).toEqual(['', 'USE-THE-ZEBRA-LIBRARY']);
      expect(users(sid)).toEqual(['plan the thing']);
    });

    it('a restart after a later PROMPT re-submits that prompt, not an earlier decision (REQ-NOTIFY-070)', async () => {
      // Cycle 1 parks, is approved and completes; the next prompt (plan mode again, released) fails on a first 401.
      const { sessions, client, sid } = planned((turn) => (turn === 1 ? answer('1. Original plan.') : turn === 2 ? answer('done') : turn === 3 ? failing(unauthorized()) : answer('the follow-up on the fallback')));
      await sessions.running(sid)!;
      expect(sessions.planDecision(sid, 'approve').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      const next = sessions.prompt(sid, 'and a follow-up');
      if (!next.ok) throw new Error(next.error.reason);
      expect((await sessions.running(sid)!).status).toBe('failed');
      const restarted = sessions.restartOnFallback(sid);
      if (!restarted.ok) throw new Error(`${restarted.error.code}: ${restarted.error.reason}`);
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'a1', 'a1', 'f1']);
      expect(users(sid)).toEqual(['plan the thing', 'and a follow-up', 'and a follow-up']);
    });

    it('a plan cycle whose turn ended on no model call\'s failure records no failed model: refused (REQ-NOTIFY-069)', async () => {
      // The plan cycle produced no plan text (a succeeded, empty turn): the run ends, but no model call failed.
      const { sessions } = sessionsWith(() => answer(''), { catalogue: catalogue(), fallbackModel: { model: F1, thinking: 'unset' }, runStartMode: 'plan' });
      const sid = (sessions.start(dal, 'C:/ws', 'plan the thing') as { value: SessionId }).value;
      await sessions.running(sid)!;
      expect(sessions.restartOnFallback(sid)).toMatchObject({ ok: false, error: { code: 'no-model-failure' } });
    });

    it('the fallback failing too is not tried again: refused, nothing written (REQ-NOTIFY-072, REQ-NOTIFY-075)', async () => {
      const { sessions, client } = sessionsWith(() => failing(unauthorized()), { catalogue: catalogue(), fallbackModel: { model: F1, thinking: 'unset' } });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await sessions.running(sid)!;
      const first = sessions.restartOnFallback(sid);
      expect(first.ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('failed');
      expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'f1']);
      const overrides = dal.timelineOf(sid).filter((t) => t.name === 'model_override').length;
      const second = sessions.restartOnFallback(sid);
      expect(second).toMatchObject({ ok: false, error: { code: 'fallback-failed' } });
      expect(dal.timelineOf(sid).filter((t) => t.name === 'model_override')).toHaveLength(overrides);
      expect(client.requests).toHaveLength(2);
    });

    it('with no fallback configured, or with the fallback being the model that failed, it is refused and nothing is written (REQ-NOTIFY-069/072)', async () => {
      for (const fallbackModel of [null, { model: A1, thinking: 'unset' as const }]) {
        const { sessions, client } = sessionsWith(() => failing(unauthorized()), { catalogue: catalogue(), fallbackModel });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await sessions.running(sid)!;
        expect(sessions.restartOnFallback(sid)).toMatchObject({ ok: false, error: { code: fallbackModel === null ? 'no-fallback' : 'fallback-failed' } });
        expect(timeline(sid)).not.toContain('model_override');
        expect(client.requests).toHaveLength(1);
      }
    });

    it('a run whose failure was no model call\'s is refused (REQ-NOTIFY-069)', async () => {
      const { sessions } = sessionsWith(() => answer('fine'), { catalogue: catalogue(), fallbackModel: { model: F1, thinking: 'unset' } });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await sessions.running(sid)!;
      expect(sessions.restartOnFallback(sid)).toMatchObject({ ok: false, error: { code: 'no-model-failure' } });
    });

    it('REQ-NOTIFY-078: re-authentication re-pins the primary — for the next run after the run ended, durably; from the next iteration while one runs', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      // Turn 1 is the 401 on a1; turn 2 (the restart on f1) is held so a re-pin lands while the run is live; then answers.
      const { sessions, client } = sessionsWith((_p, turn) => (turn === 1 ? failing(unauthorized()) : turn === 2 ? { parts: [{ hold, part: { kind: 'text', delta: 'on the fallback' } }, { part: { kind: 'finish', reason: 'stop' } }] } : answer(`answer ${turn}`)), { catalogue: catalogue(), fallbackModel: { model: F1, thinking: 'unset' } });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await sessions.running(sid)!;
      expect(sessions.restartOnFallback(sid).ok).toBe(true);
      await tick();
      expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'f1']);
      expect(sessions.repinPrimary(sid, { provider: 'a', model: 'a1' })).toEqual({ ok: true, value: { applies: 'next-iteration' } });
      // A queued prompt gives the run a next iteration: the turn in flight finishes on f1, the next one runs on a1.
      expect(sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'and then this' } }).ok).toBe(true);
      release();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'f1', 'a1']);
      expect(dal.residentRows(sid).some((r) => r.kind === 'system' && r.body === 'Re-authenticated: the run switches back to a/a1 from the next iteration.')).toBe(true);
      // The next prompt runs on the primary again.
      const next = sessions.prompt(sid, 'again');
      if (!next.ok) throw new Error(next.error.reason);
      await sessions.running(sid)!;
      expect(client.requests.at(-1)!.model.modelId).toBe('a1');
      // With no run live the answer is "the next run".
      expect(sessions.repinPrimary(sid, { provider: 'a', model: 'a1' })).toEqual({ ok: true, value: { applies: 'next-run' } });
      // And a reload replays the taken-back pin: the primary.
      const fresh = sessionsWith(() => answer('fresh'), { catalogue: catalogue(), fallbackModel: { model: F1, thinking: 'unset' } });
      const resumed = fresh.sessions.resume(dal, 'C:/ws', sid);
      if (!resumed.ok) throw new Error(resumed.error.reason);
      const again = fresh.sessions.prompt(sid, 'once more');
      if (!again.ok) throw new Error(again.error.reason);
      await fresh.sessions.running(sid)!;
      expect(fresh.client.requests.map((r) => r.model.modelId)).toEqual(['a1']);
      expect(JSON.parse(dal.timelineOf(sid).filter((t) => t.name === 'model_override').at(-1)!.metadata)).toMatchObject({ provider: 'a', model: 'a1', cleared: true, cause: 'reauthentication' });
    });

    it('a restart that cannot begin takes the pin back, durably, so the session stays on the model it had (REQ-NOTIFY-070)', async () => {
      // Configure answers the start and the pin's resolution (calls 1 and 2) and refuses the restart's own (call 3).
      const { sessions, client } = sessionsWith(() => failing(unauthorized()), { catalogue: catalogue(), fallbackModel: { model: F1, thinking: 'unset' }, configureRefusesFrom: 3 });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await sessions.running(sid)!;
      expect(sessions.restartOnFallback(sid)).toMatchObject({ ok: false, error: { code: 'restart-failed' } });
      expect(client.requests).toHaveLength(1);
      const entries = dal.timelineOf(sid).filter((t) => t.name === 'model_override').map((t) => JSON.parse(t.metadata) as Record<string, unknown>);
      expect(entries).toHaveLength(2);
      expect(entries[1]).toMatchObject({ provider: 'a', model: 'a1', cleared: true });
      // The transcript says nothing that did not happen: no row claims a restart on the fallback, and no second user row.
      const rows = dal.residentRows(sid).map((r) => `${r.kind}: ${r.body}`);
      expect(rows.filter((r) => /fallback/i.test(r))).toEqual([]);
      expect(rows.filter((r) => r.startsWith('user:'))).toEqual(['user: x']);
      // A reload replays both: no override stands.
      const fresh = sessionsWith(() => answer('fresh'), { catalogue: catalogue(), fallbackModel: { model: F1, thinking: 'unset' } });
      const resumed = fresh.sessions.resume(dal, 'C:/ws', sid);
      if (!resumed.ok) throw new Error(resumed.error.reason);
      const again = fresh.sessions.prompt(sid, 'once more');
      if (!again.ok) throw new Error(again.error.reason);
      await fresh.sessions.running(sid)!;
      expect(fresh.client.requests.map((r) => r.model.modelId)).toEqual(['a1']);
    });

    it('a restart whose own user row cannot be written, after the announcement, says so and takes the pin back (REQ-NOTIFY-070)', async () => {
      const { sessions, client } = sessionsWith(() => failing(unauthorized()), { catalogue: catalogue(), fallbackModel: { model: F1, thinking: 'unset' } });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await sessions.running(sid)!;
      // Every refusal passes and the announcement is written; then the restarted prompt's user row fails to write.
      type Writer = { appendRow: (kind: string, ...rest: unknown[]) => unknown };
      const writer = (sessions as unknown as { live: Map<SessionId, { writer: Writer }> }).live.get(sid)!.writer;
      const original = writer.appendRow.bind(writer);
      writer.appendRow = (kind, ...rest) => (kind === 'user' ? { ok: false, error: { code: 'history-failed', reason: 'the disk is full' } } : original(kind, ...rest));
      const answer = sessions.restartOnFallback(sid);
      writer.appendRow = original;
      expect(answer).toMatchObject({ ok: false, error: { code: 'restart-failed', reason: 'the disk is full' } });
      expect(client.requests).toHaveLength(1);
      // The transcript says what happened, in order: the restart announced, then that it could not begin, on the model it had.
      const rows = dal.residentRows(sid).map((r) => `${r.kind}: ${r.body}`);
      const fallbackRows = rows.filter((r) => /fallback/i.test(r));
      expect(fallbackRows).toHaveLength(2);
      expect(fallbackRows[0]).toMatch(/^system: Authentication failed on a\/a1\. The run restarts on the fallback model f1 \(f\/f1\)/);
      expect(fallbackRows[1]).toBe('system: The run could not restart on the fallback model f1 (the disk is full); the session stays on a/a1.');
      expect(rows.filter((r) => r.startsWith('user:'))).toEqual(['user: x']);
      // And the pin is taken back, durably.
      const entries = dal.timelineOf(sid).filter((t) => t.name === 'model_override').map((t) => JSON.parse(t.metadata) as Record<string, unknown>);
      expect(entries).toHaveLength(2);
      expect(entries[1]).toMatchObject({ provider: 'a', model: 'a1', cleared: true });
    });
  });

  describe('REQ-NOTIFY-072/074/076 (the 401 note\'s parts C and D): the authentication recovery dialog\'s facts and its restart', () => {
    const unauthorized = () => failing(modelError({ code: 'http', status: 401, headline: 'Unauthorized', providerMessage: 'Incorrect API key provided', transient: false }));
    const catalogue = () => [entry('a1', 'a', A1, ['small_model']), entry('b1', 'b', B1, ['small_model']), entry('c1', 'c', C1, [], { usable: false })];
    const failedSession = async (script: (persona: string, turn: number) => ScriptedCall = (_p, turn) => (turn === 1 ? unauthorized() : answer('restarted')), opts: Opts = {}) => {
      const s = sessionsWith(script, { catalogue: catalogue(), ...opts });
      const sid = (s.sessions.start(dal, 'C:/ws', 'the first prompt') as { value: SessionId }).value;
      expect((await s.sessions.running(sid)!).status).toBe('failed');
      return { ...s, sid };
    };

    it('names the model the failed root call was addressed to, the active model, every usable configured model, and a recorded prompt', async () => {
      const { sessions, sid } = await failedSession();
      const facts = sessions.authRecoveryFacts(sid);
      if (!facts.ok) throw new Error(facts.error.reason);
      expect(facts.value.failed).toEqual({ key: 'a1', provider: 'a', model: 'a1' });
      expect(facts.value.active).toEqual({ key: 'a1', provider: 'a', model: 'a1' });
      // c1 is not usable for this run (its provider was not leased), so a restart could never reach it.
      expect(facts.value.models).toEqual([{ key: 'a1', provider: 'a', model: 'a1' }, { key: 'b1', provider: 'b', model: 'b1' }]);
      expect(facts.value.lastPrompt).toBe(true);
    });

    it('a chosen model is pinned against the failed pair, the run restarts with the same prompt on it, and the pin survives a reload', async () => {
      const { sessions, client, sid } = await failedSession();
      const r = sessions.restartAfterAuthFailure(sid, 'b1');
      if (!r.ok) throw new Error(r.error.reason);
      expect(r.value.pinned).toEqual({ from: { key: 'a1', provider: 'a', model: 'a1' }, to: { key: 'b1', provider: 'b', model: 'b1' } });
      expect((await sessions.running(sid)!).status).toBe('completed');
      // REQ-NOTIFY-068: the pair that failed is not called again; the restart is on the chosen model.
      expect(client.requests.map((q) => q.model.modelId)).toEqual(['a1', 'b1']);
      const users = dal.residentRows(sid).filter((row) => row.kind === 'user').map((row) => row.body);
      expect(users).toEqual(['the first prompt', 'the first prompt']);
      expect(dal.residentRows(sid).some((row) => row.kind === 'system' && /Authentication failed on a\/a1\. The run restarts on b1 \(b\/b1\)/.test(row.body))).toBe(true);
      expect(JSON.parse(dal.timelineOf(sid).filter((t) => t.name === 'model_override').at(-1)!.metadata)).toMatchObject({ provider: 'a', model: 'a1', model_key: 'b1', cause: 'authentication' });
      // REQ-SESSION-026: a fresh process rehydrates the pin, so the session's next run is on b1 too.
      const fresh = sessionsWith(() => answer('fresh'), { catalogue: catalogue() });
      const resumed = fresh.sessions.resume(dal, 'C:/ws', sid);
      if (!resumed.ok) throw new Error(resumed.error.reason);
      const again = fresh.sessions.prompt(sid, 'once more');
      if (!again.ok) throw new Error(again.error.reason);
      await fresh.sessions.running(sid)!;
      expect(fresh.client.requests.map((q) => q.model.modelId)).toEqual(['b1']);
    });

    it('REQ-NOTIFY-076: a re-authentication restarts with the same prompt on the same model and pins nothing', async () => {
      const { sessions, client, sid } = await failedSession();
      const r = sessions.restartAfterAuthFailure(sid, null);
      if (!r.ok) throw new Error(r.error.reason);
      expect(r.value.pinned).toBeNull();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(client.requests.map((q) => q.model.modelId)).toEqual(['a1', 'a1']);
      expect(dal.timelineOf(sid).some((t) => t.name === 'model_override')).toBe(false);
      expect(dal.residentRows(sid).filter((row) => row.kind === 'user').map((row) => row.body)).toEqual(['the first prompt', 'the first prompt']);
      expect(dal.residentRows(sid).some((row) => row.kind === 'system' && row.body.startsWith('Re-authenticated after the authentication failure'))).toBe(true);
    });

    /*
     * REQ-NOTIFY-068: main never offers back a pair that failed authentication while its provider holds the same credentials
     * (`apps/desktop/src/main/auth-recovery.ts`, `refusedPair`) — the credential store is main's, so the engine cannot know
     * whether they changed. What this pins is the engine's half once they have: a1's provider re-authenticated under
     * Settings after a1 failed, then b1 failing too, makes a1 a legitimate choice again, and the pin that moved the session
     * off a1 must not lead back off it.
     */
    it('REQ-NOTIFY-075: a hand-chosen model that also fails is replaced by the next choice; choosing back the first model once its provider\'s credentials changed leaves no pin away from it', async () => {
      const { sessions, client, sid } = await failedSession((_p, turn) => (turn <= 2 ? unauthorized() : answer('at last')));
      const first = sessions.restartAfterAuthFailure(sid, 'b1');
      if (!first.ok) throw new Error(first.error.reason);
      expect((await sessions.running(sid)!).status).toBe('failed');
      const facts = sessions.authRecoveryFacts(sid);
      if (!facts.ok) throw new Error(facts.error.reason);
      expect(facts.value.failed).toEqual({ key: 'b1', provider: 'b', model: 'b1' });
      const back = sessions.restartAfterAuthFailure(sid, 'a1');
      if (!back.ok) throw new Error(back.error.reason);
      expect(back.value.pinned).toEqual({ from: { key: 'b1', provider: 'b', model: 'b1' }, to: { key: 'a1', provider: 'a', model: 'a1' } });
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(client.requests.map((q) => q.model.modelId)).toEqual(['a1', 'b1', 'a1']);
      const memory = ResilienceMemory.rehydrate(dal.timelineOf(sid), (key) => ({ model: key === 'a1' ? A1 : B1, thinking: 'unset' }));
      expect(memory.overrideFor('a', 'a1')).toBeUndefined();
      expect(memory.overrideFor('b', 'b1')?.key).toBe('a1');
    });

    it('a restart that cannot begin takes the pin back, so the session stays on the model it had', async () => {
      // The start configures once and the restart twice (its own resolution, then the prompt's): the third refuses.
      const { sessions, client, sid } = await failedSession(undefined, { configureRefusesFrom: 3 });
      const r = sessions.restartAfterAuthFailure(sid, 'b1');
      expect(r.ok ? null : r.error.code).toBe('restart-failed');
      const overrides = dal.timelineOf(sid).filter((t) => t.name === 'model_override').map((t) => JSON.parse(t.metadata) as Record<string, unknown>);
      expect(overrides.map((m) => m['cleared'] === true)).toEqual([false, true]);
      // No row claims a restart that never began, and nothing was called.
      expect(dal.residentRows(sid).some((row) => row.kind === 'system' && row.body.includes('The run restarts on'))).toBe(false);
      expect(client.requests).toHaveLength(1);
      expect(ResilienceMemory.rehydrate(dal.timelineOf(sid), () => ({ model: B1, thinking: 'unset' })).overrideFor('a', 'a1')).toBeUndefined();
    });

    it('refuses the model that failed, an unknown key and an active run, writing nothing', async () => {
      const { sessions, sid } = await failedSession((_p, turn) => (turn === 1 ? unauthorized() : hanging(NEVER)));
      const before = dal.timelineOf(sid).length;
      const same = sessions.restartAfterAuthFailure(sid, 'a1');
      expect(same.ok ? null : same.error.code).toBe('same-model');
      const unknown = sessions.restartAfterAuthFailure(sid, 'nope');
      expect(unknown.ok ? null : unknown.error.code).toBe('unknown-model');
      expect(dal.timelineOf(sid).length).toBe(before);
      expect(sessions.restartAfterAuthFailure(sid, 'b1').ok).toBe(true);
      await tick();
      const active = sessions.restartAfterAuthFailure(sid, 'b1');
      expect(active.ok ? null : active.error.code).toBe('run-active');
      expect(sessions.authRecoveryFacts(sid).ok).toBe(false);
      sessions.control({ op: 'cancel', sessionId: sid, args: { force: true } });
      await sessions.running(sid);
    });
  });

  it('REQ-ORCH-145: the per-model timeout and retry count reach the request; a catalogue entry without them leaves the run\'s', async () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model'], { timeoutMs: 7000, retries: 2 })];
    const s = sessionsWith(() => answer('ok'), { catalogue });
    const sid = (s.sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await s.sessions.running(sid)!;
    expect(s.client.requests[0]).toMatchObject({ timeoutMs: 7000, retries: 2 });
    const t = sessionsWith(() => answer('ok'), { catalogue: [entry('a1', 'a', A1, ['small_model'])] });
    const sid2 = (t.sessions.start(dal, 'C:/ws', 'y') as { value: SessionId }).value;
    await t.sessions.running(sid2)!;
    expect(t.client.requests[0]).toMatchObject({ timeoutMs: RUN_CONFIG_DEFAULTS.modelTimeoutMs, retries: RUN_CONFIG_DEFAULTS.modelRetries });
  });

  /*
   * REQ-MONITOR-142 over REQ-ORCH-090/091 (OQ-177): the row a switch appends says what the entry agent runs on from the
   * next iteration, whatever the ladder did before it — and the iteration in flight finishes on the setting it had.
   */
  describe('REQ-MONITOR-142 with REQ-ORCH-090/091 (OQ-177): an entry switch row is what the next iteration runs on', () => {
    const systemRows = (sid: SessionId) => dal.residentRows(sid).filter((r) => r.kind === 'system').map((r) => r.body);
    const isRoot = (r: { messages: readonly { content: readonly { kind: string; text?: string }[] }[] }) => /^You are the orchestrator/.test(r.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text ?? '' : '')).join('') ?? '');
    const rootModels = (client: ScriptedModelClient) => client.requests.filter(isRoot).map((r) => r.model.modelId);
    const held = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };
    const addTask = (sessions: Sessions, sid: SessionId) => expect(sessions.control({ op: 'editTodo', sessionId: sid, args: { op: 'add', id: 'second', text: 'a second task' } })).toEqual({ ok: true });

    it('a switch back to the configured key after a same-tier move rebuilds the root on it at the next iteration, as its row says (REQ-ORCH-091 b)', async () => {
      const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('b1', 'b', B1, ['small_model'])];
      const gate = held();
      const { sessions, client } = sessionsWith((p, turn) => (p !== 'orchestrator' ? answer('{"summary":"done"}') : turn === 1 ? failing(rateLimit(1)) : turn === 2 ? hanging(gate.p) : answer(`iteration ${turn}`)), { catalogue });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await tick();
      expect(rootModels(client)).toEqual(['a1', 'b1']);
      addTask(sessions, sid);
      expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model: 'a1' } })).toEqual({ ok: true });
      gate.open();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(dal.iterationsOf(sid)).toHaveLength(2);
      expect(rootModels(client)).toEqual(['a1', 'b1', 'a1']);
      expect(systemRows(sid)).toContain('Entry model switched to a1; it applies from the next iteration.');
    });

    it('a switch back to the configured key after an unresponsive-model fallback rebuilds the root on it at the next iteration (REQ-ORCH-090)', async () => {
      const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('f1', 'f', F1, [])];
      const gate = held();
      const { sessions, client } = sessionsWith((p, turn) => (p !== 'orchestrator' ? answer('{"summary":"done"}') : turn === 1 ? hanging(NEVER) : turn === 2 ? hanging(gate.p) : answer(`iteration ${turn}`)), { catalogue, fallbackModel: { model: F1, thinking: 'unset' }, llmResponseTimeoutMs: 30_000 });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await tick();
      clock.advance(30_000);
      await tick();
      expect(rootModels(client)).toEqual(['a1', 'f1']);
      addTask(sessions, sid);
      expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model: 'a1' } })).toEqual({ ok: true });
      gate.open();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(rootModels(client)).toEqual(['a1', 'f1', 'a1']);
      expect(systemRows(sid)).toContain('Entry model switched to a1; it applies from the next iteration.');
    });

    it('a reasoning switch reaches the next iteration\'s requests, on the model the root has, and the row says so', async () => {
      const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('b1', 'b', B1, ['small_model'])];
      const gate = held();
      const { sessions, client } = sessionsWith((p, turn) => (p !== 'orchestrator' ? answer('{"summary":"done"}') : turn === 1 ? failing(rateLimit(1)) : turn === 2 ? hanging(gate.p) : answer(`iteration ${turn}`)), { catalogue });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await tick();
      addTask(sessions, sid);
      expect(sessions.control({ op: 'setReasoning', sessionId: sid, args: { level: 'high' } })).toEqual({ ok: true });
      gate.open();
      expect((await sessions.running(sid)!).status).toBe('completed');
      // A reasoning switch is not a model switch: the same-tier move stands, and only the level changes.
      expect(client.requests.filter(isRoot).map((r) => [r.model.modelId, r.thinking])).toEqual([['a1', 'unset'], ['b1', 'unset'], ['b1', 'high']]);
      expect(systemRows(sid)).toContain('Entry reasoning level switched to high; it applies from the next iteration.');
    });

    it('the iteration in flight finishes on the model it had: a root resumed after its child in the same iteration is not moved by a switch', async () => {
      const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('c1', 'c', C1, [])];
      const gate = held();
      const script = (persona: string, turn: number): ScriptedCall => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'slow', task: 'TASK: be slow' } }]) : answer(`root ${turn}`);
        if (persona === 'summariser') return answer('{"summary":"done"}');
        return turn === 1 ? hanging(gate.p) : answer('I did it.');
      };
      const { sessions, client } = sessionsWith(script, { catalogue, delegation: true });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await tick();
      expect(dal.childrenOf(sid)[0]!.state).toBe('running');
      addTask(sessions, sid);
      expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model: 'c1' } })).toEqual({ ok: true });
      gate.open();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(dal.iterationsOf(sid)).toHaveLength(2);
      // Iteration 1's root (its first call, its call after the delegation, its resume with the child's report) on a1;
      // iteration 2's root on c1.
      const roots = client.requests.filter(isRoot);
      expect(roots.map((r) => r.model.modelId)).toEqual(['a1', 'a1', 'a1', 'c1']);
      expect(JSON.stringify(roots[2]!.messages.at(-1))).toContain('[Background task completed]');
    });

    it('a switch onto a pair an earlier wait moved for the rest of the session says the entry agent stays on that choice (REQ-ORCH-091 d)', async () => {
      const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('c1', 'c', C1, [])];
      const gate = held();
      const { sessions, client, pub } = sessionsWith((p, turn) => (p !== 'orchestrator' ? answer('{"summary":"done"}') : turn === 1 ? failing(quota()) : turn === 2 ? hanging(gate.p) : answer(`iteration ${turn}`)), { catalogue });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await tick();
      expect(lastWait(pub)).toMatchObject({ provider: 'a', model: 'a1' });
      expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model: 'c1' } })).toEqual({ ok: true });
      await tick();
      expect(rootModels(client)).toEqual(['a1', 'c1']);
      addTask(sessions, sid);
      expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model: 'a1' } })).toEqual({ ok: true });
      gate.open();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(rootModels(client)).toEqual(['a1', 'c1', 'c1']);
      const row = systemRows(sid).find((b) => b.startsWith('Entry model switched to a1'))!;
      expect(row).toBe('Entry model switched to a1, but c1, chosen for a/a1 during an earlier wait, stands for the rest of the session: the entry agent runs on c1 from the next iteration.');
      expect(row).not.toContain('it applies from the next iteration');
    });
  });
  /*
   * REQ-NOTIFY-069/070/074/076 with REQ-SESSION-192: the authentication restarts and the recovery dialog read the session's
   * last prompt over released rows too (`lastSubmittedPrompt`, through `lastPromptOf`). Before the repair of
   * `docs/defects/fixed/the-continue-reads-the-last-prompt-from-the-resident-window-and-falls-back-to-the-session-id.md`
   * they searched the resident window only, so once the prompt had been released the restart refused with "No prompt is
   * recorded for this session." and the dialog said no prompt was recorded. fin8's verifier found nothing pinned it.
   */
  describe('REQ-NOTIFY-069/070/074/076 with REQ-SESSION-192: the restarts read a prompt that has been released', () => {
    const unauthorized = () => failing(modelError({ code: 'http', status: 401, headline: 'Unauthorized', providerMessage: 'Incorrect API key provided', transient: false }));
    const catalogue = () => [entry('a1', 'a', A1, ['small_model']), entry('f1', 'f', F1, [])];
    /** A session at rest `paused` whose prompt lies RESIDENT_ROW_CAP + 10 rows back (released to a page), continued, its run failing on a 401. */
    const failedReleased = async (raw: string, opts: Opts = {}, prompt: { readonly body: string; readonly attachments?: string } = { body: 'the released prompt' }) => {
      const sid = asSessionId(raw);
      dal.upsertSession({ session_id: raw, execution_status: 'paused', workspace_root: 'C:/ws', created_at: '2026-10-02T10:00:00.000Z', updated_at: '2026-10-02T10:05:00.000Z', worktree: null });
      dal.transaction(() => {
        dal.appendRow(sid, 0, 'user', true, prompt.body, '2026-10-02T10:00:00.000Z', prompt.attachments === undefined ? {} : { attachments: prompt.attachments });
        for (let i = 1; i <= RESIDENT_ROW_CAP + 10; i++) dal.appendRow(sid, i, i % 2 === 0 ? 'agent' : 'tool', true, `row ${i}`, '2026-10-02T10:01:00.000Z');
        while (dal.residentCount(sid) > RESIDENT_ROW_CAP) dal.releaseOldestPage(sid, dal.nextPageNumber(sid));
      });
      expect(dal.residentRows(sid).some((r) => r.kind === 'user')).toBe(false);
      const s = sessionsWith((_p, turn) => (turn === 1 ? unauthorized() : answer('restarted')), { catalogue: catalogue(), ...opts });
      const resumed = s.sessions.resume(dal, 'C:/ws', sid);
      if (!resumed.ok) throw new Error(resumed.error.reason);
      const continued = s.sessions.continueSession(sid, 'continue');
      if (!continued.ok) throw new Error(continued.error.reason);
      expect((await s.sessions.running(sid)!).status).toBe('failed');
      return { ...s, sid };
    };
    const userBodies = (sid: SessionId) => dal.rowsBefore(sid, dal.nextRowIndex(sid), 1_000_000).filter((r) => r.kind === 'user').map((r) => r.body).reverse();

    it('the recovery dialog says a prompt is recorded, and the fallback restart re-sends the released prompt\'s text', async () => {
      const { sessions, client, sid } = await failedReleased('RL1', { fallbackModel: { model: F1, thinking: 'unset' } });
      const facts = sessions.authRecoveryFacts(sid);
      if (!facts.ok) throw new Error(facts.error.reason);
      expect(facts.value.lastPrompt).toBe(true);
      const restarted = sessions.restartOnFallback(sid);
      if (!restarted.ok) throw new Error(restarted.error.reason);
      expect(restarted.value.prompt).toBe('the released prompt');
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'f1']);
      expect(userBodies(sid)).toEqual(['the released prompt', 'the released prompt']);
    });

    it('the re-authenticated restart (no model chosen) re-sends the released prompt\'s text', async () => {
      const { sessions, sid } = await failedReleased('RL2');
      const restarted = sessions.restartAfterAuthFailure(sid, null);
      if (!restarted.ok) throw new Error(restarted.error.reason);
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(userBodies(sid)).toEqual(['the released prompt', 'the released prompt']);
    });

    it('a last prompt of images alone is refused by name — a prompt is recorded, its images are not re-sent (OQ-182) — never as "no prompt recorded"', async () => {
      const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
      const saved = persistAttachments(join(dir, 'sessions', 'RL3'), [{ name: 'shot.png', mediaType: 'image/png', size: png.length, base64: png.toString('base64') }]);
      if (!saved.ok) throw new Error(saved.reason);
      const { sessions, sid } = await failedReleased('RL3', { fallbackModel: { model: F1, thinking: 'unset' } }, { body: '', attachments: JSON.stringify(saved.attachments) });
      const reason = 'The last prompt carries images only, which the restart does not re-send (OQ-182), so there is no text to restart with.';
      expect(sessions.restartOnFallback(sid)).toEqual({ ok: false, error: { code: 'no-prompt', reason } });
      expect(sessions.restartAfterAuthFailure(sid, null)).toEqual({ ok: false, error: { code: 'no-prompt', reason } });
      const facts = sessions.authRecoveryFacts(sid);
      if (!facts.ok) throw new Error(facts.error.reason);
      expect(facts.value.lastPrompt).toBe(false);
    });
  });
});
