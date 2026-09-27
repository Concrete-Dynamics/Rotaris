import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { MonotonicClock, Timers, WallClock } from '@rotaris/kernel';
import { APPROVAL_RESOLUTION_SOURCES, denialText, type ApprovalPayload, type HeadlessPolicy, type ToolStatus } from '@rotaris/contracts';
import type { ApprovalOutcome, PendingApprovals, PresenterPort } from './approvals.js';
import { argumentSummary, permissionRequest, requestSummary, type DecisionRecord, type PermissionRequest, type PolicyContext } from './policy.js';
import { canonicalToolName, isPublicToolName, META_TOOL_NAMES } from './registry.js';
import { planGateRefusal, withheldUnderPlanGate } from './planning-grants.js';
import { checkFence } from './tools/fence.js';
import { fencedByWriteScope, writeScopeRefusal, type WriteClaimHolder } from './write-scope.js';
import type { Observation, ToolExecutor } from './tools/types.js';

/**
 * ADR-0017 / REQ-TOOLS-011: the ONE gate. Every dispatch — built-in, plugin, MCP — comes through
 * `dispatch`, in REQ-TOOLS-175's order: the payload repaired and validated (REQ-TOOLS-032), the
 * permission resolved (never raises), an `ask` brokered to the approval flow or the headless policy
 * (ADR-0019), the decision audited whatever it was (REQ-TOOLS-027), the pre-execution hooks (ADR-0015:
 * only a permitted call reaches them, REQ-HOOKS-004/068), execution, the post-execution hooks, the
 * observation settled into the evidence record with its diagnostics issues (REQ-SESSION-136).
 * A deny returns REQ-TOOLS-013's exact text with the original call id and never aborts the run.
 *
 * The gate knows nothing of the store: `GateSink` is the seam the engine fills with the session writer.
 */
export interface ToolCall {
  readonly callId: string;
  readonly name: string;
  /** As the model produced it — a string of JSON, or an already-parsed object. */
  readonly rawArgs: string | Readonly<Record<string, unknown>> | null;
  readonly persona: string;
  readonly agentId: string;
  readonly agentName: string;
}

/**
 * ADR-0015's two slots as the gate sees them: structurally identical to the engine's `ToolHookBridge`,
 * filled at the run-host root with the same object. Only `preTool` can stop a call (REQ-HOOKS-047).
 */
export interface ToolHookCall {
  readonly toolName: string;
  readonly facetText: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly command: string;
  readonly results?: readonly { readonly kind: 'observation' | 'error'; readonly text: string }[];
}
export interface ToolHooks {
  preTool(call: ToolHookCall): Promise<{ readonly blocked: boolean; readonly refusal: string }>;
  postTool(call: ToolHookCall): Promise<{ readonly feedback: string }>;
}

/** REQ-HOOKS-029: the facet a hook matcher is compared against — the same one the policy matches on. */
export function hookFacet(toolName: string, args: Readonly<Record<string, unknown>>): string {
  if (toolName === 'terminal' && typeof args['command'] === 'string') return args['command'] as string;
  if (typeof args['operation'] === 'string') return args['operation'] as string;
  return '';
}

export interface ToolResult {
  readonly callId: string;
  readonly name: string;
  /** Model-visible text. */
  readonly text: string;
  readonly isError: boolean;
  readonly status: Exclude<ToolStatus, 'running'>;
  readonly durationMs: number;
  readonly decision: DecisionRecord | null;
  readonly observation: Observation | null;
  /** The repaired, validated arguments (empty when the payload could not be read). */
  readonly args: Readonly<Record<string, unknown>>;
  readonly label: string;
  /** The reason a `blocked` row shows: the policy's, or a pre_tool hook's refusal (REQ-HOOKS-071). */
  readonly blockedReason?: string;
  /** REQ-HOOKS-074: post_tool feedback for a call that produced no observation. */
  readonly followUp?: string;
}

export interface GateSink {
  /** ADR-0024: the audit entry; returns its ordinal (the entry identifier) or null when recording failed. */
  decision(entry: { agent_id: string; persona: string; tool_name: string; decision: string; rule_id: string; source: string; summary: string; reason: string; request_id?: string }): number | null;
  approvalRequested(payload: { request_id: string; agent_name: string; persona: string; tool_name: string; rule_id: string; summary: string; resolver: 'brokered' | 'headless'; timeout_seconds: number | null; unattended_reason: string }): void;
  /** REQ-TOOLS-060: the mirror into session state. */
  pendingChanged(pending: readonly ApprovalPayload[]): void;
  issue(input: { kind: string; severity: 'warning' | 'error'; actor: string; message: string; evidence_ref: string; metadata: Record<string, unknown> }): void;
  timeline(name: string, actor: string, message: string, metadata: Record<string, unknown>): void;
  toolOpen(open: { call_id: string; agent_name: string; tool_name: string; args: Readonly<Record<string, unknown>> }): number | null;
  toolSettle(ordinal: number, open: { call_id: string; agent_name: string; tool_name: string; args: Readonly<Record<string, unknown>> }, settle: { status: Exclude<ToolStatus, 'running'>; elapsed_ms: number; is_error: boolean; result: string; error?: string | null; outcome_kind?: string; exit_code?: number | null; failure_kind?: string | null; warnings?: readonly string[] }): void;
  warn(message: string): void;
}

export interface GateDeps {
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly policy: PolicyContext;
  readonly approvals: PendingApprovals;
  readonly attended: () => boolean;
  readonly presenter: PresenterPort | null;
  readonly headlessPolicy: HeadlessPolicy;
  /** REQ-TOOLS-065: the session's registered abort hook, when any. */
  readonly abortHook: (() => void) | null;
  /** Milliseconds; 0 = wait without limit (REQ-TOOLS-055). */
  readonly approvalTimeoutMs: number;
  readonly executors: ReadonlyMap<string, ToolExecutor>;
  readonly resolvePath: (p: string) => string | null;
  readonly monotonic: MonotonicClock;
  readonly wall: WallClock;
  readonly timers: Timers;
  readonly sink: GateSink;
  /** ADR-0019: the monotonic presentation sequence, run-host-wide. */
  readonly nextSequence: () => number;
  readonly newRequestId?: () => string;
  /** ADR-0015: absent or null means no hook exists for the session (REQ-HOOKS-069/070). */
  readonly hooks?: ToolHooks | null | undefined;
  /**
   * REQ-ORCH-153 (ADR-0062): whether the run this gate serves is held at the plan gate, read LIVE at each
   * dispatch. Absent means no gate can hold it. A function rather than a flag because the hold is a property of
   * the RUN, and a port built while it held must stop refusing the moment the run's own state says so.
   */
  readonly planGateHeld?: (() => boolean) | undefined;
  /**
   * REQ-ORCH-153: the names this port removed BECAUSE the gate is held — the MCP and plugin tools that carry no
   * declaration and so are withheld by the fail-closed predicate. Read LIVE, because an MCP surface resolves after
   * the port is built. It exists to tell a withheld name apart from one that was never a tool at all; see the
   * dispatch check for why that distinction is worth a dependency.
   */
  readonly planGateWithheldNames?: (() => ReadonlySet<string>) | undefined;
  /**
   * PD-TOOLS-006: the live write-scope claim, if any, that refuses THIS port's agent a write to a workspace-relative
   * POSIX path. Read at each dispatch of `write_file` and `haet_edit`; absent means no claim can reach this agent.
   */
  readonly writeClaimFor?: ((rel: string) => WriteClaimHolder | null) | undefined;
}

/** REQ-TOOLS-032's first repair: close the strings, objects and arrays still open at the cut. */
export function completeTruncatedJson(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  let out = text;
  if (inString) out += '"';
  // a dangling `"key":` or a trailing comma cannot be completed as a value; drop back to the last complete member
  out = out.replace(/,\s*$/, '').replace(/("(?:[^"\\]|\\.)*")\s*:\s*$/, '');
  out = out.replace(/,\s*$/, '');
  while (stack.length > 0) out += stack.pop();
  return out;
}

const ARRAY_FIELDS = ['tasks', 'phases', 'files', 'items', 'test_cases'] as const;

/** REQ-TOOLS-032: the three repairs, before schema validation. Null when nothing readable remains. */
export function repairPayload(raw: string | Readonly<Record<string, unknown>> | null, isCompletion: boolean): Record<string, unknown> | null {
  let obj: unknown = null;
  if (raw === null) return {};
  if (typeof raw !== 'string') obj = raw;
  else {
    try {
      obj = JSON.parse(raw);
    } catch {
      try {
        obj = JSON.parse(completeTruncatedJson(raw));
      } catch {
        if (isCompletion) return { message: raw.replace(/^\s*\{\s*"message"\s*:\s*"?/, '').replace(/"?\s*\}?\s*$/, '') };
        return null;
      }
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const o = { ...(obj as Record<string, unknown>) };
  for (const f of ARRAY_FIELDS) if (o[f] !== undefined && !Array.isArray(o[f]) && typeof o[f] === 'object' && o[f] !== null) o[f] = [o[f]];
  return o;
}

function defaultLabel(name: string, args: Readonly<Record<string, unknown>>): string {
  const cmd = args['command'];
  if (typeof cmd === 'string') return `${name}: $ ${cmd}`;
  const path = args['path'] ?? args['file_path'] ?? args['pattern'] ?? args['url'];
  return typeof path === 'string' ? `${name} ${path}` : `${name}(${Object.keys(args).sort().join(', ')})`;
}

export class Gate {
  constructor(private readonly deps: GateDeps) {}

  async dispatch(call: ToolCall, signal: AbortSignal): Promise<ToolResult> {
    const { deps } = this;
    const started = deps.monotonic.now();
    const executor = deps.executors.get(call.name) ?? deps.executors.get(call.name.toLowerCase());
    const isMeta = META_TOOL_NAMES.has(call.name.toLowerCase());
    const repaired = repairPayload(call.rawArgs, isMeta);
    const argsForGate: Readonly<Record<string, unknown>> = repaired ?? {};
    const open = { call_id: call.callId, agent_name: call.agentName, tool_name: call.name, args: argsForGate };
    const label = executor?.label?.(argsForGate) ?? defaultLabel(call.name, argsForGate);
    // The evidence record is opened first: tool.start precedes everything else naming this call (REQ-EVENTS-076).
    const ordinal = deps.sink.toolOpen(open);
    const finish = (r: Omit<ToolResult, 'durationMs' | 'callId' | 'name' | 'args' | 'label'>, extra: { outcome_kind?: string; exit_code?: number | null; failure_kind?: string | null; warnings?: readonly string[]; error?: string | null } = {}): ToolResult => {
      const durationMs = deps.monotonic.now() - started;
      if (ordinal !== null) deps.sink.toolSettle(ordinal, open, { status: r.status, elapsed_ms: durationMs, is_error: r.isError, result: r.text, ...extra });
      return { ...r, callId: call.callId, name: call.name, durationMs, args: argsForGate, label };
    };

    /*
     * REQ-ORCH-153 (ADR-0062): the plan gate's authoritative enforcement point. It sits HERE — ahead of the
     * executor lookup, the schema parse and the permission resolution — for three reasons the requirement states
     * or implies:
     *  - "by whatever route the tool reached that role": a name the port's narrowing never saw (an MCP tool
     *    registered late, a plugin) is refused with the gate's reason rather than reported unknown, and the
     *    fail-closed predicate withholds exactly those. The falsified clause, kept beside its replacement: this
     *    read "a plugin, a name the model invented" until 2026-09-16, and the last of the three was wrong. No
     *    approval can make an invented name exist, so the gate's remedy is a promise the product cannot keep;
     *    what the requirement binds is the dispatch of a TOOL, and a name that is no tool dispatches nothing;
     *  - "MUST NOT run a hook command": REQ-HOOKS-004's order puts `pre_tool` hooks after the permission
     *    resolution, so refusing before it means a withheld call's tool hooks never fire at all — the hooks
     *    amendment (REQ-HOOKS-126) then reaches only the lifecycle points, which is the whole of what it must;
     *  - "no refusal under this requirement is a refusal to record": the evidence record is already open above,
     *    and `finish` settles it as `blocked` exactly as a permission denial does.
     * Meta tools are never gated (REQ-TOOLS-014, ADR-0016 c.4) and are checked first; they touch no workspace.
     */
    if (!isMeta && deps.planGateHeld?.() === true && withheldUnderPlanGate(call.name)) {
      /*
       * …of a name that IS a tool. The fail-closed predicate answers `true` for every name outside the
       * registry, which is what the requirement asks for and also what made a misspelling read as a promise:
       * the run that found this called `read_path`, a name this product has never had, and was told the call
       * was withheld until the plan is approved — so it waited for an approval that could never make that name
       * exist. A name is a tool here when an executor holds it (whatever route registered it), when the public
       * registry declares it, or when THIS port removed it at the gate. Anything else falls through to
       * REQ-TOOLS-032's unknown-tool refusal below, which is the true answer and the actionable one. Nothing is
       * relaxed: a name with an executor is still refused before the schema parse, the permission and the hooks.
       */
      const isTool = executor !== undefined || isPublicToolName(canonicalToolName(call.name)) || deps.planGateWithheldNames?.().has(call.name) === true;
      if (isTool) {
        const reason = planGateRefusal(call.name);
        return finish({ text: reason, isError: true, status: 'blocked', decision: null, observation: null, blockedReason: reason }, { failure_kind: 'plan_gate_withheld', error: 'withheld while the run is held at the plan gate' });
      }
    }

    // REQ-TOOLS-032: a payload still unreadable or schema-invalid after repair is a recoverable error, not executed.
    if (!executor) {
      return finish({ text: `Unknown tool '${call.name}'. The call was not executed; choose one of the tools listed.`, isError: true, status: 'failed', decision: null, observation: null }, { failure_kind: 'invalid_request' });
    }
    if (repaired === null) {
      return finish({ text: `The arguments for '${call.name}' could not be read as JSON even after repair. Re-issue the call with a well-formed object.`, isError: true, status: 'failed', decision: null, observation: null }, { failure_kind: 'invalid_request' });
    }
    const parsed = executor.schema.safeParse(repaired);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      const diagnostic = executor.validationError?.(repaired, detail);
      if (diagnostic) {
        return finish({ text: diagnostic.text, isError: true, status: 'failed', decision: null, observation: diagnostic }, {
          failure_kind: 'invalid_request', outcome_kind: diagnostic.outcomeKind ?? 'invalid_request',
          exit_code: diagnostic.exitCode ?? null, warnings: diagnostic.warnings ?? [],
        });
      }
      return finish({ text: `The arguments for '${call.name}' do not match its schema (${detail}). Re-issue the call with corrected arguments.`, isError: true, status: 'failed', decision: null, observation: null }, { failure_kind: 'invalid_request' });
    }

    /*
     * PD-TOOLS-006: a write into a live sibling's declared scope is refused before it executes. It sits after the
     * schema parse, because the target path is an argument, and ahead of the permission resolution, so a write the
     * claim would refuse never costs the user an approval first. The path is read exactly as the file tools' fence
     * reads it; a path the fence would refuse is left for the executor to refuse in its own words.
     */
    const claimRefusal = this.writeScopeRefusal(call.name, parsed.data as Readonly<Record<string, unknown>>);
    if (claimRefusal !== null) {
      return finish({ text: claimRefusal, isError: true, status: 'blocked', decision: null, observation: null, blockedReason: claimRefusal }, { failure_kind: 'write_scope_claimed', error: 'inside a live write scope' });
    }

    // (1) permission resolution — never raises; an ask is resolved here, so nothing below sees one.
    const req = permissionRequest(call.name, call.persona, repaired);
    const attended = deps.attended();
    let decision = deps.policy.evaluate(req, { attended, workspaceRoot: deps.workspaceRoot, resolvePath: deps.resolvePath });
    let requestId: string | undefined;
    if (decision.decision === 'ask') {
      const brokered = await this.broker(call, req, decision, attended);
      decision = brokered.decision;
      requestId = brokered.requestId;
    }
    const summary = requestSummary(req);
    const pairing = requestId !== undefined && APPROVAL_RESOLUTION_SOURCES.has(decision.source) ? { request_id: requestId } : {};
    const auditOrdinal = deps.sink.decision({ agent_id: call.agentId, persona: call.persona, tool_name: call.name, decision: decision.decision, rule_id: decision.ruleId, source: decision.source, summary, reason: decision.reason, ...pairing });
    if (decision.source === 'user-once' || decision.source === 'user-session') {
      deps.sink.timeline('permission_approved', call.agentId, `The user approved ${summary}`, { tool: call.name, rule: decision.ruleId, source: decision.source, persona: call.persona });
    }
    if (decision.decision === 'deny') {
      deps.sink.issue({
        kind: 'permission_denied', severity: 'warning', actor: call.agentId || call.persona,
        message: `Permission denied for ${summary}: ${decision.reason}`,
        evidence_ref: auditOrdinal === null ? '' : `permission_audit#${auditOrdinal}`,
        metadata: { tool: call.name, rule: decision.ruleId, source: decision.source, persona: call.persona },
      });
      const text = denialText(decision.ruleId, decision.reason, call.name);
      return finish({ text, isError: true, status: 'blocked', decision, observation: null, blockedReason: decision.reason }, { error: decision.reason });
    }

    // (2) pre-execution hooks (ADR-0015): only a permitted call reaches them; a stop is one refused invocation (REQ-HOOKS-071/072).
    const hooks = deps.hooks ?? null;
    const hookCall = { toolName: call.name, facetText: hookFacet(call.name, parsed.data as Record<string, unknown>), arguments: parsed.data as Record<string, unknown>, command: call.name === 'terminal' && typeof req.commandFacet === 'string' ? req.commandFacet : '' };
    if (hooks) {
      const pre = await hooks.preTool(hookCall);
      if (pre.blocked) return finish({ text: pre.refusal, isError: true, status: 'blocked', decision, observation: null, blockedReason: pre.refusal }, { failure_kind: 'hook_blocked', error: 'stopped by a pre_tool hook' });
    }
    // (3) execution.
    let obs: Observation;
    try {
      obs = await executor.execute(parsed.data, {
        workspaceRoot: deps.workspaceRoot, sessionId: deps.sessionId, agentName: call.agentName, persona: call.persona,
        monotonic: deps.monotonic, wall: deps.wall, signal, warn: (m) => deps.sink.warn(m),
      });
    } catch (cause) {
      const aborted = signal.aborted;
      obs = { text: aborted ? `The '${call.name}' call was cancelled before it completed.` : `The '${call.name}' call failed: ${String(cause instanceof Error ? cause.message : cause)}`, isError: true, failureKind: aborted ? 'cancelled' : 'execution_error' };
    }
    // (4) post-execution hooks: for a call that ran, errors included (REQ-HOOKS-005); feedback rides in the same result
    // message, or follows as a user message when the call produced no observation (REQ-HOOKS-074).
    let text = obs.text;
    let followUp: string | undefined;
    if (hooks) {
      const post = await hooks.postTool({ ...hookCall, results: [{ kind: obs.isError ? 'error' : 'observation', text: obs.text }] });
      if (post.feedback !== '') {
        if (obs.isError) followUp = post.feedback;
        else text = `${obs.text}\n${post.feedback}`;
      }
    }
    // (5) diagnostics.
    const status: Exclude<ToolStatus, 'running'> = obs.isError ? 'failed' : 'ok';
    const result = finish({ text, isError: obs.isError, status, decision, observation: obs, ...(followUp === undefined ? {} : { followUp }) }, {
      ...(obs.outcomeKind === undefined ? {} : { outcome_kind: obs.outcomeKind }), ...(obs.exitCode === undefined ? {} : { exit_code: obs.exitCode }),
      ...(obs.failureKind === undefined ? {} : { failure_kind: obs.failureKind }), ...(obs.warnings === undefined ? {} : { warnings: obs.warnings }),
      error: obs.isError ? obs.text.slice(0, 500) : null,
    });
    this.outcomeIssues(call, obs);
    return result;
  }

  /** PD-TOOLS-006: the refusal for a file-tool write whose target a live claim holds for this agent, or null. */
  private writeScopeRefusal(toolName: string, args: Readonly<Record<string, unknown>>): string | null {
    const claimFor = this.deps.writeClaimFor;
    if (!claimFor || !fencedByWriteScope(toolName)) return null;
    const target = args['path'] ?? args['file_path'];
    if (typeof target !== 'string' || target === '') return null;
    const verdict = checkFence({ workspaceRoot: this.deps.workspaceRoot, allowOutsideWorkspace: false, additionalReadOnlyRoots: [] }, target, 'write');
    if (!verdict.ok || !verdict.inside) return null;
    const holder = claimFor(verdict.rel);
    return holder === null ? null : writeScopeRefusal(verdict.rel, holder);
  }

  /** REQ-SESSION-136's outcome-driven issues, each referencing the tool-call record. */
  private outcomeIssues(call: ToolCall, obs: Observation): void {
    const ref = `tool_call_evidence#${call.callId}`;
    const actor = call.agentId || call.persona;
    const meta = { tool: call.name, outcome_kind: obs.outcomeKind ?? '', failure_kind: obs.failureKind ?? '' };
    if (obs.outcomeKind === 'shell_failure') this.deps.sink.issue({ kind: 'terminal_shell_failure', severity: 'error', actor, message: `A terminal command failed (exit ${obs.exitCode ?? '?'}).`, evidence_ref: ref, metadata: meta });
    else if (obs.outcomeKind === 'suspicious_success') this.deps.sink.issue({ kind: 'terminal_suspicious_success', severity: 'warning', actor, message: `A terminal command exited 0 with output that looks like a failure: ${(obs.warnings ?? []).join('; ')}`, evidence_ref: ref, metadata: meta });
    else if (obs.outcomeKind === 'timeout' || obs.failureKind === 'timeout') this.deps.sink.issue({ kind: 'terminal_timeout', severity: 'error', actor, message: 'A terminal command exceeded its timeout.', evidence_ref: ref, metadata: meta });
    else if (obs.isError) this.deps.sink.issue({ kind: 'tool_error', severity: 'warning', actor, message: `The '${call.name}' call failed: ${obs.text.slice(0, 200)}`, evidence_ref: ref, metadata: meta });
  }

  /** ADR-0019's flow: publish, then either the headless policy (no wait at all) or the brokered wait. */
  private async broker(call: ToolCall, req: PermissionRequest, asked: DecisionRecord, attended: boolean): Promise<{ decision: DecisionRecord; requestId: string }> {
    const { deps } = this;
    const requestId = (deps.newRequestId ?? (() => randomUUID().replace(/-/g, '')))();
    const summary = requestSummary(req);
    const base = { agent_name: call.agentName, persona: call.persona, tool_name: call.name, rule_id: asked.ruleId, summary };
    try {
      if (!attended || !deps.presenter) {
        // REQ-TOOLS-061/064/065/066: headless — timeout null, no wait occurs.
        deps.sink.approvalRequested({ request_id: requestId, ...base, resolver: 'headless', timeout_seconds: null, unattended_reason: 'headless-policy' });
        return { requestId, decision: this.headless(asked) };
      }
      const timeoutS = deps.approvalTimeoutMs > 0 ? deps.approvalTimeoutMs / 1000 : 0;
      deps.sink.approvalRequested({ request_id: requestId, ...base, resolver: 'brokered', timeout_seconds: timeoutS, unattended_reason: '' });
      const payload: ApprovalPayload = {
        request_id: requestId, session_id: deps.sessionId, agent_id: call.agentId || call.persona, persona: call.persona, tool_name: call.name,
        command: req.commandFacet === null ? '' : summary.slice(call.name.length + 2), argument_summary: argumentSummary(req),
        rule_id: asked.ruleId, reason: asked.reason, sequence: deps.nextSequence(),
      };
      const wait = deps.approvals.create(payload, deps.approvalTimeoutMs > 0 ? deps.approvalTimeoutMs : null);
      deps.sink.pendingChanged(deps.approvals.pending());
      const shown = await deps.presenter.present(payload);
      if (!shown.ok) {
        // REQ-TOOLS-058: the pending request is discarded and the call denied with source presenter-error.
        deps.approvals.cancel(requestId);
        deps.sink.pendingChanged(deps.approvals.pending());
        return { requestId, decision: { decision: 'deny', ruleId: asked.ruleId, source: 'presenter-error', reason: `${asked.reason} Denied because the approval request could not be shown: ${shown.error}.`, description: asked.description } };
      }
      deps.approvals.markShown(requestId);
      const outcome = await wait;
      deps.sink.pendingChanged(deps.approvals.pending());
      deps.presenter.close(requestId);
      return { requestId, decision: this.outcomeDecision(call, req, asked, outcome) };
    } catch (cause) {
      // REQ-TOOLS-026: approval resolution that raises denies with source fail-closed.
      deps.approvals.cancel(requestId);
      deps.sink.pendingChanged(deps.approvals.pending());
      return { requestId, decision: { decision: 'deny', ruleId: asked.ruleId, source: 'fail-closed', reason: `${asked.reason} Denied because approval resolution failed: ${String(cause instanceof Error ? cause.message : cause)}.`, description: asked.description } };
    }
  }

  /** REQ-TOOLS-052's five mappings. */
  private outcomeDecision(call: ToolCall, req: PermissionRequest, asked: DecisionRecord, outcome: ApprovalOutcome): DecisionRecord {
    switch (outcome.kind) {
      case 'timed_out':
        return { decision: 'deny', ruleId: asked.ruleId, source: 'timeout', reason: `${asked.reason} Denied because no answer arrived within ${outcome.afterSeconds} seconds.`, description: asked.description };
      case 'cancelled':
        return { decision: 'deny', ruleId: asked.ruleId, source: 'cancelled', reason: `${asked.reason} Denied because the approval request was cancelled.`, description: asked.description };
      case 'resolved':
        if (outcome.option === 'once') return { decision: 'allow', ruleId: 'approval:once', source: 'user-once', reason: `The user approved '${call.name}' once (rule '${asked.ruleId}' asked).`, description: asked.description };
        if (outcome.option === 'session') {
          const grant = this.deps.policy.grant(req, { workspaceRoot: this.deps.workspaceRoot, resolvePath: this.deps.resolvePath });
          return { decision: 'allow', ruleId: 'approval:session', source: 'user-session', reason: `The user approved '${call.name}' for this session (rule '${asked.ruleId}' asked); session rule '${grant.id}' added.`, description: grant.description };
        }
        return { decision: 'deny', ruleId: asked.ruleId, source: 'user-deny', reason: `${asked.reason} Denied because the user denied the request.`, description: asked.description };
      default:
        return { decision: 'deny', ruleId: asked.ruleId, source: 'fail-closed', reason: `${asked.reason} Denied because approval resolver returned no verdict.`, description: asked.description };
    }
  }

  /** REQ-TOOLS-065/066. */
  private headless(asked: DecisionRecord): DecisionRecord {
    const { deps } = this;
    if (deps.headlessPolicy === 'abort') {
      if (deps.abortHook) {
        deps.abortHook();
        return { decision: 'deny', ruleId: asked.ruleId, source: 'headless-policy', reason: `${asked.reason} No approval UI is available in this host, so the request was denied and the headless approval policy aborts the run.`, description: asked.description };
      }
      deps.sink.warn(`headless approval policy 'abort' has no abort hook registered for ${deps.sessionId}; degrading to deny (REQ-TOOLS-065)`);
    }
    return { decision: 'deny', ruleId: asked.ruleId, source: 'headless-policy', reason: `${asked.reason} No approval UI is available in this host, so the request was denied.`, description: asked.description };
  }
}

/** A minimal executor for tests and for the never-gated meta tools. */
export function simpleExecutor<A>(name: string, description: string, schema: z.ZodType<A>, execute: ToolExecutor<A>['execute']): ToolExecutor<A> {
  return { name, description, schema, execute };
}

export const anySchema = z.record(z.string(), z.unknown());
