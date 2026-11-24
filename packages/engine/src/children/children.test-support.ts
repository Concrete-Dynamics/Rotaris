import { afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling, type ChildRow } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type ModelRequest, type ScriptedCall } from '@rotaris/model';
import type { StrategyChoice, ApprovalPayload, PermissionPreset } from '@rotaris/contracts';
import { RUN_CONFIG_DEFAULTS, Sessions, type DelegationOps, type PortToolResult, type Publisher, type RunConfig, type ToolPort, type ToolPortContext } from '../index.js';
import type { AgentGrant, PersonaResolver } from './personas.js';
import type { HookPort } from '../hooks-port.js';
import { SUPERVISOR_DEFAULTS, type LoopClassifier, type SupervisorConfig } from '../run/supervisor.js';
export const HOST = mintMachineId('0000000000000000000000000000000a');
export const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };
export const NONE: Publisher = { increment: () => undefined, snapshot: () => undefined };

export let dir: string;

export let dal: StoreDal;

export let clock: FakeClock;

export const warnings: string[] = [];

/** The lines the run writes at `INFO` (`SessionsDeps.log`): an intended state, since OQ-127's ruling. */
export const infos: string[] = [];


/**
 * A tool the test answers itself, in place of the gate's executors; undefined leaves the call to the delegation tools.
 * The third argument is the calling agent's port context, for a stand-in that reads what the run handed the port;
 * the fourth, `builtIn`, runs the delegation tool of that name, so a test can hold one.
 */
export type TestTool = (name: string, args: Record<string, unknown>, ctx: ToolPortContext, builtIn: () => Promise<PortToolResult>) => Promise<PortToolResult> | undefined;


/** A tool port whose only tools are the three delegation tools, dispatched straight to the ops (the gate is Part A's, tested there). */
export function delegationPort(ops: DelegationOps, parentId: string, tool?: TestTool, ctx?: ToolPortContext): ToolPort {
  const dispatch = async (name: string, raw: string): Promise<PortToolResult> => {
    const a = JSON.parse(raw) as Record<string, unknown>;
    const ok = (text: string): PortToolResult => ({ text, isError: false, status: 'ok', durationMs: 1, label: name, args: a });
    const own = ctx ? tool?.(name, a, ctx, () => builtIn(name, a, ok)) : undefined;
    if (own) return own;
    return builtIn(name, a, ok);
  };
  const builtIn = async (name: string, a: Record<string, unknown>, ok: (text: string) => PortToolResult): Promise<PortToolResult> => {
    if (name === 'delegate') {
      const r = await ops.delegate(parentId, { persona: String(a['persona']), taskName: String(a['task_name']), task: String(a['task']), dependsOn: (a['depends_on'] as string[]) ?? [], inheritedContext: (a['inherited_context'] as string[] | undefined) ?? [], category: '', runInBackground: a['run_in_background'] !== false, writeScope: (a['write_scope'] as string[] | undefined) ?? [], ...(typeof a['continuation_of'] === 'string' ? { continuationOf: a['continuation_of'] } : {}), ...(typeof a['session_id'] === 'string' ? { sessionId: a['session_id'] } : {}), ...(a['suppress_auto_context'] === true ? { suppressAutoContext: true } : {}), ...(Array.isArray(a['attach_artifacts']) ? { attachArtifacts: a['attach_artifacts'] as string[] } : {}), ...(typeof a['todo_item'] === 'string' ? { todoItem: a['todo_item'] } : {}) });
      if (r.status === 'rejected') return { ...ok(`Task '${r.canonicalName}': rejected — ${r.message}`), isError: true, status: 'failed' };
      let text = `Task '${r.canonicalName}': ${r.status} — ${r.message}\ntask_id: ${r.taskId}`;
      // PD-TOOLS-006 revision 7 (OQ-249): the item the admitted delegation serves, which the run host's port marks IN_PROGRESS.
      if (r.todoItem !== undefined) text += `\nserves todo item ${r.todoItem}`;
      // PD-TOOLS-006 revision 9 (OQ-256): the hand-off answers the delegation cut, as the run host's tool renders them.
      if (r.handOff !== undefined) text += `\nhand-off cuts: ${JSON.stringify(r.handOff)}`;
      if (a['run_in_background'] === false) { const w = await ops.waitForTasks(parentId, [r.taskId]); text += `\n\n${'refused' in w ? w.refused : 'interrupted' in w ? w.interrupted : w.text}`; }
      return ok(text);
    }
    if (name === 'wait_for_tasks') { const w = await ops.waitForTasks(parentId, (a['task_ids'] as string[]) ?? []); return 'refused' in w ? { ...ok(w.refused), isError: true, status: 'failed' } : 'interrupted' in w ? { ...ok(w.interrupted), isError: true, status: 'failed', interrupted: true } : ok(w.text); }
    if (name === 'background_output') { const r = ops.backgroundOutput(parentId, String(a['task_id']), 'summary'); return ok(r.status === 'ok' ? r.text : r.status); }
    return { ...ok(`unknown ${name}`), isError: true, status: 'failed' };
  };
  return {
    specs: () => ['delegate', 'wait_for_tasks', 'background_output'].map((n) => ({ name: n, description: n, parameters: { type: 'object' } })),
    dispatch: (c) => dispatch(c.name, c.rawArgs), cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
  };
}


/**
 * `deaf`: the personas whose calls ignore their abort — a provider that does not honour it — so a test can have a call
 * outlive a stop. `hooks`, `drainTimeoutMs` and `publisher` reach the session as their names say; `images` has the
 * model accept image input. `pending`: request ids every port reports as its own live approval or question set, so an
 * id-routed answer finds a holder. `closed` collects each port's close (REQ-SESSION-094): the agent, the statement its
 * open calls are settled with, and how many `session.end` events the session held at that moment.
 */
export function sessionsWith(script: (persona: string, turn: number, req: ModelRequest) => ScriptedCall, over: { cap?: number | null; childTimeoutMs?: number; childStallTimeoutMs?: number; tool?: TestTool; deaf?: readonly string[]; hooks?: HookPort; drainTimeoutMs?: number; images?: boolean; publisher?: Publisher; pending?: ReadonlySet<string>; closed?: { agent: string; statement: string; ended: number }[]; personas?: PersonaResolver; capFor?: (modelKey: string) => number | null; modelKey?: string; raisingPort?: string; grant?: (ctx: ToolPortContext) => AgentGrant | null; readiness?: (ctx: ToolPortContext) => Promise<void> | undefined; approvals?: (ctx: ToolPortContext) => readonly ApprovalPayload[]; classifier?: LoopClassifier; supervisorConfig?: Partial<SupervisorConfig>; chooseStrategy?: (prompt: string) => Promise<StrategyChoice>; preflight?: () => void } = {}) {
  // The scripted client answers by persona and by the number of calls that persona has made.
  const counts = new Map<string, number>();
  const client = new ScriptedModelClient([]);
  const original = client.stream.bind(client);
  client.stream = (req) => {
    const persona = /^You are the orchestrator/.test(req.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '') ? 'orchestrator' : /summarise/i.test(req.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '') ? 'summariser' : 'child';
    const n = (counts.get(persona) ?? 0) + 1;
    counts.set(persona, n);
    client.push(script(persona, n, req));
    return original(over.deaf?.includes(persona) === true ? { ...req, signal: new AbortController().signal } : req);
  };
  let n = 0;
  const built: { persona: string; mode: PermissionPreset }[] = [];
  /** Each agent's tool-port context, by canonical name, as the engine built it. */
  const contexts = new Map<string, ToolPortContext>();
  const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, model: over.images === true ? { ...MODEL, acceptsImageInput: true } : MODEL, ...(over.modelKey === undefined ? {} : { modelKey: over.modelKey }), credentialFor: () => async () => 'k' };
  const runtime = { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', modelConcurrencyCap: over.cap ?? null, ...(over.capFor ? { modelCapFor: over.capFor } : {}), drainTimeoutMs: over.drainTimeoutMs ?? 0, ...(over.childStallTimeoutMs === undefined ? {} : { childStallTimeoutMs: over.childStallTimeoutMs }), ...(over.childTimeoutMs === undefined ? {} : { childTimeoutMs: over.childTimeoutMs }), ...(over.chooseStrategy ? { chooseStrategy: true } : {}) } as const;
  const sessions = new Sessions({
    clocks: clock, publisher: over.publisher ?? NONE, pid: 77, host: HOST, retentionCap: 20_000, warn: (m) => warnings.push(m), log: (m) => infos.push(m), mintSessionId: () => `S${++n}`,
    model: { backend: new DefaultAgentBackend(client), config }, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
    tools: (ctx) => {
      // The mode each agent was BUILT with, in construction order. The run host's port SELECTS it through
      // `selectRequestedMode` — the persona's pin, then the session override, then `runtime.permission_mode`
      // (REQ-TOOLS-048, covered in `run-host/tools.test.ts`); with no pins that is the override or the
      // start-of-run mode, which is the half this run's engine owns (REQ-TOOLS-073's second).
      // `raisingPort`: the agent whose tool-port factory throws, as one the run host could not build would.
      if (over.raisingPort === ctx.agentName) throw new Error(`no tool port for ${ctx.agentName}`);
      const selected = (ctx.modeOverride ?? ctx.requestedMode) as PermissionPreset;
      built.push({ persona: ctx.persona, mode: selected });
      contexts.set(ctx.agentName, ctx);
      let mode: PermissionPreset = selected;
      const held = (id: string): boolean => over.pending?.has(id) ?? false;
      const base = { ...(over.grant ? { ready: async () => { await over.readiness?.(ctx); }, grant: () => over.grant!(ctx) } : {}), close: (statement: string) => { over.closed?.push({ agent: ctx.agentName, statement, ended: dal.eventsOfKind(ctx.sessionId, 'session.end').length }); }, cancelPending: () => 0, setMode: (m: string) => { const previous = mode; mode = m as PermissionPreset; return { requested: mode, effective: mode, downgraded: false, reason: '', previous }; }, currentMode: () => mode, answerApproval: held, answerQuestions: held, cancelQuestions: held, ...(over.approvals ? { pendingApprovals: () => over.approvals!(ctx) } : {}) };
      return ctx.delegation
        ? { ...delegationPort(ctx.delegation, ctx.parentId ?? 'root', over.tool, ctx), ...base }
        : { specs: () => [], dispatch: async () => ({ text: '', isError: true, status: 'failed', durationMs: 0, label: '', args: {} }), ...base };
    },
    attended: () => true,
    ...(over.hooks ? { hooks: () => over.hooks! } : {}),
    ...(over.classifier ? { supervisor: () => ({ config: { ...SUPERVISOR_DEFAULTS, ...over.supervisorConfig }, classifier: over.classifier! }) } : {}),
    runtime,
    // PD-ORCH-020: the host's two answers, as a test gives them. The pre-flight stand-in raises, so the run goes on unclassified.
    ...(over.chooseStrategy ? { chooseStrategy: (ctx) => over.chooseStrategy!(ctx.prompt) } : {}),
    ...(over.preflight ? { preflight: async () => { over.preflight!(); throw new Error('no classifier in this test'); } } : {}),
    // A resolved `personas:` table reaches a run only through the root's configuration (RunSetup).
    ...(over.personas ? { configure: () => ({ ok: true as const, value: { model: { backend: new DefaultAgentBackend(client), config }, runtime, personas: over.personas! } }) } : {}),
  });
  return { sessions, client, counts, built, contexts };
}

export const children = (sid: SessionId): ChildRow[] => dal.childrenOf(sid);

export const kinds = (sid: SessionId) => dal.eventsFrom(sid, 1, 10_000).map((e) => e.kind);


export function holdingChild() {
  let releaseChild!: () => void;
  const hold = new Promise<void>((r) => { releaseChild = r; });
  const { sessions } = sessionsWith((persona, turn) => {
    if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('never');
    if (persona === 'summariser') return answer('{}');
    return { parts: [{ hold }, { part: { kind: 'text', delta: 'late' } }, { part: { kind: 'finish', reason: 'stop' } }] };
  });
  return { sessions, release: () => releaseChild() };
}

/** A store other than the one `useIterationStore` opened, for a case that closes and reopens it: the `afterEach` closes this one. */
export const setDal = (next: StoreDal): void => { dal = next; };

/** The scratch store, the clock and the two logs every end-to-end case starts from; each part file calls it inside its describe. */
export function useIterationStore(): void {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-iter-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
    warnings.length = 0;
    infos.length = 0;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });
}
