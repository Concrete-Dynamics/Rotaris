import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { toIsoUtc, type Clocks } from '@rotaris/kernel';
import { resolvePreset, type ApprovalPayload, type HeadlessPolicy, type PermissionPreset, type ToolStatus } from '@rotaris/contracts';
import {
  buildPolicy, directWorkBundle, effectiveMode, FileToolState, findShell, Gate, globTool, grepTool, haetEditTool, haetReadTool, nodePtyFactory, PendingApprovals, PolicyContext, readFileTool, realPathOf,
  resolveToolSet, TERMINAL_DEFAULTS, TerminalManager, terminalTool, TodoList, todoTool, writeFileTool, type GateSink, type PresenterPort, type ToolExecutor,
} from '@rotaris/agent-tools';
import { BUILT_IN_PERSONAS, parseLogLevel, type ModeChange, type PortToolCall, type PortToolResult, type RoleName, type RuntimePosture, type SessionWriter, type ToolPort, type ToolPortContext } from '@rotaris/engine';
import { backgroundOutputTool, delegateTool, waitForTasksTool } from '@rotaris/agent-tools';
import { z } from 'zod';

/**
 * The run-host root's side of the tool surface: it builds the ONE gate per session from agent-tools,
 * fills the engine's `ToolPort` with it, and fills the gate's `GateSink` with the session writer — so
 * the engine never imports agent-tools and agent-tools never imports the engine (ADR-0002's boundaries
 * stay structural). Decision 1 of the plan: the runtime keys are read from the environment here until
 * the configuration loader (ADR-0036) owns them; decision 2: the entry persona holds the direct-work
 * bundle until Part B brings `delegate` and the coordinator role.
 */
export const RUNTIME_ENV_KEYS = {
  permissionMode: 'ROTARIS_PERMISSION_MODE',
  approvalTimeoutS: 'ROTARIS_APPROVAL_TIMEOUT_S',
  headlessApprovalPolicy: 'ROTARIS_HEADLESS_APPROVAL_POLICY',
  allowOutsideWorkspace: 'ROTARIS_ALLOW_OUTSIDE_WORKSPACE',
  sessionLogLevel: 'ROTARIS_SESSION_LOG_LEVEL',
  shellCommandTimeoutS: 'ROTARIS_SHELL_COMMAND_TIMEOUT_S',
  /** REQ-ORCH-025: `single` | `swarm` | unset (decision 2 of the plan). */
  runOverride: 'ROTARIS_RUN_OVERRIDE',
  /** REQ-ORCH-050: a per-model cap the user set; unset = uncapped. */
  modelConcurrencyCap: 'ROTARIS_MODEL_CONCURRENCY_CAP',
} as const;

export interface RuntimeFromEnv extends RuntimePosture {
  readonly approvalTimeoutMs: number;
  readonly headlessPolicy: HeadlessPolicy;
  readonly allowOutsideWorkspace: boolean;
  /** REQ-CONFIG-116: `runtime.shell_command_timeout`, seconds, default 100. */
  readonly shellCommandTimeoutS: number;
  readonly runOverride: 'single' | 'swarm' | null;
  readonly warnings: string[];
}

/** REQ-TOOLS-046/055/065/130 defaults; ADR-0022: no sandbox backend exists on this platform. */
export function runtimeFromEnv(env: NodeJS.ProcessEnv = process.env): RuntimeFromEnv {
  const warnings: string[] = [];
  const mode = resolvePreset(env[RUNTIME_ENV_KEYS.permissionMode]);
  if (mode.warned) warnings.push(`unrecognised permission mode '${env[RUNTIME_ENV_KEYS.permissionMode]}'; using the strictest preset (restricted) (REQ-TOOLS-046)`);
  const timeoutRaw = env[RUNTIME_ENV_KEYS.approvalTimeoutS];
  let approvalTimeoutMs = 300_000;
  if (timeoutRaw !== undefined && timeoutRaw.trim() !== '') {
    const n = Number(timeoutRaw);
    if (!Number.isFinite(n) || n < 0) warnings.push(`runtime.approval_timeout_seconds must be a number of at least 0; '${timeoutRaw}' was rejected and the default 300 stands (REQ-TOOLS-055)`);
    else approvalTimeoutMs = Math.round(n * 1000);
  }
  const headlessRaw = (env[RUNTIME_ENV_KEYS.headlessApprovalPolicy] ?? 'deny').trim().toLowerCase();
  const headlessPolicy: HeadlessPolicy = headlessRaw === 'abort' ? 'abort' : 'deny';
  if (headlessRaw !== 'deny' && headlessRaw !== 'abort') warnings.push(`unrecognised headless approval policy '${headlessRaw}'; behaving as deny (REQ-TOOLS-065)`);
  const allowOutsideWorkspace = /^(1|true|yes)$/i.test(env[RUNTIME_ENV_KEYS.allowOutsideWorkspace] ?? '');
  const level = parseLogLevel(env[RUNTIME_ENV_KEYS.sessionLogLevel]);
  if (level.warning) warnings.push(level.warning);
  let shellCommandTimeoutS = 100;
  const shellRaw = env[RUNTIME_ENV_KEYS.shellCommandTimeoutS];
  if (shellRaw !== undefined && shellRaw.trim() !== '') {
    const n = Number(shellRaw);
    if (!Number.isFinite(n) || n <= 0) warnings.push(`runtime.shell_command_timeout must be a positive number of seconds; '${shellRaw}' was rejected and the default 100 stands (REQ-CONFIG-116)`);
    else shellCommandTimeoutS = n;
  }
  const overrideRaw = (env[RUNTIME_ENV_KEYS.runOverride] ?? '').trim().toLowerCase();
  const runOverride = overrideRaw === 'single' ? 'single' : overrideRaw === 'swarm' ? 'swarm' : null;
  if (overrideRaw !== '' && runOverride === null) warnings.push(`unrecognised run override '${overrideRaw}'; ignored (REQ-ORCH-025)`);
  const capRaw = env[RUNTIME_ENV_KEYS.modelConcurrencyCap];
  let modelConcurrencyCap: number | null = null;
  if (capRaw !== undefined && capRaw.trim() !== '') {
    const n = Number(capRaw);
    if (!Number.isInteger(n) || n < 1) warnings.push(`the per-model concurrency cap must be a positive integer; '${capRaw}' was rejected and models are uncapped (REQ-ORCH-050)`);
    else modelConcurrencyCap = n;
  }
  return {
    permissionMode: mode.preset, allowUnsandboxedAutonomous: false,
    sandbox: { requested: false, available: false, backend: '' },
    sessionLogLevel: level.level, approvalTimeoutMs, headlessPolicy, allowOutsideWorkspace, shellCommandTimeoutS, runOverride, modelConcurrencyCap, warnings,
  };
}

/** REQ-SESSION-142: the session's log file, appended line by line; the directory is made on first write. */
export function fileAppender(file: string): (line: string) => void {
  let made = false;
  return (line) => {
    if (!made) { mkdirSync(dirname(file), { recursive: true }); made = true; }
    appendFileSync(file, line, 'utf8');
  };
}

/** ADR-0019: the run host's side of the presenter channel — post a present-request, await main's `approval.shown`. */
export class RunHostPresenter implements PresenterPort {
  private readonly waiters = new Map<string, (r: { ok: true } | { ok: false; error: string }) => void>();
  constructor(private readonly deps: { readonly post: (payload: ApprovalPayload) => void; readonly close: (requestId: string) => void; readonly clocks: Clocks; readonly shownBoundMs: number }) {}
  present(payload: ApprovalPayload): Promise<{ ok: true } | { ok: false; error: string }> {
    return new Promise((resolve) => {
      const h = this.deps.clocks.timers.after(this.deps.shownBoundMs as never, () => {
        this.waiters.delete(payload.request_id);
        resolve({ ok: false, error: `main did not confirm the dialog within ${this.deps.shownBoundMs} ms` });
      });
      this.waiters.set(payload.request_id, (r) => { h.cancel(); resolve(r); });
      this.deps.post(payload);
    });
  }
  shown(requestId: string, ok: boolean, error?: string): boolean {
    const w = this.waiters.get(requestId);
    if (!w) return false;
    this.waiters.delete(requestId);
    w(ok ? { ok: true } : { ok: false, error: error ?? 'the dialog could not be shown' });
    return true;
  }
  close(requestId: string): void {
    this.deps.close(requestId);
  }
}

export interface ToolPortDeps {
  readonly clocks: Clocks;
  readonly runtime: RuntimeFromEnv;
  readonly presenter: PresenterPort;
  readonly nextSequence: () => number;
  /** Shared per workspace root: the read record and the undo stacks (REQ-TOOLS-137). */
  readonly fileStates: Map<string, FileToolState>;
  /** ADR-0020: one manager for the run host; null when no shell is present (REQ-TOOLS-104) and the tool is removed. */
  readonly terminal: TerminalManager | null;
}

/** REQ-TOOLS-104/106: the backend by presence alone; the PTY factory loaded once. Null when no shell exists on the host. */
export async function terminalManagerFromHost(clocks: Clocks, warn: (m: string) => void, shellCommandTimeoutS: number): Promise<TerminalManager | null> {
  const backend = findShell();
  if (!backend) return null;
  const env = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'));
  return new TerminalManager({ factory: await nodePtyFactory(), backend, clocks, config: { ...TERMINAL_DEFAULTS, commandTimeoutS: shellCommandTimeoutS }, env, warn });
}

/** The sink the gate writes through: every unit lands in the session writer's transactions. */
function writerSink(writer: SessionWriter, sessionId: string, clocks: Clocks, warn: (m: string) => void): GateSink {
  return {
    decision: (e) => { const r = writer.recordDecision({ timestamp: toIsoUtc(clocks.wall.instant()), session_id: sessionId, ...e }); return r.ok ? r.value : null; },
    approvalRequested: (p) => { writer.recordEvent('approval.requested', p); },
    pendingChanged: (pending) => { writer.save(writer.currentStatus, { pending_approvals: JSON.stringify(pending) }); },
    issue: (i) => { writer.recordIssue(i); },
    timeline: (name, actor, message, metadata) => { writer.appendTimeline(name, actor, message, metadata); },
    toolOpen: (o) => { const r = writer.openToolCall(o); return r.ok ? r.value : null; },
    toolSettle: (ordinal, o, s) => { writer.settleToolCall(ordinal, o, s); },
    warn,
  };
}

/** The executors this build registers (decision 3 of the plan); the registry removes any other declared name (REQ-TOOLS-004). */
function executorsFor(root: string, deps: ToolPortDeps, todo: TodoList): Map<string, ToolExecutor> {
  const fence = { workspaceRoot: root, allowOutsideWorkspace: deps.runtime.allowOutsideWorkspace, additionalReadOnlyRoots: [] as string[] };
  let state = deps.fileStates.get(root);
  if (!state) { state = new FileToolState(fence); deps.fileStates.set(root, state); }
  const list: ToolExecutor[] = [
    readFileTool(state) as ToolExecutor, writeFileTool(state) as ToolExecutor, haetReadTool(state) as ToolExecutor,
    haetEditTool(state, 'haet_edit') as ToolExecutor, haetEditTool(state, 'haet') as ToolExecutor,
    grepTool(fence) as ToolExecutor, globTool(fence) as ToolExecutor, todoTool(todo) as ToolExecutor,
  ];
  if (deps.terminal) list.push(terminalTool(deps.terminal, { ...TERMINAL_DEFAULTS, commandTimeoutS: deps.runtime.shellCommandTimeoutS }) as ToolExecutor);
  return new Map(list.map((e) => [e.name, e]));
}

export function createToolPort(ctx: ToolPortContext, deps: ToolPortDeps): ToolPort {
  const root = realPathOf(ctx.workspaceRoot);
  const todo = new TodoList();
  const executors = executorsFor(root, deps, todo);
  // Decision 2: the persona from the engine's built-in table until ADR-0036 loads agents.yaml.
  const persona = BUILT_IN_PERSONAS[ctx.persona as RoleName] ?? BUILT_IN_PERSONAS.orchestrator;
  const isEntry = ctx.persona === 'orchestrator';
  // REQ-ORCH-025: `single` grants the entry role the direct-work bundle and withholds delegate from every role.
  const single = deps.runtime.runOverride === 'single';
  // REQ-ORCH-016/018: the pre-flight's grant reaches the entry role only; the bundle is resolved by facet against the registry.
  const directWork = isEntry && (single || ctx.grant === 'direct-work');
  const declared = directWork ? [...new Set([...persona.tools, ...directWorkBundle()])] : persona.tools;
  const delegationAvailable = ctx.delegation !== undefined && !single;
  if (delegationAvailable && ctx.delegation) {
    const parentId = ctx.parentId ?? 'root';
    executors.set('delegate', delegateTool(ctx.delegation, parentId) as ToolExecutor);
    executors.set('background_output', backgroundOutputTool(ctx.delegation, parentId) as ToolExecutor);
    executors.set('wait_for_tasks', waitForTasksTool(ctx.delegation, parentId) as ToolExecutor);
  }
  // ONE resolution feeds the prompt listing and the callable set (REQ-TOOLS-010).
  const resolved = resolveToolSet({ name: ctx.persona, tools: declared, coordinatorOnly: persona.coordinatorOnly && delegationAvailable && !directWork, readOnly: persona.readOnly }, {}, {
    delegationRuntime: delegationAvailable, userPromptChannel: false, artifactStore: false, canPublishArtifacts: false, terminalBackend: executors.has('terminal'), executors: new Set(executors.keys()),
  }, isEntry);
  for (const r of resolved.removals) ctx.warn(`tool '${r.tool}' removed from ${ctx.persona} by ${r.control}${r.reason ? ` (${r.reason})` : ''} (REQ-TOOLS-004/006)`);
  const callable = new Map<string, ToolExecutor>();
  for (const n of resolved.tools) { const e = executors.get(n); if (e) callable.set(n, e); }
  const specs = [...callable.values()].map((e) => ({ name: e.name, description: e.description, parameters: z.toJSONSchema(e.schema) as Record<string, unknown> }));

  let mode: PermissionPreset = ctx.requestedMode;
  const policy = new PolicyContext(buildPolicy({ preset: mode, workspaceRoot: root }));
  const approvals = new PendingApprovals(deps.clocks.timers);
  const gate = new Gate({
    sessionId: ctx.sessionId, workspaceRoot: root, policy, approvals, attended: ctx.attended, presenter: deps.presenter,
    headlessPolicy: deps.runtime.headlessPolicy, abortHook: ctx.abortRun, approvalTimeoutMs: deps.runtime.approvalTimeoutMs,
    executors: callable, resolvePath: (p) => { try { return realPathOf(p); } catch { return null; } },
    monotonic: deps.clocks.monotonic, wall: deps.clocks.wall, timers: deps.clocks.timers,
    sink: writerSink(ctx.writer, ctx.sessionId, deps.clocks, ctx.warn), nextSequence: deps.nextSequence,
    hooks: ctx.hooks ?? null,
  });

  return {
    specs: () => specs,
    dispatch: async (call: PortToolCall, signal): Promise<PortToolResult> => {
      const r = await gate.dispatch({ callId: call.callId, name: call.name, rawArgs: call.rawArgs, persona: call.persona, agentId: call.agentId, agentName: call.agentName }, signal);
      const status: Exclude<ToolStatus, 'running'> = r.status;
      return {
        text: r.text, isError: r.isError, status, durationMs: r.durationMs, label: r.label, args: r.args,
        ...(r.observation?.diff === undefined ? {} : { diff: r.observation.diff }),
        ...(r.status === 'blocked' ? { blockedReason: r.blockedReason ?? r.decision?.reason ?? '' } : {}),
        ...(r.followUp === undefined ? {} : { followUp: r.followUp }),
      };
    },
    cancelPending: () => approvals.cancelAll(),
    setMode: (requested, _source): ModeChange => {
      const previous = mode;
      const wanted = resolvePreset(requested).preset;
      // REQ-TOOLS-073: re-resolved through the downgrade for this run's context.
      const e = effectiveMode({ requested: wanted, attended: ctx.attended(), sandboxed: false, allowUnsandboxedAutonomous: deps.runtime.allowUnsandboxedAutonomous });
      mode = e.effective;
      policy.replace(buildPolicy({ preset: mode, workspaceRoot: root }));
      return { requested: wanted, effective: mode, downgraded: e.downgraded, reason: e.reason, previous };
    },
    currentMode: () => mode,
    answerApproval: (requestId, option) => approvals.resolve(requestId, option),
  };
}
