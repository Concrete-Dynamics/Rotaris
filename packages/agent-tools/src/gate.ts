import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { MonotonicClock, Timers, WallClock } from '@rotaris/kernel';
import { APPROVAL_RESOLUTION_SOURCES, denialText, interruptionPhrase, type ApprovalPayload, type HeadlessPolicy, type ToolStatus } from '@rotaris/contracts';
import type { ApprovalOutcome, PendingApprovals, PresenterPort } from './approvals.js';
import { argumentSummary, permissionRequest, requestSummary, type DecisionRecord, type PermissionRequest, type PolicyContext } from './policy.js';
import { canonicalToolName, isPublicToolName, META_TOOL_NAMES } from './registry.js';
import { planGateRefusal, withheldUnderPlanGate } from './planning-grants.js';
import { checkFence } from './tools/fence.js';
import { fencedByWriteScope, writeScopeRefusal, type WriteClaimHolder } from './write-scope.js';
import { INTERRUPTED_FAILURE_KIND, type Observation, type ToolExecutor } from './tools/types.js';

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
  /**
   * PD-ORCH-005: the run came to rest while this call was under way — its approval was withdrawn (clause 9) and it never
   * ran, or its executor reported the rest cut it short. The turn records it as interrupted and never re-runs it.
   */
  readonly interrupted?: boolean;
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

/**
 * PD-TOOLS-005: the run's away state as the gate sees it. The engine owns the holder (one per run, the same object on
 * every agent's port, delegated children included) and clears it on the user's next input; the gate only reads it
 * before it would prompt, and marks it when an approval wait ends by timeout.
 */
export interface PresencePort {
  /** Non-null while the run treats the user as away: the timeout, in seconds, that expired unanswered. */
  away(): { readonly afterSeconds: number } | null;
  markAway(afterSeconds: number): void;
  /**
   * PD-TOOLS-005 revision 2 (OQ-78): told when the run marks its user away, so an approval wait still outstanding is ended at
   * once. Returns the function that unregisters the listener.
   */
  onAway(listener: (mark: { readonly afterSeconds: number }) => void): () => void;
}

/**
 * PD-TOOLS-005 revision 2 (OQ-77): the one tool whose own approval ask the away state does not resolve — the question tool,
 * whose question is the prompt the directive keeps for an away user. Its call still asks under the preset's decision.
 */
const AWAY_EXEMPT_TOOL = 'ask_questions';

/** PD-TOOLS-005's reason clause for an ask resolved — or a wait ended — because the run treats its user as away. */
const awayBecause = (afterSeconds: number): string => `The user is treated as away because an earlier approval in this run went unanswered for ${afterSeconds} seconds`;

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
  /**
   * PD-TOOLS-004: whether `executors` serves this callable name with the public tool of that name rather than an MCP
   * or plugin tool offered under it. Only the root that assembled the surface knows where each executor came from.
   */
  readonly publicTool: (name: string) => boolean;
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
  /** PD-TOOLS-005: the run's away state; absent means no run holds one, and every ask is brokered as before the directive. */
  readonly presence?: PresencePort | undefined;
  /**
   * PD-ORCH-005 clause 9: the application's quit has closed its last window, so no presenter is left and the run is about
   * to come to rest by the quit. An ask made now is not REQ-TOOLS-064's headless case — the quit took the window, not the
   * person — so it is HELD: it waits unshown in `pending_approvals` until the quit's shutdown withdraws it, and is never
   * denied. The same predicate holds its wait past the approval budget (`PendingApprovals`' `held`). Absent: no quit is
   * ever announced to this gate.
   */
  readonly quitting?: (() => boolean) | undefined;
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

/**
 * REQ-TOOLS-032's JSON repairs — the cut-off structure completed, the run-completion payload recovered — before schema
 * validation. Null when nothing readable remains. The third repair, an object read as a one-element array, is the
 * schema's to decide and is `repairArrayFields`'.
 */
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
  return { ...(obj as Record<string, unknown>) };
}

function hasIssueAt(issues: readonly { readonly path: readonly PropertyKey[] }[], field: string): boolean {
  return issues.some((i) => i.path.length === 1 && i.path[0] === field);
}

/**
 * REQ-TOOLS-032: "a single object supplied where the schema expects an array is read as a one-element array, for the
 * fields `tasks`, `phases`, `files`, `items`, and `test_cases`". Where the schema expects an array is read from the schema
 * itself, whichever kind it is (a built-in tool's zod, an MCP tool's advertised JSON Schema): a field is wrapped when the
 * schema refuses the object at that field and does not refuse the one-element array there. The violation inside the
 * element, if any, is then the one the refusal names.
 *
 * Until 2026-10-06 `repairPayload` wrapped the five fields unconditionally, before the schema was consulted. No public tool
 * names one of them as anything but an array, but an MCP tool may: a server whose `items` is an object received an array it
 * never asked for, and once its call was checked against its advertised schema the wrapped value was refused on every
 * re-issue (docs/defects/fixed/the-gate-wraps-an-object-in-an-array-where-the-schema-does-not-expect-one.md).
 */
export function repairArrayFields(payload: Record<string, unknown>, schema: z.ZodType): Record<string, unknown> {
  const fields = ARRAY_FIELDS.filter((f) => { const v = payload[f]; return v !== null && typeof v === 'object' && !Array.isArray(v); });
  if (fields.length === 0) return payload;
  try {
    const asSent = schema.safeParse(payload);
    if (asSent.success) return payload;
    const wrapped: Record<string, unknown> = { ...payload };
    for (const f of fields) wrapped[f] = [payload[f]];
    const asArrays = schema.safeParse(wrapped);
    const out: Record<string, unknown> = { ...payload };
    let changed = false;
    for (const f of fields) {
      if (hasIssueAt(asSent.error.issues, f) && (asArrays.success || !hasIssueAt(asArrays.error.issues, f))) {
        out[f] = wrapped[f];
        changed = true;
      }
    }
    return changed ? out : payload;
  } catch {
    return payload; // A schema that cannot be run here decides nothing; its own parse below reports what it will.
  }
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
    const readable = repairPayload(call.rawArgs, isMeta);
    let repaired = readable !== null && executor !== undefined ? repairArrayFields(readable, executor.schema) : readable;
    // PD-TOOLS-007: the one repair beyond REQ-TOOLS-032's three, made by the tool it concerns and only for a call its
    // schema still refuses. What it returns is the call from here on — the record, the label, the approval, the hooks.
    let inferredNote: string | null = null;
    if (repaired !== null && executor?.inferArguments !== undefined && !executor.schema.safeParse(repaired).success) {
      let inferred: ReturnType<NonNullable<ToolExecutor['inferArguments']>> = null;
      try {
        inferred = executor.inferArguments(repaired);
      } catch {
        inferred = null; // A repair that cannot be made is no repair: the refusal below answers the call as sent.
      }
      if (inferred !== null && executor.schema.safeParse(inferred.args).success) {
        repaired = inferred.args;
        inferredNote = inferred.note;
      }
    }
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
    /*
     * Which tool the name reaches decides whether it is declared, not the name: a name this surface serves with
     * something other than the public tool (a server's `read_file`, PD-TOOLS-004's `publicTool` answering false), or
     * one this port removed at the gate (a server's `read_file` withheld from the listing is in no map at all), carries
     * no declaration and is withheld whatever the registry says of the NAME. A name the surface neither serves nor
     * removed is judged by the registry as before, so a public name the port never offered still takes the two
     * branches below.
     */
    const removedHere = deps.planGateWithheldNames?.().has(call.name) === true;
    const undeclared = removedHere || (executor !== undefined && !deps.publicTool(call.name));
    if (!isMeta && deps.planGateHeld?.() === true && withheldUnderPlanGate(call.name, !undeclared)) {
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
      const isTool = executor !== undefined || isPublicToolName(canonicalToolName(call.name)) || removedHere;
      if (isTool) {
        const reason = planGateRefusal(call.name);
        return finish({ text: reason, isError: true, status: 'blocked', decision: null, observation: null, blockedReason: reason }, { failure_kind: 'plan_gate_withheld', error: 'withheld while the run is held at the plan gate' });
      }
    }

    // REQ-TOOLS-032: a payload still unreadable or schema-invalid after repair is a recoverable error, not executed.
    /*
     * REQ-SESSION-136: each such refusal is a failure in the tool-call record (`failed`, `is_error`, `invalid_request`), so
     * it is REQ-SESSION-136's "any other failure" and files a `tool_error` warning referencing that record, through the
     * same `outcomeIssues` an executor's observation takes. REQ-TOOLS-032 makes the call recoverable and unexecuted; it
     * does not except it from the issue record. Before this every refusal here returned before `outcomeIssues`, and the
     * duress run's two schema-invalid `write_file` calls were the only failures no issue referenced (live-run a71-6,
     * docs/defects/fixed/a-call-refused-at-the-tool-gates-schema-check-files-no-tool-error-issue.md). The gate's other
     * refusals — the plan gate, a write scope, a deny, a hook's stop, a withdrawn approval — settle `blocked`, not
     * `failed`, and file no `tool_error` (a deny files its own `permission_denied`).
     */
    const refuseInvalid = (text: string, diagnostic: Observation | null): ToolResult => {
      const result = finish({ text, isError: true, status: 'failed', decision: null, observation: diagnostic }, diagnostic === null ? { failure_kind: 'invalid_request' } : {
        failure_kind: 'invalid_request', outcome_kind: diagnostic.outcomeKind ?? 'invalid_request',
        exit_code: diagnostic.exitCode ?? null, warnings: diagnostic.warnings ?? [],
      });
      this.outcomeIssues(call, { ...(diagnostic === null ? {} : { outcomeKind: diagnostic.outcomeKind ?? 'invalid_request' }), text, isError: true, failureKind: 'invalid_request' });
      return result;
    };
    if (!executor) return refuseInvalid(`Unknown tool '${call.name}'. The call was not executed; choose one of the tools listed.`, null);
    if (repaired === null) return refuseInvalid(`The arguments for '${call.name}' could not be read as JSON even after repair. Re-issue the call with a well-formed object.`, null);
    const parsed = executor.schema.safeParse(repaired);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      const diagnostic = executor.validationError?.(repaired, detail);
      if (diagnostic) return refuseInvalid(diagnostic.text, diagnostic);
      return refuseInvalid(`The arguments for '${call.name}' do not match its schema (${detail}). Re-issue the call with corrected arguments.`, null);
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
    // PD-ORCH-005 clause 9: the quit took the last window, not the person — an ask in the quit's gap is held, not denied.
    const heldForQuit = !attended && deps.quitting?.() === true;
    let decision = deps.policy.evaluate(req, { attended: attended || heldForQuit, workspaceRoot: deps.workspaceRoot, resolvePath: deps.resolvePath, publicTool: deps.publicTool });
    let requestId: string | undefined;
    if (decision.decision === 'ask') {
      const brokered = await this.broker(call, req, decision, attended, heldForQuit);
      if ('withdrawn' in brokered) {
        /*
         * PD-ORCH-005 clause 9: the run came to rest while this call waited on a person. The approval is withdrawn —
         * never recorded as denied, so no decision enters the audit and no denial issue is raised — the timeline says
         * which interruption withdrew it, and the call settles as never run (`blocked`: REQ-MONITOR-105's "refused or
         * skipped before it ran"), marked interrupted so the turn records it that way. Asked again, it asks afresh.
         */
        const summary = requestSummary(req);
        deps.sink.timeline('approval_withdrawn', call.agentId || call.persona, `The approval for ${summary} was withdrawn by ${interruptionPhrase(brokered.withdrawn)}; the call was not run.`, { request_id: brokered.requestId, tool: call.name, persona: call.persona, interruption: brokered.withdrawn });
        const text = `The approval this call was waiting on was withdrawn by ${interruptionPhrase(brokered.withdrawn)}; the call was not run.`;
        return finish({ text, isError: true, status: 'blocked', decision: null, observation: null, blockedReason: text, interrupted: true }, { failure_kind: 'interrupted', error: 'approval withdrawn' });
      }
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
    // PD-TOOLS-007: the result says what the gate read the call as, whatever came of it.
    let text = inferredNote === null ? obs.text : `${obs.text}\n${inferredNote}`;
    let followUp: string | undefined;
    // PD-ORCH-005 clause 9: a question withdrawn by the rest was never run, so no post-execution hook sees it.
    if (hooks && obs.withdrawnBy === undefined) {
      const post = await hooks.postTool({ ...hookCall, results: [{ kind: obs.isError ? 'error' : 'observation', text: obs.text }] });
      if (post.feedback !== '') {
        if (obs.isError) followUp = post.feedback;
        else text = `${text}\n${post.feedback}`;
      }
    }
    // (5) diagnostics.
    /*
     * PD-ORCH-005: an executor the run's rest cut short (a withdrawn question, a released wait) says so by its failure
     * kind. A question withdrawn by the rest (clause 9) was never answered and never run: it settles `blocked`
     * (REQ-MONITOR-105's "refused or skipped before it ran") and the timeline records which interruption withdrew it.
     */
    const withdrawnBy = obs.withdrawnBy;
    const status: Exclude<ToolStatus, 'running'> = withdrawnBy !== undefined ? 'blocked' : obs.isError ? 'failed' : 'ok';
    if (withdrawnBy !== undefined) deps.sink.timeline('question_withdrawn', call.agentId || call.persona, `The ${call.name} call was withdrawn by ${interruptionPhrase(withdrawnBy)} before the user answered; it was not run.`, { tool: call.name, persona: call.persona, interruption: withdrawnBy });
    const result = finish({ text, isError: obs.isError, status, decision, observation: obs, ...(followUp === undefined ? {} : { followUp }), ...(obs.failureKind === INTERRUPTED_FAILURE_KIND ? { interrupted: true } : {}), ...(withdrawnBy !== undefined ? { blockedReason: text } : {}) }, {
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
    // PD-ORCH-005: a call the run's rest cut short did not fail; it is recorded as interrupted, and raises no issue.
    else if (obs.isError && obs.failureKind !== INTERRUPTED_FAILURE_KIND) this.deps.sink.issue({ kind: 'tool_error', severity: 'warning', actor, message: `The '${call.name}' call failed: ${obs.text.slice(0, 200)}`, evidence_ref: ref, metadata: meta });
  }

  /** ADR-0019's flow: publish, then either the headless policy (no wait at all) or the brokered wait. */
  private async broker(call: ToolCall, req: PermissionRequest, asked: DecisionRecord, attended: boolean, heldForQuit = false): Promise<{ decision: DecisionRecord; requestId: string } | { withdrawn: string; requestId: string }> {
    const { deps } = this;
    const requestId = (deps.newRequestId ?? (() => randomUUID().replace(/-/g, '')))();
    const summary = requestSummary(req);
    const base = { agent_name: call.agentName, persona: call.persona, tool_name: call.name, rule_id: asked.ruleId, summary };
    let stopListening: (() => void) | null = null;
    try {
      if (!heldForQuit && (!attended || !deps.presenter)) {
        // REQ-TOOLS-061/064/065/066: headless — timeout null, no wait occurs.
        deps.sink.approvalRequested({ request_id: requestId, ...base, resolver: 'headless', timeout_seconds: null, unattended_reason: 'headless-policy' });
        return { requestId, decision: this.headless(asked) };
      }
      /*
       * PD-TOOLS-005: an earlier approval wait in this run expired unanswered, so the user is treated as away and this
       * ask — one that WOULD prompt: a rule that resolved it never reaches here — is resolved at once exactly as the
       * headless path resolves one, with no wait created and no dialog posted. The event is the headless shape
       * REQ-EVENTS-049 fixes (`headless-policy` is its only defined `unattended_reason`); the DECISION's reason is
       * where the cause is stated, and it names the timeout that expired rather than claiming no approval UI exists.
       * The order matters: a session that has genuinely lost its presenter is still reported as such, above.
       */
      /*
       * PD-TOOLS-005 revision 2 (OQ-77, ruled 2026-10-06): the question tool's own dispatch is exempt — under the `ask` preset
       * its call is an approval ask, and resolving it at once kept every question from an away user. It is brokered and
       * waits as before the user went away; nothing else is exempt.
       */
      const awayExempt = call.name === AWAY_EXEMPT_TOOL && deps.publicTool(call.name);
      const away = awayExempt ? null : deps.presence?.away() ?? null;
      if (away !== null) {
        deps.sink.approvalRequested({ request_id: requestId, ...base, resolver: 'headless', timeout_seconds: null, unattended_reason: 'headless-policy' });
        return { requestId, decision: this.headless(asked, awayBecause(away.afterSeconds)) };
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
      /*
       * PD-TOOLS-005 revision 2 (OQ-78, ruled 2026-10-06): a wait still outstanding when the run marks its user away — shown,
       * or queued unshown behind another dialog — is ended at once and resolved under the headless policy with the
       * directive's reason, its dialog closed below as any ended wait's is, so one unanswered approval costs one timeout. A
       * wait the quit holds is the quit's to withdraw (PD-ORCH-005 clause 9) and is left; the question tool's own is exempt.
       */
      stopListening = awayExempt ? null : deps.presence?.onAway((mark) => { if (deps.quitting?.() !== true) deps.approvals.endAway(requestId, mark.afterSeconds); }) ?? null;
      /*
       * PD-ORCH-005 clause 9: the quit closed the last window and its shutdown is still to come. There is nobody to show
       * the request to and nobody left the application: the request waits, unshown, in `pending_approvals`, and the quit's
       * shutdown withdraws it with every other wait of the run. A later decision (the explicit cancel's cancellation)
       * still resolves it by REQ-TOOLS-052, a request never shown counting a timeout as cancelled (REQ-TOOLS-054).
       */
      const heldUntilTheQuit = async (): Promise<{ decision: DecisionRecord; requestId: string } | { withdrawn: string; requestId: string }> => {
        const outcome = await wait;
        deps.sink.pendingChanged(deps.approvals.pending());
        if (outcome.kind === 'withdrawn') return { requestId, withdrawn: outcome.cause };
        return { requestId, decision: this.outcomeDecision(call, req, asked, outcome.kind === 'timed_out' ? { kind: 'cancelled' } : outcome) };
      };
      if (heldForQuit || !deps.presenter) return await heldUntilTheQuit();
      // REQ-TOOLS-063: a request queued behind an open dialog stays unshown until that dialog closes. If its wait ends
      // first (a timeout, a cancellation, a withdrawal, or an answer given elsewhere), it is dropped unshown. A
      // timeout or a cancellation of a request never shown counts as cancelled (REQ-TOOLS-054).
      const shown = await Promise.race([deps.presenter.present(payload), wait.then((outcome) => ({ unshown: outcome }))]);
      if ('unshown' in shown) {
        deps.sink.pendingChanged(deps.approvals.pending());
        deps.presenter.close(requestId);
        const outcome = shown.unshown;
        if (outcome.kind === 'withdrawn') return { requestId, withdrawn: outcome.cause };
        return { requestId, decision: this.outcomeDecision(call, req, asked, outcome.kind === 'timed_out' ? { kind: 'cancelled' } : outcome) };
      }
      // PD-ORCH-005 clause 9: a request main could not show because the quit had closed its window (the present crossed
      // the last window's close) is the quit's to withdraw, as one asked after the close is — not REQ-TOOLS-058's fault.
      if (!shown.ok && deps.quitting?.() === true) return await heldUntilTheQuit();
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
      if (outcome.kind === 'withdrawn') return { requestId, withdrawn: outcome.cause };
      return { requestId, decision: this.outcomeDecision(call, req, asked, outcome) };
    } catch (cause) {
      // REQ-TOOLS-026: approval resolution that raises denies with source fail-closed.
      deps.approvals.cancel(requestId);
      deps.sink.pendingChanged(deps.approvals.pending());
      return { requestId, decision: { decision: 'deny', ruleId: asked.ruleId, source: 'fail-closed', reason: `${asked.reason} Denied because approval resolution failed: ${String(cause instanceof Error ? cause.message : cause)}.`, description: asked.description } };
    } finally {
      stopListening?.();
    }
  }

  /** REQ-TOOLS-052's five mappings. */
  private outcomeDecision(call: ToolCall, req: PermissionRequest, asked: DecisionRecord, outcome: ApprovalOutcome): DecisionRecord {
    switch (outcome.kind) {
      case 'timed_out':
        // PD-TOOLS-005: the first unanswered wait marks the run's user away; this decision keeps REQ-TOOLS-052's own reason.
        this.deps.presence?.markAway(outcome.afterSeconds);
        return { decision: 'deny', ruleId: asked.ruleId, source: 'timeout', reason: `${asked.reason} Denied because no answer arrived within ${outcome.afterSeconds} seconds.`, description: asked.description };
      case 'away':
        // PD-TOOLS-005 revision 2 (OQ-78): ended because another approval of the run went unanswered — the away ask's resolution.
        return this.headless(asked, awayBecause(outcome.afterSeconds));
      case 'cancelled':
      // A withdrawn wait never reaches here (`broker` answers it first); were it to, it would read as REQ-TOOLS-052's cancellation.
      case 'withdrawn':
        return { decision: 'deny', ruleId: asked.ruleId, source: 'cancelled', reason: `${asked.reason} Denied because the approval request was cancelled.`, description: asked.description };
      case 'resolved':
        if (outcome.option === 'once') return { decision: 'allow', ruleId: 'approval:once', source: 'user-once', reason: `The user approved '${call.name}' once (rule '${asked.ruleId}' asked).`, description: asked.description };
        if (outcome.option === 'session') {
          const grant = this.deps.policy.grant(req, { workspaceRoot: this.deps.workspaceRoot, resolvePath: this.deps.resolvePath, publicTool: this.deps.publicTool });
          return { decision: 'allow', ruleId: 'approval:session', source: 'user-session', reason: `The user approved '${call.name}' for this session (rule '${asked.ruleId}' asked); session rule '${grant.id}' added.`, description: grant.description };
        }
        return { decision: 'deny', ruleId: asked.ruleId, source: 'user-deny', reason: `${asked.reason} Denied because the user denied the request.`, description: asked.description };
      default:
        return { decision: 'deny', ruleId: asked.ruleId, source: 'fail-closed', reason: `${asked.reason} Denied because approval resolver returned no verdict.`, description: asked.description };
    }
  }

  /**
   * REQ-TOOLS-065/066. `because` is the clause the reason opens with: REQ-TOOLS-065's own for a session with no
   * presenter, and PD-TOOLS-005's — naming the timeout that expired — for a run whose user is treated as away.
   */
  private headless(asked: DecisionRecord, because = 'No approval UI is available in this host'): DecisionRecord {
    const { deps } = this;
    if (deps.headlessPolicy === 'abort') {
      if (deps.abortHook) {
        deps.abortHook();
        return { decision: 'deny', ruleId: asked.ruleId, source: 'headless-policy', reason: `${asked.reason} ${because}, so the request was denied and the headless approval policy aborts the run.`, description: asked.description };
      }
      deps.sink.warn(`headless approval policy 'abort' has no abort hook registered for ${deps.sessionId}; degrading to deny (REQ-TOOLS-065)`);
    }
    return { decision: 'deny', ruleId: asked.ruleId, source: 'headless-policy', reason: `${asked.reason} ${because}, so the request was denied.`, description: asked.description };
  }
}

/** A minimal executor for tests and for the never-gated meta tools. */
export function simpleExecutor<A>(name: string, description: string, schema: z.ZodType<A>, execute: ToolExecutor<A>['execute']): ToolExecutor<A> {
  return { name, description, schema, execute };
}

export const anySchema = z.record(z.string(), z.unknown());
