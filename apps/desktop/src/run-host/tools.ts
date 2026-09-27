import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { toIsoUtc, type Clocks } from '@rotaris/kernel';
import { presetRank, resolvePreset, type ApprovalPayload, type PermissionPreset, type ToolStatus } from '@rotaris/contracts';
import {
  askQuestionsTool, buildPolicy, directWorkBundle, fetchTool, FileToolState, findShell, Gate, gitReadTool, globTool, grepTool, haetEditTool, haetReadTool, nodePtyFactory, PendingApprovals, PendingQuestions, PolicyContext, readFileTool, realPathOf,
  resolveToolSet, selectRequestedMode, TERMINAL_DEFAULTS, TerminalManager, terminalTool, TodoList, todoTool, withheldUnderPlanGate, writeFileTool, type ConfinementPort, type GateSink, type PolicyRead, type PresenterPort, type ToolExecutor,
} from '@rotaris/agent-tools';
import { BUILT_IN_PERSONAS, type ModeChange, type PersonaResolver, type PortToolCall, type PortToolResult, type RoleName, type SessionWriter, type ToolPort, type ToolPortContext } from '@rotaris/engine';
import { CODE_INTELLIGENCE_MEMORY_GATE } from '@rotaris/config';
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
  /** Shared per workspace root: the read record and the undo stacks (REQ-TOOLS-137). NOT the fence — see `executorsFor`. */
  readonly fileStates: Map<string, FileToolState>;
  /**
   * REQ-WORKSPACE-059 (ADR-0063): the cataloged skill directories for this workspace, as additional READ
   * roots. Absent in a test or a build with no skill host, which is the same as discovering none. Read per
   * port, so a rescan governs agents constructed afterwards (REQ-WORKSPACE-069) and leaves built ones alone.
   */
  readonly skillReadRoots?: ((workspaceRoot: string) => readonly string[]) | undefined;
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
  /*
   * REQ-CONFIG-468 and REQ-WORKSPACE-059: the additional read-only roots and the cataloged skill directories
   * reach the fence, which is built PER PORT from this run's configuration.
   *
   * The falsified reason, kept beside its replacement (ADR-0063's first execution, 2026-09-14): this line
   * read "the file-tool state is per workspace root and keeps the first fence it saw", which was true and
   * was read as a property of the read record. It was also `runtime.additional_read_only_roots` ceasing to
   * take effect after the first run in this process — `grep` and `glob` took the fresh fence while
   * `read_file`, `write_file` and the two `haet` tools took the stale one, so two tools in one bundle
   * disagreed about where the boundary was. The state now holds only what REQ-TOOLS-132/137 say it holds
   * (the read record and the undo stacks, shared across runs in a workspace) and the fence travels with the
   * tool. Invisible until now because the key's default is empty; the first value that differs is the skill
   * directories, which a rescan changes and which REQ-WORKSPACE-069 requires to govern agents built after it.
   */
  const fence = { workspaceRoot: root, allowOutsideWorkspace: runtime.allowOutsideWorkspace, additionalReadOnlyRoots: [...runtime.additionalReadOnlyRoots, ...(deps.skillReadRoots?.(root) ?? [])] };
  let state = deps.fileStates.get(root);
  if (!state) { state = new FileToolState(); deps.fileStates.set(root, state); }
  /*
   * REQ-MCP-116 makes the generated manifest the only place a runtime tool name is written, and this is
   * where the two are READ. The gate is the ordered pair [listing, reading]. They are handed to
   * `read_file` because its refusal for a `memory:` path names them: an agent that reached for a memory
   * through the wrong tool is told the right one, instead of a parent listing for a namespace that has
   * no parent. `packages/agent-tools` cannot import this manifest itself and must not restate it.
   */
  const memoryTools = { list: CODE_INTELLIGENCE_MEMORY_GATE[0], read: CODE_INTELLIGENCE_MEMORY_GATE[1] };
  const list: ToolExecutor[] = [
    readFileTool(state, fence, memoryTools) as ToolExecutor, writeFileTool(state, fence) as ToolExecutor, haetReadTool(state, fence) as ToolExecutor,
    haetEditTool(state, fence, 'haet_edit') as ToolExecutor, haetEditTool(state, fence, 'haet') as ToolExecutor,
    grepTool(fence) as ToolExecutor, globTool(fence) as ToolExecutor, gitReadTool(root) as ToolExecutor, todoExecutor,
    // ADR-0023: the policy is read per call from the saved files (REQ-SANDBOX-038); the gate resolved any `ask` before execution (REQ-TOOLS-091).
    fetchTool({ policy: deps.egress(root), timers: deps.clocks.timers }) as ToolExecutor,
  ];
  /*
   * ADR-0022's terminal enforcement point. REQ-SANDBOX-093: the specification is resolved AFRESH for
   * each call, from the issuing run's configuration and the conversation's actual working directory,
   * worktree-aware — which is why the port is a function of the execution root the call presents
   * rather than a value fixed when the port was built. REQ-SANDBOX-096: the commands of each live
   * run follow the setting in force when THAT run began, which this per-run closure gives.
   * REQ-SANDBOX-088: mode `off` returns null, so the shell receives exactly what was submitted.
   * REQ-SANDBOX-123: verification checks and probes come through this same point, unmodified.
   */
  const confinement: ConfinementPort = {
    resolve: (executionRoot) => {
      const c = runtime.confinement;
      if (c.mode === 'off') return null;
      return { spec: { mode: c.mode, executionRoot, writableRoots: c.writableRoots, allowNetwork: c.allowNetwork }, verdict: c.verdict ?? { available: false, backend: 'unavailable', reason: '', remediation: '' } };
    },
  };
  if (deps.terminal) list.push(terminalTool(deps.terminal, { ...TERMINAL_DEFAULTS, commandTimeoutS: runtime.shellCommandTimeoutS }, confinement) as ToolExecutor);
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
/**
 * What a tool looks like to the model: ADR-0034 gives an MCP tool its server's own input schema, and everything
 * else is the zod schema's JSON form.
 *
 * `io: 'input'` is the schema of a call about to be MADE. Zod's default is `'output'`, under which a field with a
 * `.default()` is emitted as **required** — `todo`'s `tasks` was advertised as required inside every phase while
 * the parser accepted it omitted, so the product advertised a contract it did not enforce, in the one place a
 * batch call is built. Exported so that shape can be asserted; the closure it replaced could not be.
 */
export function toolSpec(e: ToolExecutor): { name: string; description: string; parameters: Record<string, unknown> } {
  return { name: e.name, description: e.description, parameters: (e.parameters ? { ...e.parameters } : z.toJSONSchema(e.schema, { io: 'input' })) as Record<string, unknown> };
}

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
  const granted = directWork ? [...new Set([...persona.tools, ...directWorkBundle()])] : persona.tools;
  /*
   * REQ-ORCH-153 (ADR-0062), enforcement point 1 of three: the planning grants applied to the DECLARED set, so
   * one resolution still feeds both the model's listing and the callable map (REQ-TOOLS-010) — a held run is
   * offered exactly the tools it may call, rather than being shown a tool the gate would then refuse. The `single`
   * override is narrowed here on the same terms as every other role: the requirement grants it the direct-work
   * bundle above and then narrows that bundle, which is why the narrowing comes after the union and not instead
   * of it. This point only REMOVES; the dispatch check in the gate is what makes the withholding authoritative.
   */
  const planGateHeld = ctx.planGateHeld ?? (() => false);
  const declared = planGateHeld() ? granted.filter((t) => !withheldUnderPlanGate(t)) : granted;
  /*
   * REQ-ORCH-153: the names this point and the MCP one below REMOVE because the gate is held. The gate reads it to
   * tell a withheld tool apart from a name that is no tool at all — the public names it can check against the
   * registry itself, but an MCP or plugin name exists only here. Filled as the surface resolves, read live.
   */
  const withheldAtPlanGate = new Set<string>(planGateHeld() ? granted.filter((t) => withheldUnderPlanGate(t)) : []);
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
  const specs = [...callable.values()].map(toolSpec);

  /*
   * REQ-TOOLS-048 (narrowed by PD-TOOLS-002): the requested mode is SELECTED here, at agent construction, from
   * the persona's `permission_mode` pin, the session-level override a mid-session change recorded, and
   * `runtime.permission_mode` (which is what `ctx.requestedMode` carries). The pin wins over the override unless
   * the override is at least as restrictive as it — the same direction REQ-TOOLS-074 gives a live agent. The
   * selected name IS the effective one: there is no downgrade left to re-resolve.
   */
  const pin = persona.permissionMode ?? null;
  let mode: PermissionPreset = selectRequestedMode({ pin, override: ctx.modeOverride ?? null, runtime: ctx.requestedMode });
  const policy = new PolicyContext(buildPolicy({ preset: mode, workspaceRoot: root }));
  const approvals = new PendingApprovals(deps.clocks.timers);
  const gate = new Gate({
    sessionId: ctx.sessionId, workspaceRoot: root, policy, approvals, attended: ctx.attended, presenter: deps.presenter,
    headlessPolicy: runtime.headlessPolicy, abortHook: ctx.abortRun, approvalTimeoutMs: runtime.approvalTimeoutMs,
    executors: callable, resolvePath: (p) => { try { return realPathOf(p); } catch { return null; } },
    // PD-TOOLS-004: a name is the public tool's when the callable map holds the very executor `executorsFor` built
    // for it. An MCP tool offered under a free public name (a server's own `write_file` on a persona whose public
    // set lacks one) is a different object, and its session approval keeps REQ-TOOLS-024's exact match.
    publicTool: (name) => { const e = callable.get(name) ?? callable.get(name.toLowerCase()); return e !== undefined && executors.get(e.name) === e; },
    monotonic: deps.clocks.monotonic, wall: deps.clocks.wall, timers: deps.clocks.timers,
    sink: writerSink(ctx.writer, ctx.sessionId, deps.clocks, ctx.warn), nextSequence: deps.nextSequence,
    hooks: ctx.hooks ?? null,
    // REQ-ORCH-153, enforcement point 2: the authoritative one — refused whichever role issues the call and by
    // whatever route the tool reached it, including a name this port's narrowing never saw.
    planGateHeld,
    planGateWithheldNames: () => withheldAtPlanGate,
    // PD-TOOLS-006: the live write-scope claims, bound to this port's agent by the engine.
    ...(ctx.writeClaimFor ? { writeClaimFor: ctx.writeClaimFor } : {}),
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
        // REQ-ORCH-153: an MCP tool carries no declaration, so the fail-closed predicate withholds it while the
        // gate is held (ADR-0016's reading, the same one `restricted` and `read_only` already take above). The
        // gate's dispatch check would refuse it anyway; removing it here keeps the listing honest.
        if (planGateHeld() && withheldUnderPlanGate(e.name)) { withheldAtPlanGate.add(e.name); ctx.warn(`mcp: '${e.name}' is withheld while this run is held at the plan gate (REQ-ORCH-153)`); continue; }
        if (callable.has(e.name)) { ctx.warn(`mcp: the tool name '${e.name}' collides with a native tool of ${ctx.persona}; the MCP tool is not offered`); continue; }
        callable.set(e.name, e);
        specs.push(toolSpec(e));
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
      // REQ-TOOLS-074: a session-wide change reaches a PINNED agent only when it is at least as restrictive as
      // the pin (REQ-TOOLS-047's order). A change that would loosen this agent leaves it deciding under its pin,
      // and names the persona so the run can list it in `skipped_personas`, the log line and the confirmation.
      if (pin !== null && presetRank(wanted) > presetRank(pin)) {
        return { requested: wanted, effective: previous, downgraded: false, reason: '', previous, skippedPersona: ctx.persona };
      }
      // PD-TOOLS-002: the requested mode always applies — no re-resolution through attendedness, confinement or the opt-in.
      mode = wanted;
      policy.replace(buildPolicy({ preset: mode, workspaceRoot: root }));
      return { requested: wanted, effective: mode, downgraded: false, reason: '', previous };
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
