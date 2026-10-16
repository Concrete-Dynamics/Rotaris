import { millis, toIsoUtc, type Clocks, type TimerHandle } from '@rotaris/kernel';

/** REQ-CHAT-164: ten seconds of provider silence on a call in flight. */
const STALL_AFTER = millis(10_000);
import { terminalRowStreamId, type ApprovalOption, type ApprovalPayload, type Interruption, type PermissionPreset, type QuestionAnswers, type QuestionPrompt } from '@rotaris/contracts';
import type { AgentBackend, ChatMessage, ContentPart, DispatchRetry, ModelRef, ThinkingLevel, ToolSpec, TurnReport } from '@rotaris/model';
import type { ProjectionOwner } from '../projection-owner.js';
import type { SessionWriter } from '../session-writer.js';
import type { LoopSupervisor, SupervisorEscalation } from './supervisor.js';
import { onExcludedPair, resilientStep, settleBeforeCall, type LadderDeps, type StepOutcome, type TurnResilience } from './ladder.js';
import { priceRequest, type PricedUsage } from './pricing.js';
import { providerIdentity, type ModelChoice } from './resilience.js';
import { CompressionRunner, type TurnCompression } from './compression.js';
import { Conversation, type ConversationRecorder } from './conversation.js';
import { interruptedResult } from './interruption.js';
import type { FingerprintCheck } from './record.js';
import type { AgentGrant } from '../children/personas.js';
import { duringImposedWait, type ImposedWaitPort } from '../children/stall.js';

/**
 * The tool loop inside one iteration (REQ-TOOLS-180, REQ-ORCH-146's non-native case): step the model;
 * for every tool call it requested, append a `tool` row `running`, dispatch through the injected
 * `ToolPort`, settle the row with the outcome, append the result to the conversation; step again.
 * The turn ends when a step requests no tool call — the message addressed to the user is then the
 * turn's text. The engine owns the interface; `agent-tools` implements it; the run-host root wires
 * the two, so no engine → agent-tools import exists (ADR-0002's boundaries stay structural).
 *
 * REQ-ORCH-141: a replayed tool-call id is dispatched once; a repeat returns the recorded result.
 * A cancel aborts the in-flight step or tool and the row settles `failed`.
 */
export interface PortToolCall {
  readonly callId: string;
  readonly name: string;
  readonly rawArgs: string;
  readonly persona: string;
  readonly agentId: string;
  readonly agentName: string;
}
export interface PortToolResult {
  readonly text: string;
  readonly isError: boolean;
  readonly status: 'ok' | 'failed' | 'blocked';
  readonly durationMs: number;
  readonly label: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly diff?: string;
  readonly blockedReason?: string;
  /** REQ-HOOKS-074: post_tool feedback for a call that produced no observation — delivered as a following user message. */
  readonly followUp?: string;
  /**
   * PD-ORCH-005: the run's rest cut this call short — its approval or question was withdrawn (clause 9), or its executor
   * reported the rest interrupted it. The turn records it as interrupted and never re-run.
   */
  readonly interrupted?: boolean;
  /**
   * OQ-245: the files the run host observed a cross-file code-intelligence EDIT call change, whatever it returned — carried
   * onto the call's tool-result part for the report's edited files, never to the model. Absent when nothing was observed.
   */
  readonly observedPaths?: readonly string[];
  /**
   * OQ-245: the run host meant to observe such a call and could not complete the walk, so it ran and what it changed is
   * unknown — carried onto the tool-result part so the report says so, even for a call that erred. Never to the model.
   */
  readonly unobserved?: true;
}
export interface ModeChange {
  readonly requested: PermissionPreset;
  readonly effective: PermissionPreset;
  readonly downgraded: boolean;
  readonly reason: string;
  readonly previous: PermissionPreset;
  /**
   * REQ-TOOLS-074: the persona this change did NOT reach, because the change would loosen an agent whose persona
   * pins `permission_mode`. Absent when the change applied. The run collects these names for `skipped_personas`.
   */
  readonly skippedPersona?: string | undefined;
}
export interface ToolPort {
  /** The ONE resolution's listing (REQ-TOOLS-010). */
  specs(): readonly ToolSpec[];
  /**
   * REQ-MONITOR-060/061 (live-run finding K1): the NATIVE tools that same resolution kept, in declaration order — the set
   * the inspector shows for the agent this port serves, policy narrowing applied (an MCP tool is shown under its server).
   * Optional because a port built without the registry (a test double) has no resolution to report.
   */
  resolvedTools?(): readonly string[];
  /**
   * REQ-MCP-065 / REQ-TOOLS-006: the grant in force once `ready()` has resolved — the native set `resolvedTools` reports and
   * the MCP surface left after every control — or null before then. A child's row records it (`ChildLedger.recordGrant`).
   * Optional because a test double has no resolution to report; a port without it records no grant.
   */
  grant?(): AgentGrant | null;
  /**
   * ADR-0034 (Part S): a port whose surface needs discovery before its listing is complete resolves this first; the turn
   * awaits it before reading `specs()` or the prompt section, bounded by the port (REQ-MCP-053's 35 s at most).
   */
  ready?(): Promise<void>;
  /** REQ-MCP-101 / REQ-TOOLS-010: the prompt's MCP section, rendered from the same resolution as `specs()`; appended to the system prompt. */
  promptSection?(): string;
  dispatch(call: PortToolCall, signal: AbortSignal): Promise<PortToolResult>;
  /** REQ-MONITOR-012 / REQ-TOOLS-177: every waiting approval released, before the run stops. */
  cancelPending(): number;
  /**
   * PD-ORCH-005 clause 9: the run comes to rest — every approval and question this port's calls wait on is WITHDRAWN,
   * never denied: each waiting call settles as interrupted and never run, and the withdrawal is recorded. Optional
   * because a port with nothing to wait on has nothing to withdraw.
   */
  withdrawPending?(cause: Interruption): number;
  /** REQ-TOOLS-025/073: the next call is decided under the replacement. */
  setMode(mode: string, source: string): ModeChange;
  currentMode(): PermissionPreset;
  /** REQ-MONITOR-254: false when no wait carries this id here. */
  answerApproval(requestId: string, option: ApprovalOption): boolean;
  /**
   * Part AC — REQ-CHAT-096 / REQ-MONITOR-004's "answer a pending question set" and "cancel a pending question set",
   * routed by request id exactly as an approval is; false when no wait carries this id here. Optional because a port
   * without a user-prompt channel has none: `ask_questions` is removed from such a port by the registry's
   * prerequisite (REQ-TOOLS-004), so there is nothing there to answer.
   */
  answerQuestions?(requestId: string, answers: QuestionAnswers): boolean;
  cancelQuestions?(requestId: string): boolean;
  /** REQ-CHAT-097: what the whole-session update publishes for this port's conversation. */
  pendingQuestions?(): readonly QuestionPrompt[];
  /**
   * PD-ORCH-005 clause 9 / REQ-SESSION-031: the approvals this port's agent is waiting on, which `Run.pendingApprovals`
   * gathers over every port, so the session's one `pending_approvals` column holds every agent's and not the last writer's.
   */
  pendingApprovals?(): readonly ApprovalPayload[];
  /**
   * REQ-SESSION-094: the run has ended. Every call this port still has open is settled at once, as failed with
   * `cutOff`, and from here nothing the port's gate would write for any call reaches the session — no settle, no
   * `tool.finish`, no issue, no audit or timeline entry, no approvals mirror — so a call the stop's grace detached writes
   * nothing when it returns. Idempotent. Optional because a port with no sink of its own has nothing to close.
   */
  close?(cutOff: string): void;
}

export interface TurnDeps {
  readonly writer: SessionWriter;
  readonly owner: ProjectionOwner;
  readonly backend: AgentBackend;
  readonly tools: ToolPort | null;
  readonly clocks: Clocks;
  readonly persona: string;
  readonly agentName: string;
  readonly systemPrompt: string;
  readonly model: ModelRef;
  readonly thinking: ThinkingLevel;
  readonly modelTimeoutMs: number;
  readonly modelRetries: number;
  /** ADR-0030: the credential of the model this turn calls. */
  readonly credentialFor: (model: ModelRef) => () => Promise<string>;
  /** A final belt for roots; null for children (PD-ORCH-017). */
  readonly maxStepsPerTurn: number | null;
  readonly warn: (message: string) => void;
  /** REQ-ORCH-141: the call ids already dispatched in this run. */
  readonly dispatched: Map<string, string>;
  readonly supervisor?: LoopSupervisor | undefined;
  /** REQ-MONITOR-134/135: the pending steering prompts for this conversation, drained at the agent's next step. */
  readonly steering?: (() => readonly SteeringPrompt[]) | undefined;
  /** REQ-MONITOR-123: a graceful pause — the turn stops before its next model step. */
  readonly shouldPause?: (() => boolean) | undefined;
  /**
   * PD-ORCH-005 clause 2 / REQ-ORCH-134: aborted when the pause's tool deadline passes, cutting every call still in flight;
   * absent means only the turn's own signal cuts a call.
   */
  readonly cutCalls?: AbortSignal | undefined;
  /** PD-ORCH-005: what the run is coming to rest by, for the interrupted results it records; null while it is not. */
  readonly interruption?: (() => Interruption | null) | undefined;
  /**
   * REQ-SESSION-094: the run gave up waiting for this turn and has ended. A step or a call that returns after that writes
   * nothing more — no row settled, nothing recorded — and the turn ends where it stands. Absent means never.
   */
  readonly detached?: (() => boolean) | undefined;
  /** Part Q: the ladder over every model step of this agent (REQ-ORCH-090/091/092); absent means the bare step. */
  readonly resilience?: TurnResilience | undefined;
  /**
   * Part AH (ADR-0060): context compression for THIS agent — the threshold ahead of every step
   * (REQ-MONITOR-076) and the condensation the ladder asks for on a context-window rejection (REQ-ORCH-093).
   * Absent means neither happens and a rejection fails the step as it did before.
   */
  readonly compression?: TurnCompression | undefined;
  /** REQ-ORCH-093: this turn resumes a parent with its children's reports, so a rejection on its FIRST call is `parent_resume_bad_request`. */
  readonly parentResume?: boolean | undefined;
  /**
   * OQ-8 (REQ-EVENTS-053): every completed provider request of this turn, reported once as it completes —
   * the successful ones and the failed or partial ones the ladder discarded. A caller that maintains the run's
   * cumulative figures takes them from here rather than from `TurnOutcome.report.usage`, which carries only what
   * one turn's surviving attempts spent.
   */
  readonly onRequestUsage?: ((usage: PricedUsage) => void) | undefined;
  /**
   * PD-ORCH-004: every tool call this agent dispatched, as its result returns — ok, failed or blocked alike. A replayed
   * call id (REQ-ORCH-141) is not dispatched and is not reported. The children's orchestration reads it for the
   * progress rule and the list of paths a child changed; absent means nobody is listening.
   */
  readonly onToolCompleted?: ((call: PortToolCall, result: PortToolResult) => void) | undefined;
  /** REQ-ORCH-089: every tool call this agent dispatches, as it starts; `onToolCompleted` reports its end. The children's stall watch reads both. */
  readonly onToolStarted?: ((call: PortToolCall) => void) | undefined;
  /**
   * PD-ORCH-008: every call this turn counts in its `toolCallCount`, as it counts it — a call it dispatches and one answered
   * from a replay (REQ-ORCH-141) alike, and before either. A turn that raises returns no count, so the children's settle
   * reads an attempt's calls from this, and counts what it never completed (fin22's repair round).
   */
  readonly onToolCounted?: (() => void) | undefined;
  /** REQ-ORCH-089: every part each model step streams, by its kind (`TurnSink.event`) — the stall watch's "model event or token". */
  readonly onModelEvent?: ((kind: string) => void) | undefined;
  /**
   * OQ-173: told of each wait the run holds this agent in between its model steps — the ladder's backoff and suspended
   * wait, and a context compression's own model call, automatic or on a rejection — so the stall watch reports a wait and
   * not a stall; the returned release ends it. Absent means nobody is watching.
   */
  readonly onImposedWait?: ImposedWaitPort | undefined;
  /** PD-ORCH-005 clause 1: observes every message as it joins this agent's conversation — the conversation record. */
  readonly recorder?: ConversationRecorder | undefined;
  /**
   * PD-ORCH-005 revision 4 clause 14: handed the system prompt and the tool definitions each model step's request carries,
   * just before the step goes out; the agent's record keeps the first and a resume compares against it.
   */
  readonly fingerprint?: FingerprintCheck | undefined;
  /**
   * REQ-ORCH-025: the run override's layer of this agent's instructions (`runOverrideLayer`, `children/personas.ts`), placed
   * after everything else the request's system prompt carries, the MCP section included. Absent or '' adds nothing: every
   * agent but a `swarm` run's coordinating entry role.
   */
  readonly runOverrideLayer?: string | undefined;
}

type ToolResultPart = { kind: 'tool-result'; callId: string; name: string; result: string; isError: boolean; observedPaths?: readonly string[]; unobserved?: true };

export interface SteeringPrompt {
  readonly id: string;
  readonly text: string;
}

export interface TurnOutcome {
  readonly report: TurnReport;
  /** ADR-0060: the conversation as it stands — a compression replaced the array, so this is never the one the turn began with. */
  readonly messages: readonly ChatMessage[];
  readonly toolCallCount: number;
  readonly escalation?: SupervisorEscalation | undefined;
  /**
   * REQ-MONITOR-123 / PD-ORCH-005: the turn stopped where it stood because the run is coming to rest — before its next
   * model step, or mid-step with its calls' results recorded (interrupted ones as such); the task is left where it was.
   */
  readonly paused?: boolean | undefined;
}

/** REQ-MONITOR-134: the message a steering prompt joins a conversation as, explicitly marked as a steering prompt. */
export function steeringMessage(prompt: SteeringPrompt): ChatMessage {
  return { role: 'user', content: [{ kind: 'text', text: `${STEERING_MARK}${prompt.text}` }] };
}
const STEERING_MARK = '[Steering prompt] ';

/** Whether `message` is a steering prompt as `steeringMessage` writes it. */
export function isSteeringMessage(message: ChatMessage | undefined): boolean {
  return message !== undefined && message.role === 'user' && message.content.some((p) => p.kind === 'text' && p.text.startsWith(STEERING_MARK));
}

/** REQ-MONITOR-134: the prompt is marked injected — once, wherever it joined the agent's conversation. */
export function recordSteeringInjected(writer: SessionWriter, agentName: string, prompt: SteeringPrompt, extra: Readonly<Record<string, unknown>> = {}): void {
  writer.appendTimeline('steering_injected', 'user', `A steering prompt reached ${agentName} (${prompt.id.slice(0, 8)}).`, { prompt_id: prompt.id, agent: agentName, ...extra });
}

/** REQ-MONITOR-134: delivered as a message explicitly marked as a steering prompt; the supervisor counts it as a user instruction. */
function injectSteering(deps: TurnDeps, conversation: Conversation): number {
  const pending = deps.steering?.() ?? [];
  for (const s of pending) {
    conversation.push(steeringMessage(s));
    recordSteeringInjected(deps.writer, deps.agentName, s);
    deps.supervisor?.noteUserInstruction();
  }
  return pending.length;
}

/**
 * REQ-MCP-101: the persona's one MCP section, after the role's instructions, its playbook and the session's context units
 * (`withContextUnits`), one blank line before its heading; only the run override's layer comes after it
 * (`withRunOverrideLayer`). An empty section
 * (no MCP surface at all) adds nothing. The unit before it closes itself where it needs to: the instruction files end with
 * `INSTRUCTION_FILES_END_COMMENT`, so this heading is never read as the last file's own
 * (`docs/defects/fixed/nothing-marks-where-the-last-instruction-file-ends-so-agents-read-the-mcp-section-as-part-of-it.md`).
 */
export function withMcpSection(systemPrompt: string, section: string): string {
  return section === '' ? systemPrompt : `${systemPrompt}\n\n${section}`;
}

/**
 * REQ-ORCH-025: the run override "as a final layer ... placed after everything else": after the MCP section, so nothing the
 * request's system prompt carries follows it. The layer opens with its own heading (`SWARM_HEADING`), so it is never read as
 * part of the MCP listing before it. '' adds nothing.
 *
 * The reason it is composed here, kept beside it: the first repair of F07 (finacc3) appended it in `Run` before the context
 * units, and `runTurn` adds the MCP section after whatever it is handed, so the "final layer" was followed by both.
 */
export function withRunOverrideLayer(systemPrompt: string, layer: string): string {
  if (layer === '') return systemPrompt;
  return systemPrompt === '' ? layer : `${systemPrompt}\n\n${layer}`;
}

export async function runTurn(deps: TurnDeps, task: string | null, history: readonly ChatMessage[], signal: AbortSignal, initialContent?: readonly ContentPart[]): Promise<TurnOutcome> {
  const { writer, owner, tools, clocks } = deps;
  // ADR-0060: the history is an object whose array is SWAPPED by a compression, never spliced under a call in flight.
  // PD-ORCH-005: a null task continues the history as it stands — how a recorded conversation is resumed.
  const conv = new Conversation(history, deps.recorder);
  if (task !== null) conv.push({ role: 'user', content: initialContent ?? [{ kind: 'text', text: task }] });
  // ADR-0034: the MCP surface is demanded before the listing and the prompt are read — one resolution feeds both.
  if (tools?.ready) await tools.ready();
  const specs = tools?.specs() ?? [];
  const section = tools?.promptSection?.() ?? '';
  const composed = withRunOverrideLayer(withMcpSection(deps.systemPrompt, section), deps.runOverrideLayer ?? '');
  const stepDeps: TurnDeps = composed === deps.systemPrompt ? deps : { ...deps, systemPrompt: composed };
  let toolCallCount = 0;
  let steps = 0;
  let lastReport: TurnReport = { status: 'succeeded', text: '', usage: { input: 0, output: 0 } };
  let usage = { input: 0, output: 0 };
  /**
   * OQ-8: the ONE place a completed provider request's usage is counted — the turn's own total and the caller's
   * cumulative figures both come from here, so a request the ladder retried past is counted exactly once rather
   * than dropped with the report it belonged to.
   */
  const observeRequestUsage = (u: PricedUsage): void => {
    // REQ-SESSION-094: a step the run gave up on and that returned after it ended counts toward nothing.
    if (deps.detached?.() === true) return;
    usage = { input: usage.input + u.input, output: usage.output + u.output };
    deps.onRequestUsage?.(u);
  };
  /**
   * Part AH (ADR-0060). `condensed` says the history no longer matches the provider's last prompt count, so
   * REQ-MONITOR-081's preference for the real figure falls back to the estimate until the next step reports one.
   */
  const compression = deps.compression ? new CompressionRunner(deps.compression, { writer, clocks, warn: deps.warn, agent: deps.agentName }) : null;
  let condensed = false;
  /** OQ-173: a compression's own model call is a wait the run imposes on this agent, not its silence. */
  const compressing = (pass: () => Promise<boolean>): Promise<boolean> => duringImposedWait(deps.onImposedWait, 'compression', pass);
  // Part AO
  /**
   * Part AO (ADR-0060 decision 1, its second reader): this conversation is LIVE for the span of the turn, and the
   * `forceCompression` arm reaches it through the run's registry. A manual pass replaces the array under whatever
   * call is in flight — safe by ADR-0060's swap rule — and marks the history condensed so the next count falls back
   * to the estimate until the next step reports a real prompt figure (REQ-MONITOR-081), exactly as an automatic pass
   * does. The unregister runs on EVERY exit below, so a handle never outlives its turn.
   */
  const unregister = compression && deps.compression?.registry
    ? deps.compression.registry.register({ agent: deps.agentName, compress: async (s) => { const r = await compression.manual(conv, condensed, s); if (r.kind === 'compressed') condensed = true; return r; } })
    : null;
  try {
  // REQ-MONITOR-123 / PD-ORCH-005 clause 2: the turn stops before its next model call — checked again after every awaited
  // piece that precedes the step, since a pause accepted meanwhile allows no model call (found by phase 3's review).
  const stopsHere = (): TurnOutcome | null => (deps.shouldPause?.() === true ? { report: { status: 'succeeded', text: lastReport.text, usage }, messages: conv.snapshot(), toolCallCount, paused: true } : null);
  for (;;) {
    const before = stopsHere();
    if (before) return before;
    injectSteering(deps, conv);
    const supervision = await deps.supervisor?.check();
    if (supervision?.kind === 'inject') {
      conv.push({ role: 'user', content: [{ kind: 'text', text: supervision.message }] });
      writer.appendTimeline('loop_supervisor_activation', deps.agentName, supervision.message, { trigger: supervision.activation.trigger, reason: supervision.activation.reason, activation_count: supervision.activation.activationCount });
    } else if (supervision?.kind === 'escalate') {
      const headline = 'child aborted after repeated activations';
      writer.recordIssue({ kind: 'circuit_breaker_escalation', severity: 'error', actor: deps.agentName, message: headline, metadata: { session_id: supervision.signal.sessionId, activation_count: supervision.signal.activationCount, reason: supervision.signal.reason } });
      writer.appendTimeline('loop_supervisor_activation', deps.agentName, headline, { trigger: supervision.activation.trigger, reason: supervision.signal.reason, activation_count: supervision.signal.activationCount });
      return { report: { status: 'failed', text: lastReport.text, usage, error: { code: 'unknown', headline, transient: false } }, messages: conv.snapshot(), toolCallCount, escalation: supervision.signal };
    }
    steps += 1;
    if (deps.maxStepsPerTurn !== null && steps > deps.maxStepsPerTurn) {
      deps.warn(`the turn exceeded ${deps.maxStepsPerTurn} model steps and was ended as partial (the final step belt fired)`);
      return { report: { status: 'partial', text: lastReport.text, usage }, messages: conv.snapshot(), toolCallCount };
    }
    /**
     * REQ-MONITOR-076: an agent that has reached the effective threshold compresses BEFORE the call, so the
     * call goes out over the compressed context. This sits where ADR-0059's `check()` sits — between steps,
     * with no request in flight, which is the only place the conversation may be replaced.
     */
    const afterSupervision = stopsHere();
    if (afterSupervision) return afterSupervision;
    /**
     * REQ-MONITOR-194 with REQ-MONITOR-080: the cell is settled BEFORE the compression check — the session's overrides
     * followed and a pair it holds out of quota left for the same-tier candidate, else the wait (`settleBeforeCall`) — so
     * the pass compresses on the pair this step will call, at that pair's threshold, and never calls an excluded one. A
     * report here (a wait cancelled, a rest accepted meanwhile) is the step's, exactly as the ladder would have returned it.
     */
    const ladderDeps: LadderDeps = { writer, clocks, warn: deps.warn, agent: deps.agentName, onRequestUsage: observeRequestUsage, imposedWait: deps.onImposedWait };
    const settled = deps.resilience && onExcludedPair(deps.resilience) ? await settleBeforeCall(ladderDeps, deps.resilience, signal) : null;
    if (settled === null && compression && !signal.aborted && compression.due(conv, condensed)) {
      if (await compressing(() => compression.run(conv, 'automatic', condensed, signal))) condensed = true;
      const afterCompression = stopsHere();
      if (afterCompression) return afterCompression;
    }
    // PD-ORCH-005 clause 14: the comparison is made at the execution's first model step, once the port is ready. Since
    // OQ-105's ruling (R-071) it is taken of the persona's own definition, not of what this step's request carries.
    deps.fingerprint?.();
    // REQ-CHAT-054: one stable message key per response SEGMENT. A tool boundary ends a segment, so the next step's
    // response is a distinct row; the ladder re-running THIS step on a fallback reuses the key and so persists once.
    const segment = `${deps.agentName}#${steps}`;
    /**
     * REQ-ORCH-093: the ladder asks for a condensation and retries; at most twice for ONE call, which the ladder
     * counts. The ladder holds no conversation of its own — this closure is the only thing that knows there is one.
     * REQ-ORCH-093's parent-resume limb differs from a child's own call only in the issue kind, and a resumed
     * turn's first call is the one that carries it.
     */
    const resilience: TurnResilience | undefined = deps.resilience && compression
      ? { ...deps.resilience, condense: async () => { const ok = await compressing(() => compression.run(conv, 'rejection', condensed, signal)); if (ok) condensed = true; return ok; }, resumeIssue: deps.parentResume === true && steps === 1 }
      : deps.resilience;
    // PD-MONITOR-001 revision 2: the ladder prices each request at its cell's model. The bare path has no catalogue to read
    // rates from — it runs only where no resilience was configured — so it keeps a reported figure and prices nothing itself.
    const report = settled ?? (resilience
      ? await resilientStep(ladderDeps, resilience, (choice, unresponsiveMs) => step(stepDeps, choice, conv.snapshot(), specs, signal, unresponsiveMs, segment), signal)
      : await (async () => { const o = await step(stepDeps, { model: deps.model, thinking: deps.thinking }, conv.snapshot(), specs, signal, null, segment); observeRequestUsage(priceRequest(o.report.usage, null)); return o.report; })());
    lastReport = report;
    if (deps.detached?.() === true) return { report: { ...report, usage }, messages: conv.snapshot(), toolCallCount, paused: true };
    // REQ-MONITOR-049 (Part R): the step's input count is this agent's latest prompt-token reading; the surface reads it from the record.
    // REQ-MONITOR-089: after a compression the reading FALLS, because the step that follows one reports the shorter prompt.
    writer.activity.usage(deps.agentName, report.usage.input);
    if (report.usage.input > 0) condensed = false;
    if (report.status === 'failed') return { report: { ...report, usage }, messages: conv.snapshot(), toolCallCount };
    deps.supervisor?.observe({ kind: 'message', text: report.text });
    const calls = report.toolCalls ?? [];
    conv.push({ role: 'assistant', content: [...(report.text ? [{ kind: 'text' as const, text: report.text }] : []), ...calls.map((c) => ({ kind: 'tool-call' as const, callId: c.callId, name: c.name, args: c.args }))] });
    if (calls.length === 0 || !tools) {
      if (calls.length > 0) deps.warn(`the model requested ${calls.length} tool call(s) but this run has no tool port; the turn ends`);
      // REQ-ORCH-096: an empty reply with no call is the runtime's "cannot make progress" report — the stuck path of the supervisor.
      if (calls.length === 0 && report.text.trim() === '') deps.supervisor?.observeStuck();
      // REQ-MONITOR-136: a steer that arrived while the agent was finishing makes it take another round.
      // (First execution: a peek that drained the queue lost the steer and bought a spurious round; the injection is the one read.)
      if (calls.length === 0 && !signal.aborted && injectSteering(deps, conv) > 0) continue;
      return { report: { ...report, usage }, messages: conv.snapshot(), toolCallCount };
    }
    const results: ToolResultPart[] = [];
    const followUps: string[] = [];
    /**
     * PD-ORCH-005 clauses 2, 3 and 9: whether the run's rest cut this step short. Every call of the step still gets a
     * result, so the conversation never ends on calls with none (the spike's finding: a stop used to return without
     * the step's `tool` message, losing the results of the calls that DID complete): a completed call its own, a call
     * cut off or withdrawn the interrupted statement with whatever it produced, and a call the step asked for but had
     * not started when the rest began the statement that it never ran — no new call starts once the run is coming to
     * rest, and a paused agent makes no model step after this one.
     */
    let cut = false;
    const cause = (): Interruption | null => deps.interruption?.() ?? null;
    for (const c of calls) {
      // Only the run's rest (or the turn's own abort) skips a call: REQ-ORCH-088's landing lets the step's calls run.
      if (signal.aborted || cause() !== null) {
        cut = true;
        const text = interruptedResult(cause(), false, '');
        results.push({ kind: 'tool-result', callId: c.callId, name: c.name, result: text, isError: true });
        // REQ-MONITOR-105 / REQ-SESSION-129: `blocked` is a call skipped before it ran; no row is ever left `running`.
        writer.appendRow('tool', `${c.name}`, true, { persona: deps.persona, name: deps.agentName, toolName: c.name, toolStatus: 'blocked', callKey: c.callId, startedAt: toIsoUtc(clocks.wall.instant()), input: c.args, output: text, blockedReason: text });
        continue;
      }
      toolCallCount += 1;
      deps.onToolCounted?.();
      deps.supervisor?.observe({ kind: 'tool', name: c.name, args: c.args });
      const prior = deps.dispatched.get(c.callId);
      if (prior !== undefined) {
        // REQ-ORCH-141: a replayed id is not dispatched again.
        results.push({ kind: 'tool-result', callId: c.callId, name: c.name, result: prior, isError: false });
        continue;
      }
      const startedAt = toIsoUtc(clocks.wall.instant());
      // Part AL — REQ-CHAT-046/063/066/076: a foreground `terminal` call's row carries its live stream id while it runs
      // (ADR-0021; `terminalRowStreamId` is the one rule the tool shares). The settle rebuilds the row from the record,
      // which never holds the id, so the settled row has none — cleared on exit by construction.
      const streamId = terminalRowStreamId(c.name, c.args, deps.agentName);
      const rowResult = writer.appendRow('tool', `${c.name}`, false, { persona: deps.persona, name: deps.agentName, toolName: c.name, toolStatus: 'running', callKey: c.callId, startedAt, input: c.args, ...(streamId === undefined ? {} : { streamId }) });
      const rowIndex = rowResult.ok ? rowResult.value.index : null;
      const call: PortToolCall = { callId: c.callId, name: c.name, rawArgs: c.args, persona: deps.persona, agentId: deps.agentName, agentName: deps.agentName };
      // REQ-ORCH-134 (PD-ORCH-005 clause 2): the call runs under the turn's signal and the pause's tool deadline.
      const callSignal = deps.cutCalls ? AbortSignal.any([signal, deps.cutCalls]) : signal;
      deps.onToolStarted?.(call);
      const r = await tools.dispatch(call, callSignal);
      if (deps.detached?.() === true) return { report: { status: 'succeeded', text: lastReport.text, usage }, messages: conv.snapshot(), toolCallCount, paused: true };
      const interrupted = r.interrupted === true || callSignal.aborted;
      deps.onToolCompleted?.(call, r);
      deps.dispatched.set(c.callId, r.text);
      if (rowIndex !== null) {
        writer.settleRow(rowIndex, r.label, { toolStatus: r.status, durationMs: r.durationMs, output: r.text, ...(r.blockedReason === undefined ? {} : { blockedReason: r.blockedReason }) });
        // REQ-CHAT-050: the user-only edit-diff row directly beneath the tool row that produced it.
        if (r.diff !== undefined && r.status === 'ok') writer.appendRow('diff', r.diff, true, { persona: deps.persona, name: deps.agentName, callKey: c.callId, diff: r.diff });
      }
      // OQ-245: what the run host observed the call change rides on its result part, persisted with the conversation and
      // read by the report; the model client sends a part's result alone (`ai-sdk-client.ts`), so the model never sees it.
      const observed = { ...(r.observedPaths === undefined ? {} : { observedPaths: r.observedPaths }), ...(r.unobserved === true ? { unobserved: true as const } : {}) };
      if (interrupted) {
        cut = true;
        // Clause 3: "recorded as interrupted, with whatever output it had produced"; a withdrawn call (`blocked`) never ran.
        results.push({ kind: 'tool-result', callId: c.callId, name: c.name, result: interruptedResult(cause(), r.status !== 'blocked', r.text), isError: true, ...observed });
      } else {
        results.push({ kind: 'tool-result', callId: c.callId, name: c.name, result: r.text, isError: r.isError, ...observed });
      }
      if (r.followUp !== undefined && r.followUp !== '') followUps.push(r.followUp);
    }
    conv.push({ role: 'tool', content: results });
    // REQ-HOOKS-074: nothing is placed between the assistant's calls and their results; feedback for an errored call follows as a user message.
    if (followUps.length > 0) conv.push({ role: 'user', content: [{ kind: 'text', text: followUps.join('\n') }] });
    owner.flushPending();
    if (cut || signal.aborted) return { report: { status: 'succeeded', text: report.text, usage }, messages: conv.snapshot(), toolCallCount, paused: true };
  }
  } finally {
    unregister?.(); // Part AO
    conv.close(); // PD-ORCH-005: a manual pass that finishes after this turn replaces and records nothing.
  }
}

/**
 * OQ-110 (ruled 2026-09-29, R-067): the session-log line for one retry the dispatch layer absorbed. The dispatch
 * layer's retries (REQ-CONFIG-086's `num_retries`, default 5) come before the resilience ladder (REQ-ORCH-091/092),
 * which takes over only when they are exhausted, so a retry absorbed there records no issue and no timeline entry —
 * this line is the one trace it leaves, with the status the failed attempt met and the delay waited before the retry.
 * It goes out through the run's `warn`, which the session log takes at its default WARNING level (REQ-SESSION-142).
 */
export function dispatchRetryLine(agentName: string, provider: string, modelId: string, r: DispatchRetry): string {
  const met = r.status === null ? `a connection failure${r.failure === undefined ? '' : ` (${r.failure})`}` : `HTTP ${r.status}`;
  // The provider as the ladder's own lines name it (`providerIdentity`), so the two layers' lines about one call agree.
  return `model request retried by the dispatch layer: ${agentName} on ${provider}/${modelId} met ${met} and waited ${r.delayMs} ms before retry ${r.attempt} of ${r.of} (REQ-CONFIG-086 num_retries; the ladder of REQ-ORCH-091/092 takes over only when they are exhausted)`;
}

/**
 * One model step streamed into one `agent` row: first delta appends it unsettled, growth ticks, the end settles it.
 * The choice carries the model, its reasoning level and REQ-ORCH-145's per-model timeout and retry count. With
 * `unresponsiveMs` set, a timer on the clock port aborts the call when no event of any kind arrived within it
 * (REQ-ORCH-090); the ladder then re-runs the step on the fallback. The timer disarms on the first event.
 */
async function step(deps: TurnDeps, choice: ModelChoice, messages: readonly ChatMessage[], specs: readonly ToolSpec[], signal: AbortSignal, unresponsiveMs: number | null, segment: string): Promise<StepOutcome> {
  const { writer, owner, backend, clocks } = deps;
  let index: number | null = null;
  let text = '';
  let seen = false;
  let unresponsive = false;
  /** REQ-CHAT-163 / REQ-CHAT-062: the streamed-reasoning row of this step, and the text it has been given. */
  let reasoningIndex: number | null = null;
  let reasoning = '';
  /** The `startedAt` stamped on the reasoning row's append; the span REQ-CHAT-062's settled figure closes. */
  let reasoningStartedAt: string | null = null;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal.aborted) controller.abort(); else signal.addEventListener('abort', onAbort, { once: true });
  const timer = unresponsiveMs === null ? null : clocks.timers.after(millis(unresponsiveMs), () => { if (!seen) { unresponsive = true; controller.abort(); } });

  /**
   * REQ-CHAT-164's DETECTION half (the drawing half is the renderer's): ten seconds with no output of any kind
   * marks the live row stalled; the next output of any kind clears the mark. It appends no row, cancels nothing
   * and changes nothing recorded - `markStalled` publishes and does not write. The timer is the clock port's,
   * never a bare one (ADR-0006). Before any output there is no live row for the call and nothing is marked; that
   * window is stated in ADR-0046's note rather than met by appending the row the requirement forbids appending.
   */
  const stall: { timer: TimerHandle | null } = { timer: null };
  let stalled = false;
  const liveRow = (): number | null => (index !== null ? index : reasoningIndex);
  const armStall = (): void => {
    stall.timer?.cancel();
    stall.timer = clocks.timers.after(STALL_AFTER, () => {
      const row = liveRow();
      if (row === null || deps.detached?.() === true) return;
      stalled = true;
      owner.markStalled(row, toIsoUtc(clocks.wall.instant()));
    });
  };
  const outputArrived = (): void => {
    if (stalled) {
      stalled = false;
      const row = liveRow();
      if (row !== null) owner.markStalled(row, null);
    }
    armStall();
  };

  /**
   * REQ-CHAT-062's settled form carries FINAL figures, so the settle stamps `durationMs` — the wall span from the
   * row's `startedAt` to this settle, on the clock port. Without the stamp the renderer's settled branch falls
   * through to `nowMs - startedAt` against its once-a-second tick and the seconds keep rising after the row is
   * finished (a defect note, removed once repaired).
   */
  const settleReasoning = (): void => {
    if (reasoningIndex === null) return;
    const started = reasoningStartedAt === null ? Number.NaN : Date.parse(reasoningStartedAt);
    const durationMs = Number.isFinite(started) ? Math.max(0, Date.parse(toIsoUtc(clocks.wall.instant())) - started) : undefined;
    writer.settleRow(reasoningIndex, reasoning, durationMs === undefined ? {} : { durationMs });
    reasoningIndex = null;
  };
  /**
   * REQ-SESSION-094: the run gave up on this step and has ended (`TurnDeps.detached`). Its stream is a binding into the
   * finished session, so from here it writes and publishes nothing: no row appended, grown or settled.
   */
  const detached = (): boolean => deps.detached?.() === true;
  const sink = {
    started: () => { seen = true; timer?.cancel(); armStall(); },
    delta: (d: string) => {
      if (detached()) return;
      outputArrived();
      // REQ-CHAT-163: a reasoning burst is finished the moment the answer body starts, so its row settles here
      // rather than at the end of the call - a thinking row that stayed live past its own content would keep
      // counting upward against REQ-CHAT-062 while nothing was arriving for it.
      settleReasoning();
      text += d;
      if (index === null) {
        const r = writer.upsertMessageRow(segment, 'agent', text, false, { persona: deps.persona, name: deps.agentName });
        if (r.ok) index = r.value.index;
      } else {
        owner.grow(index, text);
      }
    },
    /**
     * REQ-CHAT-163: deliberation appears ONLY in the reasoning channel, which means a streamed-reasoning row.
     * Before this the sink discarded it - the reasoning-delta shape was recognised by the client and then dropped
     * here, so no thinking row has ever existed in this product and REQ-CHAT-048/062 had nothing to act on.
     * REQ-CHAT-059 keys a thinking row by its START TIME, which is why `startedAt` is stamped on the append.
     */
    reasoning: (d: string) => {
      if (detached()) return;
      outputArrived();
      reasoning += d;
      if (reasoningIndex === null) {
        reasoningStartedAt = toIsoUtc(clocks.wall.instant());
        const r = writer.upsertMessageRow(`${segment}:reasoning`, 'thinking', reasoning, false, { persona: deps.persona, name: deps.agentName, startedAt: reasoningStartedAt });
        if (r.ok) reasoningIndex = r.value.index;
      } else {
        owner.grow(reasoningIndex, reasoning);
      }
    },
    usage: () => { outputArrived(); },
    event: (kind: string) => {
      deps.onModelEvent?.(kind);
      // REQ-CHAT-164: a tool call under way, or complete, is output of the call too, so it clears the live row's stalled
      // mark and re-arms its ten seconds; text and reasoning do so in their own callbacks. Until 2026-10-07 a step that
      // wrote a line and then streamed a long `write_file` marked its row "not producing output" ten seconds into the
      // arguments (docs/defects/fixed/a-child-streaming-a-long-tool-call-is-reported-stalled.md).
      if ((kind === 'tool-input' || kind === 'tool-call') && !detached()) outputArrived();
    },
    // OQ-110: a retry the dispatch layer absorbed is written where a person diagnosing the run reads (REQ-SESSION-142).
    retried: (r: DispatchRetry) => { deps.warn(dispatchRetryLine(deps.agentName, providerIdentity(deps.resilience?.catalogue ?? [], choice.model), choice.model.modelId, r)); },
  };
  let report: TurnReport;
  try {
    report = await backend.runTurn({
      persona: deps.persona, systemPrompt: deps.systemPrompt, messages, tools: specs, model: choice.model, thinking: choice.thinking,
      timeoutMs: choice.timeoutMs ?? deps.modelTimeoutMs, retries: choice.retries ?? deps.modelRetries, resolveCredential: deps.credentialFor(choice.model),
    }, sink, controller.signal);
  } finally {
    timer?.cancel();
    stall.timer?.cancel();
    signal.removeEventListener('abort', onAbort);
  }
  // REQ-CHAT-164: "when a streamed phase completes, its animation MUST stop where it stands" - settling does that,
  // and no completion row is appended for either phase.
  if (!detached()) {
    settleReasoning();
    if (index !== null) writer.upsertMessageRow(segment, 'agent', report.text || text, true, {});
  }
  return { report, unresponsive: unresponsive && !signal.aborted };
}
