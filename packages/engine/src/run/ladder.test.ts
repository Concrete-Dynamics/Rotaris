import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import type { SessionSnapshot } from '@rotaris/contracts';
import { answer, DefaultAgentBackend, modelError, ScriptedModelClient, toolCalls, type ModelRef, type ScriptedCall } from '@rotaris/model';
import { BUILT_IN_PERSONAS, RUN_CONFIG_DEFAULTS, Sessions, type CatalogueEntry, type DelegationOps, type ModelChoice, type ModelLookup, type PortToolResult, type Publisher, type RoleName, type RunConfig, type ToolPort } from '../index.js';

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

/** The delegation tools dispatched straight to the ops (as the children test does). */
function delegationPort(ops: DelegationOps, parentId: string): ToolPort {
  const dispatch = async (name: string, raw: string): Promise<PortToolResult> => {
    const a = JSON.parse(raw) as Record<string, unknown>;
    const ok = (text: string): PortToolResult => ({ text, isError: false, status: 'ok', durationMs: 1, label: name, args: a });
    if (name === 'delegate') {
      const r = await ops.delegate(parentId, { persona: String(a['persona']), taskName: String(a['task_name']), task: String(a['task']), dependsOn: [], inheritedContext: [], category: '', runInBackground: true });
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
    delegation?: boolean;
    over?: Partial<RunConfig>;
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
    const personas = { resolve: (name: string) => { const base = BUILT_IN_PERSONAS[name as RoleName]; return base ? { persona: { ...base, ...(opts.roleFallback ? { fallbackModel: opts.roleFallback } : {}) }, alias: null } : null; }, knownRoles: () => Object.keys(BUILT_IN_PERSONAS) };
    const backend = new DefaultAgentBackend(client);
    const results: string[] = [];
    const sessions = new Sessions({
      clocks: clock, publisher: pub, pid: 77, host: HOST, retentionCap: 20_000, warn: (m) => warnings.push(m), mintSessionId: () => `S${++minted}`,
      model: null, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid), attended: () => true, onRunResult: (_sid, r) => results.push(r.status),
      configure: () => ({ ok: true, value: {
        model: { backend, config }, models, personas,
        runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', drainTimeoutMs: 0, ...(opts.childTimeoutMs === undefined ? {} : { childTimeoutMs: opts.childTimeoutMs }) },
        resilience: { catalogue, fallbackModel: opts.fallbackModel ?? null },
      } }),
      ...(opts.delegation ? { tools: (ctx) => (ctx.delegation ? delegationPort(ctx.delegation, ctx.parentId ?? 'root') : { specs: () => [], dispatch: async () => ({ text: '', isError: true, status: 'failed', durationMs: 0, label: '', args: {} }), cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false }) } : {}),
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

  it('quota with a same-tier candidate on another provider: the pair is marked exhausted, the fallback is transparent, the run completes on the other model (REQ-ORCH-091 a/b, REQ-NOTIFY-082/088/090)', async () => {
    const catalogue = [entry('a1', 'a', A1, ['small_model']), entry('b1', 'b', B1, ['small_model']), entry('c1', 'c', C1, [])];
    const { sessions, client, pub } = sessionsWith((_p, turn) => (turn === 1 ? failing(quota()) : answer('from b')), { catalogue });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    expect(client.requests.map((r) => r.model.modelId)).toEqual(['a1', 'b1']);
    expect(timeline(sid)).toEqual(expect.arrayContaining(['model_exhausted', 'model_fallback']));
    const fallback = dal.timelineOf(sid).find((t) => t.name === 'model_fallback')!;
    expect(JSON.parse(fallback.metadata)).toMatchObject({ from_provider: 'a', from_model: 'a1', to_provider: 'b', to_model: 'b1', to_key: 'b1', condition: 'quota_exhausted', provider_exhausted: true });
    const issue = dal.issuesOf(sid).find((i) => i.kind === 'model_fallback')!;
    expect(issue.severity).toBe('warning');
    expect(JSON.parse(issue.metadata)).toMatchObject({ requested_model: 'a/a1', fallback_model: 'b/b1', provider_exhausted: true });
    expect(JSON.parse(dal.timelineOf(sid).find((t) => t.name === 'model_exhausted')!.metadata)).toMatchObject({ provider: 'a', model: 'a1' });
    expect(issues(sid)).not.toContain('model_wait');
    expect(pub.snapshots.every((s) => s.wait === null)).toBe(true);
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
    expect(timeline(sid)).toContain('unresponsive_model_fallback');
    expect(issues(sid)).toContain('unresponsive_model');
    expect(JSON.parse(dal.timelineOf(sid).find((t) => t.name === 'unresponsive_model_fallback')!.metadata)).toMatchObject({ from_model: 'a1', to_model: 'f1', threshold_seconds: 30 });

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
    expect(timeline(sid2)).not.toContain('unresponsive_model_fallback');
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
    expect(timeline(sid)).toContain('child_timeout_fallback');
    expect(JSON.parse(dal.timelineOf(sid).find((t) => t.name === 'child_timeout_fallback')!.metadata)).toMatchObject({ from_model: 'a1', to_model: 'f1', timeout_seconds: 10 });
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
    expect(timeline(sid2)).not.toContain('child_timeout_fallback');
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
});
