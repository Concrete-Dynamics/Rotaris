import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { toIsoUtc, type Clocks } from '@rotaris/kernel';
import { presetRank, resolvePreset, restrictionsAllow, type ApprovalPayload, type PermissionPreset, type ToolStatus } from '@rotaris/contracts';
import {
  askQuestionsTool, buildPolicy, directWorkBundle, fetchTool, FileToolState, findShell, Gate, gitReadTool, globTool, grepTool, haetEditTool, haetReadTool, nodePtyFactory, PendingApprovals, PendingQuestions, PolicyContext, readFileTool, realPathOf,
  resolveToolSet, selectRequestedMode, TERMINAL_DEFAULTS, TerminalManager, terminalTool, TodoList, todoTool, withheldUnderPlanGate, writeFileTool, type BackgroundAttribution, type BackgroundSession, type ConfinementPort, type GateSink, type PolicyRead, type PresenterPort, type ToolExecutor,
} from '@rotaris/agent-tools';
import { BUILT_IN_PERSONAS, EMPTY_MCP_EVIDENCE, toolRestrictionsFor, type AgentGrant, type ModeChange, type PersonaResolver, type PortToolCall, type PortToolResult, type RoleName, type SessionWriter, type ToolPort, type ToolPortContext } from '@rotaris/engine';
import { CODE_INTELLIGENCE_MEMORY_GATE } from '@rotaris/config';
import type { ConfiguredRun, RuntimeFromConfiguration } from './configuration.js';
import { configurationForExecutionRoot, grantEvidence, type McpHost } from './mcp.js';
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

/**
 * ADR-0019: the run host's side of the presenter channel. It posts a present-request and awaits main's `approval.shown`.
 * Main must acknowledge within `shownBoundMs`, either by showing the dialog or, when a dialog is already open in its
 * window, with `approval.queued` (REQ-TOOLS-063: shown one at a time, the next as soon as the open one closes). A queued
 * request is then awaited without a bound, because a person's reading of the open dialog is not a presenter fault. The
 * gate's own wait ends it if it times out or is cancelled while queued, and `close` releases it.
 */
export class RunHostPresenter implements PresenterPort {
  private readonly waiters = new Map<string, { readonly settle: (r: { ok: true } | { ok: false; error: string }) => void; readonly bound: { cancel(): void } }>();
  constructor(private readonly deps: { readonly post: (payload: ApprovalPayload) => void; readonly close: (requestId: string) => void; readonly clocks: Clocks; readonly shownBoundMs: number }) {}
  present(payload: ApprovalPayload): Promise<{ ok: true } | { ok: false; error: string }> {
    return new Promise((resolve) => {
      const bound = this.deps.clocks.timers.after(this.deps.shownBoundMs as never, () => {
        this.waiters.delete(payload.request_id);
        resolve({ ok: false, error: `main did not confirm the dialog within ${this.deps.shownBoundMs} ms` });
      });
      this.waiters.set(payload.request_id, { settle: (r) => { bound.cancel(); resolve(r); }, bound });
      this.deps.post(payload);
    });
  }
  /** REQ-TOOLS-063: main queued the request behind its open dialog; the bound no longer applies. */
  queued(requestId: string): boolean {
    const w = this.waiters.get(requestId);
    if (!w) return false;
    w.bound.cancel();
    return true;
  }
  shown(requestId: string, ok: boolean, error?: string): boolean {
    const w = this.waiters.get(requestId);
    if (!w) return false;
    this.waiters.delete(requestId);
    w.settle(ok ? { ok: true } : { ok: false, error: error ?? 'the dialog could not be shown' });
    return true;
  }
  close(requestId: string): void {
    // A request closed while still queued is never shown; its waiter is released so nothing is left behind.
    const w = this.waiters.get(requestId);
    if (w) { this.waiters.delete(requestId); w.settle({ ok: false, error: 'the request was closed before it was shown' }); }
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
  /**
   * PD-ORCH-005 clause 9: the application's quit has closed its last window and its shutdown is still to come. What an
   * agent asks of a person meanwhile — an approval or a question — waits, unshown, for the quit to withdraw it, and no
   * budget expires on it. Absent in a test that never quits.
   */
  readonly quitting?: (() => boolean) | undefined;
}

/** REQ-TOOLS-104/106: the backend by presence alone; the PTY factory loaded once. Null when no shell exists on the host. */
export async function terminalManagerFromHost(clocks: Clocks, warn: (m: string) => void, shellCommandTimeoutS: number): Promise<TerminalManager | null> {
  const backend = findShell();
  if (!backend) return null;
  const env = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'));
  return new TerminalManager({ factory: await nodePtyFactory(), backend, clocks, config: { ...TERMINAL_DEFAULTS, commandTimeoutS: shellCommandTimeoutS }, env, warn });
}

/**
 * The sink the gate writes through: every unit lands in the session writer's transactions — until `close`.
 *
 * REQ-SESSION-094: the writer outlives the run (a continue in this process writes through the same one), so a call the
 * stop's grace detached, returning after its run ended, would write its settle, `tool.finish` and issues into the
 * finished session, or into a later run of it. `close` settles each call still open, as failed with the engine's
 * statement, before the run's terminal pair, and drops every write after it. The repair of
 * `a-detached-call-still-writes-through-its-tool-gate.md`.
 */
function writerSink(writer: SessionWriter, sessionId: string, clocks: Clocks, warn: (m: string) => void): { readonly sink: GateSink; readonly close: (cutOff: string) => void; readonly closed: () => boolean } {
  let closed = false;
  const open = new Map<number, { readonly call: Parameters<GateSink['toolOpen']>[0]; readonly started: number }>();
  const sink: GateSink = {
    decision: (e) => { if (closed) return null; const r = writer.recordDecision({ timestamp: toIsoUtc(clocks.wall.instant()), session_id: sessionId, ...e }); return r.ok ? r.value : null; },
    approvalRequested: (p) => { if (!closed) writer.recordEvent('approval.requested', p); },
    pendingChanged: (pending) => { if (!closed) writer.save(writer.currentStatus, { pending_approvals: JSON.stringify(pending) }); },
    issue: (i) => { if (!closed) writer.recordIssue(i); },
    timeline: (name, actor, message, metadata) => { if (!closed) writer.appendTimeline(name, actor, message, metadata); },
    toolOpen: (o) => {
      if (closed) return null;
      const r = writer.openToolCall(o);
      if (!r.ok) return null;
      open.set(r.value, { call: o, started: clocks.monotonic.now() });
      return r.value;
    },
    toolSettle: (ordinal, o, s) => { if (closed) return; open.delete(ordinal); writer.settleToolCall(ordinal, o, s); },
    warn,
  };
  const close = (cutOff: string): void => {
    if (closed) return;
    closed = true;
    for (const [ordinal, { call, started }] of open) writer.settleToolCall(ordinal, call, { status: 'failed', elapsed_ms: clocks.monotonic.now() - started, is_error: true, result: cutOff });
    open.clear();
  };
  return { sink, close, closed: () => closed };
}

/**
 * PD-ORCH-005 clause 10: each background session an agent starts is that agent's (its task id), recorded when it
 * starts and when it ends by itself — its own exit, its timeout, or the agent's kill. An end a rest records first is
 * kept: the record takes one end.
 */
function backgroundAttribution(writer: SessionWriter, sessionId: string, taskId: string): BackgroundAttribution {
  const record = (s: BackgroundSession): void => { writer.recordAgentTerminal({ terminal_id: s.id, task_id: taskId, command: s.command, started_at: s.startedAt, state: s.status, exit_code: s.exitCode, output_tail: s.tail() }); };
  return { owner: { sessionId, taskId }, onStarted: record, onEnded: record };
}

/** The executors this build registers (decision 3 of the plan, plus `fetch` since Part N); the registry removes any other declared name (REQ-TOOLS-004). */
function executorsFor(root: string, deps: ToolPortDeps, runtime: RuntimeFromConfiguration, todoExecutor: ToolExecutor, attribution?: BackgroundAttribution): Map<string, ToolExecutor> {
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
  if (deps.terminal) list.push(terminalTool(deps.terminal, { ...TERMINAL_DEFAULTS, commandTimeoutS: runtime.shellCommandTimeoutS }, confinement, attribution) as ToolExecutor);
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
  // them (ADR-0021's note, defect fifty-two). The key had a minimum of 1 and no stated maximum until OQ-55 closed on
  // 2026-09-11: REQ-CONFIG-116 gives it a range of 1–64, which the loader enforces, and ADR-0021's obligation 2 is
  // discharged with it.
  const shellLimits = deps.configured?.(ctx.workspaceRoot)?.cfg.runtime;
  if (deps.terminal && shellLimits) deps.terminal.setBackgroundLimits({ maxSessions: shellLimits.shell_max_background_sessions, timeoutS: shellLimits.shell_background_timeout });
  const executors = executorsFor(root, deps, runtime, watchedTodo, ctx.parentId === undefined ? undefined : backgroundAttribution(ctx.writer, ctx.sessionId, ctx.parentId));
  // ADR-0036: the configured persona over the built-in table; the built-in table alone when no configuration resolved.
  const resolver = deps.personas(ctx.workspaceRoot);
  const persona = resolver?.resolve(ctx.persona)?.persona ?? BUILT_IN_PERSONAS[ctx.persona as RoleName] ?? BUILT_IN_PERSONAS.orchestrator;
  /*
   * REQ-TOOLS-006 (4) with REQ-CONFIG-103, under OQ-145's reading, confirmed 2026-10-06 by R-071: the allowed-tool lists binding this agent — the entry
   * its own persona's `tool_restrictions` gives its name, and the entry the delegating persona's map gives it. The reason
   * no restriction ever narrowed a grant, kept beside its replacement (acceptance finding A4, R-067): this call passed the
   * persona's name, tools, `coordinator_only` and `read_only`, and never its map.
   */
  const parentAgentPersona = ctx.parentPersona === undefined ? null : resolver?.resolve(ctx.parentPersona)?.persona ?? BUILT_IN_PERSONAS[ctx.parentPersona as RoleName] ?? null;
  const restrictions = toolRestrictionsFor(persona, parentAgentPersona);
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
  const quitting = (): boolean => deps.quitting?.() === true;
  const questions = new PendingQuestions(deps.clocks.timers, { held: quitting });
  const conversationId = ctx.parentId ?? 'root';
  executors.set('ask_questions', askQuestionsTool({
    pending: questions, conversationId, agentId: ctx.agentName, timeoutMs: runtime.approvalTimeoutMs,
    publish: () => {
      // PD-ORCH-005 clause 9 with PD-CHAT-002 revision 2: a prompt put while the quit is under way is held for the quit to
      // withdraw — published to the record, never discarded as unshowable (REQ-CHAT-094's cancellation).
      if (!ctx.attended() && !quitting()) return false;
      return ctx.writer.save(ctx.writer.currentStatus).ok;
    },
  }) as ToolExecutor);
  // ONE resolution feeds the prompt listing and the callable set (REQ-TOOLS-010).
  // `canPublishArtifacts` is the persona's `can_publish_artifacts` (REQ-CONFIG-106) where a store exists: a declared
  // `artifact_write` is handed over only while the flag is true (REQ-TOOLS-150), and is otherwise removed and recorded as
  // `artifact_publish_not_granted` (REQ-TOOLS-004). OQ-212, ruled 2026-10-07 under R-072, keeps every built-in role's flag
  // false. The reason this stood on before, falsified by REQ-CONFIG-106 and REQ-TOOLS-004 and kept here: ~~"follows the
  // store's presence: REQ-TOOLS-004 reserves `artifact_publish_not_granted` for a build that withholds publishing
  // separately, and no requirement in this part names such a grant — a persona that must not publish declares no
  // `artifact_write` (REQ-TOOLS-002). Recorded as a decision taken."~~
  // (docs/defects/fixed/can-publish-artifacts-is-read-and-never-gates-artifact-write.md)
  const resolved = resolveToolSet({ name: ctx.persona, tools: declared, coordinatorOnly: persona.coordinatorOnly && delegationAvailable && !directWork, readOnly: persona.readOnly, toolRestrictions: restrictions }, {}, {
    // Part AC: `userPromptChannel` is attendedness (REQ-TOOLS-053/069) — an unattended run has no surface to put a
    // prompt in front of, so the registry removes `ask_questions` with `user_prompt_channel_absent`. It stood at a
    // literal `false` until this part, because there was no executor for it to be true of.
    delegationRuntime: delegationAvailable, userPromptChannel: ctx.attended(), artifactStore: artifacts !== undefined, canPublishArtifacts: artifacts !== undefined && persona.canPublishArtifacts, terminalBackend: executors.has('terminal'), executors: new Set(executors.keys()),
  }, isEntry);
  /*
   * REQ-TOOLS-006: "every removal is logged together with the persona and the control that removed it", at no level the
   * requirement names. A narrowing control's removal (the run's allow-list, `coordinator_only`, `read_only`,
   * `tool_restrictions`) is the configuration doing what it says — every coordinated run removes the orchestrator's four
   * write and command tools — so it is `info`: PD-MONITOR-002's default threshold keeps it in the application log, and the
   * session log's default `WARNING` (REQ-SESSION-142) leaves it out. Until live-run finding L14 it was a warning, four
   * per coordinated run, and the only warnings most sessions carried. A REQ-TOOLS-004 prerequisite's removal is a
   * declared tool this run cannot provide ("degrade availability") and stays a warning.
   */
  const logInfo = ctx.info ?? ctx.warn;
  for (const r of resolved.removals) (r.control === 'prerequisite' ? ctx.warn : logInfo)(`tool '${r.tool}' removed from ${ctx.persona} by ${r.control}${r.reason ? ` (${r.reason})` : ''} (REQ-TOOLS-004/006)`);
  const callable = new Map<string, ToolExecutor>();
  for (const n of resolved.tools) { const e = executors.get(n); if (e) callable.set(n, e); }
  const specs = [...callable.values()].map(toolSpec);
  // REQ-MONITOR-060/061 (live-run finding K1): the native tools the one resolution kept AND that hold an executor — the
  // names the agent can call, before the MCP surface joins the callable map on `ready()` (those are shown per server).
  const nativeResolved = [...callable.keys()];

  /*
   * REQ-TOOLS-048 (narrowed by PD-TOOLS-002): the requested mode is SELECTED here, at agent construction, from
   * the persona's `permission_mode` pin, the session-level override a mid-session change recorded, and
   * `runtime.permission_mode` (which is what `ctx.requestedMode` carries). The pin wins over the override unless
   * the override is at least as restrictive as it — the same direction REQ-TOOLS-074 gives a live agent. The
   * selected name IS the effective one: there is no downgrade left to re-resolve.
   */
  /*
   * OQ-213 as ruled (R-072), REQ-ORCH-029's todo clause: the entry agent's gate refuses the call that would start its task's
   * second work item while it keeps no todo list of its own — only where the one resolution left it `todo`, so the list can
   * be written. Without the tool the check refuses nothing and the run says so once. The engine supplies the context's check
   * at depth 0 alone; whether the run coordinates, and whether a list is owed, are the run's to answer, read live.
   */
  const todoList = isEntry && ctx.todoList !== undefined
    ? (callable.has('todo') ? { directWork, owed: ctx.todoList.owed, started: ctx.todoList.started } : (ctx.todoList.unavailable(), undefined))
    : undefined;
  const pin = persona.permissionMode ?? null;
  let mode: PermissionPreset = selectRequestedMode({ pin, override: ctx.modeOverride ?? null, runtime: ctx.requestedMode });
  const policy = new PolicyContext(buildPolicy({ preset: mode, workspaceRoot: root }));
  const approvals = new PendingApprovals(deps.clocks.timers, { held: quitting });
  const writes = writerSink(ctx.writer, ctx.sessionId, deps.clocks, ctx.warn);
  const toolHooks = ctx.hooks ?? null;
  const gate = new Gate({
    sessionId: ctx.sessionId, workspaceRoot: root, policy, approvals, attended: ctx.attended, presenter: deps.presenter, quitting,
    headlessPolicy: runtime.headlessPolicy, abortHook: ctx.abortRun, approvalTimeoutMs: runtime.approvalTimeoutMs,
    executors: callable, resolvePath: (p) => { try { return realPathOf(p); } catch { return null; } },
    // PD-TOOLS-004: a name is the public tool's when the callable map holds the very executor `executorsFor` built
    // for it. An MCP tool offered under a free public name (a server's own `write_file` on a persona whose public
    // set lacks one) is a different object, and its session approval keeps REQ-TOOLS-024's exact match.
    publicTool: (name) => { const e = callable.get(name) ?? callable.get(name.toLowerCase()); return e !== undefined && executors.get(e.name) === e; },
    monotonic: deps.clocks.monotonic, wall: deps.clocks.wall, timers: deps.clocks.timers,
    sink: writes.sink, nextSequence: deps.nextSequence,
    // REQ-SESSION-094: a call that returns after its run ended fires no `post_tool` hook — the run's hooks write into its
    // session, and the run has removed its own attachment (REQ-HOOKS-087).
    hooks: toolHooks ? { preTool: (c) => toolHooks.preTool(c), postTool: (c) => (writes.closed() ? Promise.resolve({ feedback: '' }) : toolHooks.postTool(c)) } : null,
    // REQ-ORCH-153, enforcement point 2: the authoritative one — refused whichever role issues the call and by
    // whatever route the tool reached it, including a name this port's narrowing never saw.
    planGateHeld,
    planGateWithheldNames: () => withheldAtPlanGate,
    // PD-TOOLS-006: the live write-scope claims, bound to this port's agent by the engine.
    ...(ctx.writeClaimFor ? { writeClaimFor: ctx.writeClaimFor } : {}),
    // OQ-213: the entry agent's todo-list check (above).
    ...(todoList ? { todoList } : {}),
    // PD-TOOLS-005: the run's away holder — the engine's one object per run, so a child's gate reads what the root's marked.
    ...(ctx.presence ? { presence: ctx.presence } : {}),
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
  /*
   * REQ-MCP-034's isolated-run clause: a run in an isolated working tree launches its servers against that tree's root. The
   * configuration is LOOKED UP by the anchoring workspace (it is loaded there) and handed on as the execution root's view;
   * discovery and the surface are memoised per that root, so a base-tree run's memo is never reused for a worktree. The
   * executors take the execution root too: their only use of it is REQ-MCP-070's `lsp_init` root, which names the tree
   * since `PD-MCP-002` (OQ-194, ruled 2026-10-06). The reading it replaces, kept beside it: "The executors keep
   * `ctx.workspaceRoot`: their only use of it is REQ-MCP-070's `lsp_init` root, which names the workspace root (OQ-194's
   * literal reading)." Until 2026-10-03 all three calls read the loaded configuration and the anchoring root.
   */
  const mcpRoot = ctx.effectiveRoot ?? ctx.workspaceRoot;
  const withhold = mode === 'restricted' || persona.readOnly;
  let mcpSection = '';
  /*
   * REQ-MCP-065 with REQ-TOOLS-006: the grant this port puts in force, set once `ready()` has resolved its surface — the
   * native tools the one resolution kept and, per carried server, the tools that joined the callable map. A child's row
   * records it (`ChildLedger.recordGrant`); the persona's declared set was recorded at spawn until 2026-10-01.
   */
  let grant: AgentGrant | null = null;
  let readiness: Promise<void> | null = null;
  const ready = (): Promise<void> => {
    if (readiness) return readiness;
    readiness = (async () => {
      if (!deps.mcp || !run) { grant = { tools: nativeResolved, mcp: EMPTY_MCP_EVIDENCE }; return; }
      const mcp = deps.mcp;
      const cfg = configurationForExecutionRoot(run.cfg, mcpRoot);
      await mcp.prepare(cfg, mcpRoot);
      const session = { sessionId: ctx.sessionId, writer: ctx.writer };
      const offered = mcp.surfaceFor(cfg, mcpRoot, ctx.persona, session, new Set(callable.keys()));
      if (withhold) {
        if (offered.active.some((s) => s.tools.length > 0)) ctx.warn(`mcp: ${ctx.persona}'s MCP tools are withheld under ${mode === 'restricted' ? "the 'restricted' preset" : 'read_only'} (ADR-0016: a tool outside the registry declares no facet, so a withholding rule withholds it)`);
        mcpSection = mcp.section({ ...offered, active: offered.active.map((s) => ({ ...s, tools: [] })) });
        // Every carried server is listed with its fate, and none grants a tool (REQ-MCP-114).
        grant = { tools: nativeResolved, mcp: grantEvidence(offered, () => false) };
        return;
      }
      // REQ-TOOLS-006 (4), OQ-145: an allowed-tool list is closed — a server's tool it does not name is withheld, as a
      // withholding rule withholds a tool outside the registry (ADR-0016), and logged with the control like a native one.
      // It is taken off the SURFACE, so the executors and the prompt section both come from what is left and a printed
      // name stays callable (REQ-MCP-062) — until 2026-09-29 it was skipped only in the executor loop, and the section
      // still printed it.
      const surface = {
        ...offered,
        active: offered.active.map((s) => ({
          ...s,
          tools: s.tools.filter((t) => {
            if (restrictionsAllow(restrictions, t.callable)) return true;
            logInfo(`tool '${t.callable}' removed from ${ctx.persona} by tool_restrictions (REQ-TOOLS-004/006)`);
            return false;
          }),
        })),
      };
      const remove = (name: string) => { callable.delete(name); };
      const joined = new Set<string>();
      for (const e of mcp.executorsFor({ cfg, workspaceRoot: mcpRoot, role: ctx.persona, surface, ctx: session, remove, log: (m) => ctx.warn(m) })) {
        // REQ-ORCH-153: an MCP tool carries no declaration, so the fail-closed predicate withholds it while the
        // gate is held (ADR-0016's reading, the same one `restricted` and `read_only` already take above). The
        // gate's dispatch check would refuse it anyway; removing it here keeps the listing honest. Every executor
        // this loop sees is a server's, and the predicate is told so: asked about the NAME alone it let a server's
        // tool offered under a public read-only name (`read_file`, on a persona whose public set lacks one) through
        // the hold until 2026-09-28.
        if (planGateHeld() && withheldUnderPlanGate(e.name, false)) { withheldAtPlanGate.add(e.name); ctx.warn(`mcp: '${e.name}' is withheld while this run is held at the plan gate (REQ-ORCH-153)`); continue; }
        if (callable.has(e.name)) { ctx.warn(`mcp: the tool name '${e.name}' collides with a native tool of ${ctx.persona}; the MCP tool is not offered`); continue; }
        callable.set(e.name, e);
        joined.add(e.name);
        specs.push(toolSpec(e));
      }
      /*
       * REQ-MCP-062: "a printed name SHALL be callable". The section and the grant are drawn from the surface narrowed to the
       * tools that joined the callable map, so what the loop above withheld — at the plan gate (REQ-ORCH-153), for a
       * collision with a native name — is neither printed nor granted. Until 2026-10-01 the section was rendered from
       * `surface`, which still held them, and printed names the agent could not call
       * (`docs/defects/fixed/an-mcp-tool-withheld-at-the-plan-gate-is-still-printed-in-the-prompt.md`). The hold is read when the
       * port is built and its readiness resolved once; approval launches a new run, whose ports are built with the gate
       * released, so the approved segment prints and calls the tool (traced in `run/plan-gate.test.ts`).
       */
      const callableSurface = { ...surface, active: surface.active.map((s) => ({ ...s, tools: s.tools.filter((t) => joined.has(t.callable)) })) };
      mcpSection = mcp.section(callableSurface);
      grant = { tools: nativeResolved, mcp: grantEvidence(callableSurface) };
    })();
    return readiness;
  };

  return {
    specs: () => specs,
    // REQ-MONITOR-060/061 (live-run finding K1): the native callable set — what the inspector shows.
    resolvedTools: () => nativeResolved,
    // REQ-MCP-065 / REQ-TOOLS-006: the grant in force, null until `ready()` has resolved.
    grant: () => grant,
    ready,
    promptSection: () => mcpSection,
    dispatch: async (call: PortToolCall, signal): Promise<PortToolResult> => {
      const r = await gate.dispatch({ callId: call.callId, name: call.name, rawArgs: call.rawArgs, persona: call.persona, agentId: call.agentId, agentName: call.agentName }, signal);
      const status: Exclude<ToolStatus, 'running'> = r.status;
      return {
        text: r.text, isError: r.isError, status, durationMs: r.durationMs, label: r.label, args: r.args,
        ...(r.interrupted === true ? { interrupted: true } : {}),
        ...(r.observation?.diff === undefined ? {} : { diff: r.observation.diff }),
        ...(r.status === 'blocked' ? { blockedReason: r.blockedReason ?? r.decision?.reason ?? '' } : {}),
        ...(r.followUp === undefined ? {} : { followUp: r.followUp }),
      };
    },
    // REQ-MONITOR-012 / REQ-TOOLS-054/177 and REQ-CHAT-096: run stop, shutdown and host teardown release every wait
    // on a person — the approvals AND the question prompts, on the one sweep the engine already performs.
    cancelPending: () => approvals.cancelAll() + questions.cancelAll(),
    // PD-ORCH-005 clause 9: a rest withdraws both — each waiting call settles as interrupted and never run, never denied.
    withdrawPending: (cause) => approvals.withdrawAll(cause) + questions.withdrawAll(cause),
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
    // REQ-SESSION-094: the run has ended; what this port's gate still has open settles now, and nothing more is written.
    close: (cutOff) => writes.close(cutOff),
  };
}
