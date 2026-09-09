import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { toIsoUtc, type Clocks } from '@rotaris/kernel';
import { resolvePreset, type ApprovalPayload, type PermissionPreset, type ToolStatus } from '@rotaris/contracts';
import {
  askQuestionsTool, buildPolicy, directWorkBundle, effectiveMode, fetchTool, FileToolState, findShell, Gate, globTool, grepTool, haetEditTool, haetReadTool, nodePtyFactory, PendingApprovals, PendingQuestions, PolicyContext, readFileTool, realPathOf,
  resolveToolSet, TERMINAL_DEFAULTS, TerminalManager, terminalTool, TodoList, todoTool, writeFileTool, type GateSink, type PolicyRead, type PresenterPort, type ToolExecutor,
} from '@rotaris/agent-tools';
import { BUILT_IN_PERSONAS, type ModeChange, type PersonaResolver, type PortToolCall, type PortToolResult, type RoleName, type SessionWriter, type ToolPort, type ToolPortContext } from '@rotaris/engine';
import type { ConfiguredRun, RuntimeFromConfiguration } from './configuration.js';
import type { McpHost } from './mcp.js';
import { artifactListTool, artifactReadTool, artifactWriteTool, backgroundOutputTool, delegateTool, waitForTasksTool } from '@rotaris/agent-tools';
import { z } from 'zod';

/**
 * The run-host root's side of the tool surface: it builds the ONE gate per session from agent-tools,
 * fills the engine's `ToolPort` with it, and fills the gate's `GateSink` with the session writer — so
 * the engine never imports agent-tools and agent-tools never imports the engine (ADR-0002's boundaries
 * stay structural). The runtime keys and the personas come from the configuration resolved at run start
 * (ADR-0036/0037, `configuration.ts`), per workspace; the entry role's direct-work bundle is the
 * pre-flight's grant or a `single` strategy (REQ-ORCH-025).
 */
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
  /** The runtime resolved for the workspace's current run (ADR-0037 Tier B). */
  readonly runtime: (workspaceRoot: string) => RuntimeFromConfiguration;
  /** ADR-0036: the configured personas over the built-in table, per workspace; null means the built-in table. */
  readonly personas: (workspaceRoot: string) => PersonaResolver | null;
  readonly presenter: PresenterPort;
  readonly nextSequence: () => number;
  /** Shared per workspace root: the read record and the undo stacks (REQ-TOOLS-137). */
  readonly fileStates: Map<string, FileToolState>;
  /** ADR-0020: one manager for the run host; null when no shell is present (REQ-TOOLS-104) and the tool is removed. */
  readonly terminal: TerminalManager | null;
  /** ADR-0023 / REQ-SANDBOX-038: the egress policy and `tool_call_timeout`, read from the workspace's SAVED configuration at each fetch call. */
  readonly egress: (workspaceRoot: string) => () => Promise<PolicyRead>;
  /** ADR-0034 (Part S): the run host's MCP holder and the run's configuration; null means no MCP surface (tests). */
  readonly mcp?: McpHost | null | undefined;
  readonly configured?: ((workspaceRoot: string) => ConfiguredRun | null) | undefined;
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

/** The executors this build registers (decision 3 of the plan, plus `fetch` since Part N); the registry removes any other declared name (REQ-TOOLS-004). */
function executorsFor(root: string, deps: ToolPortDeps, runtime: RuntimeFromConfiguration, todoExecutor: ToolExecutor): Map<string, ToolExecutor> {
  // REQ-CONFIG-468: the additional read-only roots reach the fence; the file-tool state is per workspace root and keeps the first fence it saw.
  const fence = { workspaceRoot: root, allowOutsideWorkspace: runtime.allowOutsideWorkspace, additionalReadOnlyRoots: [...runtime.additionalReadOnlyRoots] };
  let state = deps.fileStates.get(root);
  if (!state) { state = new FileToolState(fence); deps.fileStates.set(root, state); }
  const list: ToolExecutor[] = [
    readFileTool(state) as ToolExecutor, writeFileTool(state) as ToolExecutor, haetReadTool(state) as ToolExecutor,
    haetEditTool(state, 'haet_edit') as ToolExecutor, haetEditTool(state, 'haet') as ToolExecutor,
    grepTool(fence) as ToolExecutor, globTool(fence) as ToolExecutor, todoExecutor,
    // ADR-0023: the policy is read per call from the saved files (REQ-SANDBOX-038); the gate resolved any `ask` before execution (REQ-TOOLS-091).
    fetchTool({ policy: deps.egress(root), timers: deps.clocks.timers }) as ToolExecutor,
  ];
  if (deps.terminal) list.push(terminalTool(deps.terminal, { ...TERMINAL_DEFAULTS, commandTimeoutS: runtime.shellCommandTimeoutS }) as ToolExecutor);
  return new Map(list.map((e) => [e.name, e]));
}

/**
 * Which port is the ENTRY role's — the one the pre-flight's grant and the `single` override reach (REQ-ORCH-016/025).
 * The falsified reason, kept beside its replacement (Part N's first execution, 2026-09-05): this read
 * `ctx.parentId === undefined || ctx.parentId === 'root'`, written against the root conversation id as it was before
 * Part B renamed it to `root:<iteration>` (run.ts, `6de7506`) — so from the day the configuration load wired this
 * port (`6f2880d`) the direct-work grant by intent never reached the entry role; `fetch` was the first tool that
 * could only arrive through the bundle, and the fetch proof's first launch found the orchestrator still
 * coordinator-only under `explicit_trivial`. The entry is the port at depth 0 — the run asks for it with depth 0
 * and every child with its parent's depth plus one (`ledger.ts`) — with the id spellings kept for a caller that
 * carries no depth.
 */
export function isEntryPort(ctx: Pick<ToolPortContext, 'parentId' | 'depth'>): boolean {
  if (ctx.depth !== undefined) return ctx.depth === 0;
  return ctx.parentId === undefined || /^root(:\d+)?$/.test(ctx.parentId);
}

export function createToolPort(ctx: ToolPortContext, deps: ToolPortDeps): ToolPort {
  // REQ-GIT-019/022: the fence, the policy's root and the terminal's cwd are the EFFECTIVE root (the worktree of an
  // isolated run); the runtime and the personas are the BASE workspace's configuration.
  const root = realPathOf(ctx.effectiveRoot ?? ctx.workspaceRoot);
  const runtime = deps.runtime(ctx.workspaceRoot);
  const todo = new TodoList(ctx.readTodo?.());
  const rawTodo = todoTool(todo) as ToolExecutor;
  const watchedTodo: ToolExecutor = {
    ...rawTodo,
    execute: async (args, toolContext) => {
      const before = JSON.stringify(todo.toDocument());
      const result = await rawTodo.execute(args, toolContext);
      if (JSON.stringify(todo.toDocument()) !== before) ctx.writeTodo?.(todo.toDocument());
      return result;
    },
  };
  // Part AL — REQ-TOOLS-108 / REQ-CONFIG-116: the registered `runtime.shell_max_background_sessions` and
  // `runtime.shell_background_timeout` reach the terminal manager from the run's loaded configuration, per port
  // creation, instead of `TERMINAL_DEFAULTS` (20 / 3600). The loader had validated both since Part I and nothing read
  // them (ADR-0021's note, defect fifty-two). The key has a minimum of 1 and NO stated maximum — the owner's (OQ by
  // handoff), and the production half of ADR-0021 obligation 2 stays open exactly that far.
  const shellLimits = deps.configured?.(ctx.workspaceRoot)?.cfg.runtime;
  if (deps.terminal && shellLimits) deps.terminal.setBackgroundLimits({ maxSessions: shellLimits.shell_max_background_sessions, timeoutS: shellLimits.shell_background_timeout });
  const executors = executorsFor(root, deps, runtime, watchedTodo);
  // ADR-0036: the configured persona over the built-in table; the built-in table alone when no configuration resolved.
  const resolver = deps.personas(ctx.workspaceRoot);
  const persona = resolver?.resolve(ctx.persona)?.persona ?? BUILT_IN_PERSONAS[ctx.persona as RoleName] ?? BUILT_IN_PERSONAS.orchestrator;
  const isEntry = isEntryPort(ctx);
  // REQ-ORCH-025: `single` grants the entry role the direct-work bundle and withholds delegate from every role.
  const single = runtime.runOverride === 'single';
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
  // Part Y (REQ-LIBRARY-099/100/101): the three artifact executors over the engine's port, bound to THIS agent.
  const artifacts = ctx.artifacts;
  if (artifacts) {
    executors.set('artifact_write', artifactWriteTool(artifacts) as ToolExecutor);
    executors.set('artifact_read', artifactReadTool(artifacts) as ToolExecutor);
    executors.set('artifact_list', artifactListTool(artifacts) as ToolExecutor);
  }
  /*
   * Part AC (REQ-TOOLS-157/158, REQ-CHAT-092..097): the user-prompt channel. ONE registry per port, and a port IS a
   * conversation, which is what makes REQ-CHAT-094's "one pending prompt per conversation" structural rather than a
   * check. The publication is `writer.save`: it commits and hands the projection owner a `save`, which republishes
   * the whole-session update reading `pendingQuestions` from this registry — REQ-CHAT-097's "published to the
   * surface", with no timer anywhere in the path. `attended` is the frontend's presence (REQ-TOOLS-053): a run with
   * no window to paint the prompt cannot show it, so the prompt is discarded and the call sees `cancelled`
   * (REQ-CHAT-094). The budget is REQ-TOOLS-178's shared `runtime.approval_timeout_seconds`, whose 300 s default is
   * REQ-CHAT-093's figure and whose 0 means no limit.
   */
  const questions = new PendingQuestions(deps.clocks.timers);
  const conversationId = ctx.parentId ?? 'root';
  executors.set('ask_questions', askQuestionsTool({
    pending: questions, conversationId, agentId: ctx.agentName, timeoutMs: runtime.approvalTimeoutMs,
    publish: () => {
      if (!ctx.attended()) return false;
      return ctx.writer.save(ctx.writer.currentStatus).ok;
    },
  }) as ToolExecutor);
  // ONE resolution feeds the prompt listing and the callable set (REQ-TOOLS-010).
  // `canPublishArtifacts` follows the store's presence: REQ-TOOLS-004 reserves `artifact_publish_not_granted`
  // for a build that withholds publishing separately, and no requirement in this part names such a grant — a
  // persona that must not publish declares no `artifact_write` (REQ-TOOLS-002). Recorded as a decision taken.
  const resolved = resolveToolSet({ name: ctx.persona, tools: declared, coordinatorOnly: persona.coordinatorOnly && delegationAvailable && !directWork, readOnly: persona.readOnly }, {}, {
    // Part AC: `userPromptChannel` is attendedness (REQ-TOOLS-053/069) — an unattended run has no surface to put a
    // prompt in front of, so the registry removes `ask_questions` with `user_prompt_channel_absent`. It stood at a
    // literal `false` until this part, because there was no executor for it to be true of.
    delegationRuntime: delegationAvailable, userPromptChannel: ctx.attended(), artifactStore: artifacts !== undefined, canPublishArtifacts: artifacts !== undefined, terminalBackend: executors.has('terminal'), executors: new Set(executors.keys()),
  }, isEntry);
  for (const r of resolved.removals) ctx.warn(`tool '${r.tool}' removed from ${ctx.persona} by ${r.control}${r.reason ? ` (${r.reason})` : ''} (REQ-TOOLS-004/006)`);
  const callable = new Map<string, ToolExecutor>();
  for (const n of resolved.tools) { const e = executors.get(n); if (e) callable.set(n, e); }
  const specOf = (e: ToolExecutor) => ({ name: e.name, description: e.description, parameters: (e.parameters ? { ...e.parameters } : z.toJSONSchema(e.schema)) as Record<string, unknown> });
  const specs = [...callable.values()].map(specOf);

  let mode: PermissionPreset = ctx.requestedMode;
  const policy = new PolicyContext(buildPolicy({ preset: mode, workspaceRoot: root }));
  const approvals = new PendingApprovals(deps.clocks.timers);
  const gate = new Gate({
    sessionId: ctx.sessionId, workspaceRoot: root, policy, approvals, attended: ctx.attended, presenter: deps.presenter,
    headlessPolicy: runtime.headlessPolicy, abortHook: ctx.abortRun, approvalTimeoutMs: runtime.approvalTimeoutMs,
    executors: callable, resolvePath: (p) => { try { return realPathOf(p); } catch { return null; } },
    monotonic: deps.clocks.monotonic, wall: deps.clocks.wall, timers: deps.clocks.timers,
    sink: writerSink(ctx.writer, ctx.sessionId, deps.clocks, ctx.warn), nextSequence: deps.nextSequence,
    hooks: ctx.hooks ?? null,
  });

  // ADR-0034 (Part S): the persona's MCP surface — demanded on `ready()`, after the discovery the run start kicked off, and
  // never at port creation (a server still starting must not block calls to connected ones, REQ-MCP-066/067). ONE
  // resolution: the executors, the model's listing and the prompt section come from the same surface (REQ-TOOLS-010,
  // REQ-MCP-062). ADR-0016's fail-closed reading for a tool outside the registry, first executed: no facet is declared,
  // so a rule that WITHHOLDS on a facet sees all three declared — under the `restricted` preset (a read-only preset:
  // its default decision is deny) and for a persona marked `read_only` the MCP tools are withheld from the surface
  // altogether; under `ask` the gate's default decision asks; under `autonomous` it allows — nothing here special-cases
  // the gate, which decides every dispatch as for any tool.
  const run = deps.configured?.(ctx.workspaceRoot) ?? null;
  const withhold = mode === 'restricted' || persona.readOnly;
  let mcpSection = '';
  let readiness: Promise<void> | null = null;
  const ready = (): Promise<void> => {
    if (readiness) return readiness;
    readiness = (async () => {
      if (!deps.mcp || !run) return;
      const mcp = deps.mcp;
      await mcp.prepare(run.cfg, ctx.workspaceRoot);
      const session = { sessionId: ctx.sessionId, writer: ctx.writer };
      const surface = mcp.surfaceFor(run.cfg, ctx.workspaceRoot, ctx.persona, session, new Set(callable.keys()));
      if (withhold) {
        if (surface.active.some((s) => s.tools.length > 0)) ctx.warn(`mcp: ${ctx.persona}'s MCP tools are withheld under ${mode === 'restricted' ? "the 'restricted' preset" : 'read_only'} (ADR-0016: a tool outside the registry declares no facet, so a withholding rule withholds it)`);
        mcpSection = mcp.section({ ...surface, active: surface.active.map((s) => ({ ...s, tools: [] })) });
        return;
      }
      const remove = (name: string) => { callable.delete(name); };
      for (const e of mcp.executorsFor({ cfg: run.cfg, workspaceRoot: ctx.workspaceRoot, role: ctx.persona, surface, ctx: session, remove, log: (m) => ctx.warn(m) })) {
        if (callable.has(e.name)) { ctx.warn(`mcp: the tool name '${e.name}' collides with a native tool of ${ctx.persona}; the MCP tool is not offered`); continue; }
        callable.set(e.name, e);
        specs.push(specOf(e));
      }
      mcpSection = mcp.section(surface);
    })();
    return readiness;
  };

  return {
    specs: () => specs,
    ready,
    promptSection: () => mcpSection,
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
    // REQ-MONITOR-012 / REQ-TOOLS-054/177 and REQ-CHAT-096: run stop, shutdown and host teardown release every wait
    // on a person — the approvals AND the question prompts, on the one sweep the engine already performs.
    cancelPending: () => approvals.cancelAll() + questions.cancelAll(),
    setMode: (requested, _source): ModeChange => {
      const previous = mode;
      const wanted = resolvePreset(requested).preset;
      // REQ-TOOLS-073: re-resolved through the downgrade for this run's context.
      const e = effectiveMode({ requested: wanted, attended: ctx.attended(), sandboxed: false, allowUnsandboxedAutonomous: runtime.allowUnsandboxedAutonomous });
      mode = e.effective;
      policy.replace(buildPolicy({ preset: mode, workspaceRoot: root }));
      return { requested: wanted, effective: mode, downgraded: e.downgraded, reason: e.reason, previous };
    },
    currentMode: () => mode,
    answerApproval: (requestId, option) => approvals.resolve(requestId, option),
    // Part AC — REQ-CHAT-096: routed by request id; a stale id resolves nothing here and the caller answers `false`,
    // which is what REQ-CHAT-102 turns into "the modal stays open" rather than a reported success.
    answerQuestions: (requestId, answers) => questions.resolve(requestId, answers),
    cancelQuestions: (requestId) => questions.cancel(requestId),
    pendingQuestions: () => questions.pending(),
  };
}
