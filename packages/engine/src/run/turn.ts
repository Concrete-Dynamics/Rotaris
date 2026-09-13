import { millis, toIsoUtc, type Clocks, type TimerHandle } from '@rotaris/kernel';

/** REQ-CHAT-164: ten seconds of provider silence on a call in flight. */
const STALL_AFTER = millis(10_000);
import { terminalRowStreamId, type ApprovalOption, type PermissionPreset, type QuestionAnswers, type QuestionPrompt } from '@rotaris/contracts';
import type { AgentBackend, ChatMessage, ContentPart, ModelRef, ThinkingLevel, ToolSpec, TurnReport } from '@rotaris/model';
import type { ProjectionOwner } from '../projection-owner.js';
import type { SessionWriter } from '../session-writer.js';
import type { LoopSupervisor, SupervisorEscalation } from './supervisor.js';
import { resilientStep, type StepOutcome, type TurnResilience } from './ladder.js';
import type { ModelChoice } from './resilience.js';
import { CompressionRunner, type TurnCompression } from './compression.js';
import { Conversation } from './conversation.js';

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
}
export interface ModeChange {
  readonly requested: PermissionPreset;
  readonly effective: PermissionPreset;
  readonly downgraded: boolean;
  readonly reason: string;
  readonly previous: PermissionPreset;
}
export interface ToolPort {
  /** The ONE resolution's listing (REQ-TOOLS-010). */
  specs(): readonly ToolSpec[];
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
  /** A final belt behind the loop supervisor. */
  readonly maxStepsPerTurn: number;
  readonly warn: (message: string) => void;
  /** REQ-ORCH-141: the call ids already dispatched in this run. */
  readonly dispatched: Map<string, string>;
  readonly supervisor?: LoopSupervisor | undefined;
  /** REQ-MONITOR-134/135: the pending steering prompts for this conversation, drained at the agent's next step. */
  readonly steering?: (() => readonly SteeringPrompt[]) | undefined;
  /** REQ-MONITOR-123: a graceful pause — the turn stops before its next model step. */
  readonly shouldPause?: (() => boolean) | undefined;
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
  readonly onRequestUsage?: ((usage: { readonly input: number; readonly output: number }) => void) | undefined;
}

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
  /** REQ-MONITOR-123: the turn stopped for a pause; the task is left where it was. */
  readonly paused?: boolean | undefined;
}

/** REQ-MONITOR-134: delivered as a message explicitly marked as a steering prompt; the supervisor counts it as a user instruction. */
function injectSteering(deps: TurnDeps, conversation: Conversation): number {
  const pending = deps.steering?.() ?? [];
  for (const s of pending) {
    conversation.push({ role: 'user', content: [{ kind: 'text', text: `[Steering prompt] ${s.text}` }] });
    deps.writer.appendTimeline('steering_injected', 'user', `A steering prompt reached ${deps.agentName} (${s.id.slice(0, 8)}).`, { prompt_id: s.id, agent: deps.agentName });
    deps.supervisor?.noteUserInstruction();
  }
  return pending.length;
}

export async function runTurn(deps: TurnDeps, task: string, history: readonly ChatMessage[], signal: AbortSignal, initialContent?: readonly ContentPart[]): Promise<TurnOutcome> {
  const { writer, owner, tools, clocks } = deps;
  // ADR-0060: the history is an object whose array is SWAPPED by a compression, never spliced under a call in flight.
  const conv = new Conversation([...history, { role: 'user', content: initialContent ?? [{ kind: 'text', text: task }] }]);
  // ADR-0034: the MCP surface is demanded before the listing and the prompt are read — one resolution feeds both.
  if (tools?.ready) await tools.ready();
  const specs = tools?.specs() ?? [];
  const section = tools?.promptSection?.() ?? '';
  const stepDeps: TurnDeps = section === '' ? deps : { ...deps, systemPrompt: `${deps.systemPrompt}\n\n${section}` };
  let toolCallCount = 0;
  let steps = 0;
  let lastReport: TurnReport = { status: 'succeeded', text: '', usage: { input: 0, output: 0 } };
  let usage = { input: 0, output: 0 };
  /**
   * OQ-8: the ONE place a completed provider request's usage is counted — the turn's own total and the caller's
   * cumulative figures both come from here, so a request the ladder retried past is counted exactly once rather
   * than dropped with the report it belonged to.
   */
  const observeRequestUsage = (u: { readonly input: number; readonly output: number }): void => {
    usage = { input: usage.input + u.input, output: usage.output + u.output };
    deps.onRequestUsage?.(u);
  };
  /**
   * Part AH (ADR-0060). `condensed` says the history no longer matches the provider's last prompt count, so
   * REQ-MONITOR-081's preference for the real figure falls back to the estimate until the next step reports one.
   */
  const compression = deps.compression ? new CompressionRunner(deps.compression, { writer, clocks, warn: deps.warn, agent: deps.agentName }) : null;
  let condensed = false;
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
  for (;;) {
    if (deps.shouldPause?.()) return { report: { status: 'succeeded', text: lastReport.text, usage }, messages: conv.snapshot(), toolCallCount, paused: true };
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
    if (steps > deps.maxStepsPerTurn) {
      deps.warn(`the turn exceeded ${deps.maxStepsPerTurn} model steps and was ended as partial (the final step belt fired)`);
      return { report: { status: 'partial', text: lastReport.text, usage }, messages: conv.snapshot(), toolCallCount };
    }
    /**
     * REQ-MONITOR-076: an agent that has reached the effective threshold compresses BEFORE the call, so the
     * call goes out over the compressed context. This sits where ADR-0059's `check()` sits — between steps,
     * with no request in flight, which is the only place the conversation may be replaced.
     */
    if (compression && !signal.aborted && compression.due(conv, condensed)) {
      if (await compression.run(conv, 'automatic', condensed, signal)) condensed = true;
    }
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
      ? { ...deps.resilience, condense: async () => { const ok = await compression.run(conv, 'rejection', condensed, signal); if (ok) condensed = true; return ok; }, resumeIssue: deps.parentResume === true && steps === 1 }
      : deps.resilience;
    const report = resilience
      ? await resilientStep({ writer, clocks, warn: deps.warn, agent: deps.agentName, onRequestUsage: observeRequestUsage }, resilience, (choice, unresponsiveMs) => step(stepDeps, choice, conv.snapshot(), specs, signal, unresponsiveMs, segment), signal)
      : await (async () => { const o = await step(stepDeps, { model: deps.model, thinking: deps.thinking }, conv.snapshot(), specs, signal, null, segment); observeRequestUsage(o.report.usage); return o.report; })();
    lastReport = report;
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
    const results: ChatMessage['content'] = [];
    const followUps: string[] = [];
    for (const c of calls) {
      if (signal.aborted) break;
      toolCallCount += 1;
      deps.supervisor?.observe({ kind: 'tool', name: c.name, args: c.args });
      const prior = deps.dispatched.get(c.callId);
      if (prior !== undefined) {
        // REQ-ORCH-141: a replayed id is not dispatched again.
        (results as { kind: 'tool-result'; callId: string; name: string; result: string; isError: boolean }[]).push({ kind: 'tool-result', callId: c.callId, name: c.name, result: prior, isError: false });
        continue;
      }
      const startedAt = toIsoUtc(clocks.wall.instant());
      // Part AL — REQ-CHAT-046/063/066/076: a foreground `terminal` call's row carries its live stream id while it runs
      // (ADR-0021; `terminalRowStreamId` is the one rule the tool shares). The settle rebuilds the row from the record,
      // which never holds the id, so the settled row has none — cleared on exit by construction.
      const streamId = terminalRowStreamId(c.name, c.args, deps.agentName);
      const rowResult = writer.appendRow('tool', `${c.name}`, false, { persona: deps.persona, name: deps.agentName, toolName: c.name, toolStatus: 'running', callKey: c.callId, startedAt, input: c.args, ...(streamId === undefined ? {} : { streamId }) });
      const rowIndex = rowResult.ok ? rowResult.value.index : null;
      const r = await tools.dispatch({ callId: c.callId, name: c.name, rawArgs: c.args, persona: deps.persona, agentId: deps.agentName, agentName: deps.agentName }, signal);
      deps.dispatched.set(c.callId, r.text);
      if (rowIndex !== null) {
        writer.settleRow(rowIndex, r.label, { toolStatus: r.status, durationMs: r.durationMs, output: r.text, ...(r.blockedReason === undefined ? {} : { blockedReason: r.blockedReason }) });
        // REQ-CHAT-050: the user-only edit-diff row directly beneath the tool row that produced it.
        if (r.diff !== undefined && r.status === 'ok') writer.appendRow('diff', r.diff, true, { persona: deps.persona, name: deps.agentName, callKey: c.callId, diff: r.diff });
      }
      (results as { kind: 'tool-result'; callId: string; name: string; result: string; isError: boolean }[]).push({ kind: 'tool-result', callId: c.callId, name: c.name, result: r.text, isError: r.isError });
      if (r.followUp !== undefined && r.followUp !== '') followUps.push(r.followUp);
    }
    if (signal.aborted) return { report: { status: 'succeeded', text: report.text, usage }, messages: conv.snapshot(), toolCallCount };
    conv.push({ role: 'tool', content: results as { kind: 'tool-result'; callId: string; name: string; result: string; isError: boolean }[] });
    // REQ-HOOKS-074: nothing is placed between the assistant's calls and their results; feedback for an errored call follows as a user message.
    if (followUps.length > 0) conv.push({ role: 'user', content: [{ kind: 'text', text: followUps.join('\n') }] });
    owner.flushPending();
  }
  } finally {
    unregister?.(); // Part AO
  }
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
      if (row === null) return;
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

  const sink = {
    started: () => { seen = true; timer?.cancel(); armStall(); },
    delta: (d: string) => {
      outputArrived();
      // REQ-CHAT-163: a reasoning burst is finished the moment the answer body starts, so its row settles here
      // rather than at the end of the call - a thinking row that stayed live past its own content would keep
      // counting upward against REQ-CHAT-062 while nothing was arriving for it.
      if (reasoningIndex !== null) { writer.settleRow(reasoningIndex, reasoning); reasoningIndex = null; }
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
      outputArrived();
      reasoning += d;
      if (reasoningIndex === null) {
        const r = writer.upsertMessageRow(`${segment}:reasoning`, 'thinking', reasoning, false, { persona: deps.persona, name: deps.agentName, startedAt: toIsoUtc(clocks.wall.instant()) });
        if (r.ok) reasoningIndex = r.value.index;
      } else {
        owner.grow(reasoningIndex, reasoning);
      }
    },
    usage: () => { outputArrived(); },
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
  if (reasoningIndex !== null) writer.settleRow(reasoningIndex, reasoning);
  if (index !== null) writer.upsertMessageRow(segment, 'agent', report.text || text, true, {});
  return { report, unresponsive: unresponsive && !signal.aborted };
}
